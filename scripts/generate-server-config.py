import argparse
import os
import pathlib
import sys

import requests
import yaml

parser = argparse.ArgumentParser(description='Generate server configuration (including bots) '
                                             'and add it to a given config file')
parser.add_argument('--config', help='Path to bot server configs (config.yaml)', type=str, required=True)
parser.add_argument('--name', help='Name of the server', type=str, required=True)
parser.add_argument('--address', help='IP address of the server', type=str, required=True)
parser.add_argument('--port', help='Game port of the server', type=int, required=True)
parser.add_argument('--mod', help='Mod the server is running by default (without "mods/" prefix)',
                    type=str, default='bf2')
parser.add_argument('--slots', help='Number of slots to fill with bots', type=int, required=True)
parser.add_argument('--reserved-slots', help='Number of slots to keep free for real players', type=int, required=True)
parser.add_argument('--overpopulate-factor', help='Maximum factor to determine how many bots may be launched '
                                                  'beyond the desired slot count', type=int, default=2)
parser.add_argument('--bot-password', help='Password to use for bot accounts', type=str, default='gas')
args = parser.parse_args()

configPath = pathlib.Path(args.config).absolute()
if not os.path.isfile(configPath):
    print(f'Could not find config file at given path ({configPath}), creating new config')
    configs = []
else:
    with open(configPath, 'r') as configFile:
        configs = yaml.load(configFile, yaml.FullLoader)

serverConfigToAdd = {
    'name': args.name,
    'address': args.address,
    'port': args.port,
    'mod': f'mods/{args.mod}',
    'slots': args.slots,
    'reservedSlots': args.reserved_slots,
    'bots': []
}

existingBotNames = [bot['basename'] for server in configs for bot in server['bots']]

numberOfBotsToAdd = serverConfigToAdd['slots'] * args.overpopulate_factor
while len(serverConfigToAdd['bots']) < numberOfBotsToAdd:
    print(f'Fetching bot names (need {numberOfBotsToAdd - len(serverConfigToAdd["bots"])} more)')
    try:
        # Can't simply calculate count to fetch here, since certain count values lead to API errors
        resp = requests.get(
            'https://story-shack-cdn-v2.glitch.me/generators/gamertag-generator',
            params={'count': 6}
        )

        if resp.ok:
            parsed = resp.json()
            for tag in parsed['data']:
                if tag['name'] not in existingBotNames and len(serverConfigToAdd['bots']) < numberOfBotsToAdd:
                    serverConfigToAdd['bots'].append({'basename': tag['name'], 'password': args.bot_password})
        else:
            print(f'Failed to fetch bot names, server responded with HTTP/{resp.status_code}')
            sys.exit(1)
    except requests.RequestException as e:
        print(e)
        print(f'Failed to fetch bot names')
        sys.exit(1)

configs.append(serverConfigToAdd)

with open(configPath, 'w') as configFile:
    yaml.dump(configs, configFile, sort_keys=False)
