const { messages } = require('../config/messages');
const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../ui/embeds');
const { requireSameVoiceChannel } = require('./voiceAccess');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription(messages.commands.volume.description)
    .addIntegerOption((option) => option.setName('value').setDescription(messages.commands.volume.valueDescription).setRequired(true).setMinValue(0).setMaxValue(200)),
  async execute(interaction, { musicManager }) {
    await musicManager.withGuildLock(interaction.guildId, async () => {
      const player = musicManager.get(interaction.guildId);
      requireSameVoiceChannel(interaction, player);
      if (!player) return interaction.reply({ embeds: [errorEmbed(messages.playback.noPlayerInGuild)], ephemeral: true });
      const volume = interaction.options.getInteger('value', true);
      player.setVolume(volume);
      return interaction.reply({ embeds: [successEmbed(messages.playback.volumeSet(volume))] });
    });
  },
};
