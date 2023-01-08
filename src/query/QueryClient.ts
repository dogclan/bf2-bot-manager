import { GamedigPlayerInfo, GamedigQueryResult, QueryClient, ServerInfo } from './typing';
import { CachedGamedigClient, CachedHttpClient } from './CachedClient';
import RedisCache from './RedisCache';
import axios from 'axios';
import Config from '../config';

export class BflistQueryClient implements QueryClient {
    private httpClient: CachedHttpClient;

    constructor(cache: RedisCache) {
        const aclient = axios.create({
            timeout: Config.STATUS_QUERY_TIMEOUT
        });
        this.httpClient = new CachedHttpClient(aclient, cache);
    }

    async getServerInfo(ip: string, port: number): Promise<ServerInfo> {
        return this.httpClient.get(
            `https://api.bflist.io/bf2/v1/servers/${ip}:${port}`,
            { ttl: Config.STATUS_CACHE_TTL }
        );
    }
}

export class GamedigQueryClient implements QueryClient {
    private gamedigClient: CachedGamedigClient;

    constructor(cache: RedisCache) {
        this.gamedigClient = new CachedGamedigClient(cache);
    }

    async getServerInfo(ip: string, port: number, queryPort: number): Promise<ServerInfo> {
        const result = await this.gamedigClient.query(
            'bf2',
            ip,
            queryPort,
            {
                ttl: Config.STATUS_CACHE_TTL,
                givenPortOnly: true,
                maxAttempts: 2,
                socketTimeout: Config.STATUS_QUERY_TIMEOUT
            }
        );
        return this.parseQueryResult(result as GamedigQueryResult);
    }

    private parseQueryResult(result: GamedigQueryResult): ServerInfo {
        return {
            numPlayers: result.players.length,
            maxPlayers: result.maxplayers,
            gameVariant: result.raw.gamevariant,
            players: result.players.map((p: GamedigPlayerInfo) => {
                // Names are returned as "[tag] name", so remove the tag
                const [, name] = p.name.split(' ');
                return {
                    name,
                    team: p.raw.team
                };
            })
        };
    }
}
