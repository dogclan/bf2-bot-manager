import { QueryOptions, QueryResult } from 'gamedig';

export type CachedRequestConfig = {
    ttl: number;
    timeout?: number;
    headers?: any;
}

export type CachedQueryConfig = Pick<QueryOptions, 'givenPortOnly' | 'attemptTimeout' | 'socketTimeout' | 'maxRetries'> & {
    ttl: number
}

export interface QueryClient {
    getServerInfo(ip: string, port: number, queryPort?: number): Promise<ServerInfo>;
}

export type ServerInfo = {
    // omit irrelevant attributes
    numPlayers: number
    maxPlayers: number
    gameVariant: string
    players: PlayerInfo[]
}

export type PlayerInfo = {
    // omit irrelevant attributes
    name: string
    team: number
}

export type GamedigQueryResult = QueryResult & {
    raw: {
        gamevariant?: string;
    }
    players: GamedigPlayerInfo[];
}

export type GamedigPlayerInfo = {
    name: string
    raw: {
        team?: number;
        AIBot?: string
    }
}
