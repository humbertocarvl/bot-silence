const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getVerifiedUser, removeVerifiedUser } = require('../services/verificationService');
const { deleteProfileEmbed } = require('../services/profileService');
const { query } = require('../database/index');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admindesvincular')
    .setDescription('(Admin) Remove o vínculo Habbo de um membro do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('Membro cujo vínculo será removido')
        .setRequired(true),
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getUser('usuario');
    const member = interaction.guild?.members.cache.get(target.id);

    const verified = await getVerifiedUser(target.id);
    if (!verified) {
      return interaction.editReply({
        content: `❌ **${target.username}** não possui nenhuma conta do Habbo vinculada.`,
      });
    }

    await removeVerifiedUser(target.id);

    // Remove o cargo de verificado, se configurado
    const cfg = await query("SELECT value FROM bot_config WHERE key = 'verified_role_id'");
    if (cfg.rows.length > 0 && member) {
      const role = interaction.guild?.roles.cache.get(cfg.rows[0].value);
      if (role && member.roles.cache.has(role.id)) {
        await member.roles.remove(role, `Desvinculação administrativa por ${interaction.user.tag}`).catch(console.error);
      }
    }

    // Remove o embed de perfil do canal de perfis
    deleteProfileEmbed(interaction.guild, target.id).catch(console.error);

    return interaction.editReply({
      content: `✅ Vínculo de **${target.username}** com a conta Habbo **${verified.habbo_username}** removido com sucesso.`,
    });
  },
};
