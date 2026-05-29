const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { nowPlayingEmbed } = require('./embeds');

const MUSIC_CONTROL_IDS = {
  back: 'music:back',
  pause: 'music:pause',
  resume: 'music:resume',
  skip: 'music:skip',
  stop: 'music:stop',
};

function buildMusicControlRow(player) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(MUSIC_CONTROL_IDS.back)
      .setLabel('Back')
      .setEmoji('⏮️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!(player.history?.length > 0)),
    new ButtonBuilder()
      .setCustomId(player.paused ? MUSIC_CONTROL_IDS.resume : MUSIC_CONTROL_IDS.pause)
      .setLabel(player.paused ? 'Resume' : 'Pause')
      .setEmoji(player.paused ? '▶️' : '⏸️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!player.current),
    new ButtonBuilder()
      .setCustomId(MUSIC_CONTROL_IDS.skip)
      .setLabel('Skip')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!player.current),
    new ButtonBuilder()
      .setCustomId(MUSIC_CONTROL_IDS.stop)
      .setLabel('Stop')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!player.current && (player.queue?.length ?? 0) === 0),
  );
}

function nowPlayingMessage(track, player) {
  return {
    embeds: [nowPlayingEmbed(track, player)],
    components: [buildMusicControlRow(player)],
  };
}

module.exports = {
  MUSIC_CONTROL_IDS,
  buildMusicControlRow,
  nowPlayingMessage,
};
