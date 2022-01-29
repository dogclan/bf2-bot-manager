import path from 'path';
import { CommandPermissionSet, ServerBotConfig } from './typing';

export default abstract class Config {
    static readonly ROOT_DIR: string = path.join(__dirname, '..');
    static readonly RESOURCE_DIR: string = path.join(Config.ROOT_DIR, 'resources');
    static readonly RUNNING_DIR: string = path.join(Config.ROOT_DIR, 'running');
    static readonly LOG_LEVEL: string = process.env.LOG_LEVEL || 'info';
    static readonly TOKEN: string = process.env.TOKEN || '';
    static readonly COMMAND_PERMISSIONS: CommandPermissionSet[] = [
        {
            guild: '774680162415018004',
            permissions: [
                { id: '774730250772152382', type: 'ROLE', permission: true }
            ]
        },
        {
            guild: '643138640473489428',
            permissions: [
                { id: '772409834343366676', type: 'ROLE', permission: true }
            ]
        }
    ]
    static readonly SERVERS: ServerBotConfig[] = [{
        name: 'promote-openspy',
        address: '85.214.21.18',
        port: 16567,
        mod: 'mods/bf2',
        bots: [
            { basename: 'LucyFromLondon', password: 'gas' },
            { basename: 'BushWacka', password: 'gas' },
            { basename: 'SirMixAlot', password: 'gas' },
            { basename: 'Hypnotic', password: 'gas' },
            { basename: 'Congo|Natty', password: 'gas' },
            { basename: 'Mmmmmmm', password: 'gas' },
            { basename: 'Mohawkman', password: 'gas' },
            { basename: 'Daves_Mate', password: 'gas'},
        ],
    }];
}
