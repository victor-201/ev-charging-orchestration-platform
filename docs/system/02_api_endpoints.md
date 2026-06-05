# API Endpoints — EV Charging Platform

## SERVICE: IAM Service

**Base path:** `http://localhost:8000/api/v1` | **Container:** `ev-iam` | **Port:** 3001

### [01] [POST] /api/v1/auth/register

- **Auth:** Public | **Roles:** —
- **Name:** Register account
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
- **Name:** Verify email via Token or Code
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
- **Name:** Resend verification email
- **Request (Body):**
  ```json
  {
    "email": "string"
  }
  ```
- **Response (204 No Content):** Empty
### [04] [POST] /api/v1/auth/login

- **Auth:** Public | **Roles:** —
- **Name:** Login, receive JWT
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
- **Name:** Refresh Access Token
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
- **Name:** Logout, revoke session
- **Request (Body):**
  ```json
  {
    "sessionId": "uuid (optional)"
  }
  ```
- **Response (204 No Content):** Empty

### [07] [GET] /api/v1/auth/me

- **Auth:** Bearer | **Roles:** User/Admin
- **Name:** Get current user info (from JWT)
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
- **Name:** Change password
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
- **Name:** List login sessions
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
- **Name:** Revoke a session
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (204 No Content):** Empty

### [11] [DELETE] /api/v1/auth/sessions

- **Auth:** Bearer | **Roles:** User
- **Name:** Revoke all sessions
- **Request:** Empty
- **Response (204 No Content):** Empty

### [12] [POST] /api/v1/auth/roles/assign

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Assign role to user
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
- **Name:** Revoke role from user
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
- **Name:** Initialize TOTP MFA
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
- **Name:** Verify & activate MFA
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
- **Name:** Disable MFA
- **Request (Body):**
  ```json
  {
    "password": "string"
  }
  ```
- **Response (204 No Content):** Empty

### [17] [GET] /api/v1/users/me

- **Auth:** Bearer | **Roles:** User
- **Name:** Get full profile
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
- **Name:** Update profile
- **Request (Body):**
  ```json
  {
    "avatarUrl": "string (optional, url format)",
    "address": "string (optional)"
  }
  ```
- **Response (200 OK):** Updated Profile JSON

### [18a] [POST] /api/v1/users/me/avatar

- **Auth:** Bearer | **Roles:** User
- **Name:** Upload avatar image
- **Request (Multipart/Form-Data):**
  - `file`: binary (JPEG, PNG, WebP, GIF; max 2MB)
- **Response (200 OK):**
  ```json
  {
    "avatarUrl": "string"
  }
  ```

### [19] [DELETE] /api/v1/users/me

- **Auth:** Bearer | **Roles:** User
- **Name:** Soft delete account
- **Request:** Empty
- **Response (204 No Content):** Empty

### [20] [GET] /api/v1/users/me/audit-log

- **Auth:** Bearer | **Roles:** User
- **Name:** Profile change history
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
- **Name:** My vehicles list
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
- **Name:** Add new vehicle
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
- **Name:** Update vehicle
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
- **Name:** Delete vehicle
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (204 No Content):** Empty

### [25] [PATCH] /api/v1/users/me/vehicles/:id/primary

- **Auth:** Bearer | **Roles:** User
- **Name:** Set default vehicle
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (204 No Content):** Empty

### [26] [GET] /api/v1/users/me/vehicles/:id/audit-log

- **Auth:** Bearer | **Roles:** User
- **Name:** Vehicle change history
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

### [26a] [GET] /api/v1/users

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** List users (from users cache read-model)
- **Request (Query Params):**
  ```json
  {
    "limit": "number (optional, default 20)",
    "offset": "number (optional, default 0)",
    "search": "string (optional, searches fullName, email, phone)",
    "debt": "string (optional: 'debt' or 'nodebt')",
    "role": "string (optional: 'user', 'staff', 'admin', 'all', default: 'user')",
    "ids": "string (optional, comma-separated list of user IDs to batch resolve)"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "items": [
      {
        "userId": "uuid",
        "email": "string",
        "fullName": "string",
        "phone": "string (nullable)",
        "roleName": "string",
        "status": "string",
        "emailVerified": "boolean",
        "hasOutstandingDebt": "boolean",
        "arrearsAmount": "number",
        "syncedAt": "iso-date"
      }
    ],
    "total": "number"
  }
  ```

### [27] [GET] /api/v1/staff

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Staff list (paginated)
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
- **Name:** Add new staff profile
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
- **Name:** Update staff profile
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

### [29a] [DELETE] /api/v1/staff/:id

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Delete staff profile
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (204 No Content):** Empty

### [30] [POST] /api/v1/attendance/check-in

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Check-in for shift
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

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Check-out from shift
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
- **Name:** View attendance history (Admin view)
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
- **Name:** Configure AutoCharge
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
- **Name:** Station list (paginated)
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
- **Name:** Create new station
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
- **Name:** Find nearby stations (Geospatial)
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
- **Name:** Get station by chargerId (reverse lookup)
- **Request (Path Params):**
  ```json
  {
    "chargerId": "uuid"
  }
  ```
- **Response (200 OK):** Station JSON + charger detail

### [38] [GET] /api/v1/stations/cities

- **Auth:** Public | **Roles:** —
- **Name:** List cities with stations
- **Request:** Empty
- **Response (200 OK):** Array of CityDto { id, name, stationCount }
### [39] [GET] /api/v1/stations/:id

- **Auth:** Public | **Roles:** —
- **Name:** Station details
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (200 OK):** Station JSON + "chargers" array

### [40] [GET] /api/v1/stations/:stationId/chargers

- **Auth:** Public | **Roles:** —
- **Name:** List chargers in a station
- **Request (Path Params):**
  ```json
  {
    "stationId": "uuid"
  }
  ```
- **Response (200 OK):** Array of ChargerDto

### [41] [PATCH] /api/v1/stations/:id

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Update station info
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
- **Name:** Deactivate station
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (204 No Content):** Empty

### [43] [POST] /api/v1/stations/:stationId/chargers

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Add charger to station
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
- **Name:** Update charger status
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
- **Name:** View charging price quote
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
- **Name:** Calculate actual session fee (internal)
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

- **Auth:** Bearer | **Roles:** Admin
- **Name:** List pricing rules
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
- **Name:** Create new pricing rule (TOU/Idle)
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
- **Name:** Update pricing rule
- **Request (Path Params & Body):**
  ```json
  // Path Params
  {
    "ruleId": "uuid"
  }
  // Body: Same fields as POST but all optional
  ```
- **Response (200 OK):** Updated Pricing Rule JSON

### [50] [PATCH] /api/v1/stations/pricing-rules/:ruleId/deactivate

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Deactivate pricing rule
- **Request (Path Params):**
  ```json
  {
    "ruleId": "uuid"
  }
  ```
- **Response (204 No Content):** Empty
### [51] [GET] /api/v1/stations/incidents

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** List station incidents
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
- **Name:** Report new incident
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
- **Name:** Handle incident
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
- **Name:** Station maintenance schedule
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
- **Name:** Schedule maintenance
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

### [55a] [PATCH] /api/v1/stations/maintenance/:id

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Update station maintenance record
- **Request (Path Params & Body):**
  ```json
  // Path Params
  {
    "id": "uuid"
  }
  // Body
  {
    "status": "string (optional: SCHEDULED, IN_PROGRESS, COMPLETED)",
    "endTime": "iso-date (optional)",
    "reason": "string (optional)"
  }
  ```
- **Response (200 OK):** Updated Maintenance record JSON

---

## SERVICE: Session Service (Booking & Charging)

**Base paths:** `/api/v1/bookings`, `/api/v1/charging` | **Container:** `ev-session` | **Port:** 3004

### [56] [GET] /api/v1/bookings/availability

- **Auth:** Bearer | **Roles:** User
- **Name:** View availability by date
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
- **Name:** My bookings
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

### [57a] [GET] /api/v1/bookings

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** List all bookings (for Admin/Staff)
- **Request (Query Params):**
  ```json
  {
    "limit": "number (optional, default 50)",
    "offset": "number (optional, default 0)",
    "userId": "uuid (optional)",
    "chargerId": "uuid (optional)",
    "status": "string (optional: pending_payment, confirmed, completed, cancelled, expired, no_show)"
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
        "status": "string",
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
- **Name:** Create new booking (auto-deduct deposit)
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
- **Name:** Booking details
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (200 OK):** Booking JSON (same as item in /bookings/me)

### [60] [DELETE] /api/v1/bookings/:id

- **Auth:** Bearer | **Roles:** User
- **Name:** Cancel booking (100% deposit refund)
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
- **Name:** Join queue when station is full
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
- **Name:** Leave queue
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
- **Name:** Check queue position
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
- **Name:** Suggest optimal charging station (Suggest Charger & DP Optimizer)
- **Request (Query Params):**
  ```json
  {
    "connectorType": "string (required, enum: CCS, CCS2, CHAdeMO, Type2, GB/T, Other)",
    "latitude": "number (optional)",
    "longitude": "number (optional)",
    "startTime": "iso-date (optional)",
    "endTime": "iso-date (optional)",
    "budgetVnd": "number (optional, default: 150000)"
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
- **Name:** Start charging session (with/without booking)
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
- **Name:** Stop charging session (self-service)
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
- **Name:** Emergency stop charging (admin)
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
- **Name:** Manual telemetry input
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
- **Name:** Charging session details
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (200 OK):** SessionDto JSON

### [70] [GET] /api/v1/charging/charger/:chargerId/active

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Active session for charger
- **Request (Path Params):**
  ```json
  {
    "chargerId": "uuid"
  }
  ```
- **Response (200 OK):** SessionDto JSON

### [71] [GET] /api/v1/charging/history

- **Auth:** Bearer | **Roles:** User
- **Name:** Charging history
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
- **Name:** Create VNPay payment URL
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
- **Name:** Wallet-first orchestrator (prefer wallet, fallback VNPay)
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
    "paymentUrl": "string (optional, present when method=VNPAY)"
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
- **Name:** Transaction details
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

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Refund transaction
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
- **Name:** Wallet balance
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
- **Name:** Top-up wallet via VNPay
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
- **Name:** Pay directly from wallet
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

### [79a] [POST] /api/v1/wallet/pay-arrears

- **Auth:** Bearer | **Roles:** User
- **Name:** Settle outstanding arrears using wallet balance
- **Request:** Empty
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "clearedAmount": "number"
  }
  ```

### [79b] [POST] /api/v1/wallet/pay-arrears-vnpay

- **Auth:** Bearer | **Roles:** User
- **Name:** Settle outstanding arrears directly via VNPay (credit/debit card)
- **Request (Body):**
  ```json
  {
    "bankCode": "string (optional)"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "transactionId": "uuid",
    "paymentUrl": "string (URL)",
    "totalArrears": "number"
  }
  ```

### [80] [GET] /api/v1/transactions

- **Auth:** Bearer | **Roles:** User
- **Name:** Transaction history
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
- **Name:** System arrears management
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
- **Name:** Manual arrears clearance
- **Request (Body):**
  ```json
  {
    "note": "string"
  }
  ```
- **Response (200 OK):** ArrearsDto

### [83] [GET] /api/v1/billing/plans

- **Auth:** Public | **Roles:** —
- **Name:** List service plans
- **Request:** Empty
- **Response (200 OK):** PlanDto Array


### [84] [POST] /api/v1/billing/plans

- **Auth:** Bearer | **Roles:** Admin
- **Name:** Create new service plan
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
- **Name:** Subscribe to service plan
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
- **Name:** Notification list (paginated)
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
- **Name:** Unread notifications
- **Request (Query):**
  ```json
  {
    "limit": "number (optional)"
  }
  ```
- **Response (200 OK):** Array of NotificationDto

### [88] [PATCH] /api/v1/notifications/:id/read

- **Auth:** Bearer | **Roles:** User
- **Name:** Mark notification as read
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (204 No Content):** Empty

### [89] [PATCH] /api/v1/notifications/read-all

- **Auth:** Bearer | **Roles:** User
- **Name:** Mark all as read
- **Request:** Empty
- **Response (200 OK):**
  ```json
  {
    "count": "number"
  }
  ```

### [90] [POST] /api/v1/devices/register

- **Auth:** Bearer | **Roles:** User
- **Name:** Register FCM token
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
- **Name:** Unregister device
- **Request (Path Params):**
  ```json
  {
    "id": "uuid"
  }
  ```
- **Response (204 No Content):** Empty

### [92] [GET] /api/v1/devices

- **Auth:** Bearer | **Roles:** User
- **Name:** List registered devices
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
- **Name:** Get notification preferences
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
- **Name:** Update notification preferences
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
- **Name:** Platform KPIs (active sessions, revenue 30d, booking funnel)
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

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Revenue by month/day
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

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Station usage statistics
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

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Peak hours + demand forecast
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
- **Name:** User behavior
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

- **Auth:** Bearer | **Roles:** Admin/Staff
- **Name:** Station metrics summary
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
- **Name:** Composite dashboard view
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
- **Name:** Collect telemetry from charger (body)
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
- **Name:** Collect telemetry (path params)
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

### [103a] [GET] /api/v1/telemetry/health

- **Auth:** Public | **Roles:** —
- **Name:** Telemetry service health check
- **Request:** Empty
- **Response (200 OK):**
  ```json
  {
    "status": "healthy",
    "service": "telemetry-ingestion-service",
    "timestamp": "iso-date",
    "dependencies": {
      "clickhouse": {
        "status": "string (connected/disconnected)",
        "database": "string",
        "buffered": "number"
      }
    }
  }
  ```

---

## SERVICE: OCPP Gateway Service

**Base path:** `http://localhost:8000/api/v1/ocpp` | **Container:** `ev-ocpp-gw` | **Port:** 3010 | **WebSocket:** `ws://localhost:3010/ocpp`

### [104] [GET] /api/v1/ocpp/health

- **Auth:** Public | **Roles:** —
- **Name:** OCPP Gateway status + connected chargers list
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
- **Auth:** Header Authorization or TLS client certificate
- **Messages:** BootNotification, Heartbeat, StatusNotification, StartTransaction, StopTransaction, MeterValues
