const { loadConfig } = require('./config');
const { createClient } = require('./bot/client');
const { loadCommands } = require('./bot/commandLoader');
const { loadEvents } = require('./bot/eventLoader');
const { createYoutubeService } = require('./music/youtube');
const { MusicManager } = require('./music/MusicManager');
const log = require('./utils/logger');

process.on('unhandledRejection', (error) => {
  log.error('-', 'Unhandled rejection', error);
});

process.on('uncaughtException', (error) => {
  log.error('-', 'Uncaught exception', error);
});

const config = loadConfig();
const youtube = createYoutubeService({ log });
youtube.setYoutubeCookie(config.youtubeCookie);

const client = createClient();
const musicManager = new MusicManager({ youtube, client, log });

loadCommands(client);
loadEvents(client, { config, youtube, musicManager, log });

client.login(config.discordToken);
