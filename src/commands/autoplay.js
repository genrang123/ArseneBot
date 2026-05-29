const { messages } = require('../config/messages');
const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../ui/embeds');
const { requireSameVoiceChannel } = require('./voiceAccess');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription(messages.commands.autoplay.description)
    .addStringOption((option) => option
      .setName('mode')
      .setDescription(messages.commands.autoplay.modeDescription)
      .setRequired(true)
      .addChoices(
        { name: 'on', value: 'on' },
        { name: 'off', value: 'off' },
      )),
  async execute(interaction, { musicManager }) {
    await musicManager.withGuildLock(interaction.guildId, async () => {
      const player = musicManager.get(interaction.guildId);
      requireSameVoiceChannel(interaction, player);
      if (!player) return interaction.reply({ embeds: [errorEmbed(messages.playback.noPlayerInGuild)], ephemeral: true });

      const mode = interaction.options.getString('mode', true);
      player.setAutoplayEnabled(mode === 'on');
      return interaction.reply({ embeds: [successEmbed(messages.playback.autoplaySet(mode === 'on'))] });
    });
  },
};
