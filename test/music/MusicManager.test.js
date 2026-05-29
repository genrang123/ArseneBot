const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { MusicManager } = require('../../src/music/MusicManager');

function createAudioPlayer() {
  const player = new EventEmitter();
  player.play = () => {};
  player.stop = () => {};
  player.pause = () => true;
  player.unpause = () => true;
  return player;
}

function createConnection(status = 'ready') {
  const connection = new EventEmitter();
  connection.subscribe = () => {};
  connection.destroy = () => { connection.destroyed = true; connection.state = { status: 'destroyed' }; };
  connection.state = { status };
  return connection;
}

function createGuild({ channelId = 'v1', botId = 'bot1', channelHasBot = true } = {}) {
  return {
    id: 'g1',
    voiceAdapterCreator: {},
    members: { me: { id: botId, voice: { channelId } } },
    channels: { cache: new Map([['v1', { members: new Map(channelHasBot ? [[botId, {}]] : []) }]]) },
  };
}

function createManagerWithConnection(connection = createConnection()) {
  const manager = new MusicManager({
    youtube: {},
    joinVoiceChannel: () => connection,
    createAudioPlayer,
    notify: async () => {},
    log: { info() {}, warn() {}, error() {} },
  });

  manager.getOrCreate({
    guild: createGuild(),
    voiceChannel: { id: 'v1' },
    textChannelId: 't1',
  });

  return { manager, connection };
}

test('returns existing player when connection is ready and in same channel', () => {
  const { manager } = createManagerWithConnection();

  const player = manager.getOrCreate({
    guild: createGuild(),
    voiceChannel: { id: 'v1' },
    textChannelId: 't1',
  });

  assert.notEqual(player, null);
});

test('discards player when connection is disconnected', async () => {
  const { manager, connection } = createManagerWithConnection();
  connection.state = { status: 'disconnected' };

  // Simulate state change
  connection.emit('stateChange', { status: 'ready' }, { status: 'disconnected' });
  await new Promise((resolve) => setImmediate(resolve));

  // Next getOrCreate should discard stale player
  let joinCalls = 0;
  const freshConnection = createConnection('signalling');
  const manager2 = new MusicManager({
    youtube: {},
    joinVoiceChannel: () => { joinCalls += 1; return freshConnection; },
    createAudioPlayer,
    notify: async () => {},
    log: { info() {}, warn() {}, error() {} },
  });

  manager2.getOrCreate({
    guild: createGuild(),
    voiceChannel: { id: 'v1' },
    textChannelId: 't1',
  });

  const player2 = manager2.getOrCreate({
    guild: createGuild(),
    voiceChannel: { id: 'v1' },
    textChannelId: 't1',
  });

  // second getOrCreate should discard the first and create new
  assert.equal(joinCalls, 2);
});

test('voice connection destroyed state removes player', () => {
  const { manager, connection } = createManagerWithConnection();

  connection.emit('stateChange', { status: 'ready' }, { status: 'destroyed' });

  assert.equal(manager.get('g1'), null);
});

test('getOrCreate discards stale player and creates fresh one', () => {
  const staleConnection = createConnection('signalling');
  const freshConnection = createConnection('signalling');
  let joinCalls = 0;
  const manager = new MusicManager({
    youtube: {},
    joinVoiceChannel: () => {
      joinCalls += 1;
      return joinCalls === 1 ? staleConnection : freshConnection;
    },
    createAudioPlayer,
    notify: async () => {},
    log: { info() {}, warn() {}, error() {} },
  });

  manager.getOrCreate({
    guild: createGuild(),
    voiceChannel: { id: 'v1' },
    textChannelId: 't1',
  });

  // Player exists but connection is signalling (not ready) → should discard
  const player = manager.getOrCreate({
    guild: createGuild(),
    voiceChannel: { id: 'v1' },
    textChannelId: 't1',
  });

  assert.equal(joinCalls, 2);
  assert.equal(staleConnection.destroyed, true);
  assert.equal(player.voiceConnection, freshConnection);
});

test('destroyed event from stale connection does not delete newer player', () => {
  const staleConnection = createConnection('signalling');
  const freshConnection = createConnection('ready');
  let joinCalls = 0;

  const manager = new MusicManager({
    youtube: {},
    joinVoiceChannel: () => {
      joinCalls += 1;
      return joinCalls === 1 ? staleConnection : freshConnection;
    },
    createAudioPlayer,
    notify: async () => {},
    log: { info() {}, warn() {}, error() {} },
  });

  manager.getOrCreate({
    guild: { id: 'g1', voiceAdapterCreator: {}, members: { me: { voice: { channelId: 'v1' } } }, channels: { cache: new Map() } },
    voiceChannel: { id: 'v1' },
    textChannelId: 't1',
  });

  const currentPlayer = manager.getOrCreate({
    guild: { id: 'g1', voiceAdapterCreator: {}, members: { me: { voice: { channelId: 'v1' } } }, channels: { cache: new Map() } },
    voiceChannel: { id: 'v1' },
    textChannelId: 't1',
  });

  staleConnection.emit('stateChange', { status: 'ready' }, { status: 'destroyed' });

  assert.equal(manager.get('g1'), currentPlayer);
  assert.equal(manager.get('g1').voiceConnection, freshConnection);
});

test('recreates player when bot is not actually present in channel members', () => {
  const firstConnection = createConnection('ready');
  const secondConnection = createConnection('ready');
  let joinCalls = 0;

  const manager = new MusicManager({
    youtube: {},
    joinVoiceChannel: () => {
      joinCalls += 1;
      return joinCalls === 1 ? firstConnection : secondConnection;
    },
    createAudioPlayer,
    notify: async () => {},
    log: { info() {}, warn() {}, error() {} },
  });

  const botId = 'bot1';
  const guild = {
    id: 'g1',
    voiceAdapterCreator: {},
    members: { me: { id: botId, voice: { channelId: 'v1' } } },
    channels: { cache: new Map([['v1', { members: new Map() }]]) },
  };

  manager.getOrCreate({ guild, voiceChannel: { id: 'v1' }, textChannelId: 't1' });
  const player = manager.getOrCreate({ guild, voiceChannel: { id: 'v1' }, textChannelId: 't1' });

  assert.equal(joinCalls, 2);
  assert.equal(player.voiceConnection, secondConnection);
});

test('recreates player when bot voice state says it is not in voice anymore', () => {
  const firstConnection = createConnection('ready');
  const secondConnection = createConnection('ready');
  let joinCalls = 0;

  const manager = new MusicManager({
    youtube: {},
    joinVoiceChannel: () => {
      joinCalls += 1;
      return joinCalls === 1 ? firstConnection : secondConnection;
    },
    createAudioPlayer,
    notify: async () => {},
    log: { info() {}, warn() {}, error() {} },
  });

  manager.getOrCreate({ guild: createGuild(), voiceChannel: { id: 'v1' }, textChannelId: 't1' });
  const player = manager.getOrCreate({ guild: createGuild({ channelId: null }), voiceChannel: { id: 'v1' }, textChannelId: 't1' });

  assert.equal(joinCalls, 2);
  assert.equal(firstConnection.destroyed, true);
  assert.equal(player.voiceConnection, secondConnection);
});

test('withGuildLock serializes operations per guild', async () => {
  const manager = new MusicManager({
    youtube: {},
    joinVoiceChannel: () => createConnection('ready'),
    createAudioPlayer,
    notify: async () => {},
    log: { info() {}, warn() {}, error() {} },
  });

  const order = [];
  await Promise.all([
    manager.withGuildLock('g1', async () => {
      order.push('a-start');
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push('a-end');
    }),
    manager.withGuildLock('g1', async () => {
      order.push('b-start');
      order.push('b-end');
    }),
  ]);

  assert.deepEqual(order, ['a-start', 'a-end', 'b-start', 'b-end']);
});
