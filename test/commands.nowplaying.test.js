const test = require('node:test');
const assert = require('node:assert/strict');

const nowPlayingCommand = require('../src/commands/nowplaying');

function createInteraction() {
  const replies = [];
  return {
    guildId: 'g1',
    member: { voice: { channel: { id: 'v1' } } },
    guild: { members: { me: { voice: { channelId: 'v1' } } } },
    reply: async (payload) => { replies.push(payload); },
    _replies: replies,
  };
}

test('nowplaying returns a snapshot embed without control buttons', async () => {
  const interaction = createInteraction();
  const player = {
    current: { title: 'Song A', url: 'https://example.test/a', duration: 90, thumbnail: null },
    voiceChannelId: 'v1',
    volume: 100,
    loopMode: 'off',
  };

  await nowPlayingCommand.execute(interaction, {
    musicManager: { get: () => player },
  });

  assert.equal(interaction._replies.length, 1);
  assert.equal(Array.isArray(interaction._replies[0].embeds), true);
  assert.equal('components' in interaction._replies[0], false);
});
