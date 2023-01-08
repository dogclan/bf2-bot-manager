import { Logger } from 'tslog';
import { AxiosInstance } from 'axios';
import RedisCache, { CachedJSON } from './RedisCache';
import { CachedQueryConfig, CachedRequestConfig } from './typing';
import Config from '../config';
import logger from '../logger';
import gamedig from 'gamedig';

export class CachedHttpClient {
    protected logger: Logger;
    protected aclient: AxiosInstance;
    protected cache: RedisCache;

    constructor(aclient: AxiosInstance, cache: RedisCache) {
        this.aclient = aclient;
        this.cache = cache;
        this.logger = logger.getChildLogger({ name: 'CachedHttpClientLogger' });
    }

    public async get(url: string, config: CachedRequestConfig): Promise<any> {
        // Merge defaults with given config
        const requestConfig = {
            timeout: Config.STATUS_QUERY_TIMEOUT,
            ...config
        };

        const cacheKey = `get:${url}`;

        let cached: CachedJSON | null = null;
        try {
            cached = await this.cache.getJSON(cacheKey);
        } catch (e: any) {
            this.logger.error('Failed to get JSON from cache', cacheKey, e.message);
        }

        let data: any;
        if (cached) {
            this.logger.debug('Cache HIT, returning cached data', cacheKey);
            data = cached.data;
        } else {
            // If no data was found in cache, fetch it from source
            this.logger.debug('Cache MISS, fetching data from source', cacheKey);
            const resp = await this.aclient.get(url, { headers: requestConfig.headers, timeout: requestConfig.timeout });
            data = resp.data;

            // Cache fetched data and set it to expire based on source's cache ttl
            try {
                await this.cache.setExJSON(cacheKey, requestConfig.ttl, data);
            } catch (e: any) {
                this.logger.error('Failed to cache fetched data for GET request', cacheKey, e.message);
            }
        }

        return data;
    }
}

export class CachedGamedigClient {
    protected logger: Logger;
    protected cache: RedisCache;

    constructor(cache: RedisCache) {
        this.cache = cache;
        this.logger = logger.getChildLogger({ name: 'CachedGamedigClientLogger' });
    }

    public async query(type: gamedig.Type, host: string, port: number, config: CachedQueryConfig): Promise<gamedig.QueryResult> {
        const cacheKey = ['query', type, host, port].join(':');

        let cached: CachedJSON | null = null;
        try {
            cached = await this.cache.getJSON(cacheKey);
        } catch (e: any) {
            this.logger.error('Failed to get JSON from cache', cacheKey, e.message);
        }

        let data: any;
        if (cached) {
            this.logger.debug('Cache HIT, returning cached data', cacheKey);
            data = cached.data;
        } else {
            // If no data was found in cache, fetch it from source
            this.logger.debug('Cache MISS, fetching data from source', cacheKey);
            data = await gamedig.query({
                type,
                host,
                port,
                ...config
            });

            // Cache fetched data and set it to expire based on source's cache ttl
            try {
                await this.cache.setExJSON(cacheKey, config.ttl, data);
            } catch (e: any) {
                this.logger.error('Failed to cache fetched data for GET request', cacheKey, e.message);
            }
        }

        return data;
    }
}
