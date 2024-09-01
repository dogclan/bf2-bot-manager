import argparse
import ipaddress
import os
import pathlib
import secrets
import string
import sys
from enum import Enum
from typing import Any, Generator, List

import requests
import yaml

from scripts.types import ServerConfig, BotConfig

ALPHABET = string.ascii_letters + string.digits


class BotNameSource(str, Enum):
    GlitchAPI = "glitch.me"
    AINames = "ai-names"


def generate_password(length: int = 10) -> str:
    return ''.join(secrets.choice(ALPHABET) for i in range(length))


def is_query_port_required(config: ServerConfig) -> bool:
    ip = ipaddress.ip_address(config.address)
    return not ip.is_global or config.query_directly


def dict_filter(d: dict, remove: Any) -> dict:
    return {
        key: value
        for (key, value) in d.items()
        if value != remove
    }


def generate_bot_names_via_glitch_api() -> Generator[str, None, None]:
    while True:
        try:
            # Can't simply calculate count to fetch here, since certain count values lead to API errors
            resp = requests.get(
                'https://story-shack-cdn-v2.glitch.me/generators/gamertag-generator',
                params={'count': 6}
            )

            if resp.ok:
                parsed = resp.json()
                for tag in parsed['data']:
                    yield tag['name']
            else:
                raise Exception(f'Failed to fetch bot names, server responded with HTTP/{resp.status_code}')
        except requests.RequestException as e:
            raise Exception(f'Failed to fetch bot names: {e}') from None


parser = argparse.ArgumentParser(description='Generate server configuration (including bots) '
                                             'and add it to a given config file')
parser.add_argument('--config', help='Path to bot server configs (config.yaml)', type=str, required=True)
parser.add_argument('--name', help='Name of the server', type=str, required=True)
parser.add_argument('--address', help='IP address of the server', type=str, required=True)
parser.add_argument('--port', help='Game port of the server', type=int, required=True)
parser.add_argument('--query-port', help='Query port of the server', type=int)
parser.add_argument('--mod', help='Mod the server is running by default (without "mods/" prefix)',
                    type=str, default='bf2')
parser.add_argument('--slots', help='Number of slots to fill with bots', type=int, required=True)
parser.add_argument('--reserved-slots', help='Number of slots to keep free for real players', type=int, required=True)
parser.add_argument('--overpopulate-factor', help='Maximum factor to determine how many bots may be launched '
                                                  'beyond the desired slot count', type=int, default=2)
parser.add_argument('--name-source', help='Source for names of bots', type=BotNameSource,
                    default=BotNameSource.GlitchAPI)
parser.add_argument('--no-autobalance', help='Disable autobalancing bots between teams',
                    dest='autobalance', action='store_false')
parser.add_argument('--query-directly', help='Query the server directly instead of using the bflist API',
                    dest='query_directly', action='store_true')
parser.set_defaults(autobalance=None, query_directly=None)
args = parser.parse_args()

configPath = pathlib.Path(args.config).absolute()
configs: List[ServerConfig] = []
if not os.path.isfile(configPath):
    print(f'Could not find config file at given path ({configPath}), creating new config')
else:
    with open(configPath, 'r') as configFile:
        configs.extend([ServerConfig.load(parsed) for parsed in yaml.load(configFile, yaml.Loader)])

config = next(
    (config for config in configs if config.address == args.address and config.port == args.port),
    None
)

if config is None:
    config = ServerConfig(
        name=args.name,
        address=args.adddress,
        port=args.port,
        mod=f'mods/{args.mod}',
        slots=args.slots,
        reserved_slots=args.reserved_slots,
        bots=[],
        query_port=args.query_port,
        autobalance=args.autobalance,
        query_directly=args.query_directly
    )
    configs.append(config)
else:
    config.name = args.name
    config.mod = f'mods/{args.mod}'
    config.slots = args.slots
    config.reserved_slots = args.reserved_slots
    # Only update optional attributes if given, else we'd remove existing values
    if args.query_port is not None:
        config.query_port = args.query_port
    if args.autobalance is not None:
        config.autobalance = args.autobalance
    if args.query_directly is not None:
        config.query_directly = args.query_directly

if is_query_port_required(config) and config.query_port is None:
    print(f'Query port is required but missing, please provide it using --query-port')
    sys.exit(1)

if args.name_source is BotNameSource.AINames:
    from scripts.ai_names import AI_NAMES
    source = AI_NAMES
else:
    source = generate_bot_names_via_glitch_api()

names = {bot.basename for server in configs for bot in server.bots}
need = config.slots * args.overpopulate_factor
for name in source:
    if len(config.bots) < need and len(name) <= 16 and name not in names:
        config.bots.append(BotConfig(
            basename=name,
            password=generate_password()
        ))
        names.add(name)

    if len(config.bots) >= need:
        break
    else:
        print(f'Generating bot names (need {need - len(config.bots)} more)')

with open(configPath, 'w') as configFile:
    yaml.dump([config.dump() for config in configs], configFile, sort_keys=False)
