import moment from 'moment';

export type BotStatus = {
    enabled: boolean
    processRunning: boolean
    botRunning: boolean
    cliReady: boolean
    onServer?: boolean
    team?: number
    processStartedAt?: moment.Moment
    botStartedAt?: moment.Moment
    onServerLastCheckedAt?: moment.Moment
    lastSeenOnServerAt?: moment.Moment
}
