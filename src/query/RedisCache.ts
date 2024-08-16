import { createClient, RedisClientType } from '@redis/client';
import moment, { Moment } from 'moment/moment';

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
        await this.rclient.connect();
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

export class CachedJSON {
    public data: any;
    public asOf: Moment;

    constructor(data: any, asOf?: string) {
        this.data = data;
        this.asOf = moment(asOf);
    }

    public stringify(replacer?: { (key: string, value: any): any }): string {
        return JSON.stringify(
            {
                data: this.data,
                asOf: this.asOf
            },
            replacer
        );
    }

    public static parse(unparsed: string): CachedJSON {
        const parsed = JSON.parse(unparsed);
        return new this(parsed.data, parsed.asOf);
    }
}

export default RedisCache;
