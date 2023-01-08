import {
    ApplicationCommandOptionType,
    ApplicationCommandType,
    ChatInputCommandInteraction,
    EmbedBuilder,
    EmbedField
} from 'discord.js';
import BotManager from '../BotManager';
import Server from '../server/Server';
import { booleanToEnglish } from '../utility';
import { Command, ServerStatusColumns } from './typing';
import { ServerConfig, ServerStatus } from '../server/typing';

export const status: Command = {
    name: 'status',
    description: 'Show status of servers for which bots are controlled by the manager',
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: 'server',
            description: 'Server name to show status for',
            type: ApplicationCommandOptionType.String,
            required: false
        },
        {
            name: 'detailed',
            description: 'Show detailed, per-bot status',
            type: ApplicationCommandOptionType.Boolean,
            required: false
        }
    ],
    execute: async (interaction: ChatInputCommandInteraction, manager: BotManager) => {
        const serverName = interaction.options.getString('server');
        const detailed = interaction.options.getBoolean('detailed') || false;

        const servers = manager.getServers().filter((server: Server) => !serverName || server.getConfig().name == serverName);

        if (servers.length == 0) {
            await interaction.reply(
                serverName ?
                    `I do not manage bots for a server called "${serverName}". Try ${manager.getServers().slice(0, 2).map((s) => '"' + s.getConfig().name + '"').join(',')} or use the command without a server name to see all available servers.` :
                    'No servers are set up.'
            );
            return;
        }

        const embeds = servers.map((s) => formatServerStatus(s, detailed));

        if (!manager.isBotLaunchComplete()) {
            for (const embed of embeds) {
                embed.setFooter({
                    iconURL: 'https://static.cetteup.com/info-yellow.png',
                    text: 'Not all bots have been launched yet, meaning bot/filled slot status may not be up to date.'
                });
            }
        }

        await interaction.reply({ embeds });
    }
};

function formatServerStatus(server: Server, detailed: boolean): EmbedBuilder {
    const config = server.getConfig();
    const status = server.getStatus();
    // Bots that are neither enabled nor running nor on the server are not of any relevance
    const bots = server.getBots().filter((b) => {
        const status = b.getStatus();
        return status.enabled || status.botRunning || status.onServer;
    });

    const fields: EmbedField[] = [
        {
            name: 'Slots to fill',
            value: config.currentSlots != undefined && config.currentSlots != config.slots ?
                `${config.slots}, temporarily changed to ${config.currentSlots}` :
                `${config.slots}`,
            inline: true
        },
        {
            name: 'Bots enabled',
            value: bots.filter((b) => b.getStatus().enabled).length.toString(),
            inline: true
        },
        {
            name: 'Bots running',
            value: bots.filter((b) => b.getStatus().botRunning).length.toString(),
            inline: true
        },
        {
            name: 'Bots on server',
            value: bots.filter((b) => b.getStatus().onServer).length.toString(),
            inline: true
        },
        {
            name: 'Autobalance in progress',
            value: formatAutobalanceStatus(config, status),
            inline: true
        }
    ];

    const embed = new EmbedBuilder({
        title: `Status summary for ${config.name}`,
        fields,
        author: {
            name: `${config.address}:${config.port}`,
            iconURL: 'https://cdn.discordapp.com/icons/377985116758081541/525b59c06d45c14479657638cae8091a.webp',
            url: `https://www.bf2hub.com/server/${config.address}:${config.port}/`
        }
    });
    embed.setColor('#cf8562');

    if (!detailed) {
        return embed;
    }

    const longestBotName = bots.slice().sort((a, b) => a.getConfig().basename.length - b.getConfig().basename.length).pop()?.getConfig().basename;
    const columns: ServerStatusColumns = {
        bot: {
            heading: 'Bot',
            width: longestBotName?.length || 10
        },
        enabled: {
            heading: 'Enabled',
            width: 7
        },
        running: {
            heading: 'Running',
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
    let formatted = '```\n';

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
        formatted += booleanToEnglish(status.enabled).padEnd(columns.enabled.width);
        formatted += booleanToEnglish(status.botRunning).padEnd(columns.running.width);
        formatted += booleanToEnglish(status.onServer).padEnd(columns.onServer.width);
        formatted += status.onServerLastCheckedAt?.fromNow() || '';
        formatted += '\n';
    }

    // End markdown embed
    formatted += '```';

    embed.setDescription(formatted);

    return embed;
}

function formatAutobalanceStatus(config: ServerConfig, status: ServerStatus): string {
    if (config.autobalance == false) {
        return 'No (disabled)';
    }
    if (status.autobalanceInProgress) {
        return `Yes, started ${status.autobalanceStartedAt?.fromNow()}`;
    }
    return 'No';
}
