import { ApplicationCommandOptionType, ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';
import BotManager from '../BotManager';
import Config from '../config';
import Server from '../server/Server';
import { Command } from './typing';

export const setSlots: Command = {
    name: 'set-slots',
    description: 'Temporarily change the number of slots to fill with bots',
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: 'server',
            description: 'Name of server to change number of slots for',
            type: ApplicationCommandOptionType.String,
            required: true
        },
        {
            name: 'slots',
            description: 'New number of slots to fill with bots',
            type: ApplicationCommandOptionType.Number,
            required: true
        }
    ],
    execute: async (interaction: ChatInputCommandInteraction, manager: BotManager) => {
        const options = {
            serverName: interaction.options.getString('server', true),
            slots: interaction.options.getNumber('slots', true)
        };

        const server = manager.getServers().find((server: Server) => server.getConfig().name == options.serverName);

        if (!server) {
            await interaction.reply(`I do not manage bots for a server called "${options.serverName}".`);
            return;
        }
        else if (!manager.isBotLaunchComplete()) {
            await interaction.reply('Not all bots have been launched yet. Please wait until bot launch is complete before changing server settings.');
            return;
        }

        const config = server.getConfig();
        const currentSlots = config.currentSlots != undefined ? config.currentSlots : config.slots;
        const botsAvailable = server.getBots().length;
        const botsRequired = options.slots * Config.OVERPOPULATE_FACTOR;

        let reply: string;
        if (botsAvailable < botsRequired) {
            reply = `${config.name} does not have enough bots setup to ensure that ${options.slots} slots can be filled (has: ${botsAvailable}, needs: ${botsRequired}).`;
        }
        else if (currentSlots == options.slots) {
            reply = `Ahem, ${config.name} is already set up to get ${options.slots} bots.`;
        }
        else {
            server.setCurrentSlots(options.slots);
            reply = `Ok, ${options.slots != config.slots ? 'temporarily' : ''} ${options.slots > currentSlots ? 'increased' : 'decreased'} number of slots to fill on ${config.name} from ${currentSlots} to ${options.slots}. Bots will ${options.slots > currentSlots ? 'join to fill the additional' : 'leave to free'} slots shortly.`;
        }

        await interaction.reply(reply);
    }
};
