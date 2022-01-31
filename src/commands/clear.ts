import { CommandInteraction } from 'discord.js';
import { ApplicationCommandOptionTypes } from 'discord.js/typings/enums';
import BotManager from '../BotManager';
import Server from '../server/Server';
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
            await interaction.reply('Not all bots have been launched yet. Please wait until bot launch is complete before changing server settings.');
            return;
        }

        const serverName = interaction.options.getString('server');
        const servers = manager.getServers().filter((server: Server) => !serverName || server.getConfig().name == serverName);

        for (const server of servers) {
            server.setCurrentSlots(0);
        }

        let reply: string;
        if (servers.length == 0) {
            reply = serverName ? `I do not manage bots for a server called "${serverName}".`: 'No servers are set up.';
        }
        else if (serverName) {
            reply = `Ok, bots will leave ${serverName} shortly.`;
        }
        else {
            reply = 'Ok, shutting it all down for now.';
        }

        await interaction.reply(reply);
    }
};
