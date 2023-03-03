import BotManager from '../BotManager';
import Server from '../server/Server';
import Constants from '../constants';

export function buildServerOptionChoices(manager: BotManager, focusedValue: string): { name: string, value: string }[] {
    return manager.getServers()
        .map((server: Server) => server.getConfig().name)
        .filter((choice: string) => choice.toLowerCase().includes(focusedValue.toLowerCase()))
        // Avoid causing errors with long names
        .filter((choice) => choice.length <= Constants.DISCORD_CHOICES_MAX_LENGTH)
        // Avoid causing errors with too many options
        .slice(0, Constants.DISCORD_CHOICES_MAX_LENGTH)
        .map((choice: string) => ({ name: choice, value: choice }));
}

export function booleanToEnglish(bool?: boolean): string {
    return bool ? 'yes' : 'no';
}
