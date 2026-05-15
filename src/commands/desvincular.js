const { SlashCommandBuilder } = require('discord.js');
const { getVerifiedUser, removeVerifiedUser } = require('../services/verificationService');
const { deleteProfileEmbed } = require('../services/profileService');
const { query } = require('../database/index');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('desvincular')
    .setDescription('Remove o vínculo entre seu Discord e sua conta do Habbo'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const verified = await getVerifiedUser(interaction.user.id);
    if (!verified) {
      return interaction.editReply({
        content: '❌ Você não possui nenhuma conta do Habbo vinculada.',
      });
    }

    await removeVerifiedUser(interaction.user.id);

    // Remove o cargo de verificado, se configurado
    const cfg = await query("SELECT value FROM bot_config WHERE key = 'verified_role_id'");
    if (cfg.rows.length > 0) {
      const role = interaction.guild?.roles.cache.get(cfg.rows[0].value);
      if (role && interaction.member.roles.cache.has(role.id)) {
        await interaction.member.roles.remove(role, 'Desvinculação de conta Habbo').catch(console.error);
      }
    }

    // Remove o embed de perfil do canal de perfis
    deleteProfileEmbed(interaction.guild, interaction.user.id).catch(console.error);

    return interaction.editReply({
      content: `✅ Vínculo com a conta **${verified.habbo_username}** removido com sucesso.\nVocê pode verificar uma nova conta quando quiser.`,
    });
  },
};
