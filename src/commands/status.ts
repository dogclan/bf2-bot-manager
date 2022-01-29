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
        const basenames: string[] = bots.map((bot: Bot) => bot.getConfig().basename);
        const statuses: BotStatus[] = bots.map((bot: Bot) => bot.getStatus());

        const reply = await formatStatusList(basenames, statuses, manager.isBotLaunchComplete());
        await interaction.editReply(reply);
    }
};

async function formatStatusList(names: string[], statuses: BotStatus[], botLaunchComplete: boolean): Promise<string> {
    if (statuses.length == 0) {
        return 'No bots are set up';
    }

    const longestName = names.slice().sort((a, b) => a.length - b.length).pop();
    const columns: Columns = {
        name: {
            heading: 'Name',
            width: longestName?.length || 10
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

    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const status = statuses[i];
        formatted += name.padEnd(columns.name.width, ' ');
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
