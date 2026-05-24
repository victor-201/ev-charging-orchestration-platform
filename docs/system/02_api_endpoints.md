# API Endpoints — EV Charging Platform

## SERVICE: IAM Service

**Base path:** `http://localhost:8000/api/v1` | **Container:** `ev-iam` | **Port:** 3001

### [01] [POST] /api/v1/auth/register

- **Auth:** Public | **Roles:** —
- **Name:** Đăng ký tài khoản
- **Request (Body):**
  ```json
  {
    "email": "string (email format)",
    "password": "string (min 8 chars)",
    "fullName": "string (min 2 chars)",
    "phone": "string (optional, regex: ^\\+?[0-9]{9,15}$)",
    "dateOfBirth": "string (YYYY-MM-DD)"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "id": "uuid",
    "email": "string",
    "fullName": "string",
    "phone": "string",
    "dateOfBirth": "string",
    "roles": ["user"],
    "createdAt": "iso-date"
  }
  ```


### [02] [POST] /api/v1/auth/verify-email

- **Auth:** Public | **Roles:** —
- **Name:** Xác thực email qua Token hoặc Code
- **Request (Body):**
  ```json
  {
    "token": "string (optional, JWT link)",
    "code": "string (optional, 6-digit code)",
    "email": "string (required if using code)"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "message": "Email verified successfully",
    "accessToken": "string (JWT)",
    "refreshToken": "string (JWT)",
    "expiresIn": 900
  }
  ```

### [03] [POST] /api/v1/auth/resend-verification

- **Auth:** Public | **Roles:** —
- **Name:** Gửi lại email xác thực
- **Request (Body):**
  ```json
  {
    "email": "string"
  }
  ```
- **Response (204 No Content):** Empty
### [04] [POST] /api/v1/auth/login

- **Auth:** Public | **Roles:** —
- **Name:** Đăng nhập, nhận JWT
- **Request (Body):**
  ```json
  {
    "email": "string (email format)",
    "password": "string",
    "mfaToken": "string (optional, 6 digits)"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "accessToken": "string (JWT)",
    "refreshToken": "string (JWT)",
    "expiresIn": "number (seconds)"
  }
  ```

### [05] [POST] /api/v1/auth/refresh

- **Auth:** Public | **Roles:** —
- **Name:** Làm mới Access Token
- **Request (Body):**
  ```json
  {
    "refreshToken": "string (JWT)"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "accessToken": "string (JWT)",
    "refreshToken": "string (JWT)"
  }
  ```

### [06] [POST] /api/v1/auth/logout

- **Auth:** Bearer | **Roles:** User/Admin
- **Name:** Đăng xuất, thu hồi session
- **Request (Body):**
  ```json
  {
    "sessionId": "uuid (optional)"
  }
  ```
- **Response (204 No Content):** Empty

### [07] [GET] /api/v1/auth/me

- **Auth:** Bearer | **Roles:** User/Admin
- **Name:** Lấy thông tin user hiện tại (từ JWT)
- **Request:** Empty
- **Response (200 OK):**
  ```json
  {
    "id": "uuid",
    "email": "string",
    "roles": ["string"]
  }
  ```

### [08] [PATCH] /api/v1/auth/change-password

- **Auth:** Bearer | **Roles:** User
- **Name:** Đổi mật khẩu
- **Request (Body):**
  ```json
  {
    "currentPassword": "string",
    "newPassword": "string (min 8 chars)"
  }
  ```
- **Response (204 No Content):** Empty

### [09] [GET] /api/v1/auth/sessions

- **Auth:** Bearer | **Roles:** User
- **Name:** Danh sách phiên đăng nhập
- **Request:** Empty
- **Response (200 OK):**
  ```json
  [
    {
      "id": "uuid",
      "ip": "string",
      "userAgent": "string",
      "createdAt": "iso-date"
    }
  ]
  ```

### [10] [DELETE] /api/v1/auth/sessions/:id

- **Auth:** Bearer | **Roles:** User
- **Name:** Thu hồi 1 session
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (204 No Content):** Empty

### [11] [DELETE] /api/v1/auth/sessions

- **Auth:** Bearer | **Roles:** User
- **Name:** Thu hồi tất cả session
- **Request:** Empty
- **Response (204 No Content):** Empty

### [12] [POST] /api/v1/auth/roles/assign

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Gán role cho user
- **Request (Body):**
  ```json
  {
    "userId": "uuid",
    "roleName": "string",
    "expiresAt": "iso-date (optional)"
  }
  ```
- **Response (204 No Content):** Empty

### [13] [POST] /api/v1/auth/roles/revoke

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Gỡ role khỏi user
- **Request (Body):**
  ```json
  {
    "userId": "uuid",
    "roleName": "string"
  }
  ```
- **Response (204 No Content):** Empty

### [14] [POST] /api/v1/auth/mfa/setup

- **Auth:** Bearer | **Roles:** User
- **Name:** Khởi tạo TOTP MFA
- **Request:** Empty
- **Response (200 OK):**
  ```json
  {
    "otpauth_url": "string (qrcode format)",
    "secret": "string"
  }
  ```

### [15] [POST] /api/v1/auth/mfa/verify

- **Auth:** Bearer | **Roles:** User
- **Name:** Xác minh & kích hoạt MFA
- **Request (Body):**
  ```json
  {
    "token": "string (6 chars)"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "backupCodes": ["string"]
  }
  ```

### [16] [POST] /api/v1/auth/mfa/disable

- **Auth:** Bearer | **Roles:** User
- **Name:** Tắt MFA
- **Request (Body):**
  ```json
  {
    "password": "string"
  }
  ```
- **Response (204 No Content):** Empty

### [17] [GET] /api/v1/users/me

- **Auth:** Bearer | **Roles:** User
- **Name:** Lấy profile đầy đủ
- **Request:** Empty
- **Response (200 OK):**
  ```json
  {
    "id": "uuid",
    "fullName": "string",
    "phone": "string",
    "avatarUrl": "string (url)",
    "address": "string",
    "dateOfBirth": "string (YYYY-MM-DD)",
    "createdAt": "iso-date"
  }
  ```

### [18] [PATCH] /api/v1/users/me

- **Auth:** Bearer | **Roles:** User
- **Name:** Cập nhật profile
- **Request (Body):**
  ```json
  {
    "avatarUrl": "string (optional, url format)",
    "address": "string (optional)"
  }
  ```
- **Response (200 OK):** Updated Profile JSON

### [19] [DELETE] /api/v1/users/me

- **Auth:** Bearer | **Roles:** User
- **Name:** Xóa mềm tài khoản
- **Request:** Empty
- **Response (204 No Content):** Empty

### [20] [GET] /api/v1/users/me/audit-log

- **Auth:** Bearer | **Roles:** User
- **Name:** Lịch sử thay đổi profile
- **Request (Query):**
  ```json
  {
    "limit": "number (optional, default 20)"
  }
  ```
- **Response (200 OK):**
  ```json
  [
    {
      "action": "string",
      "changedAt": "iso-date",
      "details": "object (optional)"
    }
  ]
  ```

### [21] [GET] /api/v1/users/me/vehicles

- **Auth:** Bearer | **Roles:** User
- **Name:** Danh sách xe của tôi
- **Request:** Empty
- **Response (200 OK):**
  ```json
  [
    {
      "id": "uuid",
      "brand": "string",
      "modelName": "string",
      "year": "number",
      "plateNumber": "string",
      "color": "string",
      "batteryCapacityKwh": "number",
      "macAddress": "string (nullable)",
      "vinNumber": "string (nullable)",
      "autochargeEnabled": "boolean",
      "isPrimary": "boolean"
    }
  ]
  ```

### [22] [POST] /api/v1/users/me/vehicles

- **Auth:** Bearer | **Roles:** User
- **Name:** Thêm xe mới
- **Request (Body):**
  ```json
  {
    "brand": "string",
    "modelName": "string",
    "year": "number",
    "plateNumber": "string",
    "color": "string",
    "batteryCapacityKwh": "number",
    "macAddress": "string (optional, format: XX:XX:XX...)",
    "vinNumber": "string (optional)"
  }
  ```
- **Response (201 Created):** Vehicle JSON

### [23] [PATCH] /api/v1/users/me/vehicles/:id

- **Auth:** Bearer | **Roles:** User
- **Name:** Cập nhật xe
- **Request (Path Params & Body):**
  ```json
  // Path Params
  {
    "id": "uuid"
  }
  // Body
  {
    "color": "string (optional)"
  }
  ```
- **Response (200 OK):** Updated Vehicle JSON

### [24] [DELETE] /api/v1/users/me/vehicles/:id

- **Auth:** Bearer | **Roles:** User
- **Name:** Xóa xe
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (204 No Content):** Empty

### [25] [PATCH] /api/v1/users/me/vehicles/:id/primary

- **Auth:** Bearer | **Roles:** User
- **Name:** Đặt xe mặc định
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (204 No Content):** Empty

### [26] [GET] /api/v1/users/me/vehicles/:id/audit-log

- **Auth:** Bearer | **Roles:** User
- **Name:** Lịch sử thay đổi xe
- **Request (Path Params & Query):**
  ```json
  // Path Params
  {
    "id": "uuid"
  }
  // Query
  {
    "limit": "number (optional)"
  }
  ```
- **Response (200 OK):**
  ```json
  [
    {
      "action": "string",
      "changedAt": "iso-date",
      "details": "object"
    }
  ]
  ```


### [27] [GET] /api/v1/staff

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Danh sách nhân viên (phân trang)
- **Request (Query):**
  ```json
  {
    "position": "string (OPERATOR, MANAGER, TECHNICIAN, SECURITY)",
    "shift": "string (MORNING, AFTERNOON, NIGHT)",
    "limit": "number (optional, default 20)",
    "offset": "number (optional, default 0)"
  }
  ```
- **Response (200 OK):** Array of StaffProfileDto

### [28] [POST] /api/v1/staff

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Thêm hồ sơ nhân viên mới
- **Request (Body):**
  ```json
  {
    "userId": "uuid",
    "position": "string",
    "shift": "string",
    "notes": "string (optional)"
  }
  ```
- **Response (201 Created):** StaffProfileDto

### [29] [PATCH] /api/v1/staff/:id

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Cập nhật hồ sơ nhân viên
- **Request (Path Params & Body):**
  ```json
  // Path Params
  {
    "id": "uuid"
  }
  // Body
  {
    "position": "string (optional)",
    "shift": "string (optional)",
    "status": "string (optional: ACTIVE, INACTIVE)"
  }
  ```
- **Response (200 OK):** Updated StaffProfileDto

### [30] [POST] /api/v1/attendance/check-in

- **Auth:** Bearer | **Roles:** Staff
- **Name:** Điểm danh vào ca (Check-in)
- **Request (Body):**
  ```json
  {
    "latitude": "number",
    "longitude": "number",
    "stationId": "uuid (optional)"
  }
  ```
- **Response (201 Created):** AttendanceDto

### [31] [POST] /api/v1/attendance/check-out

- **Auth:** Bearer | **Roles:** Staff
- **Name:** Điểm danh ra ca (Check-out)
- **Request (Body):**
  ```json
  {
    "latitude": "number",
    "longitude": "number"
  }
  ```
- **Response (200 OK):** AttendanceDto

### [32] [GET] /api/v1/attendance

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Xem lịch sử điểm danh (Admin view)
- **Request (Query):**
  ```json
  {
    "userId": "uuid (optional)",
    "stationId": "uuid (optional)",
    "fromDate": "iso-date (optional)",
    "toDate": "iso-date (optional)",
    "limit": "number",
    "offset": "number"
  }
  ```
- **Response (200 OK):** Array of AttendanceDto
### [33] [PATCH] /api/v1/users/me/vehicles/:id/autocharge-setup

- **Auth:** Bearer | **Roles:** User
- **Name:** Cấu hình AutoCharge
- **Request (Path Params & Body):**
  ```json
  // Path Params
  {
    "id": "uuid"
  }
  // Body
  {
    "macAddress": "string (optional, format: XX:XX:XX...)",
    "vinNumber": "string (optional, 17 characters)",
    "autochargeEnabled": "boolean (optional)"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "id": "uuid",
    "macAddress": "string (nullable)",
    "vinNumber": "string (nullable)",
    "autochargeEnabled": "boolean",
    "version": "number"
  }
  ```

---

## SERVICE: Infrastructure Service (Station)

**Base path:** `http://localhost:8000/api/v1/stations` | **Container:** `ev-infrastructure` | **Port:** 3003

### [34] [GET] /api/v1/stations

- **Auth:** Public | **Roles:** —
- **Name:** Danh sách trạm sạc (phân trang)
- **Request (Query):**
  ```json
  {
    "cityId": "string (optional)",
    "status": "string (optional: ACTIVE, INACTIVE, MAINTENANCE)",
    "limit": "number (optional, default 20)",
    "offset": "number (optional, default 0)"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "items": [
      {
        "id": "uuid",
        "name": "string",
        "address": "string",
        "latitude": "number",
        "longitude": "number",
        "status": "string",
        "totalChargers": "number",
        "availableChargers": "number"
      }
    ],
    "total": "number"
  }
  ```

### [35] [POST] /api/v1/stations

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Tạo trạm sạc mới
- **Request (Body):**
  ```json
  {
    "name": "string",
    "address": "string",
    "cityId": "string",
    "latitude": "number (-90 to 90)",
    "longitude": "number (-180 to 180)",
    "ownerName": "string (optional)"
  }
  ```
- **Response (201 Created):** Station JSON


### [36] [GET] /api/v1/stations/nearby

- **Auth:** Public | **Roles:** —
- **Name:** Tìm trạm sạc gần đây (Geospatial)
- **Request (Query):**
  ```json
  {
    "lat": "number",
    "lng": "number",
    "radiusKm": "number (default 10)",
    "limit": "number (default 20)"
  }
  ```
- **Response (200 OK):** Array of StationDto (with distanceKm)

### [37] [GET] /api/v1/stations/by-charger/:chargerId

- **Auth:** Public | **Roles:** —
- **Name:** Lấy thông tin trạm theo chargerId (lookup ngược)
- **Request (Path Params):**
  ```json
  {
    "chargerId": "uuid"
  }
  ```
- **Response (200 OK):** Station JSON + charger detail

### [38] [GET] /api/v1/stations/cities

- **Auth:** Public | **Roles:** —
- **Name:** Danh sách các thành phố có trạm sạc
- **Request:** Empty
- **Response (200 OK):** Array of CityDto { id, name, stationCount }
### [39] [GET] /api/v1/stations/:id

- **Auth:** Public | **Roles:** —
- **Name:** Chi tiết trạm
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (200 OK):** Station JSON + "chargers" array

### [40] [GET] /api/v1/stations/:stationId/chargers

- **Auth:** Public | **Roles:** —
- **Name:** Danh sách charger của một trạm
- **Request (Path Params):**
  ```json
  {
    "stationId": "uuid"
  }
  ```
- **Response (200 OK):** Array of ChargerDto

### [41] [PATCH] /api/v1/stations/:id

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Cập nhật thông tin trạm
- **Request (Path Params & Body):**
  ```json
  // Path Params
  {
    "id": "uuid"
  }
  // Body
  {
    "name": "string (optional)",
    "address": "string (optional)",
    "status": "string (optional)"
  }
  ```
- **Response (200 OK):** Updated Station JSON

### [42] [DELETE] /api/v1/stations/:id

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Vô hiệu hóa trạm
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (204 No Content):** Empty

### [43] [POST] /api/v1/stations/:stationId/chargers

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Thêm charger vào trạm
- **Request (Path Params & Body):**
  ```json
  // Path Params
  {
    "stationId": "uuid"
  }
  // Body
  {
    "name": "string",
    "externalId": "string (OCPP identifier)",
    "maxPowerKw": "number",
    "connectorType": "string (enum: CCS2, CHAdeMO, Type2)"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "id": "uuid",
    "stationId": "uuid",
    "name": "string",
    "externalId": "string",
    "maxPowerKw": "number",
    "connectorType": "string",
    "status": "AVAILABLE"
  }
  ```

### [44] [PATCH] /api/v1/stations/:stationId/chargers/:chargerId/status

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Cập nhật trạng thái charger
- **Request (Path Params & Body):**
  ```json
  // Path Params
  {
    "stationId": "uuid",
    "chargerId": "uuid"
  }
  // Body
  {
    "status": "string (AVAILABLE, CHARGING, FAULTED, MAINTENANCE)"
  }
  ```
- **Response (200 OK):** Updated Charger JSON

### [45] [GET] /api/v1/stations/:stationId/chargers/:chargerId/pricing

- **Auth:** Public | **Roles:** —
- **Name:** Xem báo giá sạc
- **Request (Path Params & Query):**
  ```json
  // Path Params
  {
    "stationId": "uuid",
    "chargerId": "uuid"
  }
  // Query
  {
    "connectorType": "string",
    "startTime": "iso-date",
    "endTime": "iso-date"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "pricePerKwh": "number (VND)",
    "idleFeePerMinute": "number (VND)",
    "totalEstimateVnd": "number"
  }
  ```

### [46] [POST] /api/v1/stations/:stationId/chargers/:chargerId/pricing/calculate-session-fee

- **Auth:** Public | **Roles:** —
- **Name:** Tính phí session thực tế (internal)
- **Request (Path Params & Body):**
  ```json
  // Path Params
  {
    "stationId": "uuid",
    "chargerId": "uuid"
  }
  // Body
  {
    "connectorType": "string",
    "startTime": "iso-date",
    "kwhConsumed": "number",
    "idleMinutes": "number"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "energyFeeVnd": "number",
    "idleFeeVnd": "number",
    "totalVnd": "number"
  }
  ```

### [47] [GET] /api/v1/stations/pricing-rules

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Danh sách pricing rules
- **Request (Query):**
  ```json
  {
    "stationId": "uuid (optional)",
    "activeOnly": "boolean (optional)"
  }
  ```
- **Response (200 OK):**
  ```json
  [
    {
      "id": "uuid",
      "stationId": "uuid",
      "connectorType": "string",
      "pricePerKwh": "number",
      "idleFeePerMinute": "number",
      "validFrom": "iso-date",
      "validTo": "iso-date (nullable)",
      "active": "boolean"
    }
  ]
  ```

### [48] [POST] /api/v1/stations/pricing-rules

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Tạo pricing rule mới (TOU/Idle)
- **Request (Body):**
  ```json
  {
    "stationId": "uuid",
    "connectorType": "string",
    "validFrom": "iso-date",
    "validTo": "iso-date (optional)",
    "hourStart": "number (optional, 0-23)",
    "hourEnd": "number (optional, 0-23)",
    "dayMask": "number (optional, bitmask)",
    "pricePerKwh": "number",
    "idleGraceMinutes": "number (optional)",
    "idleFeePerMinute": "number (optional)",
    "label": "string (optional)"
  }
  ```
- **Response (201 Created):** Pricing Rule JSON

### [49] [PATCH] /api/v1/stations/pricing-rules/:ruleId

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Cập nhật pricing rule
- **Request (Path Params & Body):**
  ```json
  // Path Params
  {
    "ruleId": "uuid"
  }
  // Body: Các field giống POST nhưng đều optional
  ```
- **Response (200 OK):** Updated Pricing Rule JSON

### [50] [PATCH] /api/v1/stations/pricing-rules/:ruleId/deactivate

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Vô hiệu hóa pricing rule
- **Request (Path Params):**
  ```json
  {
    "ruleId": "uuid"
  }
  ```
- **Response (204 No Content):** Empty
### [51] [GET] /api/v1/stations/incidents

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Danh sách sự cố trạm sạc
- **Request (Query):**
  ```json
  {
    "stationId": "uuid (optional)",
    "severity": "string (LOW, MEDIUM, HIGH, CRITICAL)",
    "status": "string (PENDING_CONFIRMATION, RESOLVED)",
    "limit": "number"
  }
  ```
- **Response (200 OK):** IncidentDto Array

### [52] [POST] /api/v1/stations/incidents

- **Auth:** Bearer | **Roles:** Staff/User
- **Name:** Báo cáo sự cố mới
- **Request (Body):**
  ```json
  {
    "stationId": "uuid",
    "chargerId": "uuid (optional)",
    "description": "string",
    "severity": "string",
    "reportedBy": "uuid (optional)"
  }
  ```
- **Response (201 Created):** IncidentDto

### [53] [PATCH] /api/v1/stations/incidents/:id

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Xử lý sự cố
- **Request (Body):**
  ```json
  {
    "status": "string (RESOLVED, REJECTED)",
    "resolutionNote": "string"
  }
  ```
- **Response (200 OK):** IncidentDto

### [54] [GET] /api/v1/stations/maintenance

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Lịch bảo trì trạm sạc
- **Request (Query):**
  ```json
  {
    "stationId": "uuid",
    "status": "string (SCHEDULED, IN_PROGRESS, COMPLETED)"
  }
  ```
- **Response (200 OK):** MaintenanceDto Array

### [55] [POST] /api/v1/stations/maintenance

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Lên lịch bảo trì
- **Request (Body):**
  ```json
  {
    "stationId": "uuid",
    "scheduledStartTime": "iso-date",
    "scheduledEndTime": "iso-date",
    "reason": "string",
    "technicianId": "uuid"
  }
  ```
- **Response (201 Created):** MaintenanceDto


---

## SERVICE: Session Service (Booking & Charging)

**Base paths:** `/api/v1/bookings`, `/api/v1/charging` | **Container:** `ev-session` | **Port:** 3004

### [56] [GET] /api/v1/bookings/availability

- **Auth:** Bearer | **Roles:** User
- **Name:** Xem lịch trống/bận theo ngày
- **Request (Query):**
  ```json
  {
    "chargerId": "uuid",
    "date": "iso-date (YYYY-MM-DD)",
    "stationId": "uuid (optional)",
    "connectorType": "string (optional)"
  }
  ```
- **Response (200 OK):**
  ```json
  [
    {
      "slot": "string (e.g. 08:00)",
      "isBooked": "boolean"
    }
  ]
  ```

### [57] [GET] /api/v1/bookings/me

- **Auth:** Bearer | **Roles:** User
- **Name:** Lịch đặt của tôi
- **Request (Query):**
  ```json
  {
    "limit": "number (optional, default 20)",
    "offset": "number (optional, default 0)"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "items": [
      {
        "id": "uuid",
        "userId": "uuid",
        "chargerId": "uuid",
        "startTime": "iso-date",
        "endTime": "iso-date",
        "status": "string (pending_payment, confirmed, completed, cancelled, expired, no_show)",
        "durationMinutes": "number",
        "qrToken": "string (nullable)",
        "depositAmount": "number",
        "createdAt": "iso-date"
      }
    ],
    "total": "number"
  }
  ```

### [58] [POST] /api/v1/bookings

- **Auth:** Bearer | **Roles:** User
- **Name:** Tạo booking mới (auto trừ tiền cọc)
- **Request (Body):**
  ```json
  {
    "chargerId": "uuid",
    "stationId": "uuid",
    "connectorType": "string",
    "startTime": "iso-date",
    "endTime": "iso-date"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "id": "uuid",
    "userId": "uuid",
    "chargerId": "uuid",
    "startTime": "iso-date",
    "endTime": "iso-date",
    "status": "string",
    "durationMinutes": "number",
    "qrToken": "string (nullable)",
    "depositAmount": "number",
    "createdAt": "iso-date"
  }
  ```

### [59] [GET] /api/v1/bookings/:id

- **Auth:** Bearer | **Roles:** User/Admin
- **Name:** Chi tiết booking
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (200 OK):** Booking JSON (giống item của /bookings/me)

### [60] [DELETE] /api/v1/bookings/:id

- **Auth:** Bearer | **Roles:** User
- **Name:** Hủy booking (hoàn tiền cọc 100%)
- **Request (Path Params & Body):**
  ```json
  // Path Params
  {
    "id": "uuid"
  }
  // Body
  {
    "reason": "string (optional)"
  }
  ```
- **Response (204 No Content):** Empty

### [61] [POST] /api/v1/bookings/queue
*Note: This endpoint is also aliased at `/api/v1/queue`.*

- **Auth:** Bearer | **Roles:** User
- **Name:** Vào hàng đợi khi trạm đầy
- **Request (Body):**
  ```json
  {
    "chargerId": "uuid",
    "connectorType": "string",
    "urgencyScore": "number (optional, default 0)"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "position": "number",
    "estimatedWaitMin": "number"
  }
  ```

### [62] [DELETE] /api/v1/bookings/queue/:chargerId
*Note: This endpoint is also aliased at `/api/v1/queue/:chargerId`.*

- **Auth:** Bearer | **Roles:** User
- **Name:** Rời hàng đợi
- **Request (Path Params):**
  ```json
  {
    "chargerId": "uuid"
  }
  ```
- **Response (204 No Content):** Empty

### [63] [GET] /api/v1/bookings/queue/:chargerId/position
*Note: This endpoint is also aliased at `/api/v1/queue/:chargerId/position`.*

- **Auth:** Bearer | **Roles:** User
- **Name:** Xem vị trí trong hàng đợi
- **Request (Path Params):**
  ```json
  {
    "chargerId": "uuid"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "position": "number",
    "estimatedWaitMin": "number"
  }
  ```

### [64] [GET] /api/v1/bookings/suggest

- **Auth:** Bearer | **Roles:** User
- **Name:** Đề xuất trạm sạc tối ưu (Suggest Charger & DP Optimizer)
- **Request (Query Params):**
  ```json
  {
    "connectorType": "string (required, enum: CCS, CCS2, CHAdeMO, Type2, GB/T, Other)",
    "latitude": "number (optional)",
    "longitude": "number (optional)",
    "startTime": "iso-date (optional)",
    "endTime": "iso-date (optional)",
    "budgetVnd": "number (optional, mặc định: 150000)"
  }
  ```
- **Response (200 OK):**
  ```json
  [
    {
      "chargerId": "uuid",
      "stationId": "uuid",
      "score": "number",
      "rank": "number"
    }
  ]
  ```


### [65] [POST] /api/v1/charging/start

- **Auth:** Bearer | **Roles:** User
- **Name:** Bắt đầu phiên sạc (có/không booking)
- **Request (Body):**
  ```json
  {
    "chargerId": "uuid",
    "bookingId": "uuid (optional)",
    "qrToken": "string (optional)",
    "startMeterWh": "number (optional)"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "id": "uuid",
    "userId": "uuid",
    "chargerId": "uuid",
    "bookingId": "uuid (nullable)",
    "startTime": "iso-date",
    "status": "string (pending, active)",
    "startMeterWh": "number",
    "createdAt": "iso-date"
  }
  ```

### [66] [POST] /api/v1/charging/stop/:id

- **Auth:** Bearer | **Roles:** User
- **Name:** Dừng phiên sạc (self-service)
- **Request (Path Params & Body):**
  ```json
  // Path Params
  {
    "id": "uuid"
  }
  // Body
  {
    "endMeterWh": "number (optional)",
    "reason": "string (optional)"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "id": "uuid",
    "status": "string (completed)",
    "startTime": "iso-date",
    "endTime": "iso-date",
    "totalKwh": "number",
    "totalCostVnd": "number",
    "stopReason": "string"
  }
  ```

### [67] [POST] /api/v1/charging/admin/stop/:id

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Dừng phiên sạc khẩn cấp (admin)
- **Request (Path Params & Body):**
  ```json
  // Path Params
  {
    "id": "uuid"
  }
  // Body
  {
    "endMeterWh": "number (optional)",
    "reason": "string (optional)"
  }
  ```
- **Response (200 OK):** SessionDto JSON

### [68] [POST] /api/v1/charging/telemetry/:id

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Nhập telemetry thủ công
- **Request (Path Params & Body):**
  ```json
  // Path Params
  {
    "id": "uuid"
  }
  // Body
  {
    "powerKw": "number",
    "meterWh": "number",
    "socPercent": "number",
    "voltageV": "number (optional)",
    "currentA": "number (optional)"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "status": "accepted"
  }
  ```

### [69] [GET] /api/v1/charging/session/:id

- **Auth:** Bearer | **Roles:** User
- **Name:** Chi tiết phiên sạc
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (200 OK):** SessionDto JSON

### [70] [GET] /api/v1/charging/charger/:chargerId/active

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Session đang active của charger
- **Request (Path Params):**
  ```json
  {
    "chargerId": "uuid"
  }
  ```
- **Response (200 OK):** SessionDto JSON

### [71] [GET] /api/v1/charging/history

- **Auth:** Bearer | **Roles:** User
- **Name:** Lịch sử sạc
- **Request (Query):**
  ```json
  {
    "limit": "number (optional, default 20)",
    "offset": "number (optional, default 0)"
  }
  ```
- **Response (200 OK):** Array of SessionDto

---

## SERVICE: Billing Service (Payment & Wallet)

**Base path:** `http://localhost:8000/api/v1` | **Container:** `ev-billing` | **Port:** 3007

### [72] [POST] /api/v1/payments/create

- **Auth:** Bearer | **Roles:** User
- **Name:** Tạo VNPay payment URL
- **Request (Body):**
  ```json
  {
    "bookingId": "uuid",
    "amount": "number",
    "bankCode": "string (optional)",
    "ipAddr": "string (optional)"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "paymentUrl": "string (URL)",
    "txnRef": "string"
  }
  ```

### [73] [POST] /api/v1/payments/pay

- **Auth:** Bearer | **Roles:** User
- **Name:** Wallet-first orchestrator (ưu tiên ví, fallback VNPay)
- **Request (Headers & Body):**
  ```json
  // Headers
  {
    "Idempotency-Key": "string (UUID v4)"
  }
  // Body
  {
    "bookingId": "uuid",
    "amount": "number"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "status": "string (SUCCESS or REDIRECT)",
    "method": "string (WALLET or VNPAY)",
    "paymentUrl": "string (optional, xuất hiện khi method=VNPAY)"
  }
  ```

### [74] [GET] /api/v1/payments/vnpay-return

- **Auth:** Public | **Roles:** —
- **Name:** VNPay IPN callback
- **Request (Query):**
  ```json
  {
    "vnp_Amount": "string",
    "vnp_BankCode": "string",
    "vnp_PayDate": "string",
    "vnp_ResponseCode": "string",
    "vnp_TmnCode": "string",
    "vnp_TransactionNo": "string",
    "vnp_TxnRef": "string",
    "vnp_SecureHash": "string"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": "boolean",
    "message": "string"
  }
  ```

### [75] [GET] /api/v1/payments/:id

- **Auth:** Bearer | **Roles:** User
- **Name:** Chi tiết giao dịch
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "id": "uuid",
    "walletId": "uuid",
    "type": "string",
    "amount": "number",
    "currency": "string",
    "status": "string",
    "referenceId": "string",
    "createdAt": "iso-date"
  }
  ```

### [76] [POST] /api/v1/payments/:id/refund

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Hoàn tiền giao dịch
- **Request (Path Params & Body):**
  ```json
  // Path Params
  {
    "id": "uuid"
  }
  // Body
  {
    "reason": "string"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "id": "uuid",
    "type": "string (REFUND)",
    "amount": "number",
    "status": "string (SUCCESS)",
    "referenceId": "string"
  }
  ```

### [77] [GET] /api/v1/wallet/balance

- **Auth:** Bearer | **Roles:** User
- **Name:** Số dư ví
- **Request:** Empty
- **Response (200 OK):**
  ```json
  {
    "walletId": "uuid",
    "balance": "number",
    "currency": "string (VND)"
  }
  ```

### [78] [POST] /api/v1/wallet/topup

- **Auth:** Bearer | **Roles:** User
- **Name:** Nạp tiền vào ví qua VNPay
- **Request (Body):**
  ```json
  {
    "amount": "number",
    "bankCode": "string (optional)",
    "ipAddr": "string (optional)"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "paymentUrl": "string"
  }
  ```

### [79] [POST] /api/v1/wallet/pay

- **Auth:** Bearer | **Roles:** User
- **Name:** Thanh toán trực tiếp từ ví
- **Request (Body):**
  ```json
  {
    "bookingId": "uuid",
    "amount": "number"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": "boolean",
    "newBalance": "number"
  }
  ```

### [80] [GET] /api/v1/transactions

- **Auth:** Bearer | **Roles:** User
- **Name:** Lịch sử giao dịch
- **Request (Query):**
  ```json
  {
    "limit": "number (optional)",
    "offset": "number (optional)"
  }
  ```
- **Response (200 OK):**
  ```json
  [
    {
      "id": "uuid",
      "walletId": "uuid",
      "type": "string (TOPUP, CHARGE, REFUND, ADJUSTMENT)",
      "amount": "number",
      "currency": "string",
      "status": "string (PENDING, SUCCESS, FAILED)",
      "referenceId": "string",
      "createdAt": "iso-date"
    }
  ]
  ```


### [81] [GET] /api/v1/billing/arrears

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Quản lý công nợ hệ thống
- **Request (Query):**
  ```json
  {
    "userId": "uuid (optional)",
    "status": "string (ACTIVE, CLEARED)"
  }
  ```
- **Response (200 OK):** ArrearsDto Array

### [82] [POST] /api/v1/billing/arrears/:id/clear

- **Auth:** Bearer | **Roles:** Admin/System
- **Name:** Tất toán công nợ thủ công
- **Request (Body):**
  ```json
  {
    "note": "string"
  }
  ```
- **Response (200 OK):** ArrearsDto

### [83] [GET] /api/v1/billing/plans

- **Auth:** Public | **Roles:** —
- **Name:** Danh sách gói dịch vụ
- **Request:** Empty
- **Response (200 OK):** PlanDto Array


### [84] [POST] /api/v1/billing/plans

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Tạo gói dịch vụ mới
- **Request (Body):**
  ```json
  {
    "name": "string",
    "price": "number",
    "durationDays": "number",
    "benefits": "object"
  }
  ```
- **Response (201 Created):** PlanDto

### [85] [POST] /api/v1/billing/subscriptions

- **Auth:** Bearer | **Roles:** User
- **Name:** Đăng ký gói dịch vụ
- **Request (Body):**
  ```json
  {
    "planId": "uuid"
  }
  ```
- **Response (201 Created):** SubscriptionDto


---

## SERVICE: Notification Service

**Base paths:** `/api/v1/notifications`, `/api/v1/devices`, `/api/v1/preferences` | **Container:** `ev-notify` | **Port:** 3008

### [86] [GET] /api/v1/notifications

- **Auth:** Bearer | **Roles:** User
- **Name:** Danh sách thông báo (phân trang)
- **Request (Query):**
  ```json
  {
    "limit": "number (optional)",
    "unreadOnly": "boolean (optional)"
  }
  ```
- **Response (200 OK):**
  ```json
  [
    {
      "id": "uuid",
      "type": "string (SYSTEM, PAYMENT, BOOKING, ALERT)",
      "title": "string",
      "body": "string",
      "status": "string (UNREAD, READ)",
      "readAt": "iso-date (nullable)",
      "createdAt": "iso-date"
    }
  ]
  ```

### [87] [GET] /api/v1/notifications/unread

- **Auth:** Bearer | **Roles:** User
- **Name:** Thông báo chưa đọc
- **Request (Query):**
  ```json
  {
    "limit": "number (optional)"
  }
  ```
- **Response (200 OK):** Array of NotificationDto

### [88] [PATCH] /api/v1/notifications/:id/read

- **Auth:** Bearer | **Roles:** User
- **Name:** Đánh dấu đã đọc 1 thông báo
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (204 No Content):** Empty

### [89] [PATCH] /api/v1/notifications/read-all

- **Auth:** Bearer | **Roles:** User
- **Name:** Đánh dấu tất cả đã đọc
- **Request:** Empty
- **Response (200 OK):**
  ```json
  {
    "count": "number"
  }
  ```

### [90] [POST] /api/v1/devices/register

- **Auth:** Bearer | **Roles:** User
- **Name:** Đăng ký FCM token
- **Request (Body):**
  ```json
  {
    "platform": "string (ANDROID, IOS, WEB)",
    "pushToken": "string",
    "deviceName": "string (optional)"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "deviceId": "uuid"
  }
  ```

### [91] [DELETE] /api/v1/devices/:id

- **Auth:** Bearer | **Roles:** User
- **Name:** Hủy đăng ký thiết bị
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (204 No Content):** Empty

### [92] [GET] /api/v1/devices

- **Auth:** Bearer | **Roles:** User
- **Name:** Danh sách thiết bị đã đăng ký
- **Request:** Empty
- **Response (200 OK):**
  ```json
  [
    {
      "id": "uuid",
      "platform": "string",
      "deviceName": "string",
      "lastActiveAt": "iso-date"
    }
  ]
  ```

### [93] [GET] /api/v1/preferences

- **Auth:** Bearer | **Roles:** User
- **Name:** Lấy cài đặt thông báo
- **Request:** Empty
- **Response (200 OK):**
  ```json
  {
    "enablePush": "boolean",
    "enableEmail": "boolean",
    "enableSms": "boolean",
    "quietHoursStart": "string (HH:mm, nullable)",
    "quietHoursEnd": "string (HH:mm, nullable)"
  }
  ```

### [94] [PATCH] /api/v1/preferences

- **Auth:** Bearer | **Roles:** User
- **Name:** Cập nhật cài đặt thông báo
- **Request (Body):**
  ```json
  {
    "enablePush": "boolean (optional)",
    "enableEmail": "boolean (optional)",
    "enableSms": "boolean (optional)",
    "quietHoursStart": "string (optional, HH:mm)",
    "quietHoursEnd": "string (optional, HH:mm)"
  }
  ```
- **Response (200 OK):** Updated Preferences JSON

---

## SERVICE: Analytics Service

**Base path:** `http://localhost:8000/api/v1/analytics` | **Container:** `ev-analytics` | **Port:** 3002

### [95] [GET] /api/v1/analytics/system

- **Auth:** Bearer | **Roles:** Admin
- **Name:** KPI toàn platform (active sessions, revenue 30d, booking funnel)
- **Request:** Empty
- **Response (200 OK):**
  ```json
  {
    "activeSessions": "number",
    "revenue30d": "number",
    "newUsers30d": "number",
    "bookingFunnel": {
      "totalBookings": "number",
      "completed": "number",
      "cancelled": "number",
      "conversionRate": "number"
    }
  }
  ```

### [96] [GET] /api/v1/analytics/revenue

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Doanh thu theo tháng/ngày
- **Request (Query):**
  ```json
  {
    "range": "string (DAILY, MONTHLY, YEARLY)",
    "stationId": "uuid (optional)",
    "days": "number (optional)"
  }
  ```
- **Response (200 OK):**
  ```json
  [
    {
      "period": "string",
      "totalRevenueVnd": "number"
    }
  ]
  ```

### [97] [GET] /api/v1/analytics/usage

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Thống kê sử dụng trạm
- **Request (Query):**
  ```json
  {
    "stationId": "uuid (optional)",
    "days": "number (optional)"
  }
  ```
- **Response (200 OK):**
  *With stationId:*
  ```json
  {
    "stationId": "uuid",
    "days": 30,
    "summary": {
      "totalSessions": "number",
      "totalKwh": "number",
      "totalRevenueVnd": "number"
    },
    "daily": [
      {
        "id": "uuid",
        "stationId": "uuid",
        "metricDate": "string (YYYY-MM-DD)",
        "totalSessions": "number",
        "totalKwh": "number",
        "totalRevenueVnd": "number"
      }
    ]
  }
  ```
  *Without stationId (Top 10):*
  ```json
  {
    "days": 30,
    "topStations": [
      {
        "station_id": "uuid",
        "total_sessions": "number",
        "total_kwh": "number",
        "total_revenue_vnd": "number",
        "avg_session_min": "number"
      }
    ]
  }
  ```

### [98] [GET] /api/v1/analytics/peak-hours

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Giờ cao điểm + dự báo nhu cầu
- **Request (Query):**
  ```json
  {
    "stationId": "uuid (optional)",
    "lookbackDays": "number (optional)",
    "forecast": "boolean (optional)"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "stationId": "string ('platform' or uuid)",
    "lookbackDays": "number",
    "peakHours": [
      {
        "hourOfDay": "number (0-23)",
        "sessionsCount": "number",
        "avgKwh": "number",
        "isPeak": "boolean"
      }
    ],
    "topPeakHours": ["number (0-23)"],
    "forecast": "object (optional)"
  }
  ```

### [99] [GET] /api/v1/analytics/users/:userId

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Hành vi người dùng
- **Request (Path Params & Query):**
  ```json
  // Path Params
  {
    "userId": "uuid"
  }
  // Query
  {
    "days": "number (optional)"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "userId": "uuid",
    "allTime": {
      "totalSessions": "number",
      "totalSpentVnd": "number",
      "favoriteStationId": "uuid (nullable)",
      "averageChargeDurationMin": "number"
    },
    "last30Days": [
      {
        "id": "uuid",
        "userId": "uuid",
        "metricDate": "string",
        "sessionsCount": "number",
        "kwhConsumed": "number",
        "amountSpentVnd": "number"
      }
    ]
  }
  ```

### [100] [GET] /api/v1/analytics/stations/:stationId/metrics

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Tóm tắt thống kê 1 trạm
- **Request (Path Params & Query):**
  ```json
  // Path Params
  {
    "stationId": "uuid"
  }
  // Query
  {
    "days": "number (optional)"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "stationId": "uuid",
    "days": "number",
    "summary": {
      "totalSessions": "number",
      "totalKwh": "number",
      "totalRevenueVnd": "number"
    },
    "daily": [
      {
        "id": "uuid",
        "stationId": "uuid",
        "metricDate": "string",
        "totalSessions": "number",
        "totalKwh": "number",
        "totalRevenueVnd": "number"
      }
    ]
  }
  ```

### [101] [GET] /api/v1/analytics/dashboard

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Dashboard tổng hợp (composite view)
- **Request:** Empty
- **Response (200 OK):**
  ```json
  {
    "latestKpi": {
      "activeSessions": "number",
      "revenue30d": "number",
      "newUsers30d": "number"
    },
    "revenue30d": [
      {
        "period": "string",
        "totalRevenueVnd": "number"
      }
    ],
    "peakHours": [
      {
        "hour": "number",
        "avgSessions": "number"
      }
    ],
    "topStations": [
      {
        "stationId": "uuid",
        "revenue": "number",
        "utilizationRate": "number"
      }
    ]
  }
  ```

---

## SERVICE: Telemetry Ingestion Service

**Base path:** `http://localhost:8000/api/v1/telemetry` | **Container:** `ev-telemetry` | **Port:** 3009

### [102] [POST] /api/v1/telemetry/ingest

- **Auth:** Public | **Roles:** —
- **Name:** Thu thập telemetry từ charger (body)
- **Request (Body):**
  ```json
  {
    "chargerId": "uuid",
    "sessionId": "uuid",
    "powerKw": "number (optional)",
    "currentA": "number (optional)",
    "voltageV": "number (optional)",
    "meterWh": "number (optional)",
    "socPercent": "number (optional, 0-100)",
    "temperatureC": "number (optional)",
    "errorCode": "string (optional)",
    "hardwareTimestamp": "iso-date (optional)"
  }
  ```
- **Response (202 Accepted):**
  ```json
  {
    "eventId": "uuid",
    "warnings": ["string"]
  }
  ```

### [103] [POST] /api/v1/telemetry/ingest/:chargerId/:sessionId

- **Auth:** Public | **Roles:** —
- **Name:** Thu thập telemetry (path params)
- **Request (Path Params & Body):**
  ```json
  // Path Params
  {
    "chargerId": "uuid",
    "sessionId": "uuid"
  }
  // Body
  {
    "powerKw": "number (optional)",
    "currentA": "number (optional)",
    "voltageV": "number (optional)",
    "meterWh": "number (optional)",
    "socPercent": "number (optional, 0-100)",
    "temperatureC": "number (optional)",
    "errorCode": "string (optional)",
    "hardwareTimestamp": "iso-date (optional)"
  }
  ```
- **Response (202 Accepted):**
  ```json
  {
    "eventId": "uuid",
    "warnings": ["string"]
  }
  ```

---

## SERVICE: OCPP Gateway Service

**Base path:** `http://localhost:8000/api/v1/ocpp` | **Container:** `ev-ocpp-gw` | **Port:** 3010 | **WebSocket:** `ws://localhost:3010/ocpp`

### [104] [GET] /api/v1/ocpp/health

- **Auth:** Public | **Roles:** —
- **Name:** Trạng thái OCPP Gateway + danh sách charger kết nối
- **Request:** Empty
- **Response (200 OK):**
  ```json
  {
    "status": "string (UP, DOWN)",
    "service": "ev-ocpp-gw",
    "connectedChargers": "number",
    "chargers": [
      {
        "id": "string",
        "connectedAt": "iso-date",
        "lastHeartbeat": "iso-date"
      }
    ]
  }
  ```

### [WS] ws://ev-ocpp-gw:3010/ocpp/:chargerId

- **Protocol:** OCPP 1.6 JSON WebSocket
- **Auth:** Header Authorization hoặc TLS client certificate
- **Messages:** BootNotification, Heartbeat, StatusNotification, StartTransaction, StopTransaction, MeterValues
