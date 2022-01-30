import Bot from '../bot/Bot';
import { ServerConfig } from './typing';

class Server {
    private config: ServerConfig;
    private bots: Bot[];

    constructor (config: ServerConfig, bots: Bot[]) {
        this.config = config;
        this.bots = bots;
    }

    public getConfig(): ServerConfig {
        return this.config;
    }

    public setCurrentSlots(currentSlots?: number): void {
        this.config.currentSlots = currentSlots;
    }

    public getBots(): Bot[] {
        return this.bots;
    }
}

export default Server;
