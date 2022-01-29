import { ChatInputApplicationCommandData, CommandInteraction } from 'discord.js';
import BotManager from '../BotManager';

export interface Command extends ChatInputApplicationCommandData {
    execute: (interaction: CommandInteraction, manager: BotManager) => Promise<void>;
}

export type Columns = {
    [key: string]: Column
    server: Column
    bot: Column
    running: Column
    onServer: Column
    lastChecked: Column
}

export type Column = {
    heading: string
    width: number
}