const { createClipCommand } = require('./clipCommand');
const { messages } = require('../config/messages');

module.exports = createClipCommand({
  name: 'mixi',
  description: messages.commands.mixi.description,
  text: messages.clip.mixi,
  audioPath: '/media/audio/an-do-mixi.mp3',
  clipKey: 'mixi',
});
