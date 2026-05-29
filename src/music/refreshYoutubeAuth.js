const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { CHROMIUM_LOCK_GLOB } = require('./authConfig');

const execFileAsync = promisify(execFile);

async function refreshYoutubeAuth(log, guildId) {
  log.warn(guildId, '[auth] Starting one-shot Playwright refresh for YouTube auth');
  const command = `rm -f ${JSON.stringify(CHROMIUM_LOCK_GLOB)} 2>/dev/null; timeout 120 xvfb-run -a -s "-screen 0 1280x720x24" node /app/scripts/refresh-yt-auth.js`;
  const { stdout, stderr } = await execFileAsync('sh', ['-lc', command], {
    timeout: 130000,
    maxBuffer: 1024 * 1024,
  });
  const summary = [stdout, stderr].filter(Boolean).join('\n').trim().slice(-2000);
  log.warn(guildId, `[auth] Playwright refresh finished output=${summary || 'none'}`);
}

module.exports = { refreshYoutubeAuth };
