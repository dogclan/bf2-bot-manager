import moment from 'moment';

export type BotStatus = {
    enabled: boolean
    processRunning: boolean
    botRunning: boolean
    cliReady: boolean
    onServer?: boolean
    processStartedAt?: moment.Moment
    botStartedAt?: moment.Moment
    onServerLastCheckedAt?: moment.Moment
    lastSeenOnServerAt?: moment.Moment
}
