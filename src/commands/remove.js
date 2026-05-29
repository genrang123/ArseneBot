const { messages } = require('../config/messages');
const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../ui/embeds');
const { requireSameVoiceChannel } = require('./voiceAccess');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription(messages.commands.remove.description)
    .addIntegerOption((option) => option.setName('index').setDescription(messages.commands.remove.indexDescription).setRequired(true).setMinValue(1)),
  async execute(interaction, { musicManager }) {
    await musicManager.withGuildLock(interaction.guildId, async () => {
      const player = musicManager.get(interaction.guildId);
      requireSameVoiceChannel(interaction, player);
      if (!player) return interaction.reply({ embeds: [errorEmbed(messages.playback.noPlayerInGuild)], ephemeral: true });
      const index = interaction.options.getInteger('index', true);
      const removed = player.remove(index);
      if (!removed) return interaction.reply({ embeds: [errorEmbed(messages.playback.invalidQueueIndex)], ephemeral: true });
      return interaction.reply({ embeds: [successEmbed(messages.playback.removedFromQueue(removed.title))] });
    });
  },
};
