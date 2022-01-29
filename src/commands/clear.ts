import { CommandInteraction } from 'discord.js';
import { ApplicationCommandOptionTypes } from 'discord.js/typings/enums';
import Bot from '../bot/Bot';
import BotManager from '../BotManager';
import { Command } from './typing';

export const clear: Command = {
    name: 'clear',
    description: 'Disable all bots (if a server name is given, only bots for that server will be disabled)',
    defaultPermission: false,
    options: [
        {
            name: 'server',
            description: 'Name of server to disable bots for',
            type: ApplicationCommandOptionTypes.STRING,
            required: false
        }
    ],
    execute: async (interaction: CommandInteraction, manager: BotManager) => {
        if (!manager.isBotLaunchComplete()) {
            await interaction.reply('Not all bots have been launched yet. Please wait until bot launch is complete before enabling/disabling any bots.');
            return;
        }

        const serverName = interaction.options.getString('server');
        const bots = manager.getBots().filter((bot: Bot) => !serverName || bot.getConfig().server.name == serverName);

        for (const bot of bots) {
            bot.setEnabled(false);
        }

        let reply: string;
        if (bots.length == 0) {
            reply = serverName ? `Could not find any bots set up for a server called "${serverName}".`: 'No bots are set up.';
        }
        else if (serverName) {
            reply = `Ok, bots will leave ${serverName} shortly.`;
        }
        else {
            reply = 'Ok, shutting it all down for now.'
        }

        await interaction.reply(reply);
    }
};
