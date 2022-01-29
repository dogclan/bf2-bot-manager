import { CommandInteraction } from 'discord.js';
import { ApplicationCommandOptionTypes } from 'discord.js/typings/enums';
import Bot from '../bot/Bot';
import { BotStatus } from '../bot/typing';
import BotManager from '../BotManager';
import { booleanToEnglish } from '../utility';
import { Columns, Command } from './typing';

export const status: Command = {
    name: 'status',
    description: 'Show status of bots controlled by the manager',
    defaultPermission: false,
    options: [
        {
            name: 'server',
            description: 'Server name to show status for',
            type: ApplicationCommandOptionTypes.STRING,
            required: false
        }
    ],
    execute: async (interaction: CommandInteraction, manager: BotManager) => {
        // Status checks may take a second, so defer reply in order to keep interaction token valid
        await interaction.deferReply();

        const serverName = interaction.options.getString('server');
        const bots = manager.getBots().filter((bot: Bot) => !serverName || bot.getConfig().server.name == serverName);

        const reply = await formatStatusList(bots, manager.isBotLaunchComplete(), serverName);
        await interaction.editReply(reply);
    }
};

async function formatStatusList(bots: Bot[], botLaunchComplete: boolean, serverName: string | null): Promise<string> {
    if (bots.length == 0) {
        return serverName ? `Could not find any bots set up for a server called "${serverName}".`: 'No bots are set up.';
    }

    const longestServerName = bots.slice().sort((a, b) => a.getConfig().server.name.length - b.getConfig().server.name.length).pop()?.getConfig().server.name;
    const longestBotName = bots.slice().sort((a, b) => a.getConfig().basename.length - b.getConfig().basename.length).pop()?.getConfig().basename;
    const columns: Columns = {
        server: {
            heading: 'Server',
            width: longestServerName?.length || 10
        },
        bot: {
            heading: 'Bot',
            width: longestBotName?.length || 10
        },
        running: {
            heading: 'Enabled',
            width: 7
        },
        onServer: {
            heading: 'On server',
            width: 9
        },
        asOf: {
            heading: 'As of',
            width: 5
        }
    };

    // Start markdown embed
    let formatted = '```\n';

    // Add table headers
    let totalWidth = 0;
    for (const key in columns) {
        const column = columns[key];

        // Add three spaces of padding between tables
        column.width = key == 'asOf' ? column.width : column.width + 3;

        formatted += column.heading.padEnd(column.width, ' ');
        totalWidth += column.width;
    }

    formatted += '\n';

    // Add separator
    formatted += `${'-'.padEnd(totalWidth, '-')}\n`;

    for (const bot of bots) {
        const config = bot.getConfig();
        const status = bot.getStatus();

        formatted += config.server.name.padEnd(columns.server.width, ' ');
        formatted += config.basename.padEnd(columns.bot.width, ' ');
        formatted += booleanToEnglish(status.enabled).padEnd(columns.running.width);
        formatted += booleanToEnglish(status.onServer).padEnd(columns.onServer.width);
        formatted += status.onServerLastCheckedAt?.fromNow() || '';
        formatted += '\n';
    }

    // End markdown embed
    formatted += '```';

    if (!botLaunchComplete) {
        formatted += `\n**Note:** Not all bots have been launched yet, meaning bot status may not be up to date.`;
    }

    return formatted;
}
