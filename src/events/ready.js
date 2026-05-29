const { Events } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client, { log }) {
    log.info('-', `Ready as ${client.user.tag}`);
  },
};
