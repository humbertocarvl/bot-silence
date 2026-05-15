const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getVerifiedUser } = require('../services/verificationService');
const { getUserByName, getAvatarUrl } = require('../services/habboService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('minhaconta')
    .setDescription('Mostra sua conta do Habbo vinculada ao Discord'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const verified = await getVerifiedUser(interaction.user.id);
    if (!verified) {
      return interaction.editReply({
        content: `❌ Você ainda não vinculou uma conta do Habbo.\nAcesse <#${process.env.HABBO_VERIFY_CHANNEL_ID}> para associar sua conta.`,
      });
    }

    let habboUser = null;
    try {
      habboUser = await getUserByName(verified.habbo_username);
    } catch {
      // Mostra dados do banco se a API estiver fora
    }

    const embed = new EmbedBuilder()
      .setAuthor({
        name: interaction.member?.displayName ?? interaction.user.username,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
      })
      .setTitle(`🏨 ${verified.habbo_username}`)
      .setThumbnail(getAvatarUrl(verified.habbo_username))
      .addFields(
        {
          name: 'Missão atual',
          value: habboUser?.motto || '*Sem missão*',
          inline: false,
        },
        {
          name: 'Status',
          value: habboUser ? (habboUser.online ? '🟢 Online' : '🔴 Offline') : '❓ Desconhecido',
          inline: true,
        },
        {
          name: 'Verificado em',
          value: new Date(verified.verified_at).toLocaleDateString('pt-BR'),
          inline: true,
        },
      )
      .setColor(0x57f287)
      .setFooter({ text: 'Silence Bot • Habbo Hotel BR' });

    return interaction.editReply({ embeds: [embed] });
  },
};
