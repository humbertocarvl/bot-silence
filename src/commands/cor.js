const { SlashCommandBuilder } = require('discord.js');

const COLOR_ROLES = [
  { label: 'Amarelo', value: 'amarelo', roleId: '1504903262565044376' },
  { label: 'Preto',   value: 'preto',   roleId: '1504902908242694276' },
  { label: 'Azul',    value: 'azul',    roleId: '1504902805301760091' },
  { label: 'Vermelho',value: 'vermelho',roleId: '1504902350928871536' },
  { label: 'Roxo',    value: 'roxo',    roleId: '1504901966629961768' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cor')
    .setDescription('Escolha a cor do seu nome no servidor')
    .addStringOption(option =>
      option
        .setName('cor')
        .setDescription('Cor desejada para o seu nome')
        .setRequired(true)
        .addChoices(
          { name: 'Amarelo', value: 'amarelo' },
          { name: 'Preto',   value: 'preto'   },
          { name: 'Azul',    value: 'azul'    },
          { name: 'Vermelho',value: 'vermelho'},
          { name: 'Roxo',    value: 'roxo'    },
          { name: 'Remover', value: 'remover' },
        ),
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const chosen = interaction.options.getString('cor');
    const member = interaction.member;

    // IDs de todos os cargos de cor
    const allRoleIds = COLOR_ROLES.map(c => c.roleId);

    // Remove todos os cargos de cor existentes do membro
    const rolesToRemove = member.roles.cache.filter(r => allRoleIds.includes(r.id));
    if (rolesToRemove.size > 0) {
      await member.roles.remove(rolesToRemove, 'Troca/remoção de cargo de cor');
    }

    if (chosen === 'remover') {
      return interaction.editReply({ content: '✅ Cor removida com sucesso!' });
    }

    const colorEntry = COLOR_ROLES.find(c => c.value === chosen);
    const role = interaction.guild.roles.cache.get(colorEntry.roleId);

    if (!role) {
      return interaction.editReply({
        content: '❌ Cargo não encontrado. Avise um administrador para verificar a configuração.',
      });
    }

    await member.roles.add(role, 'Cargo de cor selecionado via /cor');

    return interaction.editReply({
      content: `✅ Cor **${colorEntry.label}** atribuída com sucesso!`,
    });
  },
};
