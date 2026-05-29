const test = require('node:test');
const assert = require('node:assert/strict');

const playnextCommand = require('../src/commands/playnext');
const { messages } = require('../src/config/messages');

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

test('queued playnext republishes now playing and schedules queue ack cleanup', async () => {
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
    await playnextCommand.execute(interaction, {
      youtube: {
        resolveQuery: async () => [{ title: 'Billie Jean', url: 'https://youtube.com/watch?v=1' }],
      },
      musicManager: {
        withGuildLock: async (_guildId, task) => task(),
        getOrCreate: () => ({
          enqueueNext: async () => ({ started: false, added: 1 }),
          publishNowPlayingMessage: async () => { republished += 1; },
        }),
      },
      log: { info() {}, warn() {}, error() {} },
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(republished, 1);
    assert.equal(interaction._replies.at(-1).embeds[0].data.description, messages.playnext.queuedOne('Billie Jean'));
    assert.deepEqual(scheduled, [8000]);
    assert.equal(interaction._deleteCount(), 1);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});
