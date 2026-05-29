const test = require('node:test');
const assert = require('node:assert/strict');

const playCommand = require('../src/commands/play');
const { messages } = require('../src/config/messages');
const { UserFacingMusicError } = require('../src/music/errors');

function createInteraction() {
  const replies = [];
  let deleted = 0;
  return {
    guildId: 'g1',
    channelId: 't1',
    user: { id: 'u1', username: 'user1' },
    options: { getString: () => 'billie jean' },
    member: {
      voice: {
        channel: {
          id: 'v1',
          permissionsFor: () => ({ has: () => true }),
        },
      },
    },
    guild: { id: 'g1', members: { me: {} } },
    editReply: async (payload) => { replies.push(payload); },
    deleteReply: async () => { deleted += 1; },
    _replies: replies,
    _deleteCount: () => deleted,
  };
}

test('play retries once on transient youtube error and then succeeds', async () => {
  const interaction = createInteraction();
  let calls = 0;

  const context = {
    youtube: {
      resolveQuery: async () => {
        calls += 1;
        if (calls === 1) throw new UserFacingMusicError(messages.youtube.transientError);
        return [{ title: 'Billie Jean', url: 'https://youtube.com/watch?v=1' }];
      },
    },
    musicManager: {
      withGuildLock: async (_guildId, task) => task(),
      getOrCreate: () => ({
        enqueue: async () => ({ started: true }),
      }),
    },
    log: { info() {}, warn() {}, error() {} },
  };

  await playCommand.execute(interaction, context);

  assert.equal(calls, 2);
  assert.ok(interaction._replies.length >= 3);
  assert.equal(interaction._replies[0].embeds[0].data.description, messages.play.searching);
  assert.equal(interaction._replies[interaction._replies.length - 1].embeds[0].data.description, messages.play.nowPlaying('Billie Jean'));
});

test('queued play republishes now playing and schedules queue ack cleanup', async () => {
  const interaction = createInteraction();
  let republished = 0;
  const scheduled = [];
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms) => {
    scheduled.push(ms);
    Promise.resolve().then(fn);
    return { ms };
  };

  try {
    await playCommand.execute(interaction, {
      youtube: {
        resolveQuery: async () => [{ title: 'Billie Jean', url: 'https://youtube.com/watch?v=1' }],
      },
      musicManager: {
        withGuildLock: async (_guildId, task) => task(),
        getOrCreate: () => ({
          enqueue: async () => ({ started: false, added: 1 }),
          publishNowPlayingMessage: async () => { republished += 1; },
          current: { title: 'Current Song' },
          queue: [{ title: 'Billie Jean' }],
          audioPlayer: { state: { status: 'playing' } },
          voiceConnection: { state: { status: 'ready' } },
        }),
      },
      log: { info() {}, warn() {}, error() {} },
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(republished, 1);
    assert.equal(interaction._replies.at(-1).embeds[0].data.description, messages.play.queuedOne('Billie Jean'));
    assert.deepEqual(scheduled, [8000]);
    assert.equal(interaction._deleteCount(), 1);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});
