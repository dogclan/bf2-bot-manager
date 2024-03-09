# Overpopulating

Because the bot manager cannot fix any of the underlying issues of the idle bots, it has to work around bots not managing to join the server. To do so, it may "overpopulate" the server by a configurable factor (default: 2). This allows the manager to temporarily launch more bots than should usually be on the server. Once the desired number of bots made it to the server, the manager will shut down any extra bots.

## Example

To help explain this behaviour, here's an example. Assume a server should receive 12 bots. Even though 12 bots are running, only 10 are on the server. Bot #5 and bot #7 bugged out and are not on the server. Here's what will happen:

* manager launches bot #13, waits to see if it joins right away (it does not)
* manager launches bot #14, waits to see if it joins right away (it does not)
* manager launches bot #15, waits to see if it joins right away (it does not)
* bot #13 shows up on the server
* bot #15 stows up on the server
* manager stops bot #5
* manager stops bot #7
* manager stops bot #14

The server is now populated with 12 bots as configured.

## Implications

### Higher number of bot configurations

Any bots launched when "overpopulating" still need to be configured. Meaning the number of bots that needs to be configured is equal to the overpopulate factor times the number of slots for the server. Meaning with the default factor of 2, at least 24 bots need to configured in `config.yaml` for a 12 slot server.

**Note:** The bot manager will error and exit during startup if fewer than the required number of bots have been configured.

### Any bot may or may not be on the server

Any of the configured bots for a server may or may not be on a server at a given time. As can be seen in the above example, the bot manager fills slots with whichever bots manage to join the server. Due to this behaviour, bot names cannot be used to reliably communicate server rules, promote your Discord or anything similar. 

### "Bursts" of bots

Due to the somewhat "aggressive" default overpopulate factor of 2, it may happen that a large number of bots suddenly bursts onto the server. This happens whenever a bigger number of bots suddenly starts working and joins the server. The manager will automatically stop bots as required to reach the configured population.
