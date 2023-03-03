import { AutocompleteInteraction, ChatInputApplicationCommandData, ChatInputCommandInteraction } from 'discord.js';
import BotManager from '../BotManager';

export interface Command extends ChatInputApplicationCommandData {
    execute: (interaction: ChatInputCommandInteraction, manager: BotManager) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction, manager: BotManager) => Promise<void>;
}

export type Columns = {
    [key: string]: Column
}

export type ServerStatusColumns = Columns & {
    bot: Column
    enabled: Column
    running: Column
    onServer: Column
}

export type Column = {
    heading: string
    width: number
}
