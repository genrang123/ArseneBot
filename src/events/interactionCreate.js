const { Events } = require('discord.js');
const { messages } = require('../config/messages');
const { errorEmbed } = require('../ui/embeds');
const { nowPlayingMessage, MUSIC_CONTROL_IDS } = require('../ui/musicControls');
const { UserFacingMusicError } = require('../music/errors');
const { requireSameVoiceChannel } = require('../commands/voiceAccess');

// Commands that need early deferReply (slow operations: search, stream, voice join)
const DEFER_COMMANDS = new Set(['alo', 'mixi', 'play', 'playnext', 'seek']);

function commandOptionsSummary(interaction) {
  const options = interaction.options?.data || [];
  if (!options.length) return 'none';
  return options.map((option) => {
    const name = option.name || 'unknown';
    const sensitive = /(token|secret|password|pass|cookie|key)/i.test(name);
    const raw = String(option.value ?? '[complex]');
    const allowValue = /^(id|page|count|limit|index|position|volume|mode)$/i.test(name);
    const value = sensitive ? '[REDACTED]' : allowValue ? raw.slice(0, 120) : `[len=${raw.length}]`;
    return `${name}=${value}`;
  }).join(' ');
}

async function handleMusicControl(interaction, context) {
  const { musicManager } = context;

  await musicManager.withGuildLock(interaction.guildId, async () => {
    const player = musicManager.get(interaction.guildId);
    requireSameVoiceChannel(interaction, player);

    if (!player) {
      await interaction.reply({ embeds: [errorEmbed(messages.playback.noPlayerInGuild)], ephemeral: true });
      return;
    }

    switch (interaction.customId) {
      case MUSIC_CONTROL_IDS.back: {
        // Pre-check: only an early-exit error goes through interaction.reply.
        // On the happy path we defer immediately so Discord doesn't time out
        // while player.back() waits for youtube.createStream.
        if (!player.current || !(player.history?.length > 0)) {
          await interaction.reply({ embeds: [errorEmbed(messages.playback.noPreviousTrack)], ephemeral: true });
          return;
        }
        await interaction.deferUpdate();
        const previous = await player.back();
        if (!previous) {
          await interaction.followUp({ embeds: [errorEmbed(messages.playback.noPreviousTrack)], ephemeral: true });
        }
        return;
      }
      case MUSIC_CONTROL_IDS.pause: {
        if (!player.current) {
          await interaction.reply({ embeds: [errorEmbed(messages.playback.noCurrentTrack)], ephemeral: true });
          return;
        }
        player.pause();
        await interaction.update(nowPlayingMessage(player.current, player));
        return;
      }
      case MUSIC_CONTROL_IDS.resume: {
        if (!player.current) {
          await interaction.reply({ embeds: [errorEmbed(messages.playback.noCurrentTrack)], ephemeral: true });
          return;
        }
        player.resume();
        await interaction.update(nowPlayingMessage(player.current, player));
        return;
      }
      case MUSIC_CONTROL_IDS.skip: {
        if (!player.current) {
          await interaction.reply({ embeds: [errorEmbed(messages.playback.noCurrentTrack)], ephemeral: true });
          return;
        }
        await interaction.deferUpdate();
        player.skip();
        return;
      }
      case MUSIC_CONTROL_IDS.stop: {
        await interaction.deferUpdate();
        player.stop();
        return;
      }
      default:
        await interaction.reply({ embeds: [errorEmbed(messages.common.invalidControlButton)], ephemeral: true });
    }
  });
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, context) {
    if (interaction.isButton() && Object.values(MUSIC_CONTROL_IDS).includes(interaction.customId)) {
      try {
        await handleMusicControl(interaction, context);
      } catch (error) {
        context.log.error(interaction.guildId, `[button] error ${interaction.customId}`, error);
        const message = error instanceof UserFacingMusicError ? error.message : messages.common.genericError;
        const payload = { embeds: [errorEmbed(message)], ephemeral: true };
        try {
          if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
          else await interaction.reply(payload);
        } catch (replyError) {
          context.log.warn(interaction.guildId, `Failed to send button error response: ${replyError.code || replyError.message}`);
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;

    const startedAt = Date.now();
    const userTag = interaction.user?.tag || interaction.user?.id || 'unknown';
    context.log.info(interaction.guildId, `[command] start /${interaction.commandName} user=${userTag}(${interaction.user?.id || 'unknown'}) channel=${interaction.channelId || 'unknown'} options=${commandOptionsSummary(interaction)}`);

    // Defer early for slow commands to avoid 3-second timeout
    if (DEFER_COMMANDS.has(interaction.commandName)) {
      context.log.info(interaction.guildId, `[command] defer-start /${interaction.commandName} duration=${Date.now() - startedAt}ms deferred=${interaction.deferred} replied=${interaction.replied}`);
      try {
        await interaction.deferReply();
        context.log.info(interaction.guildId, `[command] defer-ok /${interaction.commandName} duration=${Date.now() - startedAt}ms deferred=${interaction.deferred} replied=${interaction.replied}`);
      } catch (error) {
        context.log.warn(interaction.guildId, `[command] expired-before-defer /${interaction.commandName} duration=${Date.now() - startedAt}ms error=${error.code || error.message}`);
        return;
      }
    }

    try {
      await command.execute(interaction, context);
      context.log.info(interaction.guildId, `[command] end /${interaction.commandName} duration=${Date.now() - startedAt}ms deferred=${interaction.deferred} replied=${interaction.replied}`);
    } catch (error) {
      context.log.error(interaction.guildId, `[command] error /${interaction.commandName} duration=${Date.now() - startedAt}ms`, error);
      const message = error instanceof UserFacingMusicError ? error.message : messages.common.genericError;
      const payload = { embeds: [errorEmbed(message)] };
      try {
        if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
        else await interaction.reply(payload);
      } catch (replyError) {
        context.log.warn(interaction.guildId, `Failed to send interaction error response: ${replyError.code || replyError.message}`);
      }
    }
  },
};
