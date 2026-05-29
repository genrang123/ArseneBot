const test = require('node:test');
const assert = require('node:assert/strict');

const interactionCreate = require('../src/events/interactionCreate');
const { MUSIC_CONTROL_IDS } = require('../src/ui/musicControls');

function createButtonInteraction(customId) {
  const calls = [];
  return {
    guildId: 'g1',
    customId,
    member: { voice: { channel: { id: 'v1' } } },
    guild: { members: { me: { voice: { channelId: 'v1' } } } },
    isButton: () => true,
    isChatInputCommand: () => false,
    deferUpdate: async () => { calls.push('deferUpdate'); },
    update: async () => { calls.push('update'); },
    reply: async () => { calls.push('reply'); },
    followUp: async () => { calls.push('followUp'); },
    deferred: false,
    replied: false,
    _calls: calls,
  };
}

function createContext(player) {
  return {
    log: { info() {}, warn() {}, error() {} },
    musicManager: {
      withGuildLock: async (_guildId, task) => task(),
      get: () => player,
    },
  };
}

test('skip button defers update and lets player own the message lifecycle', async () => {
  let skipped = 0;
  const interaction = createButtonInteraction(MUSIC_CONTROL_IDS.skip);
  const context = createContext({
    current: { title: 'one' },
    voiceChannelId: 'v1',
    skip() { skipped += 1; },
  });

  await interactionCreate.execute(interaction, context);

  assert.equal(skipped, 1);
  assert.deepEqual(interaction._calls, ['deferUpdate']);
});

test('back button defers update after switching to previous track', async () => {
  let backCalls = 0;
  const interaction = createButtonInteraction(MUSIC_CONTROL_IDS.back);
  const context = createContext({
    current: { title: 'current' },
    history: [{ title: 'previous' }],
    voiceChannelId: 'v1',
    async back() {
      backCalls += 1;
      this.current = { title: 'previous' };
      return this.current;
    },
  });

  await interactionCreate.execute(interaction, context);

  assert.equal(backCalls, 1);
  assert.deepEqual(interaction._calls, ['deferUpdate']);
});

test('stop button defers update and lets player remove the now playing message', async () => {
  let stopCalls = 0;
  const interaction = createButtonInteraction(MUSIC_CONTROL_IDS.stop);
  const context = createContext({
    current: { title: 'current' },
    voiceChannelId: 'v1',
    stop() { stopCalls += 1; },
  });

  await interactionCreate.execute(interaction, context);

  assert.equal(stopCalls, 1);
  assert.deepEqual(interaction._calls, ['deferUpdate']);
});

test('pause button updates the current message in place', async () => {
  let pauseCalls = 0;
  const interaction = createButtonInteraction(MUSIC_CONTROL_IDS.pause);
  const context = createContext({
    current: { title: 'current', url: 'https://example.test/current', duration: 60 },
    history: [],
    queue: [],
    loopMode: 'off',
    volume: 100,
    paused: false,
    voiceChannelId: 'v1',
    pause() {
      pauseCalls += 1;
      this.paused = true;
      return true;
    },
  });

  await interactionCreate.execute(interaction, context);

  assert.equal(pauseCalls, 1);
  assert.deepEqual(interaction._calls, ['update']);
});

test('resume button updates the current message in place', async () => {
  let resumeCalls = 0;
  const interaction = createButtonInteraction(MUSIC_CONTROL_IDS.resume);
  const context = createContext({
    current: { title: 'current', url: 'https://example.test/current', duration: 60 },
    history: [],
    queue: [],
    loopMode: 'off',
    volume: 100,
    paused: true,
    voiceChannelId: 'v1',
    resume() {
      resumeCalls += 1;
      this.paused = false;
      return true;
    },
  });

  await interactionCreate.execute(interaction, context);

  assert.equal(resumeCalls, 1);
  assert.deepEqual(interaction._calls, ['update']);
});
