const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../ui/embeds');
const { messages } = require('../config/messages');
const { requireSameVoiceChannel } = require('./voiceAccess');

module.exports = {
  data: new SlashCommandBuilder().setName('back').setDescription(messages.commands.back.description),
  async execute(interaction, { musicManager }) {
    await musicManager.withGuildLock(interaction.guildId, async () => {
      const player = musicManager.get(interaction.guildId);
      requireSameVoiceChannel(interaction, player);
      if (!player) return interaction.reply({ embeds: [errorEmbed(messages.playback.noPlayerInGuild)], ephemeral: true });

      const previous = await player.back();
      if (!previous) {
        return interaction.reply({ embeds: [errorEmbed(messages.playback.noPreviousTrack)], ephemeral: true });
      }

      return interaction.reply({ embeds: [successEmbed(messages.playback.backToPrevious(previous.title))] });
    });
  },
};
