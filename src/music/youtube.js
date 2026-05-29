const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const { PassThrough } = require('node:stream');
const { StreamType } = require('@discordjs/voice');
const { createTrack } = require('./Track');
const { classifyYoutubeError } = require('./errors');
const {
  CHROMIUM_PROFILE_DIR,
  YOUTUBE_COOKIE_FILE: COOKIES_FILE,
  YTDLP_COOKIES_FROM_BROWSER: DEFAULT_COOKIES_FROM_BROWSER,
} = require('./authConfig');

const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';
const JS_RUNTIME = process.env.YTDLP_JS_RUNTIME || 'node';
const ENABLE_JS_RUNTIME = process.env.YTDLP_ENABLE_JS_RUNTIME === '1';
const COOKIES_FROM_BROWSER = DEFAULT_COOKIES_FROM_BROWSER;
const PO_TOKEN = process.env.YTDLP_PO_TOKEN || null;
const VISITOR_DATA = process.env.YTDLP_VISITOR_DATA || null;
const USER_AGENT = process.env.YTDLP_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Public Invidious instances for search (yt-dlp blocked on VPS IPs)
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.fdn.fr',
  'https://yewtu.be',
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUrl(query) {
  return /youtube\.com|youtu\.be/.test(query);
}

function isPlaylistUrl(query) {
  return /[?&]list=/.test(query);
}

function normalizeYoutubeQuery(query) {
  if (!isUrl(query)) return query;
  try {
    const url = new URL(query);
    const videoId = url.searchParams.get('v') || url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/)?.[1];
    const listId = url.searchParams.get('list') || '';

    // YouTube radio/mix URLs are slow and can expand into huge playlists. Play the requested video only.
    if (videoId && (listId.startsWith('RD') || url.searchParams.has('start_radio'))) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
  } catch {
    // Keep the original query if URL parsing fails.
  }
  return query;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function searchInvidious(query, requestedBy) {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const data = await fetchJson(`${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`);
      const results = (data || []).filter((r) => r.type === 'video').slice(0, 5);
      if (results.length > 0) {
        return results.map((video) =>
          createTrack(
            {
              title: video.title || 'Unknown title',
              url: `https://www.youtube.com/watch?v=${video.videoId}`,
              durationInSec: video.lengthSeconds || null,
              thumbnails: video.videoThumbnails?.length ? [{ url: video.videoThumbnails[0].url }] : [],
            },
            requestedBy,
          ),
        );
      }
    } catch {
      // Try next instance
    }
  }
  return [];
}

async function resolveInvidious(url, requestedBy) {
  const videoId = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
  if (!videoId) return null;

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const data = await fetchJson(`${instance}/api/v1/videos/${videoId}`);
      return [
        createTrack(
          {
            title: data.title || 'Unknown title',
            url: `https://www.youtube.com/watch?v=${videoId}`,
            durationInSec: data.lengthSeconds || null,
            thumbnails: data.videoThumbnails?.length ? [{ url: data.videoThumbnails[0].url }] : [],
          },
          requestedBy,
        ),
      ];
    } catch {
      // Try next instance
    }
  }
  return null;
}

function spawnYtDlp(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('yt-dlp timed out'));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 || stdout.length > 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || 'yt-dlp failed with no output'));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function parseTracks(output, requestedBy) {
  const lines = output.split('\n').filter((l) => l.trim());
  return lines
    .map((line) => {
      try {
        const data = JSON.parse(line);
        return createTrack(
          {
            title: data.title || 'Unknown title',
            url: data.webpage_url || data.url,
            durationInSec: data.duration || null,
            thumbnails: data.thumbnail ? [{ url: data.thumbnail }] : [],
          },
          requestedBy,
        );
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function hasCookieAuth() {
  return Boolean(COOKIES_FROM_BROWSER || existsSync(COOKIES_FILE));
}

function getCookiesFromBrowserValue() {
  if (!COOKIES_FROM_BROWSER) return null;
  if (COOKIES_FROM_BROWSER !== 'chromium') return COOKIES_FROM_BROWSER;
  if (existsSync(COOKIES_FILE) || existsSync(CHROMIUM_PROFILE_DIR)) return 'chromium';
  return null;
}

function buildExtractorArgs() {
  const args = [];
  if (PO_TOKEN) {
    args.push(`po_token=web+${PO_TOKEN}`);
    args.push('player_client=web');
  } else if (hasCookieAuth()) {
    args.push('player_client=web_safari');
    args.push('player_skip=webpage,configs');
  } else {
    args.push('player_client=ios');
  }
  if (VISITOR_DATA) args.push(`visitor_data=${VISITOR_DATA}`);
  return `youtube:${args.join(';')}`;
}

function buildBaseArgs() {
  const cookiesFromBrowser = getCookiesFromBrowserValue();
  const args = [
    '--user-agent', USER_AGENT,
    '--extractor-args', buildExtractorArgs(),
    '--buffer-size', '16K',
    '--socket-timeout', '15',
    '--retries', '10',
    '--fragment-retries', '10',
    '--concurrent-fragments', '1',
  ];

  if (ENABLE_JS_RUNTIME) {
    args.unshift(JS_RUNTIME);
    args.unshift('--js-runtime');
  }

  if (cookiesFromBrowser) {
    args.push('--cookies-from-browser', cookiesFromBrowser);
  } else if (existsSync(COOKIES_FILE)) {
    args.push('--cookies', COOKIES_FILE);
  }

  return args;
}

function redactArgs(args) {
  const redacted = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    redacted.push(arg);
    if ((arg === '--cookies' || arg === '--cookies-from-browser' || arg === '--extractor-args') && i + 1 < args.length) {
      redacted.push('[redacted]');
      i += 1;
    }
  }
  return redacted.join(' ');
}

function buildYtDlpArgs(query) {
  const args = [...buildBaseArgs(), '--dump-json'];
  if (isUrl(query) && !isPlaylistUrl(query)) args.push('--no-playlist');
  args.push(query);
  return args;
}

function createYoutubeService({ retryDelayMs = 500, runYtDlp = spawnYtDlp, spawnStream = spawn, enableInvidious = true, log = null } = {}) {
  async function withRetry(operation, classifyError = classifyYoutubeError, context = {}) {
    try {
      return await operation();
    } catch (firstError) {
      await delay(retryDelayMs);
      try {
        return await operation();
      } catch (secondError) {
        throw classifyError(secondError, context);
      }
    }
  }

  async function resolveQuery(query, requestedBy) {
    const startedAt = Date.now();
    return withRetry(async () => {
      const normalizedQuery = normalizeYoutubeQuery(query);
      let ytQuery = normalizedQuery;
      if (!isUrl(normalizedQuery)) ytQuery = `ytsearch1:${normalizedQuery}`;

      let ytDlpError = null;

      // --- yt-dlp ---
      try {
        const args = buildYtDlpArgs(ytQuery);
        const ytDlpStartedAt = Date.now();
        const output = await runYtDlp(args);
        const tracks = parseTracks(output, requestedBy);
        log?.info?.('-', `[timing] resolveQuery yt-dlp duration=${Date.now() - ytDlpStartedAt}ms query=${ytQuery} tracks=${tracks.length}`);
        if (tracks.length > 0 || !enableInvidious) {
          log?.info?.('-', `[timing] resolveQuery total duration=${Date.now() - startedAt}ms source=yt-dlp tracks=${tracks.length}`);
          return tracks;
        }
      } catch (error) {
        if (!enableInvidious) throw classifyYoutubeError(error, { phase: 'resolveQuery', query: normalizedQuery });
        ytDlpError = error;
        log?.warn?.('-', `[debug] resolveQuery yt-dlp failed; falling back to Invidious query=${ytQuery} cause=${error.message || error}`);
      }

      // --- Invidious fallback ---
      const invidiousStartedAt = Date.now();
      if (isUrl(normalizedQuery)) {
        const result = await resolveInvidious(normalizedQuery, requestedBy);
        log?.info?.('-', `[timing] resolveQuery invidious-url duration=${Date.now() - invidiousStartedAt}ms query=${normalizedQuery}`);
        if (result && result.length > 0) {
          log?.info?.('-', `[timing] resolveQuery total duration=${Date.now() - startedAt}ms source=invidious-url tracks=${result.length}`);
          return result;
        }
      } else {
        const results = await searchInvidious(normalizedQuery, requestedBy);
        log?.info?.('-', `[timing] resolveQuery invidious-search duration=${Date.now() - invidiousStartedAt}ms query=${normalizedQuery}`);
        if (results.length > 0) {
          log?.info?.('-', `[timing] resolveQuery total duration=${Date.now() - startedAt}ms source=invidious-search tracks=1`);
          return [results[0]];
        }
      }

      // --- Both failed: throw the yt-dlp error so callers can detect auth issues ---
      if (ytDlpError) {
        throw classifyYoutubeError(ytDlpError, {
          phase: 'resolveQuery',
          query,
          requestedById: requestedBy?.id || null,
          requestedByUsername: requestedBy?.username || null,
        });
      }

      log?.info?.('-', `[timing] resolveQuery total duration=${Date.now() - startedAt}ms source=fallback-none tracks=0`);
      return [];
    });
  }

  async function getRelatedTrack(track, requestedBy = track?.requestedBy) {
    if (!track?.title) return null;

    return withRetry(async () => {
      const args = buildYtDlpArgs(`ytsearch5:${track.title}`);
      const output = await runYtDlp(args);
      const tracks = parseTracks(output, requestedBy).filter((candidate) => candidate.url && candidate.url !== track.url);
      return tracks[0] || null;
    }, classifyYoutubeError, {
      phase: 'getRelatedTrack',
      query: track?.title || null,
      requestedById: requestedBy?.id || null,
      requestedByUsername: requestedBy?.username || null,
    });
  }

  async function createStream(track) {
    const startedAt = Date.now();
    return withRetry(async () => {
      const streamStartedAt = Date.now();
      const args = [
        ...buildBaseArgs(),
        '-f',
        'bestaudio[protocol!=m3u8_native]/bestaudio/best[protocol=m3u8_native]/best',
        '-o',
        '-',
        '--no-playlist',
        track.url,
      ];
      const proc = spawnStream(YTDLP_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      const output = new PassThrough();
      log?.info?.('-', `[debug] yt-dlp stream spawned pid=${proc.pid || 'n/a'} track=${track.title || track.url}`);
      log?.info?.('-', `[debug] yt-dlp stream args=${redactArgs(args)}`);

      await new Promise((resolve, reject) => {
        let settled = false;
        let stderr = '';

        const cleanup = () => {
          clearTimeout(timer);
          proc.stdout?.off?.('data', onFirstData);
          proc.stdout?.off?.('error', onStreamError);
          proc.stderr?.off?.('data', onStderr);
          proc.off?.('error', onProcessError);
          proc.off?.('close', onStartupClose);
        };

        const fail = (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          output.destroy();
          proc.kill?.();
          reject(error);
        };

        const succeed = (chunk) => {
          if (settled) return;
          settled = true;
          cleanup();
          output.write(chunk);
          proc.stdout?.pipe?.(output);
          log?.info?.('-', `[timing] createStream stream-ready duration=${Date.now() - streamStartedAt}ms track=${track.title || track.url}`);
          resolve();
        };

        const onStderr = (data) => {
          stderr += data.toString();
          if (stderr.length > 4000) stderr = stderr.slice(-4000);
          const compact = data.toString().trim();
          if (compact) {
            log?.info?.('-', `[debug] yt-dlp startup stderr pid=${proc.pid || 'n/a'} ${compact.slice(0, 500)}`);
          }
        };

        const onFirstData = (chunk) => {
          if (chunk?.length > 0) succeed(chunk);
        };

        const onStreamError = (error) => {
          fail(error);
        };

        const onProcessError = (error) => {
          fail(error);
        };

        const onStartupClose = (code, signal) => {
          log?.warn?.('-', `[debug] yt-dlp stream closed before audio data code=${code} signal=${signal || 'none'} stderr=${stderr.trim()}`);
          fail(new Error(stderr.trim() || `yt-dlp stream exited before audio data with code ${code}`));
        };

        const timer = setTimeout(() => {
          log?.warn?.('-', `[debug] yt-dlp stream startup timeout pid=${proc.pid || 'n/a'} stderr=${stderr.trim()}`);
          fail(new Error('yt-dlp stream startup timed out'));
        }, 30000);

        proc.stderr?.on?.('data', onStderr);
        proc.stdout?.on?.('data', onFirstData);
        proc.stdout?.once?.('error', onStreamError);
        proc.once?.('error', onProcessError);
        proc.once?.('close', onStartupClose);
      });

      let stderrAfterReady = '';
      proc.stderr?.on?.('data', (data) => {
        stderrAfterReady += data.toString();
        if (stderrAfterReady.length > 4000) stderrAfterReady = stderrAfterReady.slice(-4000);
      });
      proc.stdout?.once?.('end', () => log?.warn?.('-', `[debug] yt-dlp stdout ended track=${track.title || track.url}`));
      proc.stdout?.once?.('close', () => log?.warn?.('-', `[debug] yt-dlp stdout closed track=${track.title || track.url}`));
      proc.stdout?.once?.('error', (error) => log?.error?.('-', `[debug] yt-dlp stdout error track=${track.title || track.url}`, error));
      proc.once?.('close', (code, signal) => log?.warn?.('-', `[debug] yt-dlp process closed after ready code=${code} signal=${signal || 'none'} track=${track.title || track.url} stderr=${stderrAfterReady.trim()}`));
      proc.once?.('error', (error) => log?.error?.('-', `[debug] yt-dlp process error after ready track=${track.title || track.url}`, error));

      log?.info?.('-', `[timing] createStream total duration=${Date.now() - startedAt}ms track=${track.title || track.url}`);
      return { stream: output, type: StreamType.Arbitrary, streamProcess: proc };
    }, classifyYoutubeError, {
      phase: 'createStream',
      trackTitle: track.title || null,
      trackUrl: track.url || null,
    });
  }

  function setYoutubeCookie(_cookie) {
    // Cookies are now handled by entrypoint script writing /app/cookies.txt
  }

  return { resolveQuery, createStream, getRelatedTrack, setYoutubeCookie };
}

module.exports = { createYoutubeService };
