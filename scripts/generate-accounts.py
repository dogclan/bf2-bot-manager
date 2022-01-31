import argparse
import getpass
import pathlib

import mysql.connector
import os
import sys
import yaml

parser = argparse.ArgumentParser(description='Generate bot accounts in MySQL table')
parser.add_argument('--host', help='MySQL hostname/ip address', type=str, required=True)
parser.add_argument('--port', help='MySQL listen port', type=int, default=3306)
parser.add_argument('--user', help='MySQL user to login as', type=str, required=True)
parser.add_argument('--config', help='Path to bot server configs (config.yaml)', type=str, required=True)
args = parser.parse_args()

configPath = pathlib.Path(args.config).absolute()
if not os.path.isfile(configPath):
    print(f'Could not find config file at given path ({configPath})')
    sys.exit(1)

with open(configPath, 'r') as configFile:
    config = yaml.load(configFile, yaml.BaseLoader)

bots = [bot for server in config for bot in server['bots']]

password = getpass.getpass(f'Please enter the mysql password for "{args.user}": ')

connection = mysql.connector.connect(
    host=args.host,
    port=args.port,
    user=args.user,
    passwd=password,
    database='bf2gs'
)
cursor = connection.cursor(dictionary=True)

# Get last pid
sql = 'SELECT id FROM accounts ORDER BY id DESC LIMIT 1'
cursor.execute(sql)
results = cursor.fetchall()

lastPid = results.pop()['id'] if len(results) > 0 else 50000000

numbers = [34, 42, 69, 101, 322, 404, 419, 420]
for i in range(0, 10):
    numbers.append(pow(2, i))

errors = 0
for bot in bots:
    basename, password = bot.values()
    if len(basename) > 16:
        print(f'Name "{basename}" is too long (15 characters max.), skipping name')
    for i in numbers:
        lastPid += 1
        name = f'{basename}^{i}'
        sql = 'INSERT INTO accounts (id, name, password, email, country) ' \
              'VALUES (%(id)s, %(name)s, %(password)s, %(email)s, %(country)s)'
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

if errors == 0:
    print('Added all accounts listed in config')
else:
    print('Failed to add some accounts')

cursor.close()
connection.close()
