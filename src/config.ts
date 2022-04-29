import path from 'path';

export default abstract class Config {
    static readonly ROOT_DIR: string = path.join(__dirname, '..');
    static readonly RESOURCE_DIR: string = path.join(Config.ROOT_DIR, 'resources');
    static readonly RUNNING_DIR: string = path.join(Config.ROOT_DIR, 'running');
    static readonly LOG_LEVEL: string = process.env.LOG_LEVEL || 'info';

    static readonly API_REQUEST_TIMEOUT = Number(process.env.API_REQUEST_TIMEOUT ?? 2000);
    static readonly REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost';
    static readonly REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX ?? '';
    static readonly STATUS_CACHE_TTL = Number(process.env.STATUS_CACHE_TTL ?? 18);

    static readonly BOT_JOIN_TIMEOUT = Number(process.env.BOT_JOIN_TIMEOUT) || 300;
    static readonly BOT_ON_SERVER_TIMEOUT = Number(process.env.BOT_ON_SERVER_TIMEOUT) || 180;
    static readonly BOT_STATUS_UPDATE_TIMEOUT = Number(process.env.BOT_STATUS_UPDATE_TIMEOUT) || 30;
    static readonly BOT_SLOT_TIMEOUT = Number(process.env.BOT_SLOT_TIMEOUT) || 60;
    static readonly RESERVED_SLOT_TIMEOUT = Number(process.env.RESERVED_SLOT_TIMEOUT) || 240;
    static readonly OVERPOPULATE_FACTOR = Number(process.env.OVERPOPULATE_FACTOR) || 2;
    static readonly AUTOBALANCE_MAX_DURATION = Number(process.env.AUTOBALANCE_MAX_DURATION) || 240;

    static readonly TOKEN: string = process.env.TOKEN || '';
}
