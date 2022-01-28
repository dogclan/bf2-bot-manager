import { Client, CommandInteraction, Intents, Interaction } from 'discord.js';
import cron from 'node-cron';
import { Logger } from 'tslog';
import Bot from './bot/Bot';
import BotConfig from './bot/BotConfig';
import { status } from './commands/status';
import { Command } from './commands/typing';
import Config from './config';
import logger from './logger';
import { sleep } from './utility';

type Tasks = {
    monitoringTask: cron.ScheduledTask
}

class BotManager {
    private token: string;

    private client: Client;
    private logger: Logger;

    private bots: Bot[];
    private commands: Command[];
    private tasks: Tasks;

    constructor(token: string) {
        this.token = token;

        this.logger = logger.getChildLogger({ name: 'BotManagerLogger' });

        this.bots = [];

        this.tasks = {
            monitoringTask: cron.schedule('*/4 * * * *', async () => {
                this.logger.debug('Running bot maintenance');
                try {
                    await this.maintainBots();
                    this.logger.debug('Bot maintenance complete');
                }
                catch (e: any) {
                    this.logger.error('Encountered an error during bot maintenance', e.message);
                }
            }, {
                scheduled: false
            })
        };

        this.client = new Client({ intents: [Intents.FLAGS.GUILDS] });

        this.commands = [status];

        this.client.once('ready', () => {
            this.client.user?.presence.set({status: 'online'});

            this.logger.info('Client is ready, registering commands');
            this.client.application?.commands.set(this.commands);

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
        for (const serverWithBots of Config.SERVERS) {
            const {bots: bots, ...server} = serverWithBots;
            this.logger.info('Launching bots for', server.name);
            for (const [slot, baseConfig] of bots.entries()) {
                const config = new BotConfig(
                    baseConfig.basename,
                    baseConfig.password,
                    slot,
                    server
                );
                
                try {
                    this.logger.debug('Setting up running folder for slot', config.slot, config.nickname);
                    await config.setup();
                }
                catch (e: any) {
                    this.logger.error('Failed to set up running folder for slot', config.slot, config.nickname, e.message);
                }
                
                const bot = new Bot(config);
                this.bots.push(bot);

                try {
                    this.logger.debug('Launching bot process for slot', config.slot, config.nickname);
                    bot.launch();

                    // Give bot a few seconds before starting next one
                    await sleep(45000);
                }
                catch (e: any) {
                    this.logger.error('Failed to launch bot process for slot', config.slot, config.nickname, e.message);
                }
            }
        }

        // Start maintenance task
        this.tasks.monitoringTask.start();
    }

    private async maintainBots(): Promise<void> {
        for (const bot of this.bots) {
            const config = bot.getConfig();
            this.logger.debug('Checking whether bot is on server', config.server.name, config.slot, config.nickname);

            let onServer: boolean;
            try {
                onServer = await bot.isOnServer();
            }
            catch (e: any) {
                this.logger.error('Failed to determine whether bot is on server', config.server.name, config.slot, config.nickname, e.message);
                continue;
            }
            
            if (!bot.isLaunched()) {
                this.logger.info('Bot process not launched, relaunching', config.server.name, config.slot, config.nickname);
                await bot.relaunch();

                // Give bot a few seconds before starting next one
                await sleep(5000);
            }
            else if (!onServer && !bot.isBotRunning()) {
                this.logger.info('Bot not on server, will check again', config.server.name, config.slot, config.nickname);
            }
            else if (!onServer && bot.isBotRunning()) {
                this.logger.info('Bot not on server, killing until next iteration', config.server.name, config.slot, config.nickname);

                // Update nickname to avoid server "shadow banning" account by name
                bot.rotateNickname();

                bot.stop();
                bot.kill();
            }
            else {
                this.logger.debug('Bot on server', config.server.name, config.slot, config.nickname);
            }
        }
    }

    public getBots(): Bot[] {
        return this.bots;
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
