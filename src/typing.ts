import { ScheduledTask } from 'node-cron';

export type BotServer = {
    name: string
    address: string
    port: number
    queryPort?: number
    mod: string
    rotateBotNames?: boolean
}

export type ServerBotConfig = BotServer & {
    slots: number
    reservedSlots: number
    autobalance?: boolean
    queryDirectly?: boolean
    bots: BotBaseConfig[]
}

export type BotBaseConfig = {
    basename: string
    password: string
}

export type Task = {
    running?: boolean
    schedule: ScheduledTask
}

export type TeamSizes = {
    smaller: number
    bigger: number
    delta: number
}
