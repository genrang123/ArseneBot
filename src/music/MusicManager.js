const voice = require('@discordjs/voice');
const { GuildPlayer } = require('./GuildPlayer');

class MusicManager {
  constructor({ youtube, client = null, joinVoiceChannel = voice.joinVoiceChannel, createAudioPlayer = voice.createAudioPlayer, notify, log = console }) {
    this.youtube = youtube;
    this.client = client;
    this.joinVoiceChannel = joinVoiceChannel;
    this.createAudioPlayer = createAudioPlayer;
    this.notify = notify;
    this.log = log;
    this.players = new Map();
    this.guildLocks = new Map();
  }

  get(guildId) {
    return this.players.get(guildId) || null;
  }

  getOrCreate({ guild, voiceChannel, textChannelId }) {
    const existing = this.get(guild.id);
    if (existing) {
      const status = existing.voiceConnection.state?.status;
      const isReady = status === 'ready';

      if (!isReady) {
        this.log.warn(guild.id, `Discarding stale player (connection=${status}), joining voice channel ${voiceChannel.id}`);
        this.destroy(guild.id);
      } else {
        const botId = guild.members.me?.id;
        const botVoiceChannelId = guild.members.me?.voice?.channelId || null;
        const currentChannel = guild.channels?.cache?.get(existing.voiceChannelId);
        const currentChannelMembers = currentChannel?.members;
        const botPresentInChannel = botId ? Boolean(currentChannelMembers?.has?.(botId)) : true;
        const botVoiceStateMatches = botVoiceChannelId === existing.voiceChannelId;

        if (!botPresentInChannel || !botVoiceStateMatches) {
          this.log.warn(guild.id, `Discarding stale player (bot voice state=${botVoiceChannelId || 'none'}, present=${botPresentInChannel}, expected=${existing.voiceChannelId}), joining ${voiceChannel.id}`);
          this.destroy(guild.id);
        } else {
          if (existing.voiceChannelId !== voiceChannel.id || botVoiceChannelId !== voiceChannel.id) {
            const error = new Error('Bot đang phát ở channel khác.');
            error.code = 'PLAYER_IN_DIFFERENT_CHANNEL';
            throw error;
          }
          return existing;
        }
      }
    }

    const connection = this.joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      debug: process.env.DISCORD_VOICE_DEBUG === '1',
    });
    const audioPlayer = this.createAudioPlayer();
    connection.subscribe(audioPlayer);

    const player = new GuildPlayer({
      guildId: guild.id,
      voiceChannelId: voiceChannel.id,
      textChannelId,
      audioPlayer,
      voiceConnection: connection,
      youtube: this.youtube,
      notify: this.notify || ((message) => this.notifyTextChannel(textChannelId, message)),
      log: this.log,
      onDestroy: (guildId) => this.players.delete(guildId),
    });

    connection.on('stateChange', (oldState, newState) => {
      this.log.info(guild.id, `Voice state: ${oldState.status} → ${newState.status}; details=${describeVoiceState(newState)}`);
      if (newState.status === 'destroyed') {
        const currentPlayer = this.get(guild.id);
        if (currentPlayer?.voiceConnection === connection) {
          currentPlayer.destroy();
          this.log.warn(guild.id, 'Voice connection destroyed; cleaned up player.');
        } else {
          this.log.warn(guild.id, 'Ignored destroyed event from stale voice connection.');
        }
      } else if (newState.status === 'disconnected') {
        this.log.warn(guild.id, 'Voice connection disconnected; waiting for reconnect.');
      }
    });
    connection.on('debug', (message) => {
      this.log.info(guild.id, `Voice debug: ${redactVoiceDebug(message)}`);
    });
    connection.on('error', (error) => {
      this.log.error(guild.id, 'Voice connection error', error);
    });

    this.players.set(guild.id, player);
    return player;
  }

  async notifyTextChannel(textChannelId, message) {
    const channel = await this.client?.channels.fetch(textChannelId).catch(() => null);
    if (!channel?.isTextBased()) return null;
    return channel.send(message);
  }

  destroy(guildId) {
    const player = this.get(guildId);
    if (!player) return false;
    player.destroy();
    this.players.delete(guildId);
    return true;
  }

  async withGuildLock(guildId, task) {
    const previous = this.guildLocks.get(guildId) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    const queuePromise = previous.then(() => current);
    this.guildLocks.set(guildId, queuePromise);

    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.guildLocks.get(guildId) === queuePromise) {
        this.guildLocks.delete(guildId);
      }
    }
  }
}

function describeVoiceState(state) {
  const details = { status: state.status };
  if (state.reason !== undefined) details.reason = state.reason;
  if (state.networking?.state) details.networking = describeNetworkingState(state.networking.state);
  return JSON.stringify(details);
}

function describeNetworkingState(state) {
  const details = { code: state.code };
  if (state.ws?.endpoint) details.endpoint = state.ws.endpoint;
  if (state.udp) {
    details.udp = {
      remote: `${state.udp.remote?.ip}:${state.udp.remote?.port}`,
      keepAliveInterval: state.udp.keepAliveInterval !== undefined,
    };
  }
  if (state.connectionData) {
    details.connectionData = {
      address: state.connectionData.address,
      port: state.connectionData.port,
      mode: state.connectionData.encryptionMode,
    };
  }
  return details;
}

function redactVoiceDebug(message) {
  return String(message)
    .replace(/"token":"[^"]+"/g, '"token":"[redacted]"')
    .replace(/"session_id":"[^"]+"/g, '"session_id":"[redacted]"');
}

module.exports = { MusicManager };
