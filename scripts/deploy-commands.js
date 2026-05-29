const { REST, Routes } = require('discord.js');
const { loadConfig } = require('../src/config');
const { createClient } = require('../src/bot/client');
const { loadCommands } = require('../src/bot/commandLoader');

async function main() {
  const config = loadConfig();
  const client = createClient();
  const commands = Array.from(loadCommands(client).values()).map((command) => command.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.discordToken);

  const route = config.discordGuildId
    ? Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId)
    : Routes.applicationCommands(config.discordClientId);

  await rest.put(route, { body: commands });
  console.log(`Registered ${commands.length} slash commands.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
