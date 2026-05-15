require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const { loadEvents } = require('./handlers/eventHandler');
const { loadCommands } = require('./handlers/commandHandler');
const { startWebServer } = require('./web/server');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // Privileged — ativar no Developer Portal
  ],
  partials: [Partials.GuildMember],
});

client.commands = new Collection();

loadCommands(client);
loadEvents(client);

// Evita crash em erros de rede/API do Discord
client.on('error', (err) => console.error('Discord client error:', err));

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

client.login(process.env.DISCORD_TOKEN);
startWebServer();
