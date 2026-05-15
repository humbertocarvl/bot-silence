const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { query } = require('../database/index');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    console.log(`✅ Silence online como ${client.user.tag}`);

    await runMigrations();

    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) {
      console.error('❌ Guild não encontrada. Verifique GUILD_ID no .env');
      return;
    }

    await guild.members.fetch(); // garante cache completo de membros

    await ensureVerifiedRole(guild);
    await ensureVerificationMessage(guild, client);
  },
};

// ---------------------------------------------------------------------------

async function runMigrations() {
  const sql = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
  // Executa cada statement separadamente
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await query(statement);
  }
  console.log('✅ Migrações aplicadas');
}

async function ensureVerifiedRole(guild) {
  // Verifica se já temos o ID salvo no banco
  const cfg = await query("SELECT value FROM bot_config WHERE key = 'verified_role_id'");

  if (cfg.rows.length > 0) {
    const role = guild.roles.cache.get(cfg.rows[0].value);
    if (role) {
      console.log(`✅ Role verificado encontrada: ${role.name} (${role.id})`);
      return;
    }
    // Role foi deletada manualmente — cria novamente
  }

  const role = await guild.roles.create({
    name: '✅ Verificado',
    colors: [0x57f287],
    reason: 'Role de verificação Habbo criada pelo Silence Bot',
  });

  await query(
    `INSERT INTO bot_config (key, value)
     VALUES ('verified_role_id', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [role.id],
  );

  console.log(`✅ Role de verificado criada: ${role.name} (${role.id})`);
}

async function ensureVerificationMessage(guild, client) {
  const channel = guild.channels.cache.get(process.env.HABBO_VERIFY_CHANNEL_ID);
  if (!channel) {
    console.warn('⚠️  Canal de verificação Habbo não encontrado (HABBO_VERIFY_CHANNEL_ID)');
    return;
  }

  // Verifica se já existe mensagem salva
  const cfg = await query("SELECT value FROM bot_config WHERE key = 'verify_message_id'");

  if (cfg.rows.length > 0) {
    try {
      const existing = await channel.messages.fetch(cfg.rows[0].value);
      if (existing) {
        console.log('✅ Mensagem de verificação Habbo já existe no canal');
        return;
      }
    } catch {
      // Mensagem foi deletada — reenvia abaixo
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('🏨 Verificação de Conta Habbo')
    .setDescription(
      '**Por que verificar sua conta?**\n' +
        '> 🎉 Participe de **sorteios e eventos exclusivos** do servidor\n' +
        '> 🤖 Acesse **ferramentas exclusivas** do bot\n' +
        '> 🏆 Mostre seu nick Habbo no perfil do Discord\n\n' +
        'Clique em **Verificar Conta Habbo** abaixo para começar.\n' +
        'Você precisará colocar um código temporário na sua **missão** do Habbo por alguns instantes.',
    )
    .setColor(0xffd700)
    .setFooter({ text: 'Silence Bot • Habbo Hotel BR' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('habbo_verify_start')
      .setLabel('Verificar Conta Habbo')
      .setEmoji('🎩')
      .setStyle(ButtonStyle.Primary),
  );

  const message = await channel.send({ embeds: [embed], components: [row] });

  await query(
    `INSERT INTO bot_config (key, value)
     VALUES ('verify_message_id', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [message.id],
  );

  console.log('✅ Mensagem de verificação Habbo enviada ao canal');
}
