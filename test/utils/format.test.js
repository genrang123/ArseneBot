const test = require('node:test');
const assert = require('node:assert/strict');

const { formatDuration, truncate } = require('../../src/utils/format');

test('formatDuration formats unknown durations', () => {
  assert.equal(formatDuration(null), 'Live/Unknown');
  assert.equal(formatDuration(undefined), 'Live/Unknown');
  assert.equal(formatDuration(Number.NaN), 'Live/Unknown');
});

test('formatDuration formats seconds as mm:ss or h:mm:ss', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3661), '1:01:01');
});

test('truncate preserves short text and ellipsizes long text', () => {
  assert.equal(truncate('abc', 5), 'abc');
  assert.equal(truncate('abcdef', 5), 'ab...');
});
