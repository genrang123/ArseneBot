const { createClipCommand } = require('./clipCommand');
const { messages } = require('../config/messages');

module.exports = createClipCommand({
  name: 'alo',
  description: messages.commands.alo.description,
  text: messages.clip.alo,
  audioPath: '/media/audio/alo-vu-ha-em.mp3',
  clipKey: 'alo',
});
