# Business Functions — EV Charging Platform

# IAM Service

## [01] Register Account

- **Actor:** Guest
- **Objective:** Create a new account with email/password
- **Trigger:** `POST /api/v1/auth/register`
- **Flow:**
  1. Validate email does not exist
  2. Hash password with bcrypt
  3. Create User aggregate with status=active
  4. Persist to DB
  5. Publish event `user.registered` via Outbox → RabbitMQ
  6. Return user profile

## [02] Login

- **Actor:** Guest
- **Objective:** Authenticate credentials, issue JWT
- **Trigger:** `POST /api/v1/auth/login`
- **Flow:**
  1. Lookup user by email
  2. Check locked_until (brute-force protection)
  3. Verify password with bcrypt
  4. If MFA enabled → require TOTP token
  5. Create auth_session with refresh_token_hash
  6. Issue JWT accessToken (15m) + refreshToken (7d)
  7. (Optional) Log session / Emit login metrics

## [03] Refresh Access Token

- **Actor:** User
- **Objective:** Extend JWT without re-login
- **Trigger:** `POST /api/v1/auth/refresh`
- **Flow:**
  1. Verify refreshToken signature
  2. Lookup auth_session, check revoked_at IS NULL
  3. Issue new JWT
  4. Rotate refreshToken (delete old, create new)

## [04] Logout

- **Actor:** User
- **Objective:** Revoke session
- **Trigger:** `POST /api/v1/auth/logout`
- **Flow:**
  1. Set revoked_at = NOW() on auth_session
  2. If no sessionId → revoke all sessions

## [05] Assign/Revoke Role

- **Actor:** Admin
- **Objective:** Manage RBAC permissions
- **Trigger:** `POST /api/v1/auth/roles/assign|revoke`
- **Flow:**
  1. Check role exists in roles table
  2. Upsert/Delete record in user_roles
  3. Support expires_at for temporary roles

## [06] MFA Setup & Verify

- **Actor:** User
- **Objective:** Activate two-factor authentication (TOTP)
- **Trigger:** `POST /auth/mfa/setup → /mfa/verify`
- **Flow:**
  1. Generate TOTP secret, create otpauth_url
  2. Save mfa_secret (encrypted) to users
  3. verify: check TOTP token → set mfa_enabled=true
  4. Return backup codes

## [07] Profile Management

- **Actor:** User
- **Objective:** View/Edit personal information
- **Trigger:** `GET|PATCH /api/v1/users/me`
- **Flow:**
  1. GET: return profile from DB
  2. PATCH: update avatarUrl, address
  3. Each change is recorded in audit log

## [08] Vehicle Management

- **Actor:** User
- **Objective:** CRUD user's electric vehicles
- **Trigger:** `POST|PATCH|DELETE /api/v1/users/me/vehicles`
- **Flow:**
  1. Max 5 vehicles per account
  2. Check plateNumber is not duplicate
  3. Save technical specs: batteryCapacityKwh, maxDcPowerKw, defaultChargePort
  4. setPrimary: set default vehicle for AutoCharge

## [09] AutoCharge Configuration

- **Actor:** User
- **Objective:** Register MAC address for automatic vehicle identification
- **Trigger:** `PATCH /users/me/vehicles/:id/autocharge-setup`
- **Flow:**
  1. Save macAddress + vinNumber to vehicle record
  2. Enable autochargeEnabled flag
  3. OCPP Gateway uses MAC to auto-start session when vehicle plugs in

---

# Infrastructure Service (Station)

## [10] Station Management (CRUD)

- **Actor:** Admin
- **Objective:** Create/View/Update/Delete charging stations
- **Trigger:** `POST|GET|PATCH|DELETE /api/v1/stations`
- **Flow:**
  1. Validate GPS coordinates are not duplicate (DuplicateGeoLocation)
  2. Assign station to city_id
  3. Publish StationCreatedEvent / StationUpdatedEvent
  4. DELETE: soft delete (status=inactive)

## [11] Charger Management

- **Actor:** Admin
- **Objective:** Add/Update charger status
- **Trigger:** `POST /stations/:id/chargers | PATCH .../status`
- **Flow:**
  1. Check station is active before adding charger
  2. Validate FSM: AVAILABLE→IN_USE→AVAILABLE | AVAILABLE→FAULTED→OFFLINE→AVAILABLE
  3. external_id UNIQUE (OCPP chargePointId)
  4. Publish ChargerAddedEvent / ChargerStatusChangedEvent → session-service

## [12] View Availability/Pricing

- **Actor:** Public
- **Objective:** Return price quote before booking
- **Trigger:** `GET /stations/:id/chargers/:id/pricing`
- **Flow:**
  1. Lookup current pricing_rule (valid_from ≤ NOW ≤ valid_to)
  2. Match by connector_type, hour, day of week (day_mask)
  3. Calculate estimated deposit = (endTime-startTime) × pricePerKwh × estKwh
  4. Return with idleFeePerMinute, idleGraceMinutes

## [13] Calculate Actual Session Fee

- **Actor:** System
- **Objective:** Calculate exact cost after charging completes
- **Trigger:** `POST .../pricing/calculate-session-fee`
- **Flow:**
  1. Input: actual kwhConsumed + idleMinutes
  2. energyFee = kwhConsumed × pricePerKwh
  3. idleFee = max(0, idleMinutes - idleGraceMinutes) × idleFeePerMinute
  4. Return: {energyFeeVnd, idleFeeVnd, totalVnd}
  5. Called by billing-service after session completion

## [14] Pricing Rules Management (TOU)

- **Actor:** Admin
- **Objective:** CRUD electricity pricing by hour/day/connector type
- **Trigger:** `GET|POST|PATCH /stations/pricing-rules`
- **Flow:**
  1. Support Time-of-Use: hourStart/hourEnd + dayMask
  2. Admin can freely change pricePerKwh, idleFeePerMinute
  3. Deactivate: set valid_to=NOW() (no physical delete)
  4. System always uses the latest active rule

## [15] Incident & Maintenance Management

- **Actor:** Admin/Staff
- **Objective:** Record incidents, schedule station maintenance
- **Trigger:** `POST /stations/incidents | /maintenance`
- **Flow:**
  1. station_incidents: severity (low/medium/high/critical)
  2. station_maintenance: set station downtime
  3. When under maintenance: charger auto-sets OFFLINE

---

# Session Service (Booking & Charging)

## [16] Create Booking

- **Actor:** User
- **Objective:** Reserve a charging slot, auto-deduct deposit
- **Trigger:** `POST /api/v1/bookings`
- **Flow:**
  1. Check user has no arrears (ArrearsGuard)
  2. Check slot is not already booked (avoid overlap)
  3. Call infra-service for price quote → calculate depositAmount
  4. Create Booking aggregate: status=PENDING_PAYMENT
  5. Publish `booking.created` + `booking.deposit_requested`
  6. billing-service receives event → deduct deposit from wallet
  7. After billing ACK → Booking transitions to CONFIRMED + generate QR Token

## [17] Cancel Booking

- **Actor:** User
- **Objective:** Cancel booking, refund deposit
- **Trigger:** `DELETE /api/v1/bookings/:id`
- **Flow:**
  1. Check booking belongs to user
  2. Booking FSM: PENDING_PAYMENT|CONFIRMED → CANCELLED
  3. Publish `booking.cancelled`
  4. billing-service receives event → refund 100% deposit to wallet

## [18] View Bookings

- **Actor:** User
- **Objective:** List and view personal booking details
- **Trigger:** `GET /api/v1/bookings/me | /:id`
- **Flow:**
  1. Pagination (limit/offset)
  2. Details include qrToken (null if not yet confirmed)
  3. Admin/Staff can view all bookings

## [18b] Suggest Optimal Charging Station (Suggest Charger & DP Optimizer)

- **Actor:** User
- **Objective:** Find the optimal charging solution at available stations, matching connector type, maximizing energy received within budget, and prioritizing nearby/less-loaded stations for grid load balancing.
- **Trigger:** `GET /api/v1/bookings/suggest`
- **Flow:**
  1. Receive user coordinates (defaults to Hanoi if not provided), required `connectorType`, budget (`budgetVnd`, default 150,000 VND), and desired charging time range (default next 4 hours).
  2. Divide the requested time range into 30-minute available slots.
  3. Filter all available chargers matching the required connector type and check upcoming bookings to exclude already-booked slots.
  4. Calculate geographic distance from user to each station using the **Haversine formula**:
     $$d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
  5. Call Billing/Pricing API to get TOU (Time of Use) price quote for each available slot of each charger.
  6. Transform the problem into a **0/1 Knapsack problem**:
     - **Knapsack capacity ($W$)**: Available budget converted (divide by 1000, default $W = 150$).
     - **Item weight ($w_i$)** for slot $S_i$: Estimated cost to charge in this slot (in thousands VND):
       $$w_i = \max\left(1, \text{round}\left(\frac{\text{TOU price} \times \text{Charger power} \times 0.5 \text{ hour}}{1000}\right)\right)$$
     - **Item value ($v_i$)** for slot $S_i$: Utility of the charging slot, calculated as energy received adjusted downward based on station load to encourage load balancing:
       $$v_i = \text{Charger power} \times 0.5 \text{ hour} \times (1.0 - 0.5 \times \text{load}_i)$$
       Where $\text{load}_i = \text{busy chargers in slot} / \text{total chargers at station}$.
  7. Solve using Knapsack DP to find the optimal set of slots with total cost $\le W$ and maximum total utility ($\text{totalValue}$).
  8. Calculate composite charger score combining utility and distance:
     $$\text{Score} = \frac{\text{totalValue}}{\text{distanceKm} + 0.1}$$
  9. Sort suggestions descending by `Score` and ascending by distance.
  10. For top 5 suggestions, save slot info to `scheduling_slots` table with `algorithm = 'dp-optimizer'` and `confidence_score = Score`.
  11. Return array of suggested chargers ranked by priority in descending order.


## [19] Smart Queue

- **Actor:** User
- **Objective:** Join queue when station is full
- **Trigger:** `POST|DELETE|GET /api/v1/bookings/queue`
- **Flow:**
  1. Create queue_entry with priority score
  2. When slot becomes available: system auto-calls user in order
  3. Push notification via notification-service
  4. User has 10 minutes to confirm → if not, next in queue

## [20] Start Charging Session (Walk-in)

- **Actor:** User
- **Objective:** Charge without prior booking
- **Trigger:** `POST /api/v1/charging/start`
- **Flow:**
  1. Walk-in flow: only requires {chargerId} from JWT
  2. Check charger is AVAILABLE
  3. Check user has no other active session
  4. Create Session, publish `session.started`
  5. OCPP Gateway receives event → RemoteStartTransaction to charger

## [21] Start Charging Session (With Booking)

- **Actor:** User
- **Objective:** Scan QR at kiosk to start charging
- **Trigger:** `POST /api/v1/charging/start (with bookingId)`
- **Flow:**
  1. Kiosk scans QR → sends {chargerId, bookingId, qrToken}
  2. Verify qrToken (JWT 15 minutes): bookingId + userId match
  3. Check booking is CONFIRMED, correct charger, correct time
  4. Create Session, Booking transitions to CHECKED_IN
  5. Publish `session.started`

## [22] Stop Charging Session

- **Actor:** User/Admin
- **Objective:** End charging session, trigger billing
- **Trigger:** `POST /api/v1/charging/stop/:id`
- **Flow:**
  1. User: check ownership (sessionId must belong to current user)
  2. Admin: force stop without ownership
  3. Session saves endMeterWh, calculate kwhConsumed
  4. Publish `session.completed` {kwhConsumed, idleMinutes}
  5. billing-service: call infra for pricing → deduct from wallet or request additional payment
  6. Charger status → AVAILABLE

## [23] Manual Telemetry Input

- **Actor:** Admin/Staff
- **Objective:** Record measurement data from charger manually
- **Trigger:** `POST /api/v1/charging/telemetry/:id`
- **Flow:**
  1. Validate data (powerKw ≥ 0, socPercent 0-100)
  2. Attach to active session
  3. Publish to ev.telemetry exchange → analytics

---

# Billing Service (Payment & Wallet)

## [24] Top-up Wallet (VNPay)

- **Actor:** User
- **Objective:** Top up via VNPay payment gateway
- **Trigger:** `POST /api/v1/wallet/topup`
- **Flow:**
  1. Create Transaction: type=topup, status=pending
  2. Generate VNPay payment URL
  3. User redirects → VNPay → redirects to /payments/vnpay-return
  4. Callback verifies HMAC-SHA512 checksum
  5. If valid: update Transaction status=completed
  6. Add funds to Wallet, record wallet_ledger
  7. Publish `wallet.topup.completed`

## [25] Pay with Wallet

- **Actor:** User
- **Objective:** Deduct directly from wallet balance
- **Trigger:** `POST /api/v1/wallet/pay`
- **Flow:**
  1. Check wallet.status=active and sufficient balance
  2. Atomic: deduct balance, create transaction, record ledger
  3. Idempotency key prevents double-charge

## [26] Wallet-First Orchestrator

- **Actor:** System
- **Objective:** Prefer wallet, auto-fallback to VNPay
- **Trigger:** `POST /api/v1/payments/pay`
- **Flow:**
  1. Check Idempotency-Key header (required)
  2. If balance sufficient → deduct from wallet
  3. If insufficient → create VNPay URL
  4. Both paths record transaction + ledger

## [27] Refund

- **Actor:** Admin/Staff
- **Objective:** Refund a completed transaction
- **Trigger:** `POST /api/v1/payments/:id/refund`
- **Flow:**
  1. Create transaction: type=refund, linked to original
  2. Add funds back to user's wallet
  3. Publish `payment.refund.completed`
  4. notification-service sends refund notification

## [28] Idle Fee Calculation (Event-driven)

- **Actor:** System
- **Objective:** Auto-calculate overstay fees
- **Trigger:** `Event: session.completed`
- **Flow:**
  1. Consumer receives `session.completed` with idleMinutes
  2. Call infra-service API: POST .../calculate-session-fee
  3. idleFee = max(0, idleMinutes - graceMinutes) × idleFeePerMinute
  4. If idleFee > 0: create Transaction type=idle_fee
  5. Deduct from wallet, if insufficient → create arrears
  6. Publish `billing.idle_fee_charged`
  7. notification-service push: 'You were charged Xk for overstaying Xmin'

## [29] Arrears Management

- **Actor:** System
- **Objective:** Track and recover outstanding debts
- **Trigger:** `Event: wallet.arrears.created`
- **Flow:**
  1. When wallet deduction fails → publish arrears event
  2. session-service updates user_debt_read_models
  3. ArrearsGuard blocks user from creating new bookings
  4. When user tops up sufficient funds → auto-clear arrears
  5. Publish `wallet.arrears.cleared` → unlock user

## [30] Subscribe to Service Plan

- **Actor:** User
- **Objective:** Purchase a subscription plan
- **Trigger:** `POST /api/v1/subscriptions (internal)`
- **Flow:**
  1. Lookup plan in plans table
  2. Deduct from wallet or VNPay
  3. Create subscription record
  4. Set end_date = NOW() + duration_days

---

# Notification Service

## [31] Multi-channel Notification

- **Actor:** System
- **Objective:** Push/In-app notification by event
- **Trigger:** `Event consumers from RabbitMQ`
- **Flow:**
  1. BookingNotificationConsumer: booking.created → 'Booking successful'
  2. ChargingNotificationConsumer: charging.started → 'Charging started'
  3. PaymentNotificationConsumer: payment.success / failed
  4. IdleFeeConsumer: billing.idle_fee_charged → 'Idle fee warning'
  5. QueueNotificationConsumer: queue.updated → 'Your turn'
  6. Send via FcmPushService (stub mode when no key configured)
  7. Save Notification record to DB (in_app channel)

## [32] Register FCM Device

- **Actor:** User
- **Objective:** Register push token to receive notifications
- **Trigger:** `POST /api/v1/devices/register`
- **Flow:**
  1. Save FCM token + platform to devices table
  2. UNIQUE constraint on push_token (upsert)
  3. Support multiple devices per user

## [33] View & Mark Read

- **Actor:** User
- **Objective:** Manage notification inbox
- **Trigger:** `GET /notifications | PATCH /notifications/:id/read`
- **Flow:**
  1. Pagination, filter unreadOnly
  2. Mark read: set read_at = NOW()
  3. Mark all read: batch update

## [34] Notification Preferences

- **Actor:** User
- **Objective:** Toggle channels, quiet hours
- **Trigger:** `GET|PATCH /api/v1/preferences`
- **Flow:**
  1. enablePush, enableEmail, enableSms, enableRealtime
  2. quietHoursStart/End (0-23): disable push during sleep hours
  3. Upsert notification_preferences per user

---

# Analytics Service

## [35] Event Collection & Aggregation

- **Actor:** System
- **Objective:** Listen to all domain events, aggregate into DB
- **Trigger:** `RabbitMQ consumers`
- **Flow:**
  1. SessionEventConsumer: session.completed → daily_station_metrics, hourly_usage_stats
  2. PaymentEventConsumer: payment.completed → revenue_stats
  3. BookingEventConsumer: booking.created/cancelled → booking_stats
  4. Idempotency: processed_events prevents duplicate aggregation
  5. AggregationEngine: upsert (ON CONFLICT DO UPDATE)

## [36] Admin Dashboard

- **Actor:** Admin
- **Objective:** Platform overview in a single call
- **Trigger:** `GET /api/v1/analytics/dashboard`
- **Flow:**
  1. latestKpi: latest platform_kpi_snapshots
  2. revenue30d: daily revenue from revenue_stats
  3. peakHours: top-5 peak hours from hourly_usage_stats
  4. topStations: top-5 stations by session count

## [37] Revenue Analysis

- **Actor:** Admin
- **Objective:** Revenue report by month/day/station
- **Trigger:** `GET /api/v1/analytics/revenue`
- **Flow:**
  1. range=monthly: group by billing_month
  2. range=daily: group by day in last N days
  3. filter by stationId (optional)

## [38] Peak Hours Analysis

- **Actor:** Admin
- **Objective:** Detect peak hours + demand forecast
- **Trigger:** `GET /api/v1/analytics/peak-hours`
- **Flow:**
  1. Aggregate sessions_count by hour_of_day
  2. EWA (Exponential Weighted Average) forecast for next day
  3. Support filter by stationId

## [39] User Behavior

- **Actor:** Admin
- **Objective:** Analyze charging history of a single user
- **Trigger:** `GET /api/v1/analytics/users/:userId`
- **Flow:**
  1. Aggregate from user_behavior_stats
  2. total_sessions, total_kwh, avg_duration_min
  3. daily breakdown for last N days

---

# Telemetry Ingestion Service

## [40] Collect Telemetry from Charger

- **Actor:** Charger firmware / MQTT bridge / Staff
- **Objective:** Receive real-time measurement data from hardware, store in ClickHouse and distribute via event bus
- **Trigger:** `POST /api/v1/telemetry/ingest` or `POST /api/v1/telemetry/ingest/:chargerId/:sessionId`
- **Flow:**
  1. Validate TelemetryReadingVO (powerKw≥0, socPercent 0-100, voltageV≤1000)
  2. normalize() clamp out-of-range values
  3. Write directly to ClickHouse `telemetry_logs` table (time-series store, high-throughput)
  4. TelemetryBuffer batches 10 readings/charger
  5. Flush → publish batch to `ev.telemetry` exchange
  6. analytics-service consumes → updates `hourly_usage_stats`
  7. Return `{ eventId, warnings[] }` — 202 Accepted

---

# OCPP Gateway Service

## [41] Charger Connection Management via OCPP 1.6

- **Actor:** Charger hardware
- **Objective:** Bridge between physical chargers and backend system
- **Trigger:** WebSocket `ws://ev-ocpp-gw:3010/ocpp/:chargerId`
- **Flow:**
  1. Charger connects WebSocket → BootNotification → write to connection registry
  2. Periodic Heartbeat → update lastHeartbeat
  3. StatusNotification → publish `charger.status.changed` → session-service
  4. MeterValues → publish telemetry → telemetry-ingestion-service
  5. RemoteStartTransaction: receive command from session-service → send to charger
  6. RemoteStopTransaction: receive command from session-service → send to charger
  7. StartTransaction/StopTransaction: charger confirms → publish events

---

# Event Flow Summary (RabbitMQ)

```
User registered     → user.registered             → iam (user_profiles, user_fcm_tokens sync)
Booking created     → booking.created             → billing (deduct deposit) + notification
Booking cancelled   → booking.cancelled           → billing (refund) + notification
Session started     → session.started             → ocpp-gw (RemoteStart) + notification + analytics
Session completed   → session.completed           → billing (final charge) + analytics
Charger faulted     → charger.status.changed      → infra (update status) + notification
Payment completed   → payment.completed           → session (confirm) + analytics
Payment failed      → payment.failed              → session (mark failed)
Arrears created     → wallet.arrears.created      → session (lock user) + iam (users_cache sync)
Arrears cleared     → wallet.arrears.cleared      → session (unlock user) + iam (users_cache sync)
Idle fee charged    → billing.idle_fee_charged    → notification (alert user)
Wallet topup        → wallet.topup.completed      → analytics
Telemetry ingested  → ev.telemetry (batch)        → analytics (hourly_usage_stats) [+ ClickHouse direct write]
```
