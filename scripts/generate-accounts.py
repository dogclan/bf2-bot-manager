import argparse
from email.mime import base
import getpass
import mysql.connector

parser = argparse.ArgumentParser(description='Generate bot accounts in MySQL table')
parser.add_argument('--host', help='MySQL hostname/ip address', type=str, required=True)
parser.add_argument('--port', help='MySQL listen port', type=int, default=3306)
parser.add_argument('--user', help='MySQL user to login as', type=str, required=True)
parser.add_argument('--names', help='Basenames of accounts to create (16 characters max. each)', type=str, nargs='+', required=True)
args = parser.parse_args()

password = getpass.getpass(f'Please enter the password for "{args.user}": ')

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

accountsAdded = 0
for basename in args.names:
    if len(basename) > 16:
        print(f'Name "{basename}" is too long (15 characters max.), skipping name')
    for i in numbers:
        lastPid += 1
        name = f'{basename}^{i}'
        print(name)
        sql = 'INSERT INTO accounts (id, name, password, email, country) VALUES (%(id)s, %(name)s, %(password)s, %(email)s, %(country)s)'
        cursor.execute(sql, {
            'id': lastPid,
            'name': name,
            'password': 'gas',
            'email': 'bla@bla.com',
            'country': 'DE'
        })
        connection.commit()
        accountsAdded += 1

print(f'Added {accountsAdded} accounts')
