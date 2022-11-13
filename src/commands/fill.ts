import { ApplicationCommandOptionType, ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';
import BotManager from '../BotManager';
import Server from '../server/Server';
import { Command } from './typing';

export const fill: Command = {
    name: 'fill',
    description: 'Enable all bots (if a server name is given, only bots for that server will be enabled)',
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: 'server',
            description: 'Name of server to enable bots for',
            type: ApplicationCommandOptionType.String,
            required: false
        }
    ],
    execute: async (interaction: ChatInputCommandInteraction, manager: BotManager) => {
        if (!manager.isBotLaunchComplete()) {
            await interaction.reply('Not all bots have been launched yet. Please wait until bot launch is complete before changing server settings.');
            return;
        }

        const serverName = interaction.options.getString('server');
        const servers = manager.getServers().filter((server: Server) => !serverName || server.getConfig().name == serverName);

        for (const server of servers) {
            // Manager will use default number of slots if currentSlots is undefined
            server.setCurrentSlots(undefined);
        }

        let reply: string;
        if (servers.length == 0) {
            reply = serverName ? `I do not manage bots for a server called "${serverName}".`: 'No servers are set up.';
        }
        else if (serverName) {
            reply = `Ok, bots will join ${serverName} shortly.`;
        }
        else {
            reply = 'Ok, calling all hands on deck.';
        }

        await interaction.reply(reply);
    }
};
