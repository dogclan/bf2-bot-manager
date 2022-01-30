import { CommandInteraction } from 'discord.js';
import { ApplicationCommandOptionTypes } from 'discord.js/typings/enums';
import Bot from '../bot/Bot';
import BotManager from '../BotManager';
import Server from '../server/Server';
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
            required: true
        }
    ],
    execute: async (interaction: CommandInteraction, manager: BotManager) => {
        const serverName = interaction.options.getString('server');
        const server = manager.getServers().find((server: Server) => server.getConfig().name == serverName);

        if (!server) {
            await interaction.reply( `I do not manage bots for a server called "${serverName}".`);
            return;
        }

        const reply = await formatStatusList(server, manager.isBotLaunchComplete());
        await interaction.reply(reply);
    }
};

async function formatStatusList(server: Server, botLaunchComplete: boolean): Promise<string> {
    const config = server.getConfig();

    let formatted = `**Server:** ${config.name}\n`;
    formatted += `**Slots:** ${config.slots}${config.currentSlots != undefined ? ', temporarily changed to ' + config.currentSlots : ''}\n`;

    const bots = server.getBots();

    formatted += `**Bots on server:** ${bots.filter((b) => b.getStatus().onServer).length}\n\n`;

    const longestBotName = bots.slice().sort((a, b) => a.getConfig().basename.length - b.getConfig().basename.length).pop()?.getConfig().basename;
    const columns: Columns = {
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
        lastChecked: {
            heading: 'Last checked',
            width: 17
        }
    };

    // Start markdown embed
    formatted += '```\n';

    // Add table headers
    let totalWidth = 0;
    for (const key in columns) {
        const column = columns[key];

        // Add three spaces of padding between tables
        column.width = key == 'lastChecked' ? column.width : column.width + 3;

        formatted += column.heading.padEnd(column.width, ' ');
        totalWidth += column.width;
    }

    formatted += '\n';

    // Add separator
    formatted += `${'-'.padEnd(totalWidth, '-')}\n`;

    for (const bot of bots) {
        const config = bot.getConfig();
        const status = bot.getStatus();

        formatted += config.basename.padEnd(columns.bot.width, ' ');
        formatted += booleanToEnglish(status.enabled).padEnd(columns.running.width);
        formatted += booleanToEnglish(status.onServer).padEnd(columns.onServer.width);
        formatted += status.onServerLastCheckedAt?.fromNow() || '';
        formatted += '\n';
    }

    // End markdown embed
    formatted += '```';

    if (!botLaunchComplete) {
        formatted += '\n**Note:** Not all bots have been launched yet, meaning bot status may not be up to date.';
    }

    return formatted;
}
