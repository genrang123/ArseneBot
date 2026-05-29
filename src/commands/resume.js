const { messages } = require('../config/messages');
const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../ui/embeds');
const { requireSameVoiceChannel } = require('./voiceAccess');

module.exports = {
  data: new SlashCommandBuilder().setName('resume').setDescription(messages.commands.resume.description),
  async execute(interaction, { musicManager }) {
    await musicManager.withGuildLock(interaction.guildId, async () => {
      const player = musicManager.get(interaction.guildId);
      requireSameVoiceChannel(interaction, player);
      if (!player?.current) return interaction.reply({ embeds: [errorEmbed(messages.playback.noCurrentTrack)], ephemeral: true });
      player.resume();
      return interaction.reply({ embeds: [successEmbed(messages.playback.resumed)] });
    });
  },
};
