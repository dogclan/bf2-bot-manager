import {Client, CommandInteraction, Intents, Interaction} from 'discord.js';
import fs from 'fs';
import yaml from 'js-yaml';
import {Schema, ValidationError, Validator} from 'jsonschema';
import cron from 'node-cron';
import path from 'path';
import {Logger} from 'tslog';
import Bot from './bot/Bot';
import BotConfig from './bot/BotConfig';
import {clear} from './commands/clear';
import {fill} from './commands/fill';
import {setSlots} from './commands/setSlots';
import {status} from './commands/status';
import {Command} from './commands/typing';
import Config from './config';
import logger from './logger';
import Server from './server/Server';
import {ServerBotConfig, Task} from './typing';
import {readFileAsync} from './utility';
import axios from 'axios';
import RedisCache from './http/RedisCache';
import {CachedHttpClient} from './http/CachedHttpClient';

type BotManagerTasks = {
    botMaintenance: Task
    freeSlotCheck: Task
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
            botMaintenance: {
                running: false,
                schedule: cron.schedule('*/2 * * * *', async () => {
                    if (this.tasks.botMaintenance.running) {
                        this.logger.warn('Bot maintenance is alreay running, skipping');
                        return;
                    }

                    this.logger.debug('Running bot maintenance');
                    this.tasks.botMaintenance.running = true;
                    try {
                        await Promise.allSettled(this.servers.map((s: Server) => s.maintainBots()));
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
            freeSlotCheck: {
                running: false,
                schedule: cron.schedule('10,30,50 * * * * *', async () => {
                    if (this.tasks.freeSlotCheck.running) {
                        this.logger.warn('Free slot check is already running, skipping');
                    }

                    this.logger.debug('Running free slot check');
                    this.tasks.freeSlotCheck.running = true;
                    try {
                        await Promise.allSettled(this.servers.map((s: Server) => s.ensureReservedSlots()));
                    }
                    catch (e: any) {
                        this.logger.debug('Encountered an error during free slot check', e.message);
                    }
                    finally {
                        this.tasks.freeSlotCheck.running = false;
                    }
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

        await this.initializeServers(serverBotConfigs);

        // Run ensureReservedSlots once to make sure we don't initially fill the server up beyond the limit
        await Promise.allSettled(this.servers.map((s: Server) => s.ensureReservedSlots(true)));

        await Promise.allSettled(this.servers.map((s: Server) => s.launchBots()));

        // Start tasks
        this.tasks.botMaintenance.schedule.start();
        this.tasks.freeSlotCheck.schedule.start();

        this.botLaunchComplete = true;
    }

    private async initializeServers(serverBotConfigs: ServerBotConfig[]): Promise<void> {
        // Set up cached http client for bots to use when checking their onserver status
        const aclient = axios.create({
            timeout: Config.API_REQUEST_TIMEOUT
        });
        const cache = new RedisCache(Config.REDIS_URL, Config.REDIS_KEY_PREFIX);
        await cache.connect();

        const httpClient = new CachedHttpClient(aclient, cache);

        for (const serverBotConfig of serverBotConfigs) {
            const { bots: baseConfigs, mod: mod, ...serverConfig } = serverBotConfig;

            this.logger.info('Preparing bots for', serverConfig.name);
            const bots: Bot[] = [];
            for (const [slot, baseConfig] of baseConfigs.entries()) {
                const config = new BotConfig(
                    baseConfig.basename,
                    baseConfig.password,
                    slot,
                    {
                        ...serverConfig,
                        mod: mod,
                    }
                );

                try {
                    this.logger.debug('Setting up running folder for slot', config.slot, config.nickname);
                    await config.setup();
                }
                catch (e: any) {
                    this.logger.error('Failed to set up running folder for slot', config.slot, config.nickname, e.message);
                }

                const bot = new Bot(httpClient, config);
                bots.push(bot);
            }

            const server = new Server(httpClient, serverConfig, bots);
            this.servers.push(server);
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
