const { Events } = require('discord.js');

const PROTECTED_CHANNELS = ['1504837691332886699'];

module.exports = {
  name: Events.MessageCreate,

  async execute(message) {
    if (!PROTECTED_CHANNELS.includes(message.channelId)) return;
    if (message.author.bot) return;

    await message.delete().catch(() => null);
  },
};
