export interface CachedRequestConfig {
    ttl: number;
    timeout?: number;
    headers?: any;
}

export type BflistServer = {
    guid: string
    ip: string
    port: number
    numPlayers: number
    maxPlayers: number
    // omit irrelevant attributes
    players: BflistPlayer[]
}

export type BflistPlayer = {
    pid: number
    name: string
    tag: string
    score: number
    kills: number
    deaths: number
    ping: number
    team: number
    teamLabel: string
    aibot: boolean
}
