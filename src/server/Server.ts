import Bot from '../bot/Bot';
import { ServerConfig } from './typing';
import {sleep} from '../utility';
import {Logger} from 'tslog';
import logger from '../logger';
import moment from 'moment';
import Config from '../config';

class Server {
    private config: ServerConfig;
    private bots: Bot[];

    private logger: Logger;

    constructor (config: ServerConfig, bots: Bot[]) {
        this.config = config;
        this.bots = bots;

        this.logger = logger.getChildLogger({ name: 'ServerLogger', prefix: [this.config.name] });
    }

    public async launchBots(): Promise<void> {
        this.logger.info('launching bots');
        const bots = this.bots.filter((bot: Bot) => bot.isEnabled());
        for (const bot of bots) {
            const config = bot.getConfig();
            try {
                this.logger.debug('launching bot process for', config.basename);
                bot.launch();

                // Give bot a few seconds before starting next one
                await sleep(45000);
                await bot.updateStatus();
            }
            catch (e: any) {
                this.logger.error('failed to launch bot process for', config.basename, e.message);
            }
        }
    }

    public async maintainBots(): Promise<void> {
        const slots = this.config.currentSlots != undefined ? this.config.currentSlots : this.config.slots;
        for (const bot of this.bots) {
            const config = bot.getConfig();
            const status = bot.getStatus();

            if (moment().diff(status.onServerLastCheckedAt, 'seconds') > Config.BOT_STATUS_UPDATE_TIMEOUT) {
                this.logger.debug('bot has not updated it\'s status recently, skipping', config.basename);
                continue;
            }

            const filledSlots = this.bots.filter((b: Bot) => b.getStatus().onServer && b.getStatus().enabled).length;
            const enabledBots = this.bots.filter((b: Bot) => b.getStatus().enabled).length;
            const maxPopulation = slots * Config.OVERPOPULATE_FACTOR;
            if (!bot.isEnabled() && filledSlots < slots && enabledBots < maxPopulation) {
                // Enable if desired number of slots is currently not filled on the server and overpulate max has not been reached yet
                this.logger.info('has slots to fill, enabling', config.basename, slots, filledSlots, maxPopulation, enabledBots);
                bot.setEnabled(true);
            }
            else if (bot.isEnabled() && (filledSlots > slots || enabledBots > maxPopulation)) {
                // Disable if desired number of slots or overpopulate max has been exceeded
                this.logger.info('has to many slots filled/bots running, disabling', config.basename, slots, filledSlots, maxPopulation, enabledBots);
                bot.setEnabled(false);
            }
            else if (bot.isEnabled() && !status.onServer && filledSlots == slots) {
                // Disable if bot is not on server but desired number of slots has been filled
                this.logger.info('is filled up, disabling', config.basename, slots, filledSlots, maxPopulation, enabledBots);
                bot.setEnabled(false);
            }

            if (status.enabled && !status.processRunning) {
                this.logger.info('bot process not running, (re-)launching', config.basename);
                await bot.relaunch();

                // Give bot a few seconds before starting next one
                await sleep(45000);
            }
            else if (!status.enabled && status.processRunning) {
                this.logger.info('bot is disabled but process is running, stopping', config.basename);
                bot.stop();
                await bot.waitForStop();

                bot.kill();
            }
            else if (status.enabled && !status.onServer && !status.botRunning) {
                this.logger.info('bot not on server, will check again', config.basename);
            }
            else if (status.enabled && !status.onServer && status.botRunning
                && moment().diff(status.processStartedAt, 'seconds') > Config.BOT_JOIN_TIMEOUT
                && (!status.lastSeenOnServerAt || moment().diff(status.lastSeenOnServerAt, 'seconds') > Config.BOT_ON_SERVER_TIMEOUT)
            ) {
                this.logger.info('bot not on server, killing until next iteration', config.basename);

                // Update nickname to avoid server "shadow banning" account by name
                bot.rotateNickname();

                bot.stop();
                await bot.waitForStop();

                bot.kill();
            }
            else if (status.enabled && status.onServer) {
                this.logger.debug('bot on server', config.basename);
            }
        }
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
