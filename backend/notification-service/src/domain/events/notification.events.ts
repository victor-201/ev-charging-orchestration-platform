/**
 * Notification Inbound Events: type-safe mapping from upstream services.
 *
 * PHASE 1 – EVENT MAPPING:
 *
 * Source Event                -> Notification Type        -> Channels
 * booking.created             -> booking.created          -> in_app + realtime
 * booking.confirmed           -> booking.confirmed        -> push + realtime
 * booking.cancelled           -> booking.cancelled        -> push + in_app
 * payment.completed           -> payment.completed        -> push + in_app
 * session.started             -> session.started          -> push + realtime
 * session.completed           -> session.completed        -> push + email
 * queue.updated (queue.*)     -> queue.updated            -> realtime (socket only)
 */

// Booking Events

export interface BookingCreatedEvent {
  eventType:  'booking.created';
  eventId:    string;
  bookingId:  string;
  userId:     string;
  chargerId:  string;
  stationId?: string;
  startTime:  string;   // ISO
  endTime:    string;
}

export interface BookingConfirmedEvent {
  eventType:   'booking.confirmed';
  eventId:     string;
  bookingId:   string;
  userId:      string;
  chargerId:   string;
  stationId?:  string;
  stationName?: string;
  startTime?:  string;
}

export interface BookingCancelledEvent {
  eventType:  'booking.cancelled';
  eventId:    string;
  bookingId:  string;
  userId:     string;
  reason?:    string;
}

// Payment Events

export interface PaymentCompletedEvent {
  eventType:     'payment.completed';
  eventId:       string;
  transactionId: string;
  userId:        string;
  amount:        number;    // VND
  relatedId?:    string;    // bookingId
}

export interface PaymentFailedEvent {
  eventType:     'payment.failed';
  eventId:       string;
  transactionId: string;
  userId:        string;
  amount:        number;
  reason?:       string;
}

// Charging Events

export interface SessionStartedEvent {
  eventType:    'session.started';
  eventId:      string;
  sessionId:    string;
  userId:       string;
  chargerId:    string;
  bookingId?:   string;
  stationId?:   string;
  startTime:    string;
}

export interface SessionCompletedEvent {
  eventType:       'session.completed';
  eventId:         string;
  sessionId:       string;
  userId:          string;
  chargerId:       string;
  kwhConsumed:     number;
  durationMinutes: number;
  stationId?:      string;
  bookingId?:      string;
  endTime:         string;
}

export interface SessionTelemetryPushEvent {
  eventType:     'session.telemetry';
  sessionId:     string;
  userId:        string;
  chargerId:     string;
  powerKw:       number | null;
  meterWh:       number | null;
  socPercent:    number | null;
  voltageV:      number | null;
  currentA:      number | null;
  temperatureC:  number | null;
  recordedAt:    string;
}

// Queue Events

export interface QueueUpdatedEvent {
  eventType:    'queue.updated';
  eventId:      string;
  queueId:      string;
  userId:       string;
  chargerId:    string;
  stationId?:   string;
  position:     number;
  estimatedWaitMinutes: number;
  status:       'waiting' | 'moved' | 'called' | 'expired';
}

// Billing Notification Events

export interface BillingIdleFeeChargedEvent {
  eventType:             'billing.idle_fee_charged';
  eventId:               string;
  sessionId:             string;
  userId:                string;
  idleFeeVnd:            number;
  chargeableIdleMinutes: number;
  idleFeePerMinuteVnd:   number;
  idleGraceMinutes:      number;
  transactionId:         string;
}

export interface BillingExtraChargeEvent {
  eventType:       'billing.extra_charge';
  eventId:         string;
  sessionId:       string;
  userId:          string;
  extraAmountVnd:  number;
  depositAmount:   number;
  totalFeeVnd:     number;
  transactionId:   string;
}

export interface BillingRefundIssuedEvent {
  eventType:        'billing.refund_issued';
  eventId:          string;
  sessionId:        string;
  userId:           string;
  refundAmountVnd:  number;
  depositAmount:    number;
  totalFeeVnd:      number;
  transactionId:    string;
}

// Wallet / Arrears Events

export interface WalletArrearsCreatedEvent {
  eventType:            'wallet.arrears.created';
  eventId:              string;
  userId:               string;
  arrearsAmount:        number;
  totalOutstanding:     number;
  transactionId:        string;
  relatedSessionId?:    string;
  dueDate?:             string;
}

export interface WalletArrearsClearedEvent {
  eventType:            'wallet.arrears.cleared';
  eventId:              string;
  userId:               string;
  clearedAmount:        number;
  totalOutstanding:     number;
  transactionId:        string;
}

// Queue Ready Event

export interface ChargerQueueReadyEvent {
  eventType:    'charger.queue.ready';
  eventId:      string;
  queueId:      string;
  userId:       string;
  chargerId:    string;
  stationId?:   string;
  stationName?: string;
  chargerName?: string;
  position:     number;
}

// IAM / User Events

export interface EmailVerificationRequestedEvent {
  eventType: 'user.email_verification_requested';
  eventId: string;
  userId: string;
  email: string;
  rawToken: string;
  shortCode: string;
}

// Notification Template

/** Function to build notification content from event payload */
export interface NotificationTemplate {
  title:   (payload: any) => string;
  body:    (payload: any) => string;
}

/** Centralized template registry */
export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  'booking.created': {
    title: ()        => 'Booking Created',
    body:  (p: BookingCreatedEvent) =>
      `Booking #${p.bookingId.slice(0,8)} created${p.stationId ? ' at station' : ''}. Start: ${new Date(p.startTime).toLocaleString('en-US')}.`,
  },
  'booking.reminder.upcoming': {
    title: (p: any) => p.customTitle ?? 'Upcoming Booking Reminder',
    body: (p: any) => p.customBody ??
      `Your booking${p.stationName ? ` at ${p.stationName}` : ''} starts at ${new Date(p.startTime).toLocaleTimeString('en-US')}. Please arrive on time!`,
  },
  'booking.reminder.payment_expiry': {
    title: () => 'Payment Expiration Warning',
    body: (p: any) =>
      `Your booking${p.stationName ? ` at ${p.stationName}` : ''} will be cancelled in 1 minute if deposit remains unpaid.`,
  },
  'booking.confirmed': {
    title: ()        => 'Booking Confirmed',
    body:  (p: BookingConfirmedEvent) =>
      `Booking #${p.bookingId.slice(0,8)}${p.stationName ? ` at ${p.stationName}` : ''} has been confirmed!`,
  },
  'booking.cancelled': {
    title: ()        => 'Booking Cancelled',
    body:  (p: BookingCancelledEvent) =>
      `Booking #${p.bookingId.slice(0,8)} has been cancelled.${p.reason ? ` Reason: ${p.reason}` : ''}`,
  },
  'payment.completed': {
    title: ()        => 'Payment Successful',
    body:  (p: PaymentCompletedEvent) =>
      `Payment of ${p.amount.toLocaleString('en-US')} VND completed.`,
  },
  'payment.failed': {
    title: ()        => 'Payment Failed',
    body:  (p: PaymentFailedEvent) =>
      `Payment failed.${p.reason ? ` Reason: ${p.reason}` : ' Please try again.'}`,
  },
  'session.started': {
    title: ()        => 'Charging Started',
    body:  (p: SessionStartedEvent) =>
      `Your charging session${p.stationId ? ' has' : ''} started at ${new Date(p.startTime).toLocaleTimeString('en-US')}.`,
  },
  'session.telemetry_push': {
    title: () => 'Charging Update',
    body: (p: SessionTelemetryPushEvent) =>
      `Power: ${p.powerKw?.toFixed(1) ?? '--'} kW | SOC: ${p.socPercent != null ? `${p.socPercent}%` : '--'}` +
      `${p.temperatureC != null ? ` | Temp: ${p.temperatureC.toFixed(1)}°C` : ''}`,
  },
  'session.completed': {
    title: ()        => 'Charging Completed',
    body:  (p: SessionCompletedEvent) =>
      `You consumed ${p.kwhConsumed.toFixed(2)} kWh in ${Math.round(p.durationMinutes)} minutes. Thank you!`,
  },
  'queue.updated': {
    title: ()        => 'Queue Position Updated',
    body:  (p: QueueUpdatedEvent) =>
      p.status === 'called'
        ? `It's your turn! Please navigate to the station immediately.`
        : `Your position in queue is: #${p.position}. Estimated wait: ${p.estimatedWaitMinutes} minutes.`,
  },
  'billing.idle_fee_charged': {
    title: ()        => 'Charger Occupancy Idle Fee',
    body:  (p: BillingIdleFeeChargedEvent) =>
      `Your vehicle remained occupied for ${p.chargeableIdleMinutes + p.idleGraceMinutes} minutes after fully charged ` +
      `(${p.idleGraceMinutes} minutes free grace period). Occupancy fee: ${p.idleFeeVnd.toLocaleString('en-US')} VND ` +
      `(${p.idleFeePerMinuteVnd.toLocaleString('en-US')} VND/minute × ${p.chargeableIdleMinutes} minutes). Please unplug!`,
  },
  'billing.extra_charge': {
    title: ()        => 'Extra Charge Deducted',
    body:  (p: BillingExtraChargeEvent) =>
      `Your session cost a total of ${p.totalFeeVnd.toLocaleString('en-US')} VND ` +
      `(deposit: ${p.depositAmount.toLocaleString('en-US')} VND). ` +
      `Deducted an additional ${p.extraAmountVnd.toLocaleString('en-US')} VND from your wallet.`,
  },
  'billing.refund_issued': {
    title: ()        => 'Refund Issued to Wallet',
    body:  (p: BillingRefundIssuedEvent) =>
      `Session completed. Total fee: ${p.totalFeeVnd.toLocaleString('en-US')} VND. ` +
      `Refunded ${p.refundAmountVnd.toLocaleString('en-US')} VND excess deposit to your wallet.`,
  },
  'wallet.arrears.created': {
    title: ()        => 'Debt Outstanding',
    body:  (p: WalletArrearsCreatedEvent) =>
      `Your wallet balance was insufficient for the charging session. ` +
      `Outstanding debt: ${p.totalOutstanding.toLocaleString('en-US')} VND. ` +
      `Please settle promptly to continue using our services.`,
  },
  'wallet.arrears.cleared': {
    title: ()        => 'Debt Cleared',
    body:  (p: WalletArrearsClearedEvent) =>
      `Your outstanding debt of ${p.clearedAmount.toLocaleString('en-US')} VND has been cleared. ` +
      `You can now book and charge again.`,
  },
  'charger.queue.ready': {
    title: ()        => 'Charger Ready',
    body:  (p: ChargerQueueReadyEvent) => {
      const chargerClean = p.chargerName ? p.chargerName.replace(/^(trụ sạc|trụ)\s+/i, '') : '';
      const stationClean = p.stationName ? p.stationName.replace(/^trạm\s+/i, '') : '';
      const chargerStr = chargerClean ? `Charger ${chargerClean}` : 'Charger';
      const stationStr = stationClean ? ` at ${stationClean}` : '';
      return `${chargerStr}${stationStr} is now ready. Would you like to continue booking?`;
    },
  },
};
