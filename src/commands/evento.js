const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} = require('discord.js');
const {
  getEligibility,
  getHostRoleId,
  isEventAdmin,
} = require('../services/eventAccessService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('evento')
    .setDescription('Solicita autorização para usar o painel de eventos Silence')
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const verified = await getEligibility(interaction.user.id);
    if (!verified) {
      return interaction.editReply({
        content:
          `❌ Sua conta ainda não foi verificada pelo Silence Bot.\n` +
          `Faça a verificação em <#${process.env.HABBO_VERIFY_CHANNEL_ID}> antes de solicitar acesso.`,
      });
    }

    const hostRoleId = getHostRoleId();
    if (!interaction.member?.roles?.cache?.has(hostRoleId)) {
      return interaction.editReply({
        content: '❌ Você precisa possuir o cargo **HOST** para solicitar o painel de eventos.',
      });
    }

    const administrator = isEventAdmin(interaction.user.id);
    const embed = new EmbedBuilder()
      .setTitle('🎮 Solicitar painel de eventos')
      .setDescription(
        `**Conta Habbo:** \`${verified.habbo_username}\`\n\n` +
          (administrator
            ? 'Você é um administrador autorizado e não precisa aguardar aprovação. ' +
              'Se já existir uma sessão ativa, será solicitada uma confirmação adicional antes de desconectá-la.\n\n' +
              'Deseja acessar o painel?'
            : 'Sua solicitação será enviada aos administradores do Silence. ' +
              'Se for aprovada, você receberá um código de autorização por mensagem privada.\n\n' +
              'Deseja enviar a solicitação?'),
      )
      .setColor(0xffc83d)
      .setFooter({ text: 'Silence • Painel de Eventos' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(administrator ? 'event_admin_self_confirm' : 'event_request_confirm')
        .setLabel(administrator ? 'Acessar painel' : 'Solicitar autorização')
        .setEmoji('🔑')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('event_request_cancel')
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Secondary),
    );

    return interaction.editReply({ embeds: [embed], components: [row] });
  },
};
