import moment from 'moment';

export type ServerConfig = {
    name: string
    address: string
    port: number
    slots: number
    reservedSlots: number
    currentSlots?: number
    autobalance?: boolean
}

export type ServerStatus = {
    currentSlotsTakenSince?: moment.Moment
    availableSlotsFreeSince?: moment.Moment
    autobalanceInProgress?: boolean
    autobalanceStartedAt?: moment.Moment
}

export type ServerSlotStatus = {
    filledTotal: number
    filledByBots: number
    max: number
}
