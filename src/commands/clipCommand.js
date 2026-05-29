const { messages } = require('../config/messages');
const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../ui/embeds');
const { requireSameVoiceChannel } = require('./voiceAccess');

function createClipCommand({ name, description, text, audioPath, clipKey }) {
  return {
    data: new SlashCommandBuilder()
      .setName(name)
      .setDescription(description),
    async execute(interaction, { musicManager }) {
      const player = musicManager.get(interaction.guildId);
      const inVoice = Boolean(interaction.member?.voice?.channelId);

      if (!inVoice) {
        await interaction.editReply({ embeds: [successEmbed(text)] });
        return;
      }

      try {
        const voiceChannel = requireSameVoiceChannel(interaction, player || undefined);
        const activePlayer = player || musicManager.getOrCreate({
          guild: interaction.guild,
          voiceChannel,
          textChannelId: interaction.channelId,
        });

        if (activePlayer.isIdle()) {
          await activePlayer.playClip(audioPath, { clip: clipKey });
        }

        await interaction.editReply({ embeds: [successEmbed(text)] });
      } catch (error) {
        if (error.code === 'PLAYER_IN_DIFFERENT_CHANNEL') {
          await interaction.editReply({ embeds: [errorEmbed(messages.voice.botInDifferentChannel)] });
          return;
        }
        throw error;
      }
    },
  };
}

module.exports = { createClipCommand };
