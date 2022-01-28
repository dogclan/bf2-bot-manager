import axios from 'axios';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { Logger } from 'tslog';
import logger from '../logger';
import { sleep } from '../utility';
import BotConfig from './BotConfig';

type BotExeCommand = 'start' | 'stop'

class Bot {
    private config: BotConfig;

    private logger: Logger;
    private process?: ChildProcessWithoutNullStreams;

    private processLaunched = false;
    private cliReady = false;
    private botRunning = false;

    constructor(config: BotConfig) {
        this.config = config;
        this.logger = logger.getChildLogger({ name: 'BotLogger' });

        // Kill child process when parent exists in order to not leave zombie processes behind
        process.on('exit', () => {
            this.process?.kill();
        });

        process.on('SIGINT', () => {
            console.log('SIGINT');
            this.process?.kill();
            process.exit();
        });

        process.on('SIGTERM', () => {
            console.log('SIGTERM');
            this.process?.kill();
            process.exit();
        });
    }

    public launch(): void {
        this.process = spawn('wine', ['bots.exe'], {
            cwd: this.config.cwd,
            detached: false,
            windowsHide: true
        });

        this.process.on('spawn', () => {
            this.logger.debug(this.config.nickname, 'process launched successfully');
            this.processLaunched = true;
        });

        this.process.on('exit', (code, signal) => {
            this.logger.debug(this.config.nickname, `exited with code ${code} and signal ${signal}`);
            this.processLaunched = false;
        });

        this.process.stdout.on('data', (data: Buffer) => {
            const lines = String(data).trim().split('\n');

            // Log each line individually
            for (const line of lines) {
                if (!line.includes('> That command doesn\'t exist')) {
                    this.logger.debug(this.config.nickname, `stdout: ${line}`);
                }
            }

            if (!this.cliReady && String(data).endsWith('> ')) {
                this.logger.debug(this.config.nickname, 'cli is ready');
                this.cliReady = true;
            }

            if (!this.botRunning && String(data).includes('started successfully')) {
                this.logger.info(this.config.nickname, 'started successfully');
                this.botRunning = true;
            }
            else if (this.botRunning && String(data).includes('stopped successfully')) {
                this.logger.info(this.config.nickname, 'stopped successfully');
                this.botRunning = false;
            }
        });

        this.process.stderr.on('data', (data) => {
            this.logger.error(this.config.nickname, `stderr: ${data}`);
        });
    }

    public kill(): boolean {
        if (this.process && !this.process.killed && this.process.kill()) {
            this.cliReady = false;
            this.botRunning = false;
            this.processLaunched = false;
            return true;
        }

        return false;
    }

    public async relaunch(): Promise<void> {
        this.kill();

        while (this.processLaunched) {
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

    public isLaunched(): boolean {
        return this.processLaunched;
    }

    public isBotRunning(): boolean {
        return this.botRunning;
    }

    public async isOnServer(): Promise<boolean> {
        const resp = await axios.get(`https://api.bflist.io/bf2/v1/servers/${this.config.server.address}:${this.config.server.port}/players`);
        const players = resp.data;
        return players.some((p: any) => p?.name == this.config.nickname);
    }

    public start(): boolean {
        return this.sendCommand('start');
    }

    public stop(): boolean {
        return this.sendCommand('stop');
    }

    public async restart(): Promise<boolean> {
        const stopped = this.stop();

        if (!stopped) {
            return false;
        }

        while (!this.cliReady) {
            await sleep(1000);
        }

        return this.start();
    }

    private sendCommand(cmd: BotExeCommand): boolean {
        if (this.process && this.cliReady) {
            this.logger.debug(this.config.nickname, 'sending command to process via stdin: ', cmd);
            this.logger.debug(this.config.nickname, 'cli will be busy');
            this.cliReady = false;
            return this.process.stdin.write(`${cmd}\n`);
        }
        else if (this.process && !this.cliReady) {
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
