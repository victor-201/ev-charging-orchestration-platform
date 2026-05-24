# Business Functions — EV Charging Platform

# IAM Service

## [01] Đăng ký tài khoản

- **Actor:** Guest
- **Objective:** Tạo tài khoản mới với email/mật khẩu
- **Trigger:** `POST /api/v1/auth/register`
- **Flow:**
  1. Validate email chưa tồn tại
  2. Hash mật khẩu bcrypt
  3. Tạo User aggregate với status=active
  4. Persist vào DB
  5. Publish event `user.registered` qua Outbox → RabbitMQ
  6. Trả về user profile

## [02] Đăng nhập

- **Actor:** Guest
- **Objective:** Xác thực credentials, phát hành JWT
- **Trigger:** `POST /api/v1/auth/login`
- **Flow:**
  1. Lookup user theo email
  2. Kiểm tra locked_until (brute-force protection)
  3. Verify mật khẩu bcrypt
  4. Nếu MFA enabled → yêu cầu TOTP token
  5. Tạo auth_session với refresh_token_hash
  6. Phát hành JWT accessToken (15m) + refreshToken (7d)
  7. (Optional) Log session / Emit login metrics

## [03] Làm mới Access Token

- **Actor:** User
- **Objective:** Gia hạn JWT không cần đăng nhập lại
- **Trigger:** `POST /api/v1/auth/refresh`
- **Flow:**
  1. Verify refreshToken signature
  2. Lookup auth_session, kiểm tra revoked_at IS NULL
  3. Phát hành JWT mới
  4. Rotate refreshToken (xóa cũ, tạo mới)

## [04] Đăng xuất

- **Actor:** User
- **Objective:** Thu hồi session
- **Trigger:** `POST /api/v1/auth/logout`
- **Flow:**
  1. Set revoked_at = NOW() trên auth_session
  2. Nếu không có sessionId → thu hồi tất cả session

## [05] Gán/Thu hồi Role

- **Actor:** Admin
- **Objective:** Quản lý phân quyền RBAC
- **Trigger:** `POST /api/v1/auth/roles/assign|revoke`
- **Flow:**
  1. Kiểm tra role tồn tại trong bảng roles
  2. Upsert/Delete bản ghi user_roles
  3. Hỗ trợ expires_at cho temporary role

## [06] MFA Setup & Verify

- **Actor:** User
- **Objective:** Kích hoạt xác thực 2 yếu tố (TOTP)
- **Trigger:** `POST /auth/mfa/setup → /mfa/verify`
- **Flow:**
  1. Sinh TOTP secret, tạo otpauth_url
  2. Lưu mfa_secret (encrypted) vào users
  3. verify: kiểm tra TOTP token → set mfa_enabled=true
  4. Trả về backup codes

## [07] Quản lý Profile

- **Actor:** User
- **Objective:** Xem/Sửa thông tin cá nhân
- **Trigger:** `GET|PATCH /api/v1/users/me`
- **Flow:**
  1. GET: trả về profile từ DB
  2. PATCH: cập nhật avatarUrl, address
  3. Mỗi thay đổi ghi vào audit log

## [08] Quản lý Xe

- **Actor:** User
- **Objective:** CRUD xe điện của người dùng
- **Trigger:** `POST|PATCH|DELETE /api/v1/users/me/vehicles`
- **Flow:**
  1. Tối đa 5 xe / tài khoản
  2. Kiểm tra plateNumber không trùng
  3. Lưu thông số kỹ thuật: batteryCapacityKwh, maxDcPowerKw, defaultChargePort
  4. setPrimary: đặt xe mặc định cho AutoCharge

## [09] Cấu hình AutoCharge

- **Actor:** User
- **Objective:** Đăng ký MAC address để tự động nhận dạng xe
- **Trigger:** `PATCH /users/me/vehicles/:id/autocharge-setup`
- **Flow:**
  1. Lưu macAddress + vinNumber vào vehicle record
  2. Bật autochargeEnabled flag
  3. OCPP Gateway dùng MAC để tự start session khi xe cắm

---

# Infrastructure Service (Station)

## [10] Quản lý Trạm sạc (CRUD)

- **Actor:** Admin
- **Objective:** Tạo/Xem/Sửa/Xóa trạm sạc
- **Trigger:** `POST|GET|PATCH|DELETE /api/v1/stations`
- **Flow:**
  1. Validate tọa độ GPS không trùng (DuplicateGeoLocation)
  2. Gắn trạm vào city_id
  3. Publish StationCreatedEvent / StationUpdatedEvent
  4. DELETE: soft delete (status=inactive)

## [11] Quản lý Charger/Súng sạc

- **Actor:** Admin
- **Objective:** Thêm/Sửa trạng thái charger
- **Trigger:** `POST /stations/:id/chargers | PATCH .../status`
- **Flow:**
  1. Kiểm tra station đang active mới cho thêm charger
  2. Validate FSM: AVAILABLE→IN_USE→AVAILABLE | AVAILABLE→FAULTED→OFFLINE→AVAILABLE
  3. external_id UNIQUE (OCPP chargePointId)
  4. Publish ChargerAddedEvent / ChargerStatusChangedEvent → session-service

## [12] Xem lịch trống/Giá sạc

- **Actor:** Public
- **Objective:** Trả báo giá trước khi đặt lịch
- **Trigger:** `GET /stations/:id/chargers/:id/pricing`
- **Flow:**
  1. Lookup pricing_rule hiện tại (valid_from ≤ NOW ≤ valid_to)
  2. Match theo connector_type, giờ, ngày trong tuần (day_mask)
  3. Tính tiền cọc ước tính = (endTime-startTime) × pricePerKwh × estKwh
  4. Trả kèm idleFeePerMinute, idleGraceMinutes

## [13] Tính phí phiên sạc thực tế

- **Actor:** System
- **Objective:** Tính chính xác chi phí sau khi sạc xong
- **Trigger:** `POST .../pricing/calculate-session-fee`
- **Flow:**
  1. Input: kwhConsumed + idleMinutes thực tế
  2. energyFee = kwhConsumed × pricePerKwh
  3. idleFee = max(0, idleMinutes - idleGraceMinutes) × idleFeePerMinute
  4. Trả về: {energyFeeVnd, idleFeeVnd, totalVnd}
  5. Được gọi bởi billing-service sau khi session hoàn thành

## [14] Quản lý Pricing Rules (TOU)

- **Actor:** Admin
- **Objective:** CRUD giá điện theo giờ/ngày/loại connector
- **Trigger:** `GET|POST|PATCH /stations/pricing-rules`
- **Flow:**
  1. Hỗ trợ Time-of-Use: hourStart/hourEnd + dayMask
  2. Admin có thể thay đổi pricePerKwh, idleFeePerMinute tự do
  3. Deactivate: set valid_to=NOW() (không xóa vật lý)
  4. Hệ thống luôn dùng rule mới nhất còn hiệu lực

## [15] Quản lý Sự cố & Bảo trì

- **Actor:** Admin/Staff
- **Objective:** Ghi nhận sự cố, lên lịch bảo trì trạm
- **Trigger:** `POST /stations/incidents | /maintenance`
- **Flow:**
  1. station_incidents: severity (low/medium/high/critical)
  2. station_maintenance: đặt thời gian down của trạm
  3. Khi trạm bảo trì: charger tự động OFFLINE

---

# Session Service (Booking & Charging)

## [16] Đặt lịch sạc (Booking)

- **Actor:** User
- **Objective:** Đặt trước slot sạc, tự động trừ tiền cọc
- **Trigger:** `POST /api/v1/bookings`
- **Flow:**
  1. Kiểm tra user không có arrears (ArrearsGuard)
  2. Kiểm tra slot chưa bị đặt (tránh overlap)
  3. Gọi infra-service lấy báo giá → tính depositAmount
  4. Tạo Booking aggregate: status=PENDING_PAYMENT
  5. Publish `booking.created` + `booking.deposit_requested`
  6. billing-service nhận event → trừ tiền cọc từ ví
  7. Sau khi billing ACK → Booking chuyển CONFIRMED + sinh QR Token

## [17] Hủy Booking

- **Actor:** User
- **Objective:** Hủy đặt lịch, hoàn tiền cọc
- **Trigger:** `DELETE /api/v1/bookings/:id`
- **Flow:**
  1. Kiểm tra booking thuộc về user
  2. Booking FSM: PENDING_PAYMENT|CONFIRMED → CANCELLED
  3. Publish `booking.cancelled`
  4. billing-service nhận event → hoàn 100% tiền cọc vào ví

## [18] Xem lịch đặt

- **Actor:** User
- **Objective:** Danh sách và chi tiết booking cá nhân
- **Trigger:** `GET /api/v1/bookings/me | /:id`
- **Flow:**
  1. Phân trang (limit/offset)
  2. Chi tiết kèm qrToken (null nếu chưa confirmed)
  3. Admin/Staff xem được tất cả booking

## [18b] Đề xuất trạm sạc tối ưu (Suggest Charger & DP Optimizer)

- **Actor:** User
- **Objective:** Tìm phương án sạc tối ưu tại các trạm sạc khả dụng, thỏa mãn loại đầu sạc, tối đa hóa năng lượng nhận được trong tầm ngân sách (Budget) và ưu tiên trạm sạc gần/trạm sạc ít tải hơn để điều phối lưới điện.
- **Trigger:** `GET /api/v1/bookings/suggest`
- **Flow:**
  1. Nhận thông tin tọa độ người dùng (mặc định Hà Nội nếu không truyền), loại cổng sạc yêu cầu (`connectorType`), ngân sách (`budgetVnd`, mặc định 150,000 VND), và khoảng thời gian mong muốn sạc (mặc định là 4 giờ tiếp theo).
  2. Chia nhỏ khoảng thời gian yêu cầu thành các khung giờ trống dài 30 phút (slots).
  3. Lọc tất cả súng sạc khả dụng trong hệ thống khớp với loại đầu sạc yêu cầu và tìm lịch booking sắp tới để loại bỏ các slot đã bị đặt.
  4. Tính khoảng cách địa lý từ người dùng tới từng trạm sạc bằng công thức **Haversine**:
     $$d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
  5. Gọi API Billing/Pricing để lấy báo giá TOU (Time of Use) cho từng slot khả dụng của từng súng sạc.
  6. Chuyển đổi bài toán thành bài toán **Cái balo 0/1 (0/1 Knapsack)**:
     - **Tải trọng Balo ($W$)**: Ngân sách khả dụng được quy đổi (chia cho 1000, mặc định $W = 150$).
     - **Trọng lượng vật phẩm ($w_i$)** cho slot $S_i$: Giá tiền ước tính để sạc trong slot này (quy đổi ra nghìn VND):
       $$w_i = \max\left(1, \text{round}\left(\frac{\text{Giá điện TOU} \times \text{Công suất súng sạc} \times 0.5 \text{ giờ}}{1000}\right)\right)$$
     - **Giá trị vật phẩm ($v_i$)** cho slot $S_i$: Độ hữu dụng của slot sạc, tính bằng năng lượng sạc được điều chỉnh giảm dựa theo mức độ tải của trạm để khuyến khích cân bằng tải:
       $$v_i = \text{Công suất súng sạc} \times 0.5 \text{ giờ} \times (1.0 - 0.5 \times \text{load}_i)$$
       Trong đó $\text{load}_i = \text{số súng sạc bận trong slot} / \text{tổng số súng sạc tại trạm}$.
  7. Giải thuật Quy hoạch động Knapsack tìm ra tập hợp các slot sạc tối ưu có tổng chi phí $\le W$ và có tổng độ hữu dụng ($\text{totalValue}$) cao nhất.
  8. Tính toán điểm số tổng hợp của súng sạc (Score) kết hợp độ hữu dụng và khoảng cách:
     $$\text{Score} = \frac{\text{totalValue}}{\text{distanceKm} + 0.1}$$
  9. Sắp xếp danh sách đề xuất giảm dần theo `Score` và tăng dần theo khoảng cách.
  10. Đối với top 5 đề xuất tốt nhất, lưu thông tin slot vào bảng `scheduling_slots` với cờ `algorithm = 'dp-optimizer'` và điểm tin cậy `confidence_score = Score`.
  11. Trả về mảng các súng sạc đề xuất xếp hạng theo thứ tự ưu tiên giảm dần.


## [19] Hàng đợi thông minh (Smart Queue)

- **Actor:** User
- **Objective:** Đăng ký hàng đợi khi trạm full
- **Trigger:** `POST|DELETE|GET /api/v1/bookings/queue`
- **Flow:**
  1. Tạo queue_entry với priority score
  2. Khi có slot trống: hệ thống tự gọi user theo thứ tự
  3. Push notification qua notification-service
  4. User có 10 phút để xác nhận → nếu không → next in queue

## [20] Bắt đầu phiên sạc (Walk-in)

- **Actor:** User
- **Objective:** Sạc không cần đặt lịch trước
- **Trigger:** `POST /api/v1/charging/start`
- **Flow:**
  1. Flow Walk-in: chỉ cần {chargerId} từ JWT
  2. Kiểm tra charger AVAILABLE
  3. Kiểm tra user không có active session khác
  4. Tạo Session, publish `session.started`
  5. OCPP Gateway nhận event → RemoteStartTransaction tới charger

## [21] Bắt đầu phiên sạc (Có booking)

- **Actor:** User
- **Objective:** Quét QR tại kiosk để bắt đầu sạc
- **Trigger:** `POST /api/v1/charging/start (with bookingId)`
- **Flow:**
  1. Kiosk quét QR → gửi {chargerId, bookingId, qrToken}
  2. Verify qrToken (JWT 15 phút): bookingId + userId khớp
  3. Kiểm tra booking CONFIRMED, đúng charger, đúng thời gian
  4. Tạo Session, Booking chuyển CHECKED_IN
  5. Publish `session.started`

## [22] Dừng phiên sạc

- **Actor:** User/Admin
- **Objective:** Kết thúc phiên sạc, kích hoạt tính tiền
- **Trigger:** `POST /api/v1/charging/stop/:id`
- **Flow:**
  1. User: kiểm tra ownership (sessionId phải thuộc user hiện tại)
  2. Admin: force stop không cần ownership
  3. Session lưu endMeterWh, tính kwhConsumed
  4. Publish `session.completed` {kwhConsumed, idleMinutes}
  5. billing-service: gọi infra tính phí → deduct từ ví hoặc yêu cầu thanh toán thêm
  6. Charger status → AVAILABLE

## [23] Nhập Telemetry thủ công

- **Actor:** Admin/Staff
- **Objective:** Ghi dữ liệu đo từ charger thủ công
- **Trigger:** `POST /api/v1/charging/telemetry/:id`
- **Flow:**
  1. Validate dữ liệu (powerKw ≥ 0, socPercent 0-100)
  2. Gắn vào session đang active
  3. Publish tới ev.telemetry exchange → analytics

---

# Billing Service (Payment & Wallet)

## [24] Nạp tiền vào Ví (VNPay)

- **Actor:** User
- **Objective:** Nạp tiền qua cổng VNPay
- **Trigger:** `POST /api/v1/wallet/topup`
- **Flow:**
  1. Tạo Transaction: type=topup, status=pending
  2. Sinh VNPay payment URL
  3. User redirect → VNPay → redirect về /payments/vnpay-return
  4. Callback verify HMAC-SHA512 checksum
  5. Nếu hợp lệ: update Transaction status=completed
  6. Cộng tiền vào Wallet, ghi wallet_ledger
  7. Publish `wallet.topup.completed`

## [25] Thanh toán bằng Ví

- **Actor:** User
- **Objective:** Trừ tiền trực tiếp từ số dư ví
- **Trigger:** `POST /api/v1/wallet/pay`
- **Flow:**
  1. Kiểm tra wallet.status=active và số dư đủ
  2. Atomic: trừ balance, tạo transaction, ghi ledger
  3. Idempotency key ngăn double-charge

## [26] Wallet-First Orchestrator

- **Actor:** System
- **Objective:** Ưu tiên ví, fallback VNPay tự động
- **Trigger:** `POST /api/v1/payments/pay`
- **Flow:**
  1. Kiểm tra Idempotency-Key header (bắt buộc)
  2. Nếu balance đủ → deduct từ ví
  3. Nếu không đủ → tạo VNPay URL
  4. Cả 2 path đều ghi transaction + ledger

## [27] Hoàn tiền (Refund)

- **Actor:** Admin/Staff
- **Objective:** Hoàn tiền giao dịch đã completed
- **Trigger:** `POST /api/v1/payments/:id/refund`
- **Flow:**
  1. Tạo transaction: type=refund, linked to original
  2. Cộng tiền vào ví người dùng
  3. Publish `payment.refund.completed`
  4. notification-service gửi thông báo hoàn tiền

## [28] Tính phí Idle Fee (Event-driven)

- **Actor:** System
- **Objective:** Tự động tính phí đỗ quá giờ
- **Trigger:** `Event: session.completed`
- **Flow:**
  1. Consumer nhận `session.completed` với idleMinutes
  2. Gọi infra-service API: POST .../calculate-session-fee
  3. idleFee = max(0, idleMinutes - graceMinutes) × idleFeePerMinute
  4. Nếu idleFee > 0: tạo Transaction type=idle_fee
  5. Deduct từ ví, nếu ví không đủ → tạo arrears
  6. Publish `billing.idle_fee_charged`
  7. notification-service push: 'Bạn bị phạt Xk vì đỗ quá Xph'

## [29] Quản lý Công nợ (Arrears)

- **Actor:** System
- **Objective:** Theo dõi và thu hồi nợ phát sinh
- **Trigger:** `Event: wallet.arrears.created`
- **Flow:**
  1. Khi trừ tiền thất bại → publish arrears event
  2. session-service cập nhật user_debt_read_models
  3. ArrearsGuard chặn user tạo booking mới
  4. Khi user nạp tiền đủ → auto-clear arrears
  5. Publish `wallet.arrears.cleared` → mở khóa user

## [30] Đăng ký Gói dịch vụ

- **Actor:** User
- **Objective:** Mua subscription plan
- **Trigger:** `POST /api/v1/subscriptions (internal)`
- **Flow:**
  1. Lookup plan trong bảng plans
  2. Deduct từ ví hoặc VNPay
  3. Tạo subscription record
  4. set end_date = NOW() + duration_days

---

# Notification Service

## [31] Gửi thông báo đa kênh

- **Actor:** System
- **Objective:** Push/In-app notification theo event
- **Trigger:** `Event consumers từ RabbitMQ`
- **Flow:**
  1. BookingNotificationConsumer: booking.created → 'Đặt lịch thành công'
  2. ChargingNotificationConsumer: charging.started → 'Bắt đầu sạc'
  3. PaymentNotificationConsumer: payment.success / failed
  4. IdleFeeConsumer: billing.idle_fee_charged → 'Cảnh báo phí đỗ'
  5. QueueNotificationConsumer: queue.updated → 'Đến lượt bạn'
  6. Gửi qua FcmPushService (stub mode khi không có key)
  7. Ghi Notification record vào DB (in_app channel)

## [32] Đăng ký thiết bị FCM

- **Actor:** User
- **Objective:** Đăng ký push token để nhận thông báo
- **Trigger:** `POST /api/v1/devices/register`
- **Flow:**
  1. Lưu FCM token + platform vào bảng devices
  2. UNIQUE constraint trên push_token (upsert)
  3. Hỗ trợ đa thiết bị per user

## [33] Xem & Đánh dấu đã đọc

- **Actor:** User
- **Objective:** Quản lý inbox thông báo
- **Trigger:** `GET /notifications | PATCH /notifications/:id/read`
- **Flow:**
  1. Phân trang, lọc unreadOnly
  2. Mark read: set read_at = NOW()
  3. Mark all read: batch update

## [34] Cài đặt thông báo

- **Actor:** User
- **Objective:** Tắt/Bật từng kênh, giờ im lặng
- **Trigger:** `GET|PATCH /api/v1/preferences`
- **Flow:**
  1. enablePush, enableEmail, enableSms, enableRealtime
  2. quietHoursStart/End (0-23): tắt push trong giờ ngủ
  3. Upsert notification_preferences per user

---

# Analytics Service

## [35] Thu thập & Tổng hợp Events

- **Actor:** System
- **Objective:** Lắng nghe toàn bộ domain events, aggreggate vào DB
- **Trigger:** `RabbitMQ consumers`
- **Flow:**
  1. SessionEventConsumer: session.completed → daily_station_metrics, hourly_usage_stats
  2. PaymentEventConsumer: payment.completed → revenue_stats
  3. BookingEventConsumer: booking.created/cancelled → booking_stats
  4. Idempotency: processed_events ngăn duplicate aggregation
  5. AggregationEngine: upsert (ON CONFLICT DO UPDATE)

## [36] Dashboard Admin

- **Actor:** Admin
- **Objective:** Tổng quan toàn platform trong 1 call
- **Trigger:** `GET /api/v1/analytics/dashboard`
- **Flow:**
  1. latestKpi: platform_kpi_snapshots mới nhất
  2. revenue30d: daily revenue từ revenue_stats
  3. peakHours: top-5 giờ cao nhất từ hourly_usage_stats
  4. topStations: top-5 trạm theo session count

## [37] Phân tích Doanh thu

- **Actor:** Admin
- **Objective:** Báo cáo doanh thu theo tháng/ngày/trạm
- **Trigger:** `GET /api/v1/analytics/revenue`
- **Flow:**
  1. range=monthly: group by billing_month
  2. range=daily: group by ngày trong N ngày gần nhất
  3. filter theo stationId tùy chọn

## [38] Phân tích Giờ cao điểm

- **Actor:** Admin
- **Objective:** Phát hiện peak hours + dự báo nhu cầu
- **Trigger:** `GET /api/v1/analytics/peak-hours`
- **Flow:**
  1. Tổng hợp sessions_count theo hour_of_day
  2. EWA (Exponential Weighted Average) forecast cho ngày mai
  3. Hỗ trợ filter theo stationId

## [39] Hành vi người dùng

- **Actor:** Admin
- **Objective:** Phân tích lịch sử sạc của 1 user
- **Trigger:** `GET /api/v1/analytics/users/:userId`
- **Flow:**
  1. Tổng hợp từ user_behavior_stats
  2. total_sessions, total_kwh, avg_duration_min
  3. daily breakdown N ngày gần nhất

---

# Telemetry Ingestion Service

## [40] Thu thập Telemetry từ Charger

- **Actor:** Charger firmware / MQTT bridge / Staff
- **Objective:** Nhận dữ liệu đo lường realtime từ phần cứng, lưu vào ClickHouse và phát tán qua event bus
- **Trigger:** `POST /api/v1/telemetry/ingest` hoặc `POST /api/v1/telemetry/ingest/:chargerId/:sessionId`
- **Flow:**
  1. Validate TelemetryReadingVO (powerKw≥0, socPercent 0-100, voltageV≤1000)
  2. normalize() clamp các giá trị ngoài ngưỡng
  3. Ghi trực tiếp vào ClickHouse bảng `telemetry_logs` (time-series store, high-throughput)
  4. TelemetryBuffer gom batch 10 readings/charger
  5. Flush → publish batch lên `ev.telemetry` exchange
  6. analytics-service consume → cập nhật `hourly_usage_stats`
  7. Trả về `{ eventId, warnings[] }` — 202 Accepted

---

# OCPP Gateway Service

## [41] Quản lý kết nối Charger qua OCPP 1.6

- **Actor:** Charger hardware
- **Objective:** Cầu nối giữa charger vật lý và hệ thống backend
- **Trigger:** WebSocket `ws://ev-ocpp-gw:3010/ocpp/:chargerId`
- **Flow:**
  1. Charger kết nối WebSocket → BootNotification → ghi vào connection registry
  2. Heartbeat định kỳ → cập nhật lastHeartbeat
  3. StatusNotification → publish `charger.status.changed` → session-service
  4. MeterValues → publish telemetry → telemetry-ingestion-service
  5. RemoteStartTransaction: nhận command từ session-service → gửi tới charger
  6. RemoteStopTransaction: nhận command từ session-service → gửi tới charger
  7. StartTransaction/StopTransaction: charger confirm → publish events

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
Telemetry ingested  → ev.telemetry (batch)        → analytics (hourly_usage_stats) [+ ClickHouse write trực tiếp]
```
