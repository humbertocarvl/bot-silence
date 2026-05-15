const {
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const {
  createOrUpdateVerification,
  getPending,
  getVerifiedUser,
  saveVerifiedUser,
} = require('../services/verificationService');
const { getUserByName } = require('../services/habboService');
const { query } = require('../database/index');

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction, client) {
    // -----------------------------------------------------------------------
    // Slash commands
    // -----------------------------------------------------------------------
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction, client);
      } catch (err) {
        console.error(`Erro ao executar /${interaction.commandName}:`, err);
        const payload = { content: '❌ Erro ao executar este comando.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      }
      return;
    }

    // -----------------------------------------------------------------------
    // Botão: iniciar verificação
    // -----------------------------------------------------------------------
    if (interaction.isButton() && interaction.customId === 'habbo_verify_start') {
      // showModal() deve ser a primeira e única resposta — sem async antes
      return interaction.showModal(buildModal());
    }

    // -----------------------------------------------------------------------
    // Modal: nick do Habbo enviado
    // -----------------------------------------------------------------------
    if (interaction.isModalSubmit() && interaction.customId === 'habbo_verify_modal') {
      await interaction.deferReply({ ephemeral: true });

      // Verifica se já tem conta vinculada (feito aqui, após defer, sem timeout)
      const verified = await getVerifiedUser(interaction.user.id);
      if (verified) {
        return interaction.editReply({
          content:
            `✅ Sua conta já está verificada!\n\n` +
            `**Nick Habbo:** \`${verified.habbo_username}\``,
        });
      }

      const rawNick = interaction.fields.getTextInputValue('habbo_username').trim();

      let habboUser;
      try {
        habboUser = await getUserByName(rawNick);
      } catch {
        return interaction.editReply({
          content: '❌ Erro ao consultar a API do Habbo. Tente novamente em instantes.',
        });
      }

      if (!habboUser?.uniqueId) {
        return interaction.editReply({
          content:
            '❌ Nick não encontrado no Habbo Hotel. Verifique se digitou corretamente e tente de novo.',
        });
      }

      const code = await createOrUpdateVerification(interaction.user.id, habboUser.name);

      return interaction.editReply({
        embeds: [buildCodeEmbed(habboUser.name, code)],
        components: [buildConfirmRow()],
      });
    }

    // -----------------------------------------------------------------------
    // Botão: confirmar verificação (checar motto via API)
    // -----------------------------------------------------------------------
    if (interaction.isButton() && interaction.customId === 'habbo_verify_confirm') {
      await interaction.deferReply({ ephemeral: true });

      const pending = await getPending(interaction.user.id);
      if (!pending) {
        return interaction.editReply({
          content:
            '❌ Nenhuma verificação pendente encontrada ou o código expirou.\n' +
            'Clique em **Verificar Conta Habbo** para gerar um novo código.',
        });
      }

      let habboUser;
      try {
        habboUser = await getUserByName(pending.habbo_username);
      } catch {
        return interaction.editReply({
          content: '❌ Erro ao consultar a API do Habbo. Tente novamente em instantes.',
        });
      }

      if (!habboUser || habboUser.motto !== pending.code) {
        return interaction.editReply({
          content:
            `❌ O código na missão não confere. Certifique-se de que a missão está definida como:\n` +
            `\`\`\`${pending.code}\`\`\``,
          components: [buildConfirmRow()], // mantém botão para nova tentativa
        });
      }

      // Salva o usuário verificado
      await saveVerifiedUser(interaction.user.id, habboUser.name, habboUser.uniqueId);

      // Atribui a role de verificado
      const cfg = await query("SELECT value FROM bot_config WHERE key = 'verified_role_id'");
      if (cfg.rows.length > 0) {
        const role = interaction.guild?.roles.cache.get(cfg.rows[0].value);
        if (role) {
          await interaction.member.roles.add(role, 'Verificação Habbo concluída');
        }
      }

      return interaction.editReply({
        content:
          `🎉 **Verificação concluída!**\n\n` +
          `Sua conta do Habbo **${habboUser.name}** foi vinculada ao seu Discord com sucesso.\n` +
          `Você recebeu o cargo ✅ Verificado!`,
        components: [],
      });
    }

    // -----------------------------------------------------------------------
    // Aviso — Modal 1: escolha do canal (responde com modal 2)
    // -----------------------------------------------------------------------
    if (interaction.isModalSubmit() && interaction.customId === 'aviso_canal_modal') {
      const canalId = interaction.fields.getTextInputValue('canal_id').trim();
      const canal = interaction.guild?.channels.cache.get(canalId);

      if (!canal) {
        return interaction.reply({
          content: `❌ Canal com ID \`${canalId}\` não encontrado. Verifique o ID e tente novamente.`,
          ephemeral: true,
        });
      }

      // ModalSubmitInteraction não suporta showModal() — usamos um botão intermediário
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`aviso_json_btn:${canalId}`)
          .setLabel('Inserir mensagem →')
          .setEmoji('📝')
          .setStyle(ButtonStyle.Primary),
      );

      return interaction.reply({
        content: `✅ Canal selecionado: <#${canalId}>\n\nClique no botão abaixo para inserir o conteúdo da mensagem.`,
        components: [row],
        ephemeral: true,
      });
    }

    // -----------------------------------------------------------------------
    // Aviso — Botão intermediário: abre modal 2 com o JSON (canalId no customId)
    // -----------------------------------------------------------------------
    if (interaction.isButton() && interaction.customId.startsWith('aviso_json_btn:')) {
      const canalId = interaction.customId.split(':')[1];

      const modal = new ModalBuilder()
        .setCustomId(`aviso_json_modal:${canalId}`)
        .setTitle('Aviso — Passo 2 de 2: Mensagem');

      const jsonInput = new TextInputBuilder()
        .setCustomId('mensagem_json')
        .setLabel('Cole aqui o JSON gerado pelo Discohook')
        .setPlaceholder('{"content": "...", "embeds": [...]}')
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(2)
        .setMaxLength(4000)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(jsonInput));
      return interaction.showModal(modal);
    }

    // -----------------------------------------------------------------------
    // Aviso — Modal 2: JSON da mensagem → envia no canal
    // -----------------------------------------------------------------------
    if (interaction.isModalSubmit() && interaction.customId.startsWith('aviso_json_modal:')) {
      await interaction.deferReply({ ephemeral: true });

      const canalId = interaction.customId.split(':')[1];
      const canal = interaction.guild?.channels.cache.get(canalId);

      if (!canal) {
        return interaction.editReply({ content: `❌ Canal \`${canalId}\` não encontrado.` });
      }

      const rawJson = interaction.fields.getTextInputValue('mensagem_json').trim();

      let messageData;
      try {
        const parsed = JSON.parse(rawJson);
        // Suporta o formato completo do Discohook { messages: [{ data: {...} }] }
        // e também o formato direto { content, embeds }
        messageData = parsed.messages?.[0]?.data ?? parsed;
      } catch {
        return interaction.editReply({
          content: '❌ O JSON fornecido é inválido. Verifique a sintaxe e tente novamente.',
        });
      }

      const payload = {};
      if (messageData.content) payload.content = messageData.content;
      if (Array.isArray(messageData.embeds) && messageData.embeds.length > 0) {
        payload.embeds = messageData.embeds;
      }

      if (!payload.content && !payload.embeds) {
        return interaction.editReply({
          content: '❌ O JSON não contém `content` nem `embeds` válidos.',
        });
      }

      try {
        await canal.send(payload);
        return interaction.editReply({ content: `✅ Aviso enviado em <#${canalId}>!` });
      } catch (err) {
        return interaction.editReply({
          content:
            `❌ Não foi possível enviar a mensagem. Verifique se o bot tem permissão de enviar mensagens no canal.\n` +
            `Erro: \`${err.message}\``,
        });
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildModal() {
  const modal = new ModalBuilder()
    .setCustomId('habbo_verify_modal')
    .setTitle('Verificação de Conta Habbo');

  const input = new TextInputBuilder()
    .setCustomId('habbo_username')
    .setLabel('Qual é o seu nick no Habbo?')
    .setPlaceholder('Digite exatamente como aparece no jogo')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(30)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function buildCodeEmbed(habboUsername, code) {
  return new EmbedBuilder()
    .setTitle('🔑 Código de Verificação')
    .setDescription(
      `**Nick encontrado:** \`${habboUsername}\`\n\n` +
        `**Seu código de verificação:**\n\`\`\`${code}\`\`\`\n` +
        '**Como verificar:**\n' +
        '1. Acesse o **Habbo Hotel**\n' +
        '2. Vá em **Perfil → Editar Perfil**\n' +
        '3. Cole o código acima no campo **Missão**\n' +
        '4. Salve e clique em **Confirmar Verificação** abaixo\n\n' +
        '⏳ Este código expira em **60 minutos**.',
    )
    .setColor(0xffd700)
    .setFooter({ text: 'Silence Bot • Habbo Hotel BR' });
}

function buildConfirmRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('habbo_verify_confirm')
      .setLabel('Confirmar Verificação')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
  );
}
