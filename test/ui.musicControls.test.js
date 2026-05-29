const test = require('node:test');
const assert = require('node:assert/strict');

const { nowPlayingMessage, MUSIC_CONTROL_IDS } = require('../src/ui/musicControls');

function createPlayer(overrides = {}) {
  return {
    current: { title: 'Track One', url: 'https://example.test/1', duration: 120, thumbnail: null },
    history: [],
    queue: [],
    paused: false,
    volume: 100,
    loopMode: 'off',
    ...overrides,
  };
}

test('nowPlayingMessage includes control buttons when song is active', () => {
  const player = createPlayer();

  const payload = nowPlayingMessage(player.current, player);

  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.components.length, 1);
  assert.equal(payload.components[0].components.length, 4);
  assert.equal(payload.components[0].components[0].data.custom_id, MUSIC_CONTROL_IDS.back);
  assert.equal(payload.components[0].components[0].data.emoji.name, '⏮️');
  assert.equal(payload.components[0].components[1].data.custom_id, MUSIC_CONTROL_IDS.pause);
  assert.equal(payload.components[0].components[1].data.emoji.name, '⏸️');
  assert.equal(payload.components[0].components[2].data.custom_id, MUSIC_CONTROL_IDS.skip);
  assert.equal(payload.components[0].components[2].data.emoji.name, '⏭️');
  assert.equal(payload.components[0].components[3].data.custom_id, MUSIC_CONTROL_IDS.stop);
  assert.equal(payload.components[0].components[3].data.emoji.name, '⏹️');
  assert.equal(payload.components[0].components[0].data.disabled, true);
});

test('nowPlayingMessage switches pause button to resume when paused', () => {
  const player = createPlayer({ paused: true, history: [{ title: 'Old Track' }] });

  const payload = nowPlayingMessage(player.current, player);

  assert.equal(payload.components[0].components[0].data.disabled, false);
  assert.equal(payload.components[0].components[1].data.custom_id, MUSIC_CONTROL_IDS.resume);
  assert.equal(payload.components[0].components[1].data.label, 'Resume');
  assert.equal(payload.components[0].components[1].data.emoji.name, '▶️');
});
