const { messages } = require('../config/messages');
const { SlashCommandBuilder } = require('discord.js');
const { queueEmbed, errorEmbed } = require('../ui/embeds');
const { requireSameVoiceChannel } = require('./voiceAccess');

async function respond(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.reply(payload);
}

module.exports = {
  data: new SlashCommandBuilder().setName('queue').setDescription(messages.commands.queue.description),
  async execute(interaction, { musicManager, log }) {
    const run = musicManager.withGuildLock?.bind(musicManager) || ((_guildId, task) => task());
    return run(interaction.guildId, async () => {
      const player = musicManager.get(interaction.guildId);
      requireSameVoiceChannel(interaction, player);
      if (!player) return respond(interaction, { embeds: [errorEmbed(messages.playback.noPlayerInGuild)], ephemeral: true });

      log?.info?.(interaction.guildId, `[state] /queue current=${player.current?.title || 'none'} queue=${player.queue?.length ?? 0} audio=${player.audioPlayer?.state?.status ?? 'unknown'} voice=${player.voiceConnection?.state?.status ?? 'unknown'}`);
      return respond(interaction, { embeds: [queueEmbed(player)] });
    });
  },
};
