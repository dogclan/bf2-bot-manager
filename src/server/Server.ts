import Bot from '../bot/Bot';
import {ServerConfig, ServerSlotStatus, ServerStatus} from './typing';
import {getStatusCheckURL, sleep} from '../utility';
import {Logger} from 'tslog';
import logger from '../logger';
import moment from 'moment';
import Config from '../config';
import {CachedHttpClient} from '../http/CachedHttpClient';

class Server {
    private httpClient: CachedHttpClient;
    private config: ServerConfig;
    private bots: Bot[];

    private logger: Logger;
    private status: ServerStatus;

    constructor(httpClient: CachedHttpClient, config: ServerConfig, bots: Bot[]) {
        this.httpClient = httpClient;
        this.config = config;
        this.bots = bots;

        this.logger = logger.getChildLogger({ name: 'ServerLogger', prefix: [this.config.name] });
        this.status = {};
    }

    public async launchBots(): Promise<void> {
        this.logger.info('launching bots');
        // Only launch as many bots as we have slots right now
        // (currentSlots may have already been set by ensureReservedSlots)
        const slots = this.getCurrentSlots();
        const bots = this.bots.slice(0, slots);
        for (const bot of bots) {
            const config = bot.getConfig();
            try {
                this.logger.debug('launching bot process for', config.basename);
                bot.setEnabled(true);
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
        for (const bot of this.bots) {
            const slots = this.getCurrentSlots();
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
                this.logger.info('has too many slots filled/bots running, disabling', config.basename, slots, filledSlots, maxPopulation, enabledBots);
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

    public async ensureReservedSlots(initialCheck = false): Promise<void> {
        // Skip check if server does not have reserved slots set up (or number of reserved slots is 0)
        if (!this.config.reservedSlots) {
            return;
        }

        const currentSlots = this.getCurrentSlots();
        const slotStatus = await this.getSlotStatus();
        // Ignore any negative results, as the worst case should be 0 available slots
        const availableSlotsRaw = Math.max(
            0,
            slotStatus.max - (slotStatus.filledTotal - slotStatus.filledByBots) - this.config.reservedSlots
        );
        // Keep number of slots even
        const availableSlots = availableSlotsRaw - availableSlotsRaw % 2;

        if (availableSlots < currentSlots) {
            // Slots need to be freed, figure out whether to decrease current slots now or later
            if (initialCheck || moment().diff(this.status.currentSlotsTakenSince, 'seconds') > Config.BOT_SLOT_TIMEOUT) {
                // Slots need to be freed and either we are performing the initial slot check during starting up or the timeout has passed
                // => reduce slots now
                this.logger.info('has more slots configured than are currently available, reducing current slots', availableSlots, currentSlots, slotStatus.filledByBots);
                this.setCurrentSlots(availableSlots);
                // Reset slot timeout timer
                delete this.status.currentSlotsTakenSince;
            }
            else if (this.status.currentSlotsTakenSince) {
                // Slots need to be freed but have not timed out yet => just wait
                this.logger.info('has too many slots configured, waiting for bot slots to time out', this.status.currentSlotsTakenSince.toISOString(), Config.BOT_SLOT_TIMEOUT);
            }
            else {
                // Players just joined => start timeout before freeing up slots
                this.logger.info('has slots freshly taken, starting bot slot timeout');
                this.status.currentSlotsTakenSince = moment();
            }
        }
        else if (availableSlots > currentSlots && availableSlots < this.config.slots) {
            // Slots are available, figure out whether to increase current slots now or later
            if (moment().diff(this.status.availableSlotsFreeSince, 'seconds') > Config.RESERVED_SLOT_TIMEOUT) {
                // Slots are available and timeout has either passed or is not relevant (since timestamp not set)
                this.logger.info('has more slots available than are currently configured, increasing current slots', availableSlots, currentSlots, slotStatus.filledByBots);
                // Increase current slots to either the number for available slots of the max number of bots
                this.setCurrentSlots(availableSlots);
                // Reset slot timeout timer
                delete this.status.availableSlotsFreeSince;
            }
            else if (this.status.availableSlotsFreeSince) {
                // Slots are available but timeout is set and has not passed => just wait
                this.logger.info('has slots available, waiting for reserved slot to time out', this.status.availableSlotsFreeSince.toISOString(), Config.RESERVED_SLOT_TIMEOUT);
            }
            else {
                // Slots are available and timeout is not set => set it now to start timer
                this.logger.info('has slots freshly available, starting reserved slot timeout');
                this.status.availableSlotsFreeSince = moment();
            }
        }
        else if (availableSlots == currentSlots && this.status.currentSlotsTakenSince) {
            // Slots were freed by players while we waited for timeout to pass => unset timer
            this.logger.info('had missing slots freed by player(s) during timeout');
            delete this.status.currentSlotsTakenSince;
        }
        else if (availableSlots == currentSlots && this.status.availableSlotsFreeSince) {
            // Slots were filled by players while we waited for timeout to pass => unset timer
            this.logger.info('had available slots taken by player(s) during timeout');
            delete this.status.availableSlotsFreeSince;
        }
    }

    private async getSlotStatus(): Promise<ServerSlotStatus> {
        const server = await this.httpClient.get(
            getStatusCheckURL(this.config.address, this.config.port),
            { ttl: Config.STATUS_CACHE_TTL }
        );

        // Check which bots are on server based on the data here rather than based on the bots own status tracking
        // in order to avoid mismatches in filled slot values based on slightly apart status update requests
        const botNicknames = this.bots.map((b: Bot) => b.getConfig().nickname);
        const botsOnServer = server.players.filter((p: any) => botNicknames.includes(p.name));

        return {
            filledTotal: server.numPlayers,
            filledByBots: botsOnServer.length,
            max: server.maxPlayers
        };
    }

    public getConfig(): ServerConfig {
        return this.config;
    }

    // Get the currently applicable number of slots to fill with bots (either config.slots or config.currentSlots)
    public getCurrentSlots(): number {
        return this.config.currentSlots ?? this.config.slots;
    }

    public setCurrentSlots(currentSlots?: number): void {
        this.config.currentSlots = currentSlots;
    }

    public getReservedSlots(): number {
        return this.config.reservedSlots ?? 0;
    }

    public getBots(): Bot[] {
        return this.bots;
    }
}

export default Server;
