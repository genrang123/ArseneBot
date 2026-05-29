const { messages } = require('../config/messages');
const { SlashCommandBuilder } = require('discord.js');
const { successEmbed } = require('../ui/embeds');
const { UserFacingMusicError } = require('../music/errors');
const { requireSameVoiceChannel } = require('./voiceAccess');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription(messages.commands.seek.description)
    .addIntegerOption((option) => option.setName('seconds').setDescription(messages.commands.seek.secondsDescription).setRequired(true).setMinValue(0)),
  async execute(interaction, { musicManager }) {
    await musicManager.withGuildLock(interaction.guildId, async () => {
      const player = musicManager.get(interaction.guildId);
      requireSameVoiceChannel(interaction, player);
      if (!player?.current) throw new UserFacingMusicError(messages.playback.noCurrentTrack);
      const seconds = interaction.options.getInteger('seconds', true);
      await player.seek(seconds);
      await player.refreshNowPlayingMessage();
      return interaction.editReply({ embeds: [successEmbed(messages.playback.seekedTo(seconds))] });
    });
  },
};
