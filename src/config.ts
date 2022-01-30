import path from 'path';
import { CommandPermissionSet, ServerBotConfig } from './typing';

export default abstract class Config {
    static readonly ROOT_DIR: string = path.join(__dirname, '..');
    static readonly RESOURCE_DIR: string = path.join(Config.ROOT_DIR, 'resources');
    static readonly RUNNING_DIR: string = path.join(Config.ROOT_DIR, 'running');
    static readonly LOG_LEVEL: string = process.env.LOG_LEVEL || 'info';
    static readonly TOKEN: string = process.env.TOKEN || '';
    static readonly BOT_JOIN_TIMEOUT = Number(process.env.BOT_JOIN_TIMEOUT) || 300;
    static readonly BOT_ON_SERVER_TIMEOUT = Number(process.env.BOT_ON_SERVER_TIMEOUT) || 180;
    static readonly BOT_STATUS_UPDATE_TIMEOUT = Number(process.env.BOT_STATUS_UPDATE_TIMEOUT) || 30;
    static readonly OVERPOPULATE_FACTOR = Number(process.env.OVERPOPULATE_FACTOR) || 2;
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
    static readonly SERVERS: ServerBotConfig[] = [
        {
            name: 'dog-rotation',
            address: '135.125.56.26',
            port: 16472,
            mod: 'mods/bf2',
            slots: 8,
            bots: [
                { basename: 'HopefulRace', password: 'gas' },
                { basename: 'ElyahouBeets', password: 'gas' },
                { basename: 'ProudAlarmed', password: 'gas' },
                { basename: 'NewtNicea', password: 'gas' },
                { basename: 'PearBryga', password: 'gas' },
                { basename: 'Conventional', password: 'gas' },
                { basename: 'CapablePear', password: 'gas' },
                { basename: 'SealBrockett', password: 'gas' },
                { basename: 'AgedRace', password: 'gas' },
                { basename: 'SaltyAdjeley', password: 'gas' },
                { basename: 'ShootLeira', password: 'gas' },
                { basename: 'Idolized', password: 'gas' },
                { basename: 'BabyishToxic', password: 'gas' },
                { basename: 'TotalPanther', password: 'gas' },
                { basename: 'NoseThulium', password: 'gas' },
                { basename: 'AtemoyaHuge', password: 'gas' },
            ],
        }, {
            name: 'promote-openspy',
            address: '85.214.21.18',
            port: 16567,
            mod: 'mods/bf2',
            slots: 8,
            bots: [
                { basename: 'ModestJicama', password: 'gas' },
                { basename: 'SeatUlyssia', password: 'gas' },
                { basename: 'LeanLudovika', password: 'gas' },
                { basename: 'Convert', password: 'gas' },
                { basename: 'GryphinWater', password: 'gas' },
                { basename: 'BellElephant', password: 'gas' },
                { basename: 'DutifulLean', password: 'gas' },
                { basename: 'RomaineXray', password: 'gas' },
                { basename: 'FlimsyUschi', password: 'gas' },
                { basename: 'DoubleAbove', password: 'gas' },
                { basename: 'EconomicsFox', password: 'gas' },
                { basename: 'TylaishaSnow', password: 'gas' },
                { basename: 'DavyJones', password: 'gas' },
                { basename: 'XCaliber', password: 'gas' },
                { basename: 'SlyBoat', password: 'gas' },
                { basename: 'OORetirement', password: 'gas' },
            ],
        },
    ];
}
