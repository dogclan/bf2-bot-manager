import { createClient, RedisClientType } from '@node-redis/client';
import CachedJSON from './CachedJSON';

class RedisCache {
    private readonly prefix: string;

    private rclient: RedisClientType;

    constructor(redisUrl: string, prefix: string) {
        this.prefix = prefix;

        this.rclient = createClient({
            url: redisUrl
        });
    }

    public async connect(): Promise<void> {
        return this.rclient.connect();
    }

    public async setEx(key: string, seconds: number, value: string): Promise<string> {
        return this.rclient.setEx(this.prefixedKey(key), seconds, value);
    }

    public async setExJSON(key: string, seconds: number, value: any, replacer?: { (key: string, value: any): any }): Promise<string> {
        const toCache = new CachedJSON(value);
        return this.setEx(key, seconds, toCache.stringify(replacer));
    }

    public async get(key: string): Promise<string | null> {
        return this.rclient.get(this.prefixedKey(key));
    }

    public async getJSON(key: string): Promise<CachedJSON | null> {
        const fromCache = await this.get(key);

        return fromCache != null ? CachedJSON.parse(fromCache) : null;
    }

    private prefixedKey(key: string): string {
        return this.prefix + key;
    }
}

export default RedisCache;
