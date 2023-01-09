import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import moment from 'moment';
import cron from 'node-cron';
import { Logger } from 'tslog';
import logger from '../logger';
import { Task } from '../typing';
import { randomNumber, sleep } from '../utility';
import BotConfig from './BotConfig';
import { BotStatus } from './typing';
import { PlayerInfo, QueryClient, ServerInfo } from '../query/typing';

type BotExeCommand = 'start' | 'stop'
type BotTasks = {
    statusUpdate: Task
}

class Bot {
    private queryClient: QueryClient;
    private config: BotConfig;

    private logger: Logger;
    private process?: ChildProcessWithoutNullStreams;

    private status: BotStatus;

    private tasks: BotTasks;

    constructor(queryClient: QueryClient, config: BotConfig) {
        this.queryClient = queryClient;
        this.config = config;

        this.logger = logger.getChildLogger({ name: 'BotLogger', prefix: [this.config.basename, `(${this.config.server.name})`] });

        this.status = {
            enabled: false,
            processRunning: false,
            botRunning: false,
            cliReady: false
        };

        this.tasks = {
            statusUpdate: {
                // Server slot status update runs at 10,30,50, so data should be cached before bot updates start
                schedule: cron.schedule('12,32,52 * * * * *', async () => {
                    // Wait a random number of milliseconds to improve cache hit rate
                    // (requests going out one after the other rather than all at once)
                    await sleep(randomNumber(0, 5000));

                    this.logger.debug('updating on server status');
                    try {
                        await this.updateStatus();
                        this.logger.debug('on server status update complete');
                    }
                    catch (e: any) {
                        this.logger.error('encountered an error during bot on server status update', e.message);
                    }
                }, {
                    scheduled: false
                })
            }
        };
    }

    public launch(): void {
        if (!this.status.enabled) {
            this.logger.warn('currently disabled, will not launch');
            return;
        }

        this.process = spawn('wine', ['bots.exe'], {
            cwd: this.config.cwd,
            detached: false,
            windowsHide: true
        });

        this.process.on('spawn', () => {
            this.logger.debug('process launched successfully');
            this.status.processRunning = true;
            this.status.processStartedAt = moment();
        });

        this.process.on('exit', (code, signal) => {
            this.logger.debug(`process exited with code ${code} and signal ${signal}`);
            this.status.cliReady = false;
            this.status.botRunning = false;
            this.status.botStartedAt = undefined;
            this.status.processRunning = false;
            this.status.processStartedAt = undefined;
        });

        this.process.on('error', (e) => {
            this.logger.error('process encountered an error', e.message);
        })

        this.process.stdout.on('data', (data: Buffer) => {
            const lines = String(data).trim().split('\n');

            // Log each line individually
            for (const line of lines) {
                if (!line.includes('> That command doesn\'t exist')) {
                    this.logger.debug(`process stdout: ${line}`);
                }
            }

            if (!this.status.cliReady && String(data).endsWith('> ')) {
                this.logger.debug('cli is ready');
                this.status.cliReady = true;
            }

            if (!this.status.botRunning && String(data).includes('started successfully')) {
                this.logger.info('started successfully as', this.config.nickname);
                this.status.botRunning = true;
                this.status.botStartedAt = moment();
                this.tasks.statusUpdate.schedule.start();
            }
            else if (this.status.botRunning && String(data).includes('stopped successfully')) {
                this.logger.info('stopped successfully');
                this.status.botRunning = false;
                this.status.botStartedAt = undefined;
            }
        });

        this.process.stderr.on('data', (data) => {
            this.logger.error(`process stderr: ${data}`);
        });
    }

    public kill(): boolean {
        return !this.process || this.process.killed || this.process.kill(); // We want to kill the process, so it is fine if it's already killed/not set
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

    public async rotateNicknameAndCdKey(): Promise<void> {
        await this.config.rotateNickname(false);
        await this.config.rotateCdKey();

        // TODO Relaunch if running
    }

    public async updateMod(mod: string): Promise<void> {
        await this.config.updateMod(mod);
    }

    public isEnabled(): boolean {
        return this.status.enabled;
    }

    public setEnabled(enabled: boolean) : void {
        this.status.enabled = enabled;
    }

    public async updateStatus(): Promise<void> {
        try {
            const serverInfo: ServerInfo = await this.queryClient.getServerInfo(
                this.config.server.address,
                this.config.server.port,
                this.config.server.queryPort
            );
            const player = serverInfo.players.find((p: PlayerInfo) => p.name == this.config.nickname);
            this.status.onServer = !!player;
            this.status.team = player?.team;
            this.status.onServerLastCheckedAt = moment();

            if (this.status.onServer) {
                this.status.lastSeenOnServerAt = moment();
            }
        }
        catch (e: any) {
            this.logger.error('failed to determine whether bot is on server', e.message);
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
            this.logger.warn('failed to stop gracefully', maxSleeps);
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

    public async shutdown(): Promise<void> {
        this.tasks.statusUpdate.schedule.stop();

        if (!this.status.botRunning) {
            return;
        }

        this.logger.info('shutting down');
        this.stop();
        await this.waitForStop();
        this.kill();
    }

    private sendCommand(cmd: BotExeCommand): boolean {
        if (this.process && this.status.cliReady) {
            this.logger.debug('sending command to process via stdin: ', cmd);
            this.logger.debug('cli will be busy');
            this.status.cliReady = false;
            return this.process.stdin.write(`${cmd}\n`);
        }
        else if (this.process && !this.status.cliReady) {
            this.logger.warn('cli is not ready, rejecting command', cmd);
            return false;
        }
        else {
            this.logger.warn('process is not running, rejecting command', cmd);
            return false;
        }
    }

}

export default Bot;
