const { EmbedBuilder } = require('discord.js');
const { query } = require('../database/index');
const { getUserByName, getAvatarUrl } = require('./habboService');

/**
 * Cria ou atualiza o embed de perfil de um membro verificado
 * no canal de perfis configurado (PROFILES_CHANNEL_ID).
 *
 * @param {import('discord.js').Guild} guild
 * @param {string} discordId
 * @param {string} habboUsername
 */
async function upsertProfileEmbed(guild, discordId, habboUsername) {
  const channelId = process.env.PROFILES_CHANNEL_ID;
  if (!channelId) return; // Funcionalidade opcional — sem canal configurado, ignora

  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;

  const member = guild.members.cache.get(discordId);
  const user = member?.user ?? await guild.client.users.fetch(discordId).catch(() => null);

  let habboUser = null;
  try {
    habboUser = await getUserByName(habboUsername);
  } catch {
    // Continua com dados parciais
  }

  const embed = new EmbedBuilder()
    .setAuthor({
      name: member?.displayName ?? user?.username ?? discordId,
      iconURL: user?.displayAvatarURL({ dynamic: true }),
    })
    .setTitle(`🏨 ${habboUsername}`)
    .setThumbnail(getAvatarUrl(habboUsername))
    .setColor(0x57f287)
    .addFields(
      {
        name: '💬 Missão',
        value: habboUser?.motto || '*Sem missão definida*',
        inline: false,
      },
      {
        name: '📅 Verificado em',
        value: new Date().toLocaleDateString('pt-BR'),
        inline: true,
      },
    )
    .setFooter({ text: 'Silence Bot • Habbo Hotel BR' })
    .setTimestamp();

  // Verifica se já existe uma mensagem salva para este usuário
  const cfg = await query(
    "SELECT value FROM bot_config WHERE key = $1",
    [`profile_msg_${discordId}`],
  );

  if (cfg.rows.length > 0) {
    try {
      const existing = await channel.messages.fetch(cfg.rows[0].value);
      await existing.edit({ embeds: [embed] });
      return;
    } catch {
      // Mensagem foi deletada — cria nova abaixo
    }
  }

  const msg = await channel.send({ embeds: [embed] });

  await query(
    `INSERT INTO bot_config (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2`,
    [`profile_msg_${discordId}`, msg.id],
  );
}

module.exports = { upsertProfileEmbed };

/**
 * Apaga o embed de perfil de um membro do canal de perfis
 * e remove o registro do bot_config.
 *
 * @param {import('discord.js').Guild} guild
 * @param {string} discordId
 */
async function deleteProfileEmbed(guild, discordId) {
  const channelId = process.env.PROFILES_CHANNEL_ID;
  if (!channelId) return;

  const channel = guild.channels.cache.get(channelId);
  const cfg = await query(
    'SELECT value FROM bot_config WHERE key = $1',
    [`profile_msg_${discordId}`],
  );

  if (cfg.rows.length > 0) {
    if (channel) {
      await channel.messages.fetch(cfg.rows[0].value)
        .then(msg => msg.delete())
        .catch(() => null);
    }
    await query('DELETE FROM bot_config WHERE key = $1', [`profile_msg_${discordId}`]);
  }
}

module.exports = { upsertProfileEmbed, deleteProfileEmbed };
