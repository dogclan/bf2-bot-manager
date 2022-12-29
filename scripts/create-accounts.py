import argparse
import getpass
import os
import pathlib
import sqlite3
import sys
from enum import Enum
from typing import List

import mysql.connector
import yaml


class DatabaseBackend(str, Enum):
    MySQL = 'mysql'
    SQLite = 'sqlite'


def prepare_statement(table: str, columns: List[str], backend: DatabaseBackend) -> str:
    if backend is DatabaseBackend.MySQL:
        placeholders = [f'%({c})s' for c in columns]
    else:
        placeholders = [f':{c}' for c in columns]

    return f'INSERT INTO {table} ({", ".join(columns)}) VALUES ({", ".join(placeholders)})'


parser = argparse.ArgumentParser(description='Generate bot accounts in MySQL/SQLite table')
parser.add_argument('--config', help='Path to bot server configs (config.yaml)', type=str, required=True)
subparsers = parser.add_subparsers(title='Database backend type', dest='backend', required=True)
mysqlParser = subparsers.add_parser(DatabaseBackend.MySQL)
mysqlParser.add_argument('--host', help='MySQL hostname/ip address', type=str, required=True)
mysqlParser.add_argument('--port', help='MySQL listen port', type=int, default=3306)
mysqlParser.add_argument('--user', help='MySQL user to login as', type=str, required=True)
sqliteParser = subparsers.add_parser(DatabaseBackend.SQLite)
sqliteParser.add_argument('--database', help='Path to SQLite database file', required=True)

args = parser.parse_args()

configPath = pathlib.Path(args.config).absolute()
if not os.path.isfile(configPath):
    print(f'Could not find config file at given path ({configPath})')
    sys.exit(1)

with open(configPath, 'r') as configFile:
    config = yaml.load(configFile, yaml.Loader)

bots = [bot for server in config for bot in server['bots']]

try:
    backend = DatabaseBackend(args.backend)
except ValueError:
    print('Unknown database backend type')
    sys.exit(1)

if backend is DatabaseBackend.MySQL:
    password = getpass.getpass(f'Please enter the mysql password for "{args.user}": ')

    connection = mysql.connector.connect(
        host=args.host,
        port=args.port,
        user=args.user,
        passwd=password,
        database='bf2gs'
    )
    cursor = connection.cursor(dictionary=True)
else:
    connection = sqlite3.connect(args.database)
    connection.row_factory = sqlite3.Row

    cursor = connection.cursor()

# Get last pid
sql = 'SELECT id FROM accounts ORDER BY id DESC LIMIT 1'
cursor.execute(sql)
results = cursor.fetchall()

lastPid = results.pop()['id'] if len(results) > 0 else 50000000

errors = 0
for bot in bots:
    basename, password = bot.values()

    # Name must be leave space for 2 character name suffix ("^{number}")
    if len(basename) > 16:
        print(f'Name "{basename}" is too long (15 characters max.), skipping name')

    for i in range(0, 16):
        lastPid += 1
        name = f'{basename}^{i:x}'
        sql = prepare_statement(
            'accounts',
            ['id', 'name', 'password', 'email', 'country'],
            backend
        )
        try:
            cursor.execute(sql, {
                'id': lastPid,
                'name': name,
                'password': password,
                'email': 'bla@bla.com',
                'country': 'DE'
            })
            connection.commit()
        except mysql.connector.errors.Error as e:
            if 'Duplicate entry' not in str(e):
                print(e)
                errors += 1
        except sqlite3.IntegrityError as e:
            if 'UNIQUE constraint failed' not in str(e):
                print(e)
                errors += 1

if errors == 0:
    print('Added all accounts listed in config')
else:
    print('Failed to add some accounts')

cursor.close()
connection.close()
