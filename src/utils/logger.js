function formatPrefix(level, guildId = '-') {
  return `[ArseneBot] [${new Date().toISOString()}] [${level}] [guild:${guildId}]`;
}

function info(guildId, message, ...args) {
  console.log(formatPrefix('INFO', guildId), message, ...args);
}

function warn(guildId, message, ...args) {
  console.warn(formatPrefix('WARN', guildId), message, ...args);
}

function error(guildId, message, ...args) {
  console.error(formatPrefix('ERROR', guildId), message, ...args);
}

module.exports = { info, warn, error };
