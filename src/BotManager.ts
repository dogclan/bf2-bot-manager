import {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    Client,
    Events,
    GatewayIntentBits,
    Interaction
} from 'discord.js';
import fs from 'fs';
import yaml from 'js-yaml';
import { Schema, ValidationError, Validator } from 'jsonschema';
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
import { copyAsync, isDummyDiscordToken, mkdirAsync, readFileAsync, shouldQueryDirectly } from './utility';
import RedisCache from './query/RedisCache';
import Constants from './constants';
import { BflistQueryClient, GamedigQueryClient } from './query/QueryClient';

type BotManagerTasks = {
    botMaintenance: Task
    slotMaintenance: Task
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
        process.on('SIGINT', async () => {
            await this.shutdown();
            process.exit();
        });

        process.on('SIGTERM', async () => {
            await this.shutdown();
            process.exit();
        });

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
            slotMaintenance: {
                running: false,
                schedule: cron.schedule('10,30,50 * * * * *', async () => {
                    if (this.tasks.slotMaintenance.running) {
                        this.logger.warn('Slot maintenance is already running, skipping');
                    }
                    this.tasks.slotMaintenance.running = true;

                    this.logger.debug('Running bot team balance check');
                    try {
                        await Promise.allSettled(this.servers.map((s: Server) => s.ensureTeamBalance()));
                    }
                    catch (e: any) {
                        this.logger.error('Encountered an error during bot team balance check', e.message);
                    }

                    this.logger.debug('Running free slot check');
                    try {
                        await Promise.allSettled(this.servers.map((s: Server) => s.ensureReservedSlots()));
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

        this.client = new Client({ intents: [GatewayIntentBits.Guilds] });

        this.commands = [status, fill, clear, setSlots];

        this.client.once('ready', async () => {
            this.client.user?.presence.set({ status: 'online' });

            this.logger.info('Client is ready, registering commands');
            await this.client.application!.commands.set(this.commands);

            this.logger.info('Initialization complete, listening for commands');
        });

        this.client.on(Events.InteractionCreate, async (interaction: Interaction) => {
            if (interaction.isChatInputCommand()) {
                try {
                    await this.handleChatInputCommand(interaction);
                }
                catch (e: any) {
                    this.logger.error('Failed to chat input command interaction', e.message);
                }
            }
            else if (interaction.isAutocomplete()) {
                try {
                    await this.handleAutocomplete(interaction);
                }
                catch (e: any) {
                    this.logger.error('Failed to handle autocomplete interaction', e.message);
                }
            }
        });

        if (isDummyDiscordToken(this.token)) {
            this.logger.warn('Configured Discord token is a dummy token, skipping Discord login');
            return;
        }

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

        try {
            await this.initializeResources();
        }
        catch (e: any) {
            this.logger.fatal('Failed to initialize resources');
            process.exit(1);
        }

        await this.initializeServers(serverBotConfigs);

        // Run ensureReservedSlots once to make sure we don't initially fill the server up beyond the limit
        await Promise.allSettled(this.servers.map((s: Server) => s.ensureReservedSlots(true)));

        await Promise.allSettled(this.servers.map((s: Server) => s.launchBots()));

        // Start tasks
        this.tasks.botMaintenance.schedule.start();
        this.tasks.slotMaintenance.schedule.start();

        this.botLaunchComplete = true;
    }

    private async initializeResources(): Promise<void> {
        if (!Config.MOUNTED_RESOURCES) {
            // No point in copying resources that are available locally
            return;
        }

        // Ensure local resource folder exists
        const localResourceDir = path.join(Config.ROOT_DIR, 'resources-local');
        if (!fs.existsSync(localResourceDir)) {
            await mkdirAsync(localResourceDir, { recursive: true });
        }

        // Copy resources from mounted folder
        for (const binaryFilename of Constants.RESOURCE_BINARIES) {
            const binaryTargetPath = path.join(localResourceDir, binaryFilename);
            const binarySourcePath = path.join(Config.RESOURCE_DIR, binaryFilename);
            await copyAsync(binarySourcePath, binaryTargetPath);
        }
    }

    private async initializeServers(serverBotConfigs: ServerBotConfig[]): Promise<void> {
        // Set up cached client for bots to use when checking their onserver status
        const cache = new RedisCache(Config.REDIS_URL, Config.REDIS_KEY_PREFIX);
        await cache.connect();

        const httpClient = new BflistQueryClient(cache);
        const gamedigClient = new GamedigQueryClient(cache);

        for (const serverBotConfig of serverBotConfigs) {
            const { bots: baseConfigs, mod: mod, ...serverConfig } = serverBotConfig;
            const queryClient = shouldQueryDirectly(serverConfig.address, serverConfig.queryDirectly) ?
                gamedigClient :
                httpClient;

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

                const bot = new Bot(queryClient, config);
                bots.push(bot);
            }

            const server = new Server(queryClient, serverConfig, bots);
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

    public async shutdown(): Promise<void> {
        this.tasks.botMaintenance.schedule.stop();
        this.tasks.slotMaintenance.schedule.stop();

        await Promise.all(
            this.servers.map((s) => s.shutdown())
        );
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

    private async handleChatInputCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        const command = this.commands.find(c => c.name === interaction.commandName);

        if (!command) {
            this.logger.error('Received chat input command interaction with unknown command name', interaction.commandName);
            return;
        }

        await command.execute(interaction, this);
    }

    private async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
        const command = this.commands.find(c => c.name === interaction.commandName);

        if (!command) {
            this.logger.error('Received autocomplete interaction with unknown command name', interaction.commandName);
            return;
        }
        else if (!command.autocomplete) {
            this.logger.error('Received autocomplete interaction for command without autocomplete handler', interaction.commandName);
            return;
        }

        await command.autocomplete(interaction, this);
    }
}

export default BotManager;
