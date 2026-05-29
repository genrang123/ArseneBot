const { messages } = require('../config/messages');
const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../ui/embeds');
const { requireSameVoiceChannel } = require('./voiceAccess');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription(messages.commands.loop.description)
    .addStringOption((option) => option.setName('mode').setDescription(messages.commands.loop.modeDescription).setRequired(true).addChoices(
      { name: 'off', value: 'off' },
      { name: 'track', value: 'track' },
      { name: 'queue', value: 'queue' },
    )),
  async execute(interaction, { musicManager }) {
    await musicManager.withGuildLock(interaction.guildId, async () => {
      const player = musicManager.get(interaction.guildId);
      requireSameVoiceChannel(interaction, player);
      if (!player) return interaction.reply({ embeds: [errorEmbed(messages.playback.noPlayerInGuild)], ephemeral: true });
      const mode = interaction.options.getString('mode', true);
      player.setLoopMode(mode);
      return interaction.reply({ embeds: [successEmbed(messages.playback.loopSet(mode))] });
    });
  },
};
