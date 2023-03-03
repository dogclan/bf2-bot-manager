import BotManager from '../BotManager';
import Server from '../server/Server';

export function buildServerOptionChoices(manager: BotManager, focusedValue: string): { name: string, value: string }[] {
    return manager.getServers()
        .map((server: Server) => server.getConfig().name)
        .filter((choice: string) => choice.toLowerCase().startsWith(focusedValue.toLowerCase()))
        .map((choice: string) => ({ name: choice, value: choice }));
}

export function booleanToEnglish(bool?: boolean): string {
    return bool ? 'yes' : 'no';
}
