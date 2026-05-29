const { EmbedBuilder } = require('discord.js');
const { formatDuration, truncate } = require('../utils/format');
const { messages } = require('../config/messages');

function successEmbed(description) {
  return new EmbedBuilder().setColor(0x2ecc71).setDescription(description);
}

function errorEmbed(description) {
  return new EmbedBuilder().setColor(0xe74c3c).setDescription(description);
}

function nowPlayingEmbed(track, player) {
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(messages.embeds.nowPlayingTitle)
    .setDescription(`[${truncate(track.title, 100)}](${track.url})`)
    .addFields(
      { name: messages.embeds.durationField, value: formatDuration(track.duration), inline: true },
      { name: messages.embeds.volumeField, value: `${player.volume ?? 100}%`, inline: true },
      { name: messages.embeds.loopField, value: String(player.loopMode ?? 'off'), inline: true },
    );
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  return embed;
}

function queueEmbed(player) {
  const nowPlaying = player.current
    ? `${messages.embeds.nowPlayingTitle}: [${truncate(player.current.title, 90)}](${player.current.url}) — ${formatDuration(player.current.duration)}`
    : messages.embeds.queueNowPlayingEmpty;
  const total = player.queue.length;
  const lines = player.queue.slice(0, 10).map((track, index) => (
    `${index + 1}. [${truncate(track.title, 80)}](${track.url}) — ${formatDuration(track.duration)}`
  ));
  let queueText = lines.length ? lines.join('\n') : messages.embeds.queueEmpty;
  if (total > lines.length) {
    queueText += `\n\n${messages.embeds.queueMore(total - lines.length)}`;
  }
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(messages.embeds.queueTitle(total))
    .setDescription(`${nowPlaying}\n\n${queueText}`);
}

module.exports = { successEmbed, errorEmbed, nowPlayingEmbed, queueEmbed };
