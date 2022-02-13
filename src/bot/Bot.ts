import {ChildProcessWithoutNullStreams, spawn} from 'child_process';
import moment from 'moment';
import cron from 'node-cron';
import {Logger} from 'tslog';
import logger from '../logger';
import {Task} from '../typing';
import {randomNumber, sleep} from '../utility';
import BotConfig from './BotConfig';
import {BotStatus} from './typing';
import {CachedHttpClient} from '../http/CachedHttpClient';
import Config from '../config';

type BotExeCommand = 'start' | 'stop'
type BotTasks = {
    statusUpdate: Task
}

class Bot {
    private config: BotConfig;
    private httpClient: CachedHttpClient;

    private logger: Logger;
    private process?: ChildProcessWithoutNullStreams;

    private status: BotStatus;

    private tasks: BotTasks;

    constructor(config: BotConfig, httpClient: CachedHttpClient, enabled: boolean) {
        this.config = config;
        this.httpClient = httpClient;

        this.logger = logger.getChildLogger({ name: 'BotLogger' });

        this.status = {
            enabled: enabled,
            processRunning: false,
            botRunning: false,
            cliReady: false
        };

        this.tasks = {
            statusUpdate: {
                schedule: cron.schedule('10,30,50 * * * * *', async () => {
                    // Wait a random number of milliseconds to improve cache hit rate
                    // (requests going out one after the other rather than all at once)
                    await sleep(randomNumber(0, 2000));

                    this.logger.debug(this.config.nickname, 'updating on server status');
                    try {
                        await this.updateStatus();
                        this.logger.debug(this.config.nickname, 'on server status update complete');
                    }
                    catch (e: any) {
                        this.logger.error(this.config.nickname, 'encountered an error during bot on server status update', e.message);
                    }
                }, {
                    scheduled: false
                })
            }
        };
    }

    public launch(): void {
        if (!this.status.enabled) {
            this.logger.warn(this.config.nickname, 'currently disabled, will not launch');
            return;
        }

        this.process = spawn('wine', ['bots.exe'], {
            cwd: this.config.cwd,
            detached: false,
            windowsHide: true
        });

        this.process.on('spawn', () => {
            this.logger.debug(this.config.nickname, 'process launched successfully');
            this.status.processRunning = true;
            this.status.processStartedAt = moment();
        });

        this.process.on('exit', (code, signal) => {
            this.logger.debug(this.config.nickname, `exited with code ${code} and signal ${signal}`);
            this.status.processRunning = false;
            this.status.processStartedAt = undefined;
        });

        this.process.stdout.on('data', (data: Buffer) => {
            const lines = String(data).trim().split('\n');

            // Log each line individually
            for (const line of lines) {
                if (!line.includes('> That command doesn\'t exist')) {
                    this.logger.debug(this.config.nickname, `stdout: ${line}`);
                }
            }

            if (!this.status.cliReady && String(data).endsWith('> ')) {
                this.logger.debug(this.config.nickname, 'cli is ready');
                this.status.cliReady = true;
            }

            if (!this.status.botRunning && String(data).includes('started successfully')) {
                this.logger.info(this.config.nickname, 'started successfully');
                this.status.botRunning = true;
                this.status.botStartedAt = moment();
                this.tasks.statusUpdate.schedule.start();
            }
            else if (this.status.botRunning && String(data).includes('stopped successfully')) {
                this.logger.info(this.config.nickname, 'stopped successfully');
                this.status.botRunning = false;
                this.status.botStartedAt = undefined;
            }
        });

        this.process.stderr.on('data', (data) => {
            this.logger.error(this.config.nickname, `stderr: ${data}`);
        });
    }

    public kill(): boolean {
        if (this.process && !this.process.killed && this.process.kill()) {
            this.status.cliReady = false;
            this.status.botRunning = false;
            this.status.botStartedAt = undefined;
            this.status.processRunning = false;
            this.status.processStartedAt = undefined;
            return true;
        }

        return false;
    }

    public async relaunch(): Promise<void> {
        this.kill();

        while (this.status.processRunning) {
            await sleep(1000);
        }

        this.launch();
    }

    public getConfig(): BotConfig {
        return this.config;
    }

    public rotateNickname(): void {
        this.config.rotateNickname();

        // TODO Relaunch if running
    }

    public isEnabled(): boolean {
        return this.status.enabled;
    }

    public setEnabled(enabled: boolean) : void {
        this.status.enabled = enabled;
    }

    public async updateStatus(): Promise<void> {
        try {
            const players = await this.httpClient.get(
                `https://api.bflist.io/bf2/v1/servers/${this.config.server.address}:${this.config.server.port}/players`,
                {
                    ttl: Config.STATUS_CACHE_TTL
                }
            );
            this.status.onServer = players.some((p: any) => p?.name == this.config.nickname);
            this.status.onServerLastCheckedAt = moment();

            if (this.status.onServer) {
                this.status.lastSeenOnServerAt = moment();
            }
        }
        catch (e: any) {
            this.logger.error(this.config.nickname, 'failed to determine whether bot is on server', e.message);
        }
    }

    public getStatus(): BotStatus {
        return this.status;
    }

    public isLaunched(): boolean {
        return this.status.processRunning;
    }

    public isBotRunning(): boolean {
        return this.status.botRunning;
    }

    public start(): boolean {
        return this.sendCommand('start');
    }

    public stop(): boolean {
        if (!this.status.botRunning) {
            return true;
        }

        return this.sendCommand('stop');
    }

    public async waitForStop(maxSleeps = 5): Promise<void> {
        let sleeps = 0;
        while (this.status.botRunning && sleeps++ < maxSleeps) {
            await sleep(1000);
        }

        if (sleeps >= maxSleeps) {
            this.logger.warn(this.config.nickname, 'failed to stop gracefully', maxSleeps);
        }
    }

    public async restart(): Promise<boolean> {
        const stopped = this.stop();

        if (!stopped) {
            return false;
        }

        await this.waitForStop();

        return this.start();
    }

    private sendCommand(cmd: BotExeCommand): boolean {
        if (this.process && this.status.cliReady) {
            this.logger.debug(this.config.nickname, 'sending command to process via stdin: ', cmd);
            this.logger.debug(this.config.nickname, 'cli will be busy');
            this.status.cliReady = false;
            return this.process.stdin.write(`${cmd}\n`);
        }
        else if (this.process && !this.status.cliReady) {
            this.logger.warn(this.config.nickname, 'cli is not ready, rejecting command', cmd);
            return false;
        }
        else {
            this.logger.warn(this.config.nickname, 'process is not running, rejecting command', cmd);
            return false;
        }
    }

}

export default Bot;
