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
            // statbits Discord
            guild: '774680162415018004',
            permissions: [
                // developer role
                { id: '774730250772152382', type: 'ROLE', permission: true }
            ]
        },
        {
            // =DOG= Discord
            guild: '643138640473489428',
            permissions: [
                // server bot admin role
                { id: '936992348846575666', type: 'ROLE', permission: true }
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
            { basename: 'Daves_Mate', password: 'gas' },
        ],
    },
    {
        name: 'dog-rotation',
        address: '135.125.56.26',
        port: 16472,
        mod: 'mods/bf2',
        bots: [
            { basename: 'Extra|OrdiNarY', password: 'gas' },
            { basename: 'Fr33|Da|Herb', password: 'gas' },
            { basename: 'Well|Job.Inf', password: 'gas' },
            { basename: 'Helitomas', password: 'gas' },
            { basename: 'Marcus|Thebest', password: 'gas' },
            { basename: 'Beer^Monster', password: 'gas' },
            { basename: 'John_Wick', password: 'gas' },
            { basename: 'Jane_Smith', password: 'gas' },
        ],
    }];
}
