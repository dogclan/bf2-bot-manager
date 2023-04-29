import Bot from '../bot/Bot';
import { ServerConfig, ServerSlotStatus, ServerStatus } from './typing';
import { getTeamSizes, sleep } from '../utility';
import { Logger } from 'tslog';
import logger from '../logger';
import moment from 'moment';
import Config from '../config';
import { PlayerInfo, QueryClient, ServerInfo } from '../query/typing';
import { Task } from '../typing';
import cron from 'node-cron';

type MaintenanceTasks = {
    botMaintenance: Task
    slotMaintenance: Task
}

class Server {
    private queryClient: QueryClient;
    private config: ServerConfig;
    private bots: Bot[];

    private logger: Logger;
    private status: ServerStatus;

    private tasks: MaintenanceTasks;

    constructor(queryClient: QueryClient, config: ServerConfig, bots: Bot[]) {
        this.queryClient = queryClient;
        this.config = config;
        this.bots = bots;

        this.logger = logger.getChildLogger({ name: 'ServerLogger', prefix: [this.config.name] });
        this.status = {};

        this.tasks = {
            botMaintenance: {
                running: false,
                schedule: cron.schedule('*/2 * * * *', async () => {
                    if (this.tasks.botMaintenance.running) {
                        this.logger.warn('Bot maintenance is already running, skipping');
                        return;
                    }

                    this.logger.debug('Running bot maintenance');
                    this.tasks.botMaintenance.running = true;
                    try {
                        await this.maintainBots();
                        this.logger.debug('Bot maintenance complete');
                    }
                    catch (e: any) {
                        this.logger.error('Encountered an error during bot maintenance', e.message);
                    }
                    finally {
                        this.tasks.botMaintenance.running = false;
                    }
                }, {
                    scheduled: false
                })
            },
            slotMaintenance: {
                running: false,
                schedule: cron.schedule('10,30,50 * * * * *', async () => {
                    if (this.tasks.slotMaintenance.running) {
                        this.logger.warn('Slot maintenance is already running, skipping');
                    }
                    this.tasks.slotMaintenance.running = true;

                    this.logger.debug('Running bot team balance check');
                    try {
                        await this.ensureTeamBalance();
                    }
                    catch (e: any) {
                        this.logger.error('Encountered an error during bot team balance check', e.message);
                    }

                    this.logger.debug('Running free slot check');
                    try {
                        await this.ensureReservedSlots();
                    }
                    catch (e: any) {
                        this.logger.debug('Encountered an error during free slot check', e.message);
                    }
                    finally {
                        this.tasks.slotMaintenance.running = false;
                    }
                }, {
                    scheduled: false
                })
            }
        };
    }

    public async launchBots(): Promise<void> {
        this.logger.info('launching bots');

        // Get current mod from server status
        let currentMod: string | undefined;
        try {
            this.logger.debug('Fetching current mod');
            currentMod = await this.getCurrentMod();
        }
        catch (e: any) {
            this.logger.error('Failed to determine current mod, continuing with mod as per launch config', e.message);
        }

        // Only launch as many bots as we have slots right now
        // (currentSlots may have already been set by ensureReservedSlots)
        const slots = this.getCurrentSlots();
        const bots = this.bots.slice(0, slots);
        for (const bot of bots) {
            // Stop launching once shutdown started
            if (this.status.shutdownInProgess) {
                this.logger.info('shutdown in progress, aborting bot launch');
                return;
            }

            const config = bot.getConfig();

            // This will only update the mod for bots we are currently launching
            // (remaining bots will be updated via maintenance)
            if (currentMod && config.server.mod != currentMod) {
                this.logger.info('bot is not using the current mod, updating config', config.basename, config.server.mod, currentMod);
                await bot.updateMod(currentMod);
            }

            this.logger.debug('launching bot process for', config.basename);
            bot.setEnabled(true);
            bot.launch();

            // Give bot a few seconds before starting next one
            await sleep(Config.BOT_LAUNCH_INTERVAL * 1000);
        }

        this.logger.info('launch complete, starting maintenance tasks');
        this.tasks.botMaintenance.schedule.start();
        this.tasks.slotMaintenance.schedule.start();
    }

    public async maintainBots(): Promise<void> {
        // Fetch outside the loop to ensure the same value is used for all bots
        const currentMod = await this.getCurrentMod();
        for (const bot of this.bots) {
            // Stop running maintenance once shutdown started
            if (this.status.shutdownInProgess) {
                this.logger.info('shutdown in progress, aborting bot maintenance');
                return;
            }

            const slots = this.getCurrentSlots();
            const config = bot.getConfig();
            const status = bot.getStatus();

            // Update mod if required
            if (currentMod && config.server.mod != currentMod) {
                this.logger.info('bot is not using the current mod, updating config', config.basename, config.server.mod, currentMod);
                await bot.updateMod(currentMod);

                if (bot.isLaunched()) {
                    this.logger.info('updated config for running bot, killing until next iteration');
                    bot.stop();
                    await bot.waitForStop();

                    bot.kill();

                    // Running the remaining maintenance steps makes no sense, so skip them
                    continue;
                }
            }

            if (moment().diff(status.onServerLastCheckedAt, 'seconds') > Config.BOT_STATUS_UPDATE_TIMEOUT) {
                // We cannot early return here, since bots any enabled bot would remain enabled indefinitely
                // So, rather than make no decision at all how to proceed with the bot, make the decision based on outdated data
                this.logger.warn('bot has not updated it\'s status recently', config.basename);
            }

            const botsOnServer = this.bots.filter((b: Bot) => b.getStatus().onServer && b.getStatus().enabled);
            const filledSlots = botsOnServer.length;
            const population = this.bots.filter((b: Bot) => b.getStatus().enabled).length;
            const maxPopulation = slots * Config.OVERPOPULATE_FACTOR;
            const teamsSizes = [
                botsOnServer.filter((b: Bot) => b.getStatus().team == 1).length,
                botsOnServer.filter((b: Bot) => b.getStatus().team == 2).length
            ];
            // Use actual team size if bot is on server, else use size of smaller team
            const ownTeamSize = status.team ? teamsSizes[status.team - 1] : Math.min(...teamsSizes);

            if (!bot.isEnabled() && filledSlots < slots && population < maxPopulation) {
                // Enable if desired number of slots is currently not filled on the server and overpopulate max has not been reached yet
                this.logger.info('has slots to fill, enabling', config.basename, slots, filledSlots, maxPopulation, population);
                bot.setEnabled(true);
            }
            else if (bot.isEnabled() && status.onServer && ownTeamSize > slots / 2 && filledSlots > slots) {
                // Disable if on server, own team size is greater than half the current slots and desired number of slots has been exceeded
                this.logger.info('has too many slots filled, disabling', config.basename, slots, filledSlots, maxPopulation, population);
                bot.setEnabled(false);
            }
            else if (bot.isEnabled() && !status.onServer && population > maxPopulation) {
                // Disable if not on server and overpopulate max has been exceeded
                this.logger.info('has too many bots running, disabling', config.basename, slots, filledSlots, maxPopulation, population);
                bot.setEnabled(false);
            }
            else if (bot.isEnabled() && !status.onServer && filledSlots == slots) {
                // Disable if bot is not on server but desired number of slots has been filled
                this.logger.info('is filled up, disabling', config.basename, slots, filledSlots, maxPopulation, population);
                bot.setEnabled(false);
            }

            if (status.enabled && !status.processRunning) {
                this.logger.info('bot process not running, (re-)launching', config.basename);
                await bot.relaunch();

                // Give bot a few seconds before starting next one
                await sleep(Config.BOT_LAUNCH_INTERVAL * 1000);
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
                await bot.rotateIdentifiers();

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
        const currentSlots = this.getCurrentSlots();
        const slotStatus = await this.getSlotStatus();
        // Ignore any negative results, as the worst case should be 0 available slots
        const availableSlotsRaw = Math.max(
            0,
            slotStatus.max - (slotStatus.filledTotal - slotStatus.filledByBots) - this.config.reservedSlots
        );
        // Keep number of slots even
        const availableSlots = availableSlotsRaw - availableSlotsRaw % 2;

        /**
         * Reserved slot manager somewhat "collides" with autobalance. We need to avoid increasing slots while
         * autobalance is in progress. Else we might re-fill an unbalanced team due to slots freeing up. However, we
         * may need to free up more slots than autobalance freed up to make sure the reserved slots stay available.
         */
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
                this.logger.debug('has too many slots configured, waiting for bot slots to time out', this.status.currentSlotsTakenSince.toISOString(), Config.BOT_SLOT_TIMEOUT);
            }
            else {
                // Players just joined => start timeout before freeing up slots
                this.logger.info('has slots freshly taken, starting bot slot timeout');
                this.status.currentSlotsTakenSince = moment();
            }
        }
        else if (availableSlots > currentSlots && currentSlots < this.config.slots && !this.status.autobalanceInProgress) {
            // Slots are available and autobalance is not in progress, figure out whether to increase current slots now or later
            if (moment().diff(this.status.availableSlotsFreeSince, 'seconds') > Config.RESERVED_SLOT_TIMEOUT) {
                // Slots are available and timeout has either passed or is not relevant (since timestamp not set)
                this.logger.info('has more slots available than are currently configured, increasing current slots', availableSlots, currentSlots, slotStatus.filledByBots);
                // Increase current slots to either the number for available slots of the max number of bots
                this.setCurrentSlots(Math.min(availableSlots, this.config.slots));
                // Reset slot timeout timer
                delete this.status.availableSlotsFreeSince;
            }
            else if (this.status.availableSlotsFreeSince) {
                // Slots are available but timeout is set and has not passed => just wait
                this.logger.debug('has slots available, waiting for reserved slot to time out', this.status.availableSlotsFreeSince.toISOString(), Config.RESERVED_SLOT_TIMEOUT);
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
        else if (availableSlots == currentSlots && this.status.availableSlotsFreeSince && !this.status.autobalanceInProgress) {
            // Slots were filled by players while we waited for timeout to pass => unset timer
            this.logger.info('had available slots taken by player(s) during timeout');
            delete this.status.availableSlotsFreeSince;
        }
        else if (availableSlots == currentSlots && this.status.availableSlotsFreeSince) {
            // Slots were filled during autobalance => unset timer
            this.logger.info('had available slots taken by player(s) during autobalance');
        }
    }

    public async ensureTeamBalance(): Promise<void> {
        // Explicitly check for false here, since default (undefined) should mean autobalance is enabled
        if (this.config.autobalance == false) {
            this.logger.debug('autobalance is disabled, skipping');
            return;
        }

        const serverInfo = await this.fetchServerStatus();
        const botsOnServer = this.getBotsOnServer(serverInfo);
        const playersOnServer = this.getPlayersOnServer(serverInfo);

        const playerTeamsSizes = getTeamSizes(playersOnServer);
        const botTeamsSizes = getTeamSizes(botsOnServer);

        // TODO Player teams don't need to be even. Can be even or have more players on the index 0 team (since players will always join index 1 first)
        if (botsOnServer.length == this.getCurrentSlots() && botTeamsSizes.delta > 0) {
            this.logger.info('bots are split unevenly across teams, reducing bot slots to balance', botsOnServer.length, botTeamsSizes.bigger, botTeamsSizes.smaller);
            this.status.autobalanceInProgress = true;
            this.status.autobalanceStartedAt = moment();
            this.setCurrentSlots(Math.min(botTeamsSizes.smaller * 2, this.config.slots));
        }
        else if (botsOnServer.length != this.getCurrentSlots() && botTeamsSizes.delta > 0) {
            this.logger.debug('bots are split unevenly across teams, waiting for slots to be filled/freed', botsOnServer.length, botTeamsSizes.bigger, botTeamsSizes.smaller);
        }
        else if (botsOnServer.length == this.getCurrentSlots() && botTeamsSizes.delta == 0 && playerTeamsSizes.delta == 0 && this.status.autobalanceInProgress) {
            this.logger.info('autobalance complete, teams are even again', botsOnServer.length, botTeamsSizes.bigger, botTeamsSizes.smaller, playerTeamsSizes.bigger, playerTeamsSizes.smaller);
            this.status.autobalanceInProgress = false;
            delete this.status.autobalanceStartedAt;
        }
        else if (botsOnServer.length == this.getCurrentSlots() && botTeamsSizes.delta == 0 &&
            moment().diff(this.status.autobalanceStartedAt, 'seconds') > Config.AUTOBALANCE_MAX_DURATION && this.status.autobalanceInProgress)
        {
            this.logger.info('autobalance max duration reached, aborting autobalance attempt despite player teams being uneven',
                botsOnServer.length, botTeamsSizes.bigger, botTeamsSizes.smaller, playerTeamsSizes.bigger, playerTeamsSizes.smaller);
            this.status.autobalanceInProgress = false;
            delete this.status.autobalanceStartedAt;
        }
        else {
            this.logger.debug('bots are split evenly across teams', botsOnServer.length, botTeamsSizes.bigger, botTeamsSizes.smaller);
        }
    }

    private async getSlotStatus(): Promise<ServerSlotStatus> {
        const serverInfo = await this.fetchServerStatus();
        // Check which bots are on server based on the data here rather than based on the bots own status tracking
        // in order to avoid mismatches in filled slot values based on slightly apart status update requests
        const botsOnServer = this.getBotsOnServer(serverInfo);

        return {
            filledTotal: serverInfo.numPlayers,
            filledByBots: botsOnServer.length,
            max: serverInfo.maxPlayers
        };
    }

    private async getCurrentMod(): Promise<string | undefined> {
        const { gameVariant } = await this.fetchServerStatus();
        if (!gameVariant || gameVariant.trim().length == 0) {
            return;
        }
        return `mods/${gameVariant}`;
    }

    private async fetchServerStatus(): Promise<ServerInfo> {
        return this.queryClient.getServerInfo(
            this.config.address,
            this.config.port,
            this.config.queryPort
        );
    }

    private getBotsOnServer(serverInfo: ServerInfo): PlayerInfo[] {
        const botNicknames = this.bots.map((b: Bot) => b.getConfig().nickname);
        return serverInfo.players.filter((p: PlayerInfo) => botNicknames.includes(p.name));
    }

    private getPlayersOnServer(serverInfo: ServerInfo): PlayerInfo[] {
        const botNicknames = this.bots.map((b: Bot) => b.getConfig().nickname);
        return serverInfo.players.filter((p: PlayerInfo) => !botNicknames.includes(p.name));
    }

    public getConfig(): ServerConfig {
        return this.config;
    }

    public getStatus(): ServerStatus {
        return this.status;
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

    public async shutdown(): Promise<void> {
        this.logger.info('shutting down');
        this.status.shutdownInProgess = true;

        this.tasks.botMaintenance.schedule.stop();
        this.tasks.slotMaintenance.schedule.stop();

        await Promise.all(
            this.bots.map((b) => b.shutdown())
        );
    }
}

export default Server;
