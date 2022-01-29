import { CommandInteraction } from 'discord.js';
import { ApplicationCommandOptionTypes } from 'discord.js/typings/enums';
import Bot from '../bot/Bot';
import BotManager from '../BotManager';
import { Command } from './typing';

export const setEnabled: Command = {
    name: 'set-enabled',
    description: 'Enable or disable a bot on a server',
    defaultPermission: false,
    options: [
        {
            name: 'server',
            description: 'Name of server bot is setup for',
            type: ApplicationCommandOptionTypes.STRING,
            required: true
        },
        {
            name: 'bot',
            description: 'Name of bot to enable/disable',
            type: ApplicationCommandOptionTypes.STRING,
            required: true
        },
        {
            name: 'enabled',
            description: 'New enabled status of the bot',
            type: ApplicationCommandOptionTypes.BOOLEAN,
            required: true
        }
    ],
    execute: async (interaction: CommandInteraction, manager: BotManager) => {
        if (!manager.isBotLaunchComplete()) {
            await interaction.reply('Not all bots have been launched yet. Please wait until bot launch is complete before enabling/disabling any bots.');
            return;
        }

        const options = {
            serverName: interaction.options.getString('server', true),
            botName: interaction.options.getString('bot', true),
            enabled: interaction.options.getBoolean('enabled', true)
        }

        const bot = manager.getBots().find((bot: Bot) => {
            const config = bot.getConfig();
            return config.server.name == options.serverName && config.basename == options.botName
        });

        let reply: string;
        if (!bot) {
            reply = `I do not manage a bot called "${options.botName}" on a server called "${options.serverName}". Maybe run /status once to check server and bot names?`;
        }
        else if (bot.isEnabled() != options.enabled) {
            bot.setEnabled(options.enabled);
            reply = `Ok, ${options.botName} has been ${options.enabled ? 'enabled' : 'disabled'} and will ${options.enabled ? 'attempt to join' : 'leave'} ${options.serverName} shortly.`
        }
        else {
            reply = `Um, ${options.botName} already is ${options.enabled ? 'enabled' : 'disabled'}.`;
        }
        
        await interaction.reply(reply);
    }
};
