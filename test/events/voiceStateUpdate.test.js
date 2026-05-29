const test = require('node:test');
const assert = require('node:assert/strict');

const event = require('../../src/events/voiceStateUpdate');

function members(items) {
  return {
    filter(fn) {
      return { size: items.filter(fn).length };
    },
  };
}

test('voiceStateUpdate starts idle timer when no humans remain', () => {
  let started = false;
  const player = { voiceChannelId: 'v1', startIdleTimer: () => { started = true; }, clearIdleTimer: () => {}, destroy: () => {} };
  const guild = {
    id: 'g1',
    members: { me: { id: 'bot1' } },
    channels: { cache: new Map([['v1', { members: members([{ user: { bot: true } }]) }]]) },
  };

  event.execute({ guild, id: 'user1', channelId: 'v1' }, { channelId: 'v1' }, { musicManager: { get: () => player } });

  assert.equal(started, true);
});

test('voiceStateUpdate clears idle timer when a human is present', () => {
  let cleared = false;
  const player = { voiceChannelId: 'v1', startIdleTimer: () => {}, clearIdleTimer: () => { cleared = true; }, destroy: () => {} };
  const guild = {
    id: 'g1',
    members: { me: { id: 'bot1' } },
    channels: { cache: new Map([['v1', { members: members([{ user: { bot: false } }]) }]]) },
  };

  event.execute({ guild, id: 'user1', channelId: 'v1' }, { channelId: 'v1' }, { musicManager: { get: () => player } });

  assert.equal(cleared, true);
});

test('voiceStateUpdate destroys player when bot is kicked/moved out of player channel', () => {
  let destroyed = false;
  const player = {
    voiceChannelId: 'v1',
    startIdleTimer: () => {},
    clearIdleTimer: () => {},
    destroy: () => { destroyed = true; },
  };
  const guild = {
    id: 'g1',
    members: { me: { id: 'bot1' } },
    channels: { cache: new Map([['v1', { members: members([{ user: { bot: false } }]) }]]) },
  };

  event.execute(
    { guild, id: 'bot1', channelId: 'v1' },
    { channelId: null },
    { musicManager: { get: () => player } },
  );

  assert.equal(destroyed, true);
});
