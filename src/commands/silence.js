const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { query } = require('../database/index');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('silence')
    .setDescription('Informações e estatísticas do Silence Bot'),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const result = await query('SELECT COUNT(*) AS total FROM verified_users');
    const total = result.rows[0]?.total ?? '0';

    const embed = new EmbedBuilder()
      .setTitle('🤖 Silence Bot')
      .setDescription('Bot oficial do servidor — integração com o Habbo Hotel BR.')
      .addFields(
        { name: '🏨 Contas verificadas', value: String(total), inline: true },
        { name: '🏓 Latência', value: `${client.ws.ping} ms`, inline: true },
      )
      .setThumbnail(client.user.displayAvatarURL())
      .setColor(0x5865f2)
      .setFooter({ text: 'Silence Bot • Habbo Hotel BR' });

    return interaction.editReply({ embeds: [embed] });
  },
};
