import { ChatInputApplicationCommandData, ChatInputCommandInteraction } from 'discord.js';
import BotManager from '../BotManager';

export interface Command extends ChatInputApplicationCommandData {
    execute: (interaction: ChatInputCommandInteraction, manager: BotManager) => Promise<void>;
}

export type Columns = {
    [key: string]: Column
}

export type ServerStatusColumns = Columns & {
    bot: Column
    running: Column
    onServer: Column
    lastChecked: Column
}

export type StatusOverviewColumns = Columns & {
    server: Column
    slots: Column
    reservedSlots: Column
    currentSlots: Column
    filledSlots: Column
}

export type Column = {
    heading: string
    width: number
}
