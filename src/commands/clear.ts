import {
    ApplicationCommandOptionType,
    ApplicationCommandType,
    AutocompleteInteraction,
    ChatInputCommandInteraction
} from 'discord.js';
import BotManager from '../BotManager';
import Server from '../server/Server';
import { Command } from './typing';
import { buildServerOptionChoices } from './utility';

export const clear: Command = {
    name: 'clear',
    description: 'Disable all bots (if a server name is given, only bots for that server will be disabled)',
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: 'server',
            description: 'Name of server to disable bots for',
            type: ApplicationCommandOptionType.String,
            required: false,
            autocomplete: true
        }
    ],
    execute: async (interaction: ChatInputCommandInteraction, manager: BotManager) => {
        const serverName = interaction.options.getString('server');
        const servers = manager.getServers().filter((server: Server) => !serverName || server.getConfig().name == serverName);

        if (servers.some((server: Server) => !server.getStatus().botLaunchComplete)) {
            await interaction.reply('Not all bots have been launched yet. Please wait until bot launch is complete before changing server settings.');
            return;
        }

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
    },
    autocomplete: async (interaction: AutocompleteInteraction, manager: BotManager) => {
        const focusedValue = interaction.options.getFocused();
        const choices = buildServerOptionChoices(manager, focusedValue);
        await interaction.respond(choices);
    }
};
