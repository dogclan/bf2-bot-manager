import { ChatInputApplicationCommandData, CommandInteraction } from 'discord.js';
import BotManager from '../BotManager';

export interface Command extends ChatInputApplicationCommandData {
    execute: (interaction: CommandInteraction, manager: BotManager) => Promise<void>;
}
