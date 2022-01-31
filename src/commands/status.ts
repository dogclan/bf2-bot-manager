import { CommandInteraction } from 'discord.js';
import { ApplicationCommandOptionTypes } from 'discord.js/typings/enums';
import BotManager from '../BotManager';
import Server from '../server/Server';
import { booleanToEnglish } from '../utility';
import { Command, ServerStatusColumns, StatusOverviewColumns } from './typing';

export const status: Command = {
    name: 'status',
    description: 'Show status of servers for which bots are controlled by the manager',
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
        const serverName = interaction.options.getString('server');
        const servers = manager.getServers().filter((server: Server) => !serverName || server.getConfig().name == serverName);

        if (servers.length == 0) {
            await interaction.reply(serverName ? `I do not manage bots for a server called "${serverName}".` : 'No servers are set up.');
            return;
        }

        let reply: string;
        if (serverName) {
            reply = await formatServerStatus(servers[0]);
        }
        else {
            reply = await formatStatusOverview(servers);
        }

        if (!manager.isBotLaunchComplete()) {
            reply += '\n**Note:** Not all bots have been launched yet, meaning bot/filled slot status may not be up to date.';
        }

        await interaction.reply(reply);
    }
};

async function formatServerStatus(server: Server): Promise<string> {
    const config = server.getConfig();

    let formatted = `**Server:** ${config.name}\n`;
    formatted += `**Slots:** ${config.slots}${config.currentSlots != undefined ? ', temporarily changed to ' + config.currentSlots : ''}\n`;

    const bots = server.getBots();

    formatted += `**Bots on server:** ${bots.filter((b) => b.getStatus().onServer).length}\n\n`;

    const longestBotName = bots.slice().sort((a, b) => a.getConfig().basename.length - b.getConfig().basename.length).pop()?.getConfig().basename;
    const columns: ServerStatusColumns = {
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

    return formatted;
}

async function formatStatusOverview(servers: Server[]): Promise<string> {
    const longestServerName = servers.slice().sort((a, b) => a.getConfig().name.length - b.getConfig().name.length).pop()?.getConfig().name;
    const columns: StatusOverviewColumns = {
        server: {
            heading: 'Server',
            width: longestServerName?.length || 10
        },
        slots: {
            heading: 'Slots default',
            width: 13
        },
        currentSlots: {
            heading: 'Slots current',
            width: 13
        },
        filledSlots: {
            heading: 'Slots filled',
            width: 12
        }
    };

    // Start markdown embed
    let formatted = '```\n';

    // Add table headers
    let totalWidth = 0;
    for (const key in columns) {
        const column = columns[key];

        // Add three spaces of padding between tables
        column.width = key == 'filledSlots' ? column.width : column.width + 3;

        formatted += column.heading.padEnd(column.width, ' ');
        totalWidth += column.width;
    }

    formatted += '\n';

    // Add separator
    formatted += `${'-'.padEnd(totalWidth, '-')}\n`;

    for (const server of servers) {
        const config = server.getConfig();
        const bots = server.getBots();
        const currentSlots = config.currentSlots != undefined ? config.currentSlots : config.slots;
        const filledSlots = bots.filter((b) => b.getStatus().onServer).length;

        formatted += config.name.padEnd(columns.server.width, ' ');
        formatted += String(config.slots).padEnd(columns.slots.width);
        formatted += String(currentSlots).padEnd(columns.currentSlots.width);
        formatted += String(filledSlots).padEnd(columns.filledSlots.width);
        formatted += '\n';
    }

    // End markdown embed
    formatted += '```';

    return formatted;    
}
