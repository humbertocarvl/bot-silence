const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getVerifiedUser } = require('../services/verificationService');
const { getUserByName, getAvatarUrl } = require('../services/habboService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Exibe o perfil Habbo de um membro do servidor')
    .addUserOption((option) =>
      option
        .setName('usuario')
        .setDescription('Membro que deseja consultar (padrão: você mesmo)')
        .setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getUser('usuario') ?? interaction.user;
    const member = interaction.guild?.members.cache.get(target.id);

    const verified = await getVerifiedUser(target.id);

    if (!verified) {
      return interaction.editReply({
        content:
          target.id === interaction.user.id
            ? `❌ Você ainda não vinculou uma conta do Habbo.\nAcesse <#${process.env.HABBO_VERIFY_CHANNEL_ID}> para verificar.`
            : `❌ **${target.username}** ainda não vinculou uma conta do Habbo.`,
      });
    }

    // Busca dados atualizados na API do Habbo
    let habboUser = null;
    try {
      habboUser = await getUserByName(verified.habbo_username);
    } catch {
      // Mostra dados do banco se a API estiver fora
    }

    const embed = new EmbedBuilder()
      .setAuthor({
        name: member?.displayName ?? target.username,
        iconURL: target.displayAvatarURL({ dynamic: true }),
      })
      .setTitle(`🏨 ${verified.habbo_username}`)
      .setThumbnail(getAvatarUrl(verified.habbo_username))
      .setColor(0x5865f2)
      .addFields(
        {
          name: '💬 Missão',
          value: habboUser?.motto || '*Sem missão definida*',
          inline: false,
        },
        {
          name: '🟢 Online',
          value: habboUser ? (habboUser.online ? 'Sim' : 'Não') : '❓',
          inline: true,
        },
        {
          name: '📅 Verificado em',
          value: new Date(verified.verified_at).toLocaleDateString('pt-BR'),
          inline: true,
        },
      )
      .setFooter({ text: 'Silence Bot • Habbo Hotel BR' })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
