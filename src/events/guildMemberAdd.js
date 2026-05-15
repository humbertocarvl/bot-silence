const { Events } = require('discord.js');

module.exports = {
  name: Events.GuildMemberAdd,

  async execute(member, client) {
    if (member.guild.id !== process.env.GUILD_ID) return;

    // Atribui o cargo de visitante assim que o membro entra
    const visitorRole = member.guild.roles.cache.get(process.env.VISITOR_ROLE_ID);
    if (visitorRole) {
      await member.roles.add(visitorRole, 'Novo membro — aguardando aceite das regras').catch(console.error);
    } else {
      console.warn('⚠️  Role Visitante não encontrada (VISITOR_ROLE_ID). Verifique o .env');
    }
  },
};
