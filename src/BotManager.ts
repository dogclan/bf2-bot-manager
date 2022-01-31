import { Client, CommandInteraction, Intents, Interaction } from 'discord.js';
import fs from 'fs';
import yaml from 'js-yaml';
import { Schema, ValidationError, Validator } from 'jsonschema';
import moment from 'moment';
import cron from 'node-cron';
import path from 'path';
import { Logger } from 'tslog';
import Bot from './bot/Bot';
import BotConfig from './bot/BotConfig';
import { clear } from './commands/clear';
import { fill } from './commands/fill';
import { setSlots } from './commands/setSlots';
import { status } from './commands/status';
import { Command } from './commands/typing';
import Config from './config';
import logger from './logger';
import Server from './server/Server';
import { ServerBotConfig, Task } from './typing';
import { readFileAsync, sleep } from './utility';

type BotManagerTasks = {
    maintenance: Task
}

class BotManager {
    private token: string;

    private client: Client;
    private logger: Logger;
    private configSchema: Schema;

    private servers: Server[];
    private botLaunchComplete: boolean;

    private commands: Command[];
    private tasks: BotManagerTasks;

    constructor(token: string) {
        this.token = token;

        this.logger = logger.getChildLogger({ name: 'BotManagerLogger' });
        this.configSchema = this.loadConfigSchema();

        this.servers = [];
        this.botLaunchComplete = false;

        // Kill child process when parent exists in order to not leave zombie processes behind
        process.on('exit', async () => {
            await this.shutdownBots();
        });

        process.on('SIGINT', async () => {
            await this.shutdownBots();
            process.exit();
        });

        process.on('SIGTERM', async () => {
            await this.shutdownBots();
            process.exit();
        });

        this.tasks = {
            maintenance: {
                running: false,
                schedule: cron.schedule('*/2 * * * *', async () => {
                    if (this.tasks.maintenance.running) {
                        this.logger.warn('Bot maintenance is alreay running, skipping');
                        return;
                    }

                    this.logger.debug('Running bot maintenance');
                    this.tasks.maintenance.running = true;
                    try {
                        await this.maintainBots();
                        this.logger.debug('Bot maintenance complete');
                    }
                    catch (e: any) {
                        this.logger.error('Encountered an error during bot maintenance', e.message);
                    }
                    finally {
                        this.tasks.maintenance.running = false;
                    }
                }, {
                    scheduled: false
                })
            }
        };

        this.client = new Client({ intents: [Intents.FLAGS.GUILDS] });

        this.commands = [status, fill, clear, setSlots];

        this.client.once('ready', async () => {
            this.client.user?.presence.set({ status: 'online' });

            this.logger.info('Client is ready, registering commands');
            const commands = await this.client.application!.commands.set(this.commands);

            for (const command of commands.values()) {
                for (const permissionSet of Config.COMMAND_PERMISSIONS) {
                    await command.permissions.set({ guild: permissionSet.guild, permissions: permissionSet.permissions });
                }
            }

            this.logger.info('Initialization complete, listening for commands');
        });

        this.client.on('interactionCreate', async (interaction: Interaction) => {
            if (interaction.isCommand()) {
                try {
                    await this.handleSlashCommand(interaction);
                }
                catch (e: any) {
                    this.logger.error('Failed to handle slash command', e.message);
                }
            }
        });

        logger.info('Logging into Discord using token');
        this.client.login(this.token);
    }

    public async launchBots(): Promise<void> {
        let serverBotConfigs: ServerBotConfig[];
        try {
            serverBotConfigs = await this.loadServerBotConfigs();
        }
        catch (e: any) {
            if (Array.isArray(e.errors) && e.schema) {
                // Log all validation errors if schema validation failed
                this.logger.fatal('Given config does not adhere to schema', e.errors.map((e: ValidationError) => `${e.property}: ${e.message}`));
            }
            else {
                this.logger.fatal('Failed to read/parse config file', e.message);
            }

            process.exit(1);
        }

        await this.initializeBotConfigs(serverBotConfigs);

        for (const server of this.servers) {
            this.logger.info('Launching bots for', server.getConfig().name);
            const bots = server.getBots().filter((bot: Bot) => bot.isEnabled());
            for (const bot of bots) {
                const config = bot.getConfig();
                try {
                    this.logger.debug('Launching bot process for slot', config.slot, config.nickname);
                    bot.launch();
    
                    // Give bot a few seconds before starting next one
                    await sleep(45000);
                    await bot.updateStatus();
                }
                catch (e: any) {
                    this.logger.error('Failed to launch bot process for slot', config.slot, config.nickname, e.message);
                }
            }
        }

        // Start maintenance task
        this.tasks.maintenance.schedule.start();

        this.botLaunchComplete = true;
    }

    private async initializeBotConfigs(serverBotConfigs: ServerBotConfig[]): Promise<void> {
        for (const serverBotConfig of serverBotConfigs) {
            const { bots: baseConfigs, slots: slots, ...botServer } = serverBotConfig;         

            this.logger.info('Preparing bots for', botServer.name);
            const bots: Bot[] = [];
            for (const [slot, baseConfig] of baseConfigs.entries()) {
                const config = new BotConfig(
                    baseConfig.basename,
                    baseConfig.password,
                    slot,
                    botServer
                );

                try {
                    this.logger.debug('Setting up running folder for slot', config.slot, config.nickname);
                    await config.setup();
                }
                catch (e: any) {
                    this.logger.error('Failed to set up running folder for slot', config.slot, config.nickname, e.message);
                }

                // Enable as many bots as the server has slots
                const enabled = slot < slots;
                bots.push(new Bot(config, enabled));
            }

            this.servers.push(new Server({ name: botServer.name, slots }, bots));
        }
    }

    private loadConfigSchema(): Schema {
        const schemaPath = path.join(Config.ROOT_DIR, 'config.schema.json');
        let schema: Schema;
        try {
            const unparsed = fs.readFileSync(schemaPath, { encoding: 'utf8' });
            schema = JSON.parse(unparsed);
        }
        catch (e: any) {
            this.logger.fatal('Failed to read/parse config schema', schemaPath, e.message);
            process.exit(1);
        }

        return schema;
    }

    private async loadServerBotConfigs(): Promise<ServerBotConfig[]> {
        const configPath = path.join(Config.ROOT_DIR, 'config.yaml');
        const unparsed = await readFileAsync(configPath, { encoding: 'utf8' });
        const configs = yaml.load(unparsed) as ServerBotConfig[];

        const validator = new Validator();
        validator.validate(configs, this.configSchema, { throwAll: true });

        return configs;
    }

    private async maintainBots(): Promise<void> {
        for (const server of this.servers) {
            const serverConfig = server.getConfig();
            const slots = serverConfig.currentSlots != undefined ? serverConfig.currentSlots : serverConfig.slots;
            const bots = server.getBots();
            for (const bot of bots) {
                const config = bot.getConfig();
                const status = bot.getStatus();
    
                if (moment().diff(status.onServerLastCheckedAt, 'seconds') > Config.BOT_STATUS_UPDATE_TIMEOUT) {
                    continue;
                }

                const filledSlots = bots.filter((b: Bot) => b.getStatus().onServer && b.getStatus().enabled).length;
                const enabledBots = bots.filter((b: Bot) => b.getStatus().enabled).length;
                const maxPopulation = slots * Config.OVERPOPULATE_FACTOR;
                if (!bot.isEnabled() && filledSlots < slots && enabledBots < maxPopulation) {
                    // Enable if desired number of slots is currently not filled on the server and overpulate max has not been reached yet
                    this.logger.info(serverConfig.name, 'has slots to fill, enabling', config.nickname, slots, filledSlots, maxPopulation, enabledBots);
                    bot.setEnabled(true);
                }
                else if (bot.isEnabled() && (filledSlots > slots || enabledBots > maxPopulation)) {
                    // Disable if desired number of slots or overpopulate max has been exceeded
                    this.logger.info(serverConfig.name, 'has to many slots filled/bots running, disabling', config.nickname, slots, filledSlots, maxPopulation, enabledBots);
                    bot.setEnabled(false);
                }
                else if (bot.isEnabled() && !status.onServer && filledSlots == slots) {
                    // Disable if bot is not on server but desired number of slots has been filled
                    this.logger.info(serverConfig.name, 'is filled up, disabling', config.nickname, slots, filledSlots, maxPopulation, enabledBots);
                    bot.setEnabled(false);
                }

                if (status.enabled && !status.processRunning) {
                    this.logger.info('Bot process not running, (re-)launching', config.server.name, config.slot, config.nickname);
                    await bot.relaunch();
    
                    // Give bot a few seconds before starting next one
                    await sleep(45000);
                }
                else if (!status.enabled && status.processRunning) {
                    this.logger.info('Bot is disabled but process is running, stopping', config.server.name, config.slot, config.nickname);
                    bot.stop();
                    await bot.waitForStop();
    
                    bot.kill();
                }
                else if (status.enabled && !status.onServer && !status.botRunning) {
                    this.logger.info('Bot not on server, will check again', config.server.name, config.slot, config.nickname);
                }
                else if (status.enabled && !status.onServer && status.botRunning
                    && moment().diff(status.processStartedAt, 'seconds') > Config.BOT_JOIN_TIMEOUT
                    && (!status.lastSeenOnServerAt || moment().diff(status.lastSeenOnServerAt, 'seconds') > Config.BOT_ON_SERVER_TIMEOUT)
                ) {
                    this.logger.info('Bot not on server, killing until next iteration', config.server.name, config.slot, config.nickname);
    
                    // Update nickname to avoid server "shadow banning" account by name
                    bot.rotateNickname();
    
                    bot.stop();
                    await bot.waitForStop();
    
                    bot.kill();
                }
                else if (status.enabled && status.onServer) {
                    this.logger.debug('Bot on server', config.server.name, config.slot, config.nickname);
                }
            }
        }
    }

    public async shutdownBots(): Promise<void> {
        for (const server of this.servers) {
            for (const bot of server.getBots()) {
                bot.stop();
                await bot.waitForStop();
                bot.kill();
            }
        }
    }

    public getServers(): Server[] {
        return this.servers;
    }

    public getBots(): Bot[] {
        return this.servers.flatMap((server: Server) => server.getBots());
    }

    public isBotLaunchComplete(): boolean {
        return this.botLaunchComplete;
    }

    private async handleSlashCommand(interaction: CommandInteraction): Promise<void> {
        const slashCommand = this.commands.find(c => c.name === interaction.commandName);

        if (!slashCommand) {
            interaction.followUp({ content: 'An error has occurred' });
            return;
        }

        await slashCommand.execute(interaction, this);
    }
}

export default BotManager;
