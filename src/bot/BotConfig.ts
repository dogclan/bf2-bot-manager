import fs from 'fs';
import path from 'path';
import { create } from 'xmlbuilder2';
import Config from '../config';
import Constants from '../constants';
import { BotServer } from '../typing';
import { generateCdkey, getBotName, linkAsync, mkdirAsync, writeFileAsync } from '../utility';

class BotConfig {
    public basename: string;
    public slot: number;
    public server: BotServer;

    private password: string;

    public nickname: string;
    public cwd: string;

    private cdKey: string;

    constructor(
        basename: string,
        password: string,
        slot: number,
        server: BotServer
    ) {
        this.basename = basename;
        this.slot = slot;
        this.server = server;
        this.password = password;
        
        this.nickname = getBotName(basename);
        this.cwd = path.join(Config.RUNNING_DIR, this.server.name, String(this.slot));
        this.cdKey = generateCdkey();
    }

    async setup(): Promise<void> {
        // Check if slot folder exists
        if (!fs.existsSync(this.cwd)) {
            await mkdirAsync(this.cwd, { recursive: true });
        }

        // Make sure .exe and .dll files from /resouces are linked into the running folder
        for (const binaryFilename of Constants.RESOURCE_BINARIES) {
            const binaryTargetPath = path.join(this.cwd, binaryFilename);
            if (!fs.existsSync(binaryTargetPath)) {
                const binarySourcePath = path.join(Config.RESOURCE_DIR, binaryFilename);
                await linkAsync(binarySourcePath, binaryTargetPath);
            }
        }

        return this.writeXml();
    }

    async writeXml(): Promise<void> {
        const content = create()
            .ele('bf2bot')
            .ele('server')
            .att('address', this.server.address)
            .att('port', String(this.server.port))
            .att('mod', this.server.mod)
            .ele('client')
            .att('nickname', this.nickname)
            .att('password', this.password)
            .att('cdkey', this.cdKey)
            .up()
            .up();
        
        const xmlPath = path.join(this.cwd, 'client.xml');

        return writeFileAsync(xmlPath, content.toString());
    }

    async rotateNickname(writeXml = true): Promise<void> {
        this.nickname = getBotName(this.basename, this.nickname);
        if (writeXml) {
            return this.writeXml();
        }
    }

    async rotateCdKey(writeXml = true): Promise<void> {
        this.cdKey = generateCdkey();
        if (writeXml) {
            return this.writeXml();
        }
    }

    async updateMod(mod: string, writeXml = true): Promise<void> {
        this.server.mod = mod;
        if (writeXml) {
            return this.writeXml();
        }
    }
}

export default BotConfig;
