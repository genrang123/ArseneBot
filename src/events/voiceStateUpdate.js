const { Events } = require('discord.js');

module.exports = {
  name: Events.VoiceStateUpdate,
  execute(oldState, newState, { musicManager }) {
    const guildId = oldState.guild.id;
    const player = musicManager.get(guildId);
    if (!player) return;

    const botId = oldState.guild.members?.me?.id;
    const playerChannelId = player.voiceChannelId;

    // Bot was moved/kicked out from the player channel -> destroy stale player immediately.
    if (botId && oldState.id === botId && oldState.channelId === playerChannelId && newState.channelId !== playerChannelId) {
      player.destroy();
      return;
    }

    const channel = oldState.guild.channels.cache.get(playerChannelId);
    if (!channel?.members) return;

    const humanMembers = channel.members.filter((member) => !member.user.bot);
    if (humanMembers.size === 0) player.startIdleTimer();
    else player.clearIdleTimer();
  },
};
