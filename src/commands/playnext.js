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
    .setName('playnext')
    .setDescription(messages.commands.playnext.description)
    .addStringOption((option) => option.setName('query').setDescription(messages.commands.playnext.queryDescription).setRequired(true)),
  async execute(interaction, { youtube, musicManager, log }) {
    const query = interaction.options.getString('query', true);
    const voiceChannel = requireSameVoiceChannel(interaction);

    const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
    if (!permissions.has(PermissionsBitField.Flags.Connect) || !permissions.has(PermissionsBitField.Flags.Speak)) {
      await interaction.editReply({ embeds: [errorEmbed(messages.voice.botMissingPermissions)] });
      return;
    }

    await musicManager.withGuildLock(interaction.guildId, async () => {
      log.info(interaction.guildId, `User ${interaction.user.id} requested playnext: ${safeForLog(query)}`);
      await updateStatus(interaction, messages.playnext.searching);

      let authRefreshed = false;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const tracks = await youtube.resolveQuery(query, {
            id: interaction.user.id,
            username: interaction.user.username,
          });
          if (tracks.length === 0) {
            await interaction.editReply({ embeds: [errorEmbed(messages.play.noResults)] });
            return;
          }

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

          const result = await player.enqueueNext(tracks);
          const message = result.started
            ? messages.playnext.nowPlaying(tracks[0].title)
            : tracks.length === 1
              ? messages.playnext.queuedOne(tracks[0].title)
              : messages.playnext.queuedMany(tracks.length, tracks[0].title);
          if (result.started) await interaction.editReply({ embeds: [successEmbed(message)] });
          else await finishQueuedReply(interaction, player, message);
          return;
        } catch (error) {
          if (!authRefreshed && isYoutubeAuthError(error)) {
            authRefreshed = true;
            await updateStatus(interaction, messages.play.authRefreshing);
            log.warn(interaction.guildId, `YouTube auth error on /playnext, refreshing auth once... query=${safeForLog(query)} meta=${JSON.stringify(sanitizeMeta(error.meta))} cause=${safeForLog(error.cause?.message || error.message)}`);
            await refreshYoutubeAuth(log, interaction.guildId);
            await delay(1500);
            continue;
          }
          if (attempt === 1 && shouldRetry(error)) {
            log.warn(interaction.guildId, `Transient YouTube error on /playnext, retrying once... query=${safeForLog(query)} meta=${JSON.stringify(sanitizeMeta(error.meta))} cause=${safeForLog(error.cause?.message || error.message)}`);
            await delay(1200);
            continue;
          }
          throw error;
        }
      }
    });
  },
};
