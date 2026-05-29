const { UserFacingMusicError } = require('../music/errors');
const { messages } = require('../config/messages');

function formatChannelName(channel) {
  if (!channel?.name) return 'voice channel của bot';
  return `#${channel.name}`;
}

function requireSameVoiceChannel(interaction, player) {
  const memberVoiceChannel = interaction.member?.voice?.channel || null;
  const memberVoiceChannelId = interaction.member?.voice?.channelId || memberVoiceChannel?.id || null;

  if (!memberVoiceChannelId) {
    throw new UserFacingMusicError(messages.voice.joinRequired);
  }

  const botVoiceChannelId = player?.voiceChannelId || interaction.guild?.members?.me?.voice?.channelId || null;
  if (botVoiceChannelId && memberVoiceChannelId !== botVoiceChannelId) {
    const botVoiceChannel = interaction.guild?.channels?.cache?.get?.(botVoiceChannelId) || null;
    throw new UserFacingMusicError(messages.voice.sameChannelRequired(formatChannelName(botVoiceChannel)));
  }

  return memberVoiceChannel;
}

module.exports = { requireSameVoiceChannel };
