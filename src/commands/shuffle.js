const { messages } = require('../config/messages');
const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../ui/embeds');
const { requireSameVoiceChannel } = require('./voiceAccess');

module.exports = {
  data: new SlashCommandBuilder().setName('shuffle').setDescription(messages.commands.shuffle.description),
  async execute(interaction, { musicManager }) {
    await musicManager.withGuildLock(interaction.guildId, async () => {
      const player = musicManager.get(interaction.guildId);
      requireSameVoiceChannel(interaction, player);
      if (!player || player.queue.length < 2) return interaction.reply({ embeds: [errorEmbed(messages.playback.shuffleNeedsTwoTracks)], ephemeral: true });
      player.shuffle();
      return interaction.reply({ embeds: [successEmbed(messages.playback.shuffled)] });
    });
  },
};
