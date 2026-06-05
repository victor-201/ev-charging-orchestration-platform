export class CreateBookingCommand {
  constructor(
    public readonly userId:          string,
    public readonly chargerId:       string,
    public readonly stationId:       string,
    public readonly connectorType:   string,
    public readonly startTime:       Date,
    public readonly endTime:         Date,
    public readonly idempotencyKey?: string,
  ) {}
}

export class CancelBookingCommand {
  constructor(
    public readonly bookingId: string,
    public readonly userId:    string,
    public readonly reason:    string,
  ) {}
}

export class CompleteBookingCommand {
  constructor(
    public readonly bookingId: string,
  ) {}
}

export class JoinQueueCommand {
  constructor(
    public readonly userId:        string,
    public readonly chargerId:     string,
    public readonly userPriority:  number,
    public readonly urgencyScore:  number,
    public readonly connectorType?: string,
  ) {}
}

export class LeaveQueueCommand {
  constructor(
    public readonly userId:    string,
    public readonly chargerId: string,
  ) {}
}
