const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');

const { createYoutubeService } = require('../../src/music/youtube');
const { UserFacingMusicError } = require('../../src/music/errors');

const requestedBy = { id: 'u1', username: 'User' };

function jsonLine(data) {
  return `${JSON.stringify(data)}\n`;
}

test('resolveQuery resolves video URLs into one track with yt-dlp', async () => {
  const calls = [];
  const service = createYoutubeService({
    retryDelayMs: 0,
    enableInvidious: false,
    runYtDlp: async (args) => {
      calls.push(args);
      return jsonLine({ title: 'Song', webpage_url: 'https://youtube.com/watch?v=12345678901', duration: 90, thumbnail: 'thumb' });
    },
  });

  const tracks = await service.resolveQuery('https://youtube.com/watch?v=12345678901', requestedBy);

  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('--dump-json'));
  assert.equal(calls[0].at(-1), 'https://youtube.com/watch?v=12345678901');
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].title, 'Song');
  assert.equal(tracks[0].duration, 90);
  assert.equal(tracks[0].requestedBy.id, 'u1');
});

test('resolveQuery resolves playlists into tracks from yt-dlp json lines', async () => {
  const service = createYoutubeService({
    retryDelayMs: 0,
    enableInvidious: false,
    runYtDlp: async () => [
      jsonLine({ title: 'A', webpage_url: 'url-a', duration: 1 }),
      jsonLine({ title: 'B', webpage_url: 'url-b', duration: 2, thumbnail: 'b.jpg' }),
    ].join(''),
  });

  const tracks = await service.resolveQuery('https://youtube.test/playlist?list=1', { id: 'u1' });

  assert.equal(tracks.length, 2);
  assert.deepEqual(tracks.map((track) => track.url), ['url-a', 'url-b']);
});

test('resolveQuery strips YouTube radio playlist params to play the requested video only', async () => {
  const calls = [];
  const service = createYoutubeService({
    retryDelayMs: 0,
    enableInvidious: false,
    runYtDlp: async (args) => {
      calls.push(args);
      return jsonLine({ title: 'Radio Song', webpage_url: 'https://youtube.com/watch?v=h_D3VFfhvs4', duration: 120 });
    },
  });

  const tracks = await service.resolveQuery('https://www.youtube.com/watch?v=h_D3VFfhvs4&list=RDh_D3VFfhvs4&start_radio=1', requestedBy);

  assert.ok(calls[0].includes('--no-playlist'));
  assert.equal(calls[0].at(-1), 'https://www.youtube.com/watch?v=h_D3VFfhvs4');
  assert.equal(tracks[0].title, 'Radio Song');
});

test('resolveQuery searches keyword queries with ytsearch1 fallback', async () => {
  const calls = [];
  const service = createYoutubeService({
    retryDelayMs: 0,
    enableInvidious: false,
    runYtDlp: async (args) => {
      calls.push(args);
      return jsonLine({ title: 'Lofi', webpage_url: 'url', duration: 30 });
    },
  });

  const tracks = await service.resolveQuery('lofi beats', { id: 'u1' });

  assert.equal(calls[0].at(-1), 'ytsearch1:lofi beats');
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].title, 'Lofi');
});

test('resolveQuery retries one transient failure', async () => {
  let attempts = 0;
  const service = createYoutubeService({
    retryDelayMs: 0,
    enableInvidious: false,
    runYtDlp: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('network timeout');
      return jsonLine({ title: 'Retry Song', webpage_url: 'url', duration: 10 });
    },
  });

  const tracks = await service.resolveQuery('url', { id: 'u1' });

  assert.equal(attempts, 2);
  assert.equal(tracks[0].title, 'Retry Song');
});

test('resolveQuery maps YouTube sign-in errors to cookie guidance', async () => {
  const service = createYoutubeService({
    retryDelayMs: 0,
    enableInvidious: false,
    runYtDlp: async () => {
      throw new Error('Sign in to confirm your age');
    },
  });

  await assert.rejects(
    () => service.resolveQuery('url', { id: 'u1' }),
    (error) => error instanceof UserFacingMusicError && error.message.includes('YOUTUBE_COOKIE'),
  );
});

function createMockProc() {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const handlers = { error: [], close: [] };

  return {
    stdout,
    stderr,
    stdin: new PassThrough(),
    once(event, handler) {
      handlers[event].push(handler);
      return this;
    },
    off(event, handler) {
      handlers[event] = handlers[event].filter((candidate) => candidate !== handler);
      return this;
    },
    emit(event, ...args) {
      for (const handler of handlers[event]) handler(...args);
    },
    kill() {
      return true;
    },
  };
}

test('getRelatedTrack returns a different search result for autoplay', async () => {
  const calls = [];
  const service = createYoutubeService({
    retryDelayMs: 0,
    enableInvidious: false,
    runYtDlp: async (args) => {
      calls.push(args);
      return [
        jsonLine({ title: 'Same', webpage_url: 'https://youtube.com/watch?v=12345678901', duration: 90 }),
        jsonLine({ title: 'Related Song', webpage_url: 'https://youtube.com/watch?v=abcdefghijk', duration: 120 }),
      ].join('');
    },
  });

  const track = await service.getRelatedTrack({ title: 'Same', url: 'https://youtube.com/watch?v=12345678901', requestedBy });

  assert.equal(calls[0].at(-1), 'ytsearch5:Same');
  assert.equal(track.title, 'Related Song');
  assert.equal(track.url, 'https://youtube.com/watch?v=abcdefghijk');
});

test('createStream retries once when stream startup fails early', async () => {
  let attempts = 0;
  const service = createYoutubeService({
    retryDelayMs: 0,
    spawnStream: () => {
      attempts += 1;
      const proc = createMockProc();

      process.nextTick(() => {
        if (attempts === 1) {
          proc.stderr.write('temporary upstream failure');
          proc.emit('close', 1);
          return;
        }

        proc.stdout.write('audio bytes');
      });

      return proc;
    },
  });

  const result = await service.createStream({ url: 'https://youtube.com/watch?v=12345678901' });

  assert.equal(attempts, 2);
  assert.ok(result.stream);
  assert.equal(result.type, 'arbitrary');
});
