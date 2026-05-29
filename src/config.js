require('dotenv').config();

const LOG_LEVELS = new Set(['info', 'warn', 'error']);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function loadConfig() {
  const logLevel = process.env.LOG_LEVEL || 'info';
  if (!LOG_LEVELS.has(logLevel)) {
    throw new Error('LOG_LEVEL must be one of: info, warn, error');
  }

  return {
    discordToken: requireEnv('DISCORD_TOKEN'),
    discordClientId: requireEnv('DISCORD_CLIENT_ID'),
    discordGuildId: process.env.DISCORD_GUILD_ID || null,
    youtubeCookie: process.env.YOUTUBE_COOKIE || null,
    logLevel,
  };
}

module.exports = { loadConfig };
