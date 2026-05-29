const { EventEmitter } = require('node:events');
const { messages } = require('../config/messages');
const { createReadStream, existsSync } = require('node:fs');
const { AudioPlayerStatus, VoiceConnectionStatus, createAudioResource, entersState, StreamType } = require('@discordjs/voice');
const { nowPlayingMessage } = require('../ui/musicControls');
const { UserFacingMusicError } = require('./errors');

class GuildPlayer extends EventEmitter {
  constructor({
    guildId,
    voiceChannelId,
    textChannelId,
    audioPlayer,
    voiceConnection,
    youtube,
    createAudioResource: createResource = createAudioResource,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    notify = async () => {},
    log = console,
    onDestroy,
  }) {
    super();
    this.guildId = guildId;
    this.voiceChannelId = voiceChannelId;
    this.textChannelId = textChannelId;
    this.audioPlayer = audioPlayer;
    this.voiceConnection = voiceConnection;
    this.youtube = youtube;
    this.createAudioResource = createResource;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.notify = notify;
    this.log = log;
    this.onDestroy = onDestroy;
    this.queue = [];
    this.current = null;
    this.history = [];
    this.loopMode = 'off';
    this.autoplayEnabled = false;
    this.volume = 100;
    this.paused = false;
    this.idleTimer = null;
    this.currentResource = null;
    this.isLoading = false;
    this.pendingSkip = false;
    this.nowPlayingMessageRef = null;
    this._suppressIdle = false;

    this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      this.log.info(this.guildId, 'AudioPlayer → idle');
      if (this._suppressIdle) {
        this.log.info(this.guildId, 'AudioPlayer idle suppressed (manual track transition)');
        return;
      }
      this.handleIdle().catch((error) => this.emit('error', error));
    });
    this.audioPlayer.on('error', (error) => {
      this.log.error(this.guildId, 'AudioPlayer error', error);
      this.cleanupCurrentStream();
      this.handleAudioError(error).catch((handlerError) => this.emit('error', handlerError));
    });
    this.audioPlayer.on(AudioPlayerStatus.Playing, () => {
      this.log.info(this.guildId, 'AudioPlayer → playing');
    });
    this.audioPlayer.on(AudioPlayerStatus.Buffering, () => {
      this.log.info(this.guildId, 'AudioPlayer → buffering');
    });
  }

  async enqueue(tracks) {
    this.clearIdleTimer();
    this.resetStaleCurrentIfIdle();
    if (!this.current && this.queue.length === 0) {
      const [first, ...rest] = tracks;
      this.current = first || null;
      this.queue.push(...rest);
      if (this.current) {
        try {
          await this.playCurrent();
        } catch (error) {
          this.current = null;
          this.queue = [];
          throw error;
        }
      }
      return { started: Boolean(this.current), added: rest.length };
    }

    this.queue.push(...tracks);
    return { started: false, added: tracks.length };
  }

  async enqueueNext(tracks) {
    this.clearIdleTimer();
    this.resetStaleCurrentIfIdle();
    if (!this.current && this.queue.length === 0) {
      return this.enqueue(tracks);
    }

    this.queue.unshift(...tracks);
    return { started: false, added: tracks.length };
  }

  resetStaleCurrentIfIdle() {
    if (this.isLoading) return;
    if (this.audioPlayer.state?.status !== AudioPlayerStatus.Idle) return;
    if (!this.current && this.queue.length === 0) return;

    this.log.warn(this.guildId, `Clearing stale playback state while audio player is idle: current=${this.current?.title || 'none'}, queue=${this.queue.length}`);
    this.cleanupCurrentStream();
    if (this.current) this.history.push(this.current);
    this.current = null;
  }

  async playCurrent(seekSeconds = 0) {
    if (!this.current) return;
    const playStartedAt = Date.now();
    this.isLoading = true;
    this.cleanupCurrentStream();
    try {
      const voiceReadyStartedAt = Date.now();
      await this.waitForVoiceReady();
      this.log.info(this.guildId, `[timing] playCurrent voice-ready duration=${Date.now() - voiceReadyStartedAt}ms track=${this.current.title}`);
      this.log.info(this.guildId, `Creating stream for: ${this.current.title}`);
      const createStreamStartedAt = Date.now();
      const stream = await this.youtube.createStream(this.current, seekSeconds);
      this.log.info(this.guildId, `Stream created, type=${stream.type}, connection state=${this.voiceConnection.state?.status}`);
      this.log.info(this.guildId, `[timing] playCurrent create-stream duration=${Date.now() - createStreamStartedAt}ms track=${this.current.title}`);

      const resource = this.createAudioResource(stream.stream, {
        inputType: stream.type || StreamType.Arbitrary,
        inlineVolume: true,
        metadata: {
          streamProcess: stream.streamProcess,
          upstreamProcess: stream.upstreamProcess,
        },
      });
      this.attachResourceDebug(resource, this.current);
      this.currentResource = resource;
      resource.volume?.setVolume(this.volume / 100);

      this.log.info(this.guildId, `Playing resource, player state=${this.audioPlayer.state?.status}`);
      this.audioPlayer.play(resource);
      this.log.info(this.guildId, `After play(), player state=${this.audioPlayer.state?.status}`);
      this.log.info(this.guildId, `[timing] playCurrent total duration=${Date.now() - playStartedAt}ms track=${this.current.title}`);
      if (seekSeconds === 0) await this.publishNowPlayingMessage();
    } finally {
      this.isLoading = false;
    }

    if (this.pendingSkip) {
      this.pendingSkip = false;
      this.audioPlayer.stop();
    }
  }


  attachResourceDebug(resource, track) {
    const title = track?.title || 'unknown';
    resource.playStream?.once?.('end', () => this.log.warn(this.guildId, `[debug] resource playStream ended track=${title}`));
    resource.playStream?.once?.('close', () => this.log.warn(this.guildId, `[debug] resource playStream closed track=${title}`));
    resource.playStream?.once?.('error', (error) => this.log.error(this.guildId, `[debug] resource playStream error track=${title}`, error));
    resource.stream?.once?.('end', () => this.log.warn(this.guildId, `[debug] resource stream ended track=${title}`));
    resource.stream?.once?.('close', () => this.log.warn(this.guildId, `[debug] resource stream closed track=${title}`));
    resource.stream?.once?.('error', (error) => this.log.error(this.guildId, `[debug] resource stream error track=${title}`, error));
  }

  async waitForVoiceReady() {
    const status = this.voiceConnection.state?.status;
    if (status === VoiceConnectionStatus.Ready) return;

    this.log.info(this.guildId, `Waiting for voice connection ready, current state=${status}`);
    try {
      await entersState(this.voiceConnection, VoiceConnectionStatus.Ready, 15000);
    } catch (error) {
      throw new UserFacingMusicError(messages.voice.connectionNotReady, error);
    }
  }

  async handleIdle() {
    this.log.info(this.guildId, `handleIdle called, current=${this.current?.title}, loop=${this.loopMode}, queue=${this.queue.length}`);
    if (!this.current) {
      await this.clearNowPlayingMessage();
      this.startIdleTimer();
      return;
    }

    if (this.loopMode === 'track') {
      await this.playCurrent();
      return;
    }

    const finished = this.current;
    this.cleanupCurrentStream();
    await this.clearNowPlayingMessage();
    if (this.loopMode === 'queue') this.queue.push(finished);
    else this.history.push(finished);

    if (this.loopMode === 'off' && this.queue.length === 0 && this.autoplayEnabled) {
      const relatedTrack = await this.youtube.getRelatedTrack?.(finished, finished.requestedBy);
      if (relatedTrack) {
        this.queue.push(relatedTrack);
        await this.notify(messages.playback.autoplayNext(relatedTrack.title));
      }
    }

    this.current = this.queue.shift() || null;
    if (this.current) await this.playCurrent();
    else startIdleTimerSafe(this);
  }

  async handleAudioError(error) {
    const failedTrack = this.current;
    this.log.error(this.guildId, 'Audio player error', error);
    await this.clearNowPlayingMessage();
    if (failedTrack) {
      await this.notify(messages.playback.failedTrackSkipped(failedTrack.title));
      this.history.push(failedTrack);
    }
    this.current = this.queue.shift() || null;
    if (this.current) await this.playCurrent();
    else this.startIdleTimer();
  }

  skip() {
    if (this.isLoading) {
      this.pendingSkip = true;
      return;
    }
    this.audioPlayer.stop();
  }

  stop() {
    this.queue = [];
    this.current = null;
    this.clearNowPlayingMessage().catch(() => {});
    this.cleanupCurrentStream();
    this.audioPlayer.stop(true);
    this.startIdleTimer();
  }

  pause() {
    const paused = this.audioPlayer.pause();
    if (paused) this.paused = true;
    return paused;
  }

  resume() {
    const resumed = this.audioPlayer.unpause();
    if (resumed) this.paused = false;
    return resumed;
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(200, volume));
    this.currentResource?.volume?.setVolume(this.volume / 100);
  }

  setLoopMode(loopMode) {
    this.loopMode = loopMode;
  }

  setAutoplayEnabled(enabled) {
    this.autoplayEnabled = Boolean(enabled);
  }

  isIdle() {
    return !this.isLoading
      && !this.current
      && this.queue.length === 0
      && this.audioPlayer.state?.status !== AudioPlayerStatus.Playing
      && this.audioPlayer.state?.status !== AudioPlayerStatus.Buffering;
  }

  async playClip(filePath, metadata = {}) {
    if (!this.isIdle()) {
      const error = new UserFacingMusicError(messages.playback.currentlyBusy);
      error.code = 'PLAYER_BUSY';
      throw error;
    }

    if (!existsSync(filePath)) {
      const error = new UserFacingMusicError(messages.playback.clipNotFound);
      error.code = 'CLIP_NOT_FOUND';
      throw error;
    }

    this.clearIdleTimer();
    await this.waitForVoiceReady();
    this.cleanupCurrentStream();

    const stream = createReadStream(filePath);
    const resource = this.createAudioResource(stream, {
      inputType: StreamType.Arbitrary,
      inlineVolume: true,
      metadata,
    });
    this.currentResource = resource;
    resource.volume?.setVolume(this.volume / 100);
    this.audioPlayer.play(resource);
  }

  shuffle() {
    for (let index = this.queue.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [this.queue[index], this.queue[swapIndex]] = [this.queue[swapIndex], this.queue[index]];
    }
  }

  async seek(seconds) {
    if (!this.current) throw new UserFacingMusicError(messages.playback.noCurrentTrack);
    if (!Number.isFinite(this.current.duration)) throw new UserFacingMusicError(messages.playback.seekUnsupported);
    if (seconds > this.current.duration) throw new UserFacingMusicError(messages.playback.seekOutOfRange);
    await this.playCurrent(seconds);
  }

  remove(index) {
    const zeroBasedIndex = index - 1;
    if (zeroBasedIndex < 0 || zeroBasedIndex >= this.queue.length) return null;
    return this.queue.splice(zeroBasedIndex, 1)[0];
  }

  async back() {
    if (this.isLoading) return null;

    // Skip any duplicate history entry that still points at the current track.
    while (this.history.length > 0 && this.current && this.history[this.history.length - 1]?.url === this.current.url) {
      this.history.pop();
    }

    const previous = this.history.pop() || null;
    if (!previous) return null;

    this.clearIdleTimer();
    if (this.current) this.queue.unshift(this.current);
    this.current = previous;

    // Stop current playback and suppress the idle handler during the entire
    // transition to prevent:
    // 1. Audio overlap (cleanupCurrentStream only kills the process, not buffered audio)
    // 2. handleIdle racing and corrupting queue/history/nowPlaying state
    // 3. Spurious idle events from stream cleanup during playCurrent()
    try {
      this._suppressIdle = true;
      if (this.audioPlayer.state?.status !== AudioPlayerStatus.Idle) {
        this.audioPlayer.stop();
      }
      await this.playCurrent();
      return previous;
    } finally {
      this._suppressIdle = false;
    }
  }

  setNowPlayingMessageRef(messageRef) {
    this.nowPlayingMessageRef = messageRef || null;
  }

  async publishNowPlayingMessage() {
    if (!this.current) return null;
    await this.clearNowPlayingMessage();
    const sentMessage = await this.notify(nowPlayingMessage(this.current, this));
    this.nowPlayingMessageRef = sentMessage || null;
    return sentMessage;
  }

  async refreshNowPlayingMessage() {
    if (!this.current) return null;
    if (this.nowPlayingMessageRef?.edit) {
      const updatedMessage = await this.nowPlayingMessageRef.edit(nowPlayingMessage(this.current, this));
      this.nowPlayingMessageRef = updatedMessage || this.nowPlayingMessageRef;
      return this.nowPlayingMessageRef;
    }
    return this.publishNowPlayingMessage();
  }

  async clearNowPlayingMessage() {
    if (!this.nowPlayingMessageRef?.delete) {
      this.nowPlayingMessageRef = null;
      return;
    }

    const messageRef = this.nowPlayingMessageRef;
    this.nowPlayingMessageRef = null;
    try {
      await messageRef.delete();
    } catch (error) {
      this.log.warn(this.guildId, `Failed to delete now playing message: ${error.code || error.message}`);
    }
  }

  startIdleTimer() {
    this.clearIdleTimer();
    this.idleTimer = this.setTimeoutFn(() => this.destroy(), 5 * 60 * 1000);
  }

  clearIdleTimer() {
    if (!this.idleTimer) return;
    this.clearTimeoutFn(this.idleTimer);
    this.idleTimer = null;
  }

  destroy() {
    this.clearIdleTimer();
    this.queue = [];
    this.current = null;
    this.clearNowPlayingMessage().catch(() => {});
    this.cleanupCurrentStream();
    this.audioPlayer.stop(true);
    if (this.voiceConnection.state?.status !== 'destroyed') this.voiceConnection.destroy();
    this.onDestroy?.(this.guildId);
  }

  cleanupCurrentStream() {
    const resource = this.currentResource;
    this.currentResource = null;
    if (!resource) return;

    try {
      resource.playStream?.destroy?.();
      resource.stream?.destroy?.();
      resource.metadata?.streamProcess?.kill?.();
      resource.metadata?.upstreamProcess?.kill?.();
    } catch {
      // ignore stream cleanup errors
    }
  }
}

function startIdleTimerSafe(player) {
  player.startIdleTimer();
}

module.exports = { GuildPlayer };
