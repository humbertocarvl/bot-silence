const { Events } = require('discord.js');

module.exports = {
  name: Events.GuildMemberUpdate,

  async execute(oldMember, newMember, client) {
    if (newMember.guild.id !== process.env.GUILD_ID) return;

    // Detecta quando o membro aceita o Membership Screening (pending: true → false)
    if (!oldMember.pending || newMember.pending) return;

    const playerRole = newMember.guild.roles.cache.get(process.env.PLAYER_ROLE_ID);
    if (!playerRole) {
      console.warn('⚠️  Role Player não encontrada (PLAYER_ROLE_ID). Verifique o .env');
      return;
    }

    try {
      await newMember.roles.add(playerRole, 'Aceitou as regras do servidor');
      console.log(`✅ Cargo Player atribuído a ${newMember.user.tag}`);
    } catch (err) {
      console.error(
        `❌ Não foi possível atribuir o cargo Player a ${newMember.user.tag}.\n` +
          'Verifique se o cargo do bot está ACIMA do cargo Player na hierarquia do servidor.',
        err.message,
      );
    }
  },
};
