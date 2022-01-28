import { CommandInteraction } from 'discord.js';
import { ApplicationCommandOptionTypes } from 'discord.js/typings/enums';
import Bot from '../bot/Bot';
import BotManager from '../BotManager';
import { Command } from './typing';

export const status: Command = {
    name: 'status',
    description: 'Show status of bots controlled by the manager',
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
        const bots = manager.getBots().filter((bot: Bot) => !serverName || bot.getConfig().server.name == serverName);
        const statusList: string[] = [];
        for (const bot of bots) {
            const status = `${bot.getConfig().nickname}: launched=${bot.isLaunched()}, running=${bot.isBotRunning()}, onServer=${await bot.isOnServer()}`;
            statusList.push(status);
        }
        await interaction.reply(statusList.join('\n'));
    }
};
