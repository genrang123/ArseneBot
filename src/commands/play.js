const { messages } = require('../config/messages');
const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed } = require('../ui/embeds');
const { UserFacingMusicError, isYoutubeAuthError } = require('../music/errors');
const { refreshYoutubeAuth } = require('../music/refreshYoutubeAuth');
const { requireSameVoiceChannel } = require('./voiceAccess');

const TRANSIENT_YOUTUBE_ERROR_MESSAGE = messages.youtube.transientError;

const QUEUE_ACK_DELETE_DELAY_MS = 8000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function finishQueuedReply(interaction, player, message) {
  await interaction.editReply({ embeds: [successEmbed(message)] });
  await player.publishNowPlayingMessage?.();
  setTimeout(() => {
    interaction.deleteReply?.().catch?.(() => {});
  }, QUEUE_ACK_DELETE_DELAY_MS);
}

function shouldRetry(error) {
  return error instanceof UserFacingMusicError && error.message === TRANSIENT_YOUTUBE_ERROR_MESSAGE;
}

function safeForLog(value, max = 160) {
  return String(value ?? '')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/([?&](?:token|auth|key|sig|signature|cookie|oauth)[^=]*=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, max);
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const sanitized = {};
  for (const [key, value] of Object.entries(meta)) {
    if (/raw|token|cookie|secret|auth|key/i.test(key)) continue;
    sanitized[key] = typeof value === 'string' ? safeForLog(value, 120) : value;
  }
  return sanitized;
}

async function updateStatus(interaction, message) {
  try {
    await interaction.editReply({ embeds: [successEmbed(message)] });
  } catch {
    // Best effort status update only.
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription(messages.commands.play.description)
    .addStringOption((option) => option.setName('query').setDescription(messages.commands.play.queryDescription).setRequired(true)),
  async execute(interaction, { youtube, musicManager, log }) {
    // deferReply already done in interactionCreate handler
    const query = interaction.options.getString('query', true);
    const voiceChannel = requireSameVoiceChannel(interaction);

    const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
    if (!permissions.has(PermissionsBitField.Flags.Connect) || !permissions.has(PermissionsBitField.Flags.Speak)) {
      await interaction.editReply({ embeds: [errorEmbed(messages.voice.botMissingPermissions)] });
      return;
    }

    const commandStartedAt = Date.now();
    await musicManager.withGuildLock(interaction.guildId, async () => {
      log.info(interaction.guildId, `User ${interaction.user.id} requested play: ${safeForLog(query)}`);
      log.info(interaction.guildId, `[timing] /play start query=${safeForLog(query)}`);
      await updateStatus(interaction, messages.play.searching);

      let authRefreshed = false;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const resolveStartedAt = Date.now();
          const tracks = await youtube.resolveQuery(query, {
            id: interaction.user.id,
            username: interaction.user.username,
          });
          log.info(interaction.guildId, `[timing] /play resolve duration=${Date.now() - resolveStartedAt}ms tracks=${tracks.length} attempt=${attempt}`);
          if (tracks.length === 0) {
            await interaction.editReply({ embeds: [errorEmbed(messages.play.noResults)] });
            return;
          }

          await updateStatus(interaction, messages.play.foundTrack(tracks[0].title));

          let player;
          try {
            player = musicManager.getOrCreate({ guild: interaction.guild, voiceChannel, textChannelId: interaction.channelId });
          } catch (error) {
            if (error.code === 'PLAYER_IN_DIFFERENT_CHANNEL') {
              await interaction.editReply({ embeds: [errorEmbed(messages.voice.botInDifferentChannel)] });
              return;
            }
            throw error;
          }

          await updateStatus(interaction, messages.play.joiningVoice);
          const enqueueStartedAt = Date.now();
          const result = await player.enqueue(tracks);
          log.info(interaction.guildId, `[timing] /play enqueue duration=${Date.now() - enqueueStartedAt}ms started=${result.started} added=${result.added} attempt=${attempt}`);
          const message = result.started
            ? messages.play.nowPlaying(tracks[0].title)
            : tracks.length === 1
              ? messages.play.queuedOne(tracks[0].title)
              : messages.play.queuedMany(tracks.length, tracks[0].title);
          if (!result.started) {
            log.warn(
              interaction.guildId,
              `[queue] replying queued current=${player.current?.title || 'none'} queue=${player.queue.length} audio=${player.audioPlayer.state?.status || 'unknown'} voice=${player.voiceConnection.state?.status || 'unknown'} userVoice=${voiceChannel.id} botVoice=${interaction.guild.members.me?.voice?.channelId || 'none'} addedTitles=${tracks.map((track) => track.title).join(' | ')}`,
            );
          }
          log.info(interaction.guildId, `[reply] /play editReply-start attempt=${attempt} result=${result.started ? 'started' : 'queued'} deferred=${interaction.deferred} replied=${interaction.replied}`);
          if (result.started) await interaction.editReply({ embeds: [successEmbed(message)] });
          else await finishQueuedReply(interaction, player, message);
          log.info(interaction.guildId, `[reply] /play editReply-ok attempt=${attempt} result=${result.started ? 'started' : 'queued'} deferred=${interaction.deferred} replied=${interaction.replied}`);
          log.info(interaction.guildId, `[timing] /play total duration=${Date.now() - commandStartedAt}ms attempt=${attempt} result=${result.started ? 'started' : 'queued'}`);
          return;
        } catch (error) {
          if (!authRefreshed && isYoutubeAuthError(error)) {
            authRefreshed = true;
            await updateStatus(interaction, messages.play.authRefreshing);
            log.warn(interaction.guildId, `YouTube auth error on /play, refreshing auth once... query=${safeForLog(query)} meta=${JSON.stringify(sanitizeMeta(error.meta))} cause=${safeForLog(error.cause?.message || error.message)}`);
            await refreshYoutubeAuth(log, interaction.guildId);
            await delay(1500);
            continue;
          }
          if (attempt === 1 && shouldRetry(error)) {
            log.warn(interaction.guildId, `Transient YouTube error on /play, retrying once... query=${safeForLog(query)} meta=${JSON.stringify(sanitizeMeta(error.meta))} cause=${safeForLog(error.cause?.message || error.message)}`);
            await delay(1200);
            continue;
          }
          if (shouldRetry(error) || isYoutubeAuthError(error)) {
            log.error(interaction.guildId, `Returning YouTube failure to user on /play query=${safeForLog(query)} attempt=${attempt} meta=${JSON.stringify(sanitizeMeta(error.meta))} cause=${safeForLog(error.cause?.message || error.message)}`);
          }
          throw error;
        }
      }
    });
  },
};
