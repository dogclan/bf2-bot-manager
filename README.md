# bf2-bot-manager

Run and manage Battlefield 2 server idle bots with ease

Managing Battlefield 2 idle bots can be a lot of work. One day, only 11 of 14 bots will manage to join the server. The next day, all 14 bots will join - but 10 of them will be on the same team. And once your server finally fills up, players complain because the bots are taking up slots. This tool addresses all of these issues (and more).

## Features
* ensures desired number of bots are on server at all times
* stops bots to free up slots as server fills up
* automatically balances bots between teams (optional)
* allows you to monitor and manage bots via Discord commands (optional)
* runs/manages bots for any number of game servers

**Note:** This project does not include the required `bots.exe`. You will need to supply your own.

## Configuration

Managed servers and their respective bots are configured via a simple `config.yaml`.

### Server-specific options

These options need to/can be defined for each server.

| Option         | Description                                                                                             | Default | Required                                                            |
|----------------|---------------------------------------------------------------------------------------------------------|---------|---------------------------------------------------------------------|
| name           | Server name (administrive purposes only, does not need to match the game server name)                   |         | Yes                                                                 |
| address        | Server IP address                                                                                       |         | Yes                                                                 |
| port           | Server (game) port                                                                                      |         | Yes                                                                 |
| queryPort      | Server query port                                                                                       |         | Yes, if server address is a private ip or `queryDirectly` is `true` |
| slots          | Number of slots to fill with bots ¹                                                                     |         | Yes                                                                 |
| reservedSlots  | Number of slots to keep free on the server as it fills up (reserved for real players) ¹                 |         | Yes                                                                 |
| autobalance    | Ensure same number of bots for both teams                                                               | `true`  | No                                                                  |
| queryDirectly  | Query the server directly instead of using the bflist API                                               | `false` | No                                                                  |
| rotateBotNames | Add rotating suffix to bot basenames (bot with basename 'SomeBot' will join server as e.g. 'SomeBot^6') | `true`  | No                                                                  |
| bots           | List of bot configurations ²                                                                            |         | Yes                                                                 |

¹ Must be an even number.
² By default, the number of bot configurations needs to be at least 2x the number of slots to fill on the server. See the note on [overpopulating](docs/overpopulating.md) for details.

### Bot-specific options

These options need to be defined for each bot.

| Option   | Description                                                                                                                    | Default | Required |
|----------|--------------------------------------------------------------------------------------------------------------------------------|---------|----------|
| basename | Basename of the bot (must not contain spaces, will append suffix at runtime to create nickname if `rotateBotNames` is `true` ) |         | Yes      |
| password | Password for all accounts with this basename ¹                                                                                 |         | Yes      |

¹ When using `rotateBotNames` with a GameSpy login emulator other than [dumbspy](https://github.com/dogclan/dumbspy), you will need to create accounts for the basename with every possible suffix. For example, for a bot named 'SomeBot' you need to create 'SomeBot^0', 'SomeBot^1', ..., 'SomeBot^a', ..., 'SomeBot^f' (all with the same password).

### Example

A typical, basic `config.yaml` might look like this.

```yaml
- name: primary-server
  address: 1.1.1.1
  port: 16567
  mod: mods/bf2
  slots: 2
  reservedSlots: 6
  bots:
  - basename: IffyToy
    password: secure1
  - basename: Unowfi
    password: secure2
  - basename: TheborgGenius
    password: secure3
  - basename: Novache
    password: secure4
```
