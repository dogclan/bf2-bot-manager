import { ApplicationCommandPermissionData } from 'discord.js';
import cron from 'node-cron';

export type BotServer = {
    name: string
    address: string
    port: number
    mod: string
}

export type ServerBotConfig = BotServer & {
    slots: number
    reservedSlots: number
    bots: BotBaseConfig[]
}

export type BotBaseConfig = {
    basename: string
    password: string
}

export type CommandPermissionSet = {
    guild: string
    permissions: ApplicationCommandPermissionData[]
}

export type Task = {
    running?: boolean
    schedule: cron.ScheduledTask
}

export type TeamSizes = {
    smaller: number
    bigger: number
    delta: number
}
