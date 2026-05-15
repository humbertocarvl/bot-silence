const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aviso')
    .setDescription('Envia um aviso em um canal usando JSON do Discohook')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('aviso_canal_modal')
      .setTitle('Aviso — Passo 1 de 2: Canal');

    const canalInput = new TextInputBuilder()
      .setCustomId('canal_id')
      .setLabel('ID do canal onde o aviso será enviado')
      .setPlaceholder('Ex: 965772784359833610')
      .setStyle(TextInputStyle.Short)
      .setMinLength(17)
      .setMaxLength(20)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(canalInput));
    return interaction.showModal(modal);
  },
};
