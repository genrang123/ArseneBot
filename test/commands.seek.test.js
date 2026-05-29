const test = require('node:test');
const assert = require('node:assert/strict');

const seekCommand = require('../src/commands/seek');

function createInteraction(seconds = 42) {
  const replies = [];
  return {
    guildId: 'g1',
    deferred: true,
    replied: false,
    options: { getInteger: () => seconds },
    member: { voice: { channel: { id: 'v1' } } },
    guild: { members: { me: { voice: { channelId: 'v1' } } } },
    editReply: async (payload) => { replies.push(payload); },
    _replies: replies,
  };
}

test('seek refreshes the managed now playing message after seeking', async () => {
  const interaction = createInteraction(42);
  let seekCalls = 0;
  let refreshCalls = 0;
  const player = {
    current: { title: 'Song A' },
    voiceChannelId: 'v1',
    seek: async () => { seekCalls += 1; },
    refreshNowPlayingMessage: async () => { refreshCalls += 1; },
  };

  await seekCommand.execute(interaction, {
    musicManager: {
      withGuildLock: async (_guildId, task) => task(),
      get: () => player,
    },
  });

  assert.equal(seekCalls, 1);
  assert.equal(refreshCalls, 1);
  assert.equal(interaction._replies.length, 1);
});
