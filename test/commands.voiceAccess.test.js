const test = require('node:test');
const assert = require('node:assert/strict');

const playCommand = require('../src/commands/play');
const stopCommand = require('../src/commands/stop');
const leaveCommand = require('../src/commands/leave');
const queueCommand = require('../src/commands/queue');
const nowPlayingCommand = require('../src/commands/nowplaying');
const { messages } = require('../src/config/messages');
const { UserFacingMusicError } = require('../src/music/errors');

function createVoiceInteraction({ memberChannelId = 'v1', botChannelId = 'v1', botChannelName = 'music-room' } = {}) {
  const replies = [];
  const memberVoice = memberChannelId
    ? {
        channelId: memberChannelId,
        channel: {
          id: memberChannelId,
          permissionsFor: () => ({ has: () => true }),
        },
      }
    : { channelId: null, channel: null };

  const channels = new Map();
  if (botChannelId) {
    channels.set(botChannelId, { id: botChannelId, name: botChannelName });
  }

  return {
    guildId: 'g1',
    channelId: 't1',
    user: { id: 'u1', username: 'user1' },
    options: {
      getString: () => 'billie jean',
      getInteger: () => 50,
    },
    member: { voice: memberVoice },
    guild: {
      id: 'g1',
      channels: { cache: channels },
      members: {
        me: {
          voice: { channelId: botChannelId },
        },
      },
    },
    deferred: true,
    replied: false,
    editReply: async (payload) => { replies.push(payload); },
    reply: async (payload) => { replies.push(payload); },
    _replies: replies,
  };
}

test('play rejects users outside the bot voice channel', async () => {
  const interaction = createVoiceInteraction({ memberChannelId: 'v2', botChannelId: 'v1' });
  const context = {
    youtube: {
      resolveQuery: async () => [{ title: 'Billie Jean', url: 'https://youtube.com/watch?v=1' }],
    },
    musicManager: {
      withGuildLock: async (_guildId, task) => task(),
      getOrCreate: () => ({ enqueue: async () => ({ started: true }) }),
    },
    log: { info() {}, warn() {}, error() {} },
  };

  await assert.rejects(
    playCommand.execute(interaction, context),
    (error) => error instanceof UserFacingMusicError
      && error.message === messages.voice.sameChannelRequired('#music-room'),
  );
});

test('stop rejects users outside the bot voice channel', async () => {
  const interaction = createVoiceInteraction({ memberChannelId: 'v2', botChannelId: 'v1' });
  const context = {
    musicManager: {
      withGuildLock: async (_guildId, task) => task(),
      get: () => ({ voiceChannelId: 'v1', stop() {} }),
    },
  };

  await assert.rejects(
    stopCommand.execute(interaction, context),
    (error) => error instanceof UserFacingMusicError
      && error.message === messages.voice.sameChannelRequired('#music-room'),
  );
});

test('queue rejects users outside the bot voice channel', async () => {
  const interaction = createVoiceInteraction({ memberChannelId: 'v2', botChannelId: 'v1' });
  const context = {
    musicManager: {
      get: () => ({ voiceChannelId: 'v1', queue: [] }),
    },
  };

  await assert.rejects(
    queueCommand.execute(interaction, context),
    (error) => error instanceof UserFacingMusicError
      && error.message === messages.voice.sameChannelRequired('#music-room'),
  );
});

test('nowplaying rejects users outside the bot voice channel', async () => {
  const interaction = createVoiceInteraction({ memberChannelId: 'v2', botChannelId: 'v1' });
  const context = {
    musicManager: {
      get: () => ({ voiceChannelId: 'v1', current: { title: 'Billie Jean' } }),
    },
  };

  await assert.rejects(
    nowPlayingCommand.execute(interaction, context),
    (error) => error instanceof UserFacingMusicError
      && error.message === messages.voice.sameChannelRequired('#music-room'),
  );
});

test('leave allows users in the same voice channel as the bot', async () => {
  const interaction = createVoiceInteraction({ memberChannelId: 'v1', botChannelId: 'v1' });
  let destroyedGuildId = null;
  const context = {
    musicManager: {
      withGuildLock: async (_guildId, task) => task(),
      get: () => ({ voiceChannelId: 'v1' }),
      destroy: (guildId) => {
        destroyedGuildId = guildId;
        return true;
      },
    },
  };

  await leaveCommand.execute(interaction, context);

  assert.equal(destroyedGuildId, 'g1');
  assert.equal(interaction._replies.length, 1);
  assert.equal(interaction._replies[0].embeds[0].data.description, messages.voice.leftChannel);
});
