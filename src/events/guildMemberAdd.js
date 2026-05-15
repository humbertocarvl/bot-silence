const { Events, EmbedBuilder } = require('discord.js');

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

    const channel = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('👋 Bem-vindo(a) ao servidor!')
      .setDescription(
        `Olá, ${member}! Que bom ter você aqui. 🎉\n\n` +
          '**Siga o passo a passo abaixo para liberar o acesso ao servidor:**\n\n' +
          `📜 **Passo 1 — Regras**\nLeia as regras em <#${process.env.RULES_CHANNEL_ID}> e clique em **Concordar**. Você receberá o cargo de **Player** automaticamente.\n\n` +
          `🏨 **Passo 2 — *(Recomendado)* Verificação Habbo**\nApós virar Player, acesse <#${process.env.HABBO_VERIFY_CHANNEL_ID}> e associe sua conta do Habbo para:\n` +
          '> ✨ Participar de sorteios e eventos exclusivos\n' +
          '> 🤖 Usar ferramentas exclusivas do bot',
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setColor(0x5865f2)
      .setTimestamp()
      .setFooter({ text: 'Silence Bot • Habbo Hotel BR' });

    await channel.send({ embeds: [embed] });
  },
};
