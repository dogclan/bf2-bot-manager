export type BotServer = {
    name: string
    address: string
    port: number
    mod: string
}

export type ServerBotConfig = BotServer & {
    bots: BotBaseConfig[]
}

export type BotBaseConfig = {
    basename: string
    password: string
}
