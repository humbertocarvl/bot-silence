const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const {
  EventAccessError,
  approveAccessRequest,
  cancelAccessRequest,
  createAccessRequest,
  forceReleaseActiveSession,
  getActiveSession,
  getAdminIds,
  getAccessRequest,
  getEligibility,
  getHostRoleId,
  isEventAdmin,
  issueAdminAuthorization,
  rejectAccessRequest,
  revokeApprovedRequest,
} = require('../services/eventAccessService');

async function handleEventAccessInteraction(interaction, client) {
  if (!interaction.isButton() || !interaction.customId.startsWith('event_')) return false;

  try {
    if (interaction.customId === 'event_request_cancel') {
      await interaction.update({
        content: 'Solicitação cancelada.',
        embeds: [],
        components: [],
      });
      return true;
    }

    if (interaction.customId === 'event_request_confirm') {
      await handleRequestConfirmation(interaction, client);
      return true;
    }

    if (interaction.customId === 'event_admin_self_confirm') {
      await handleAdminSelfConfirmation(interaction, client, false);
      return true;
    }

    if (interaction.customId === 'event_admin_force_takeover') {
      await handleAdminSelfConfirmation(interaction, client, true);
      return true;
    }

    if (interaction.customId.startsWith('event_admin_approve:')) {
      await handleAdminDecision(interaction, client, 'approve');
      return true;
    }

    if (interaction.customId.startsWith('event_admin_reject:')) {
      await handleAdminDecision(interaction, client, 'reject');
      return true;
    }
  } catch (error) {
    console.error('Erro no fluxo de autorização de evento:', error);
    const message =
      error instanceof EventAccessError
        ? `❌ ${error.message}`
        : '❌ Não foi possível processar a solicitação agora.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: message, embeds: [], components: [] }).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
    return true;
  }

  return false;
}

async function handleRequestConfirmation(interaction, client) {
  await interaction.deferUpdate();

  if (!interaction.guild || interaction.guild.id !== process.env.GUILD_ID) {
    throw new EventAccessError(
      'invalid_guild',
      'Use este comando dentro do servidor oficial do Silence.',
      403,
    );
  }

  const verified = await getEligibility(interaction.user.id);
  if (!verified) {
    throw new EventAccessError(
      'not_verified',
      'Sua conta precisa estar verificada pelo Silence Bot.',
      403,
    );
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.roles.cache.has(getHostRoleId())) {
    throw new EventAccessError('not_host', 'Você não possui mais o cargo HOST.', 403);
  }

  const request = await createAccessRequest(interaction.user.id, verified.habbo_username);
  const adminEmbed = buildAdminRequestEmbed(request, interaction.user);
  const adminRow = buildAdminDecisionRow(request.id);
  let delivered = 0;

  for (const adminId of getAdminIds()) {
    try {
      const admin = await client.users.fetch(adminId);
      await admin.send({ embeds: [adminEmbed], components: [adminRow] });
      delivered += 1;
    } catch (error) {
      console.warn(`Não foi possível enviar solicitação de evento ao administrador ${adminId}.`);
    }
  }

  if (delivered === 0) {
    await cancelAccessRequest(request.id);
    throw new EventAccessError(
      'admin_unreachable',
      'Nenhum administrador pôde receber a solicitação. Avise a administração.',
      503,
    );
  }

  await interaction.editReply({
    content:
      '✅ Solicitação enviada aos administradores. Você receberá a resposta por mensagem privada.',
    embeds: [],
    components: [],
  });
}

async function handleAdminSelfConfirmation(interaction, client, forceTakeover) {
  if (!isEventAdmin(interaction.user.id)) {
    throw new EventAccessError(
      'not_event_admin',
      'Você não está autorizado a iniciar uma sessão administrativa.',
      403,
    );
  }

  await interaction.deferUpdate();
  if (!interaction.guild || interaction.guild.id !== process.env.GUILD_ID) {
    throw new EventAccessError(
      'invalid_guild',
      'Use este comando dentro do servidor oficial do Silence.',
      403,
    );
  }

  const verified = await getEligibility(interaction.user.id);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!verified) {
    throw new EventAccessError(
      'not_verified',
      'Sua conta precisa estar verificada pelo Silence Bot.',
      403,
    );
  }
  if (!member.roles.cache.has(getHostRoleId())) {
    throw new EventAccessError('not_host', 'Você não possui mais o cargo HOST.', 403);
  }

  const activeSession = await getActiveSession();
  if (activeSession && !forceTakeover) {
    const owner =
      activeSession.discord_id === interaction.user.id
        ? 'Você já possui uma sessão ativa.'
        : `O usuário <@${activeSession.discord_id}> está usando o painel.`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('event_admin_force_takeover')
        .setLabel('Desconectar e continuar')
        .setEmoji('⚠️')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('event_request_cancel')
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Secondary),
    );
    await interaction.editReply({
      content:
        `⚠️ **Já existe uma sessão ativa.**\n${owner}\n\n` +
        'Deseja encerrar essa sessão e gerar um novo código para você?',
      embeds: [],
      components: [row],
    });
    return;
  }

  const disconnectedDiscordId = forceTakeover
    ? await forceReleaseActiveSession(interaction.user.id)
    : null;
  const approval = await issueAdminAuthorization(
    interaction.user.id,
    verified.habbo_username,
  );

  try {
    await interaction.user.send({ embeds: [buildAuthorizationEmbed(approval)] });
  } catch {
    await revokeApprovedRequest(approval.request.id);
    throw new EventAccessError(
      'requester_dm_closed',
      'Não foi possível enviar o código porque suas mensagens privadas estão fechadas.',
      409,
    );
  }

  if (disconnectedDiscordId && disconnectedDiscordId !== interaction.user.id) {
    const disconnectedUser = await client.users.fetch(disconnectedDiscordId).catch(() => null);
    await disconnectedUser
      ?.send('⚠️ Sua sessão no painel de eventos Silence foi encerrada por um administrador.')
      .catch(() => {});
  }

  await interaction.editReply({
    content:
      '✅ Acesso administrativo autorizado. O código de uso único foi enviado no seu privado.',
    embeds: [],
    components: [],
  });
}

async function handleAdminDecision(interaction, client, decision) {
  if (!isEventAdmin(interaction.user.id)) {
    throw new EventAccessError(
      'not_event_admin',
      'Você não está autorizado a analisar solicitações.',
      403,
    );
  }

  await interaction.deferUpdate();
  const requestId = interaction.customId.split(':')[1];
  const request = await getAccessRequest(requestId);
  if (!request || request.status !== 'pending') {
    throw new EventAccessError(
      'request_not_pending',
      'Esta solicitação já foi analisada ou não existe.',
      409,
    );
  }

  const requester = await client.users.fetch(request.discord_id);

  if (decision === 'reject') {
    await rejectAccessRequest(requestId, interaction.user.id);
    await requester
      .send('❌ Sua solicitação para usar o painel de eventos **Silence** foi recusada.')
      .catch(() => {});
    await interaction.editReply({
      content: `❌ Solicitação de <@${request.discord_id}> recusada por <@${interaction.user.id}>.`,
      embeds: [],
      components: [],
    });
    return;
  }

  const eligibility = await getEligibility(request.discord_id);
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  const member = guild ? await guild.members.fetch(request.discord_id).catch(() => null) : null;
  if (!eligibility || !member?.roles.cache.has(getHostRoleId())) {
    await rejectAccessRequest(requestId, interaction.user.id);
    await requester
      .send(
        '❌ Sua solicitação não pôde ser aprovada porque sua verificação ou cargo HOST não está mais válido.',
      )
      .catch(() => {});
    await interaction.editReply({
      content: '❌ Solicitação recusada automaticamente: o usuário não está mais elegível.',
      embeds: [],
      components: [],
    });
    return;
  }

  const approval = await approveAccessRequest(requestId, interaction.user.id);
  try {
    await requester.send({ embeds: [buildAuthorizationEmbed(approval)] });
  } catch {
    await revokeApprovedRequest(requestId);
    throw new EventAccessError(
      'requester_dm_closed',
      'A aprovação foi cancelada porque o usuário não aceita mensagens privadas.',
      409,
    );
  }

  await interaction.editReply({
    content: `✅ Solicitação de <@${request.discord_id}> aprovada por <@${interaction.user.id}>.`,
    embeds: [],
    components: [],
  });
}

function buildAdminRequestEmbed(request, discordUser) {
  return new EmbedBuilder()
    .setTitle('🔐 Solicitação de painel de eventos')
    .setDescription(
      `**Discord:** <@${request.discord_id}> (\`${request.discord_id}\`)\n` +
        `**Usuário:** \`${discordUser.username}\`\n` +
        `**Habbo verificado:** \`${request.habbo_username}\`\n\n` +
        'O usuário possui o cargo HOST e confirmou que deseja solicitar acesso.',
    )
    .setColor(0xffc83d)
    .setTimestamp(new Date(request.requested_at))
    .setFooter({ text: `Silence • Solicitação ${request.id}` });
}

function buildAdminDecisionRow(requestId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`event_admin_approve:${requestId}`)
      .setLabel('Autorizar')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`event_admin_reject:${requestId}`)
      .setLabel('Recusar')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger),
  );
}

function buildAuthorizationEmbed({ code, expiryMinutes, request }) {
  return new EmbedBuilder()
    .setTitle('✅ Acesso ao Silence autorizado')
    .setDescription(
      `Sua solicitação foi aprovada. Use o código abaixo na tela de autenticação do programa:\n\n` +
        `\`\`\`${code}\`\`\`\n` +
        `Este código é de uso único e expira em **${expiryMinutes} minutos**.\n\n` +
        'Não compartilhe o código. Somente uma pessoa pode usar o painel por vez.',
    )
    .addFields({ name: 'Habbo vinculado', value: request.habbo_username, inline: true })
    .setColor(0x57f287)
    .setFooter({ text: 'Silence • Painel de Eventos' });
}

module.exports = { handleEventAccessInteraction };
