const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { AudioPlayerStatus } = require('@discordjs/voice');
const { GuildPlayer } = require('../../src/music/GuildPlayer');

function track(title, duration = 60) {
  return { title, url: `https://example.test/${title}`, duration, requestedBy: { id: 'u1' }, thumbnail: null };
}

function createFakeAudioPlayer() {
  const player = new EventEmitter();
  player.played = [];
  player.stopped = 0;
  player.paused = false;
  player.state = { status: AudioPlayerStatus.Idle };
  player.play = (resource) => { player.state = { status: AudioPlayerStatus.Playing }; player.played.push(resource); };
  player.stop = () => { player.stopped += 1; player.state = { status: AudioPlayerStatus.Idle }; player.emit('idle'); };
  player.pause = () => { player.paused = true; return true; };
  player.unpause = () => { player.paused = false; return true; };
  return player;
}

function createPlayer(overrides = {}) {
  const audioPlayer = createFakeAudioPlayer();
  const resources = [];
  const sentMessages = [];
  const youtube = {
    createStream: async (current, seekSeconds = 0) => ({ stream: { current, seekSeconds }, type: 'opus' }),
  };
  const voiceConnection = { state: { status: 'ready' }, destroyed: false, destroy() { this.destroyed = true; } };
  const player = new GuildPlayer({
    guildId: 'g1',
    voiceChannelId: 'v1',
    textChannelId: 't1',
    audioPlayer,
    voiceConnection,
    youtube,
    createAudioResource: (stream, options) => {
      const resource = {
        stream,
        playStream: {
          destroyed: false,
          destroy() { this.destroyed = true; },
        },
        options,
        volumeValue: null,
        volume: { setVolume(value) { resource.volumeValue = value; } },
      };
      resources.push(resource);
      return resource;
    },
    setTimeoutFn: (fn, ms) => ({ fn, ms }),
    clearTimeoutFn: (timer) => { timer.cleared = true; },
    notify: async (message) => {
      const sentMessage = {
        payload: message,
        deleted: false,
        async delete() { this.deleted = true; },
      };
      sentMessages.push(sentMessage);
      return sentMessage;
    },
    log: { info() {}, warn() {}, error() {} },
    onDestroy: () => {},
    ...overrides,
  });
  return { player, audioPlayer, voiceConnection, resources, sentMessages };
}

test('enqueue starts first track and queues the rest', async () => {
  const { player, audioPlayer } = createPlayer();

  const result = await player.enqueue([track('one'), track('two')]);

  assert.equal(result.started, true);
  assert.equal(player.current.title, 'one');
  assert.deepEqual(player.queue.map((item) => item.title), ['two']);
  assert.equal(audioPlayer.played.length, 1);
});

test('idle event advances exactly once', async () => {
  const { player, audioPlayer, sentMessages } = createPlayer();
  await player.enqueue([track('one'), track('two'), track('three')]);

  audioPlayer.emit('idle');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(player.history.map((item) => item.title), ['one']);
  assert.equal(player.current.title, 'two');
  assert.deepEqual(player.queue.map((item) => item.title), ['three']);
  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[0].deleted, true);
  assert.equal(sentMessages[1].deleted, false);
});

test('idle with loop queue rotates current to queue tail', async () => {
  const { player } = createPlayer();
  await player.enqueue([track('one'), track('two')]);
  player.setLoopMode('queue');

  await player.handleIdle();

  assert.equal(player.current.title, 'two');
  assert.deepEqual(player.queue.map((item) => item.title), ['one']);
});

test('skip advances to the next track without replaying the old resource', async () => {
  const { player, audioPlayer, resources, sentMessages } = createPlayer();
  await player.enqueue([track('one'), track('two')]);

  const firstResource = resources[0];
  player.skip();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(player.current.title, 'two');
  assert.equal(audioPlayer.played.length, 2);
  assert.equal(audioPlayer.played[1], resources[1]);
  assert.notEqual(audioPlayer.played[1], firstResource);
  assert.equal(firstResource.playStream.destroyed, true);
  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[0].deleted, true);
  assert.equal(sentMessages[1].deleted, false);
});

test('enqueue clears stale current when audio player is idle', async () => {
  const { player, audioPlayer } = createPlayer();
  await player.enqueue([track('stale')]);
  audioPlayer.state = { status: AudioPlayerStatus.Idle };

  const result = await player.enqueue([track('fresh')]);

  assert.equal(result.started, true);
  assert.equal(result.added, 0);
  assert.equal(player.current.title, 'fresh');
  assert.deepEqual(player.history.map((item) => item.title), ['stale']);
});

test('enqueue preserves queued tracks when clearing stale current while idle', async () => {
  const { player, audioPlayer } = createPlayer();
  await player.enqueue([track('stale-current'), track('stale-queued')]);
  audioPlayer.state = { status: AudioPlayerStatus.Idle };

  const result = await player.enqueue([track('fresh')]);

  assert.equal(result.started, false);
  assert.equal(result.added, 1);
  assert.equal(player.current, null);
  assert.deepEqual(player.queue.map((item) => item.title), ['stale-queued', 'fresh']);
  assert.deepEqual(player.history.map((item) => item.title), ['stale-current']);
});

test('enqueueNext inserts tracks at the front of the queue', async () => {
  const { player } = createPlayer();
  await player.enqueue([track('one'), track('two')]);

  const result = await player.enqueueNext([track('urgent'), track('urgent-2')]);

  assert.equal(result.started, false);
  assert.equal(result.added, 2);
  assert.deepEqual(player.queue.map((item) => item.title), ['urgent', 'urgent-2', 'two']);
});

test('back restores the previous track and keeps current next in queue', async () => {
  const { player } = createPlayer();
  await player.enqueue([track('one'), track('two')]);
  await player.handleIdle();

  const previous = await player.back();

  assert.equal(previous.title, 'one');
  assert.equal(player.current.title, 'one');
  assert.deepEqual(player.queue.map((item) => item.title), ['two']);
  assert.deepEqual(player.history.map((item) => item.title), []);
});

test('back does not mutate playback state while a new track is still loading', async () => {
  let releaseStream;
  const youtube = {
    createStream: (current, seekSeconds = 0) => new Promise((resolve) => {
      releaseStream = () => resolve({ stream: { current, seekSeconds }, type: 'opus' });
    }),
  };
  const { player } = createPlayer({ youtube });

  player.current = track('two');
  player.history = [track('one')];
  player.queue = [track('three')];
  const playPromise = player.playCurrent();

  assert.equal(player.isLoading, true);
  const previous = await player.back();

  assert.equal(previous, null);
  assert.equal(player.current.title, 'two');
  assert.deepEqual(player.history.map((item) => item.title), ['one']);
  assert.deepEqual(player.queue.map((item) => item.title), ['three']);

  releaseStream();
  await playPromise;
});

test('back skips duplicate current-track entries in history and restores the true previous track', async () => {
  const { player } = createPlayer();

  player.current = track('two');
  player.history = [track('one'), track('two')];
  player.queue = [track('three')];

  const previous = await player.back();

  assert.equal(previous.title, 'one');
  assert.equal(player.current.title, 'one');
  assert.deepEqual(player.queue.map((item) => item.title), ['two', 'three']);
  assert.deepEqual(player.history.map((item) => item.title), []);
});

test('autoplay adds a related track when queue runs out', async () => {
  const notified = [];
  const { player } = createPlayer({
    youtube: {
      createStream: async (current, seekSeconds = 0) => ({ stream: { current, seekSeconds }, type: 'opus' }),
      getRelatedTrack: async () => track('related'),
    },
    notify: async (message) => {
      notified.push(message);
      return { deleted: false, async delete() { this.deleted = true; } };
    },
  });
  await player.enqueue([track('one')]);
  player.setAutoplayEnabled(true);

  await player.handleIdle();

  assert.equal(player.current.title, 'related');
  assert.deepEqual(player.history.map((item) => item.title), ['one']);
  assert.equal(notified.find((item) => typeof item === 'string'), 'Tự phát tiếp: **related**');
});

test('setVolume updates current audio resource immediately', async () => {
  const { player, resources } = createPlayer();
  await player.enqueue([track('one')]);

  player.setVolume(150);

  assert.equal(player.volume, 150);
  assert.equal(resources[0].volumeValue, 1.5);
});

test('seek rejects unknown duration and out-of-range positions', async () => {
  const { player } = createPlayer();
  await player.enqueue([track('live', null)]);

  await assert.rejects(() => player.seek(5), /không hỗ trợ seek/);

  player.current = track('short', 10);
  await assert.rejects(() => player.seek(11), /vượt quá thời lượng/);
});

test('remove uses one-based queue index', async () => {
  const { player } = createPlayer();
  await player.enqueue([track('one'), track('two'), track('three')]);

  const removed = player.remove(2);

  assert.equal(removed.title, 'three');
  assert.deepEqual(player.queue.map((item) => item.title), ['two']);
});

test('empty queue starts idle timer and enqueue clears it', async () => {
  let clearCount = 0;
  const { player, sentMessages } = createPlayer({ clearTimeoutFn: () => { clearCount += 1; } });
  await player.enqueue([track('one')]);

  await player.handleIdle();

  assert.equal(player.current, null);
  assert.equal(player.idleTimer.ms, 5 * 60 * 1000);
  assert.equal(sentMessages[0].deleted, true);

  await player.enqueue([track('two')]);

  assert.equal(clearCount, 1);
  assert.equal(player.idleTimer, null);
});

test('audio error notifies and advances to next track', async () => {
  const notifications = [];
  const { player, audioPlayer } = createPlayer({
    notify: async (message) => {
      notifications.push(message);
      return { deleted: false, async delete() { this.deleted = true; } };
    },
  });
  await player.enqueue([track('one'), track('two')]);

  audioPlayer.emit('error', new Error('stream died'));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(player.current.title, 'two');
  assert.equal(notifications.filter((item) => typeof item === 'string').length, 1);
});

test('destroy stops player and cleans up active stream', async () => {
  const { player, audioPlayer, resources, voiceConnection } = createPlayer();
  await player.enqueue([track('one')]);

  player.destroy();

  assert.equal(audioPlayer.stopped > 0, true);
  assert.equal(resources[0].playStream.destroyed, true);
  assert.equal(player.currentResource, null);
  assert.equal(voiceConnection.destroyed, true);
});

test('enqueue rolls back current/queue when first play fails', async () => {
  const { player } = createPlayer({
    youtube: {
      createStream: async () => {
        throw new Error('yt fail');
      },
    },
  });

  await assert.rejects(() => player.enqueue([track('one'), track('two')]), /yt fail/);
  assert.equal(player.current, null);
  assert.deepEqual(player.queue, []);
});

test('back suppresses idle handler and stops playback before switching to previous track', async () => {
  const { player, audioPlayer } = createPlayer();

  // Setup: play track one, then idle to advance to track two
  await player.enqueue([track('one'), track('two')]);
  await player.handleIdle();
  assert.equal(player.current.title, 'two');
  assert.deepEqual(player.history.map((item) => item.title), ['one']);
  assert.equal(audioPlayer.state.status, AudioPlayerStatus.Playing);

  const stoppedBefore = audioPlayer.stopped;

  // Call back — should stop the player and suppress idle
  const previous = await player.back();

  assert.equal(previous.title, 'one');
  assert.equal(player.current.title, 'one');
  assert.deepEqual(player.queue.map((item) => item.title), ['two']);
  assert.deepEqual(player.history.map((item) => item.title), []);
  // Verify stop() was called to halt current playback
  assert.equal(audioPlayer.stopped, stoppedBefore + 1);
  // Verify state is Playing again (back restarted playback)
  assert.equal(audioPlayer.state.status, AudioPlayerStatus.Playing);
  // Verify _suppressIdle was reset after transition
  assert.equal(player._suppressIdle, false);
});

test('back resets _suppressIdle even when playCurrent throws', async () => {
  const { player } = createPlayer({
    youtube: {
      createStream: async () => {
        throw new Error('stream failure');
      },
    },
  });
  player.current = track('two');
  player.history = [track('one')];

  await assert.rejects(() => player.back(), /stream failure/);
  assert.equal(player._suppressIdle, false);
});
