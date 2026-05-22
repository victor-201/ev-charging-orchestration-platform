# Lược đồ Cơ sở dữ liệu — Nền tảng Sạc EV

# Dịch vụ: IAM Service (Quản lý Định danh)

**Cơ sở dữ liệu:** `ev_iam_db` | **Bộ chứa (Container):** `ev-pg-iam`

### Enums

- `users_status_enum`: `'active'`, `'inactive'`, `'suspended'`
- `attendance_status_enum`: `'present'`, `'late'`, `'absent'`, `'leave'`
- `staff_profiles_position_enum`: `'operator'`, `'manager'`, `'technician'`, `'security'`
- `staff_profiles_shift_enum`: `'morning'`, `'afternoon'`, `'night'`
- `user_fcm_tokens_device_type_enum`: `'ios'`, `'android'`, `'web'`
- `vehicle_models_default_charge_port_enum`: `'CCS'`, `'CHAdeMO'`, `'Type2'`, `'GB/T'`, `'Other'`
- `vehicles_status_enum`: `'active'`, `'deleted'`
- `event_outbox_status_enum`: `'pending'`, `'processed'`, `'failed'`

## `users`

| Cột                | Kiểu dữ liệu      | Cho phép Null | Ghi chú                                       |
| ------------------ | ----------------- | ------------- | --------------------------------------------- |
| id                 | uuid              | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| email              | varchar(255)      | NO            | Duy nhất (UNIQUE)                             |
| full_name          | varchar(100)      | NO            |                                               |
| phone              | varchar(20)       | YES           |                                               |
| date_of_birth      | date              | NO            |                                               |
| password_hash      | varchar(255)      | NO            | Mã hóa bcrypt                                 |
| status             | users_status_enum | NO            | Mặc định: 'active'                            |
| email_verified     | boolean           | NO            | Mặc định: false                               |
| mfa_enabled        | boolean           | NO            | Mặc định: false                               |
| mfa_secret         | varchar(255)      | YES           | Mã bí mật TOTP (đã mã hóa)                    |
| failed_login_count | smallint          | NO            | Mặc định: 0                                   |
| locked_until       | timestamptz       | YES           | Khóa chống brute-force                        |
| created_at         | timestamptz       | NO            | Mặc định: NOW()                               |
| updated_at         | timestamptz       | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_users_status` ON users(status)

## `user_profiles`

| Cột        | Kiểu dữ liệu | Cho phép Null | Ghi chú                                                       |
| ---------- | ------------ | ------------- | ------------------------------------------------------------- |
| user_id    | uuid         | NO            | Khóa chính (PK), Khóa ngoại (FK) → users.id ON DELETE CASCADE |
| avatar_url | text         | YES           |                                                               |
| address    | text         | YES           |                                                               |
| updated_at | timestamptz  | NO            | Mặc định: NOW()                                               |

## `roles`

| Cột         | Kiểu dữ liệu | Cho phép Null | Ghi chú                                       |
| ----------- | ------------ | ------------- | --------------------------------------------- |
| id          | uuid         | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| name        | varchar(50)  | NO            | Duy nhất (UNIQUE)                             |
| description | text         | YES           |                                               |
| is_system   | boolean      | NO            | Mặc định: false                               |
| created_at  | timestamptz  | NO            | Mặc định: NOW()                               |
| updated_at  | timestamptz  | NO            | Mặc định: NOW()                               |

## `permissions`

| Cột         | Kiểu dữ liệu | Cho phép Null | Ghi chú                                       |
| ----------- | ------------ | ------------- | --------------------------------------------- |
| id          | uuid         | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| name        | varchar(100) | NO            | Duy nhất (UNIQUE)                             |
| resource    | varchar(50)  | NO            |                                               |
| action      | varchar(50)  | NO            |                                               |
| description | text         | YES           |                                               |
| created_at  | timestamptz  | NO            | Mặc định: NOW()                               |

## `role_permissions`

| Cột           | Kiểu dữ liệu | Cho phép Null | Ghi chú                                            |
| ------------- | ------------ | ------------- | -------------------------------------------------- |
| role_id       | uuid         | NO            | Khóa ngoại (FK) → roles.id ON DELETE CASCADE       |
| permission_id | uuid         | NO            | Khóa ngoại (FK) → permissions.id ON DELETE CASCADE |
| granted_at    | timestamptz  | NO            | Mặc định: NOW()                                    |

**PK:** (role_id, permission_id)

## `user_roles`

| Cột         | Kiểu dữ liệu | Cho phép Null | Ghi chú                                       |
| ----------- | ------------ | ------------- | --------------------------------------------- |
| user_id     | uuid         | NO            | Khóa ngoại (FK) → users.id ON DELETE CASCADE  |
| role_id     | uuid         | NO            | Khóa ngoại (FK) → roles.id ON DELETE CASCADE  |
| assigned_at | timestamptz  | NO            | Mặc định: NOW()                               |
| assigned_by | uuid         | YES           | Khóa ngoại (FK) → users.id ON DELETE SET NULL |
| expires_at  | timestamptz  | YES           | Thời hạn của vai trò                          |

**PK:** (user_id, role_id)  
**Chỉ mục:** `idx_user_roles_user_id` ON user_roles(user_id)

## `auth_sessions`

| Cột                | Kiểu dữ liệu | Cho phép Null | Ghi chú                                       |
| ------------------ | ------------ | ------------- | --------------------------------------------- |
| id                 | uuid         | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| user_id            | uuid         | NO            | Khóa ngoại (FK) → users.id ON DELETE CASCADE  |
| refresh_token_hash | varchar(255) | NO            | Duy nhất (UNIQUE)                             |
| device_fingerprint | varchar(255) | YES           |                                               |
| ip_address         | inet         | YES           |                                               |
| user_agent         | text         | YES           |                                               |
| expires_at         | timestamptz  | NO            |                                               |
| revoked_at         | timestamptz  | YES           | NULL = đang hoạt động                         |
| created_at         | timestamptz  | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_auth_sessions_user_id` ON auth_sessions(user_id)

## `email_verification_tokens`

| Cột         | Kiểu dữ liệu | Cho phép Null | Ghi chú                                       |
| ----------- | ------------ | ------------- | --------------------------------------------- |
| id          | uuid         | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| user_id     | uuid         | NO            | Khóa ngoại (FK) → users.id ON DELETE CASCADE  |
| token_hash  | varchar(255) | NO            | Duy nhất (UNIQUE)                             |
| short_code  | varchar(6)   | YES           | NULL nếu xác thực qua token link              |
| expires_at  | timestamptz  | NO            |                                               |
| verified_at | timestamptz  | YES           |                                               |
| created_at  | timestamptz  | NO            | Mặc định: NOW()                               |

## `password_reset_tokens`

| Cột        | Kiểu dữ liệu | Cho phép Null | Ghi chú                                       |
| ---------- | ------------ | ------------- | --------------------------------------------- |
| id         | uuid         | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| user_id    | uuid         | NO            | Khóa ngoại (FK) → users.id ON DELETE CASCADE  |
| token_hash | varchar(255) | NO            | Duy nhất (UNIQUE)                             |
| expires_at | timestamptz  | NO            |                                               |
| used_at    | timestamptz  | YES           |                                               |
| created_at | timestamptz  | NO            | Mặc định: NOW()                               |

## `staff_profiles`

| Cột          | Kiểu dữ liệu                 | Cho phép Null | Ghi chú                                                         |
| ------------ | ---------------------------- | ------------- | --------------------------------------------------------------- |
| id           | uuid                         | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4()                   |
| user_id      | uuid                         | NO            | Duy nhất (UNIQUE), Khóa ngoại (FK) → users.id ON DELETE CASCADE |
| station_id   | uuid                         | NO            |                                                                 |
| station_name | varchar(255)                 | YES           |                                                                 |
| position     | staff_profiles_position_enum | NO            | Mặc định: 'operator'                                            |
| shift        | staff_profiles_shift_enum    | NO            | Mặc định: 'morning'                                             |
| hire_date    | date                         | NO            | Mặc định: CURRENT_DATE                                          |
| is_active    | boolean                      | NO            | Mặc định: true                                                  |
| notes        | text                         | YES           |                                                                 |
| created_at   | timestamptz                  | NO            | Mặc định: NOW()                                                 |
| updated_at   | timestamptz                  | NO            | Mặc định: NOW()                                                 |

**Chỉ mục:** `idx_staff_profiles_station_id` ON staff_profiles(station_id)

## `attendance`

| Cột        | Kiểu dữ liệu           | Cho phép Null | Ghi chú                                               |
| ---------- | ---------------------- | ------------- | ----------------------------------------------------- |
| id         | uuid                   | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4()         |
| staff_id   | uuid                   | NO            | Khóa ngoại (FK) → staff_profiles.id ON DELETE CASCADE |
| work_date  | date                   | NO            |                                                       |
| check_in   | timestamptz            | YES           |                                                       |
| check_out  | timestamptz            | YES           |                                                       |
| status     | attendance_status_enum | NO            | Mặc định: 'absent'                                    |
| notes      | text                   | YES           |                                                       |
| created_at | timestamptz            | NO            | Mặc định: NOW()                                       |
| updated_at | timestamptz            | NO            | Mặc định: NOW()                                       |

**Chỉ mục:** `idx_attendance_staff_date` ON attendance(staff_id, work_date)

## `user_fcm_tokens`

| Cột         | Kiểu dữ liệu                     | Cho phép Null | Ghi chú                                       |
| ----------- | -------------------------------- | ------------- | --------------------------------------------- |
| id          | uuid                             | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| user_id     | uuid                             | NO            | Khóa ngoại (FK) → users.id ON DELETE CASCADE  |
| fcm_token   | text                             | NO            | Duy nhất (UNIQUE)                             |
| device_type | user_fcm_tokens_device_type_enum | NO            |                                               |
| is_active   | boolean                          | NO            | Mặc định: true                                |
| created_at  | timestamptz                      | NO            | Mặc định: NOW()                               |
| updated_at  | timestamptz                      | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_user_fcm_tokens_user_id` ON user_fcm_tokens(user_id)

## `vehicle_models`

| Cột                  | Kiểu dữ liệu                            | Cho phép Null | Ghi chú                                       |
| -------------------- | --------------------------------------- | ------------- | --------------------------------------------- |
| id                   | uuid                                    | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| brand                | varchar(50)                             | NO            |                                               |
| model_name           | varchar(50)                             | NO            |                                               |
| year                 | smallint                                | NO            |                                               |
| battery_capacity_kwh | numeric(6, 2)                           | YES           |                                               |
| usable_capacity_kwh  | numeric(6, 2)                           | YES           |                                               |
| default_charge_port  | vehicle_models_default_charge_port_enum | YES           |                                               |
| max_ac_power_kw      | numeric(5, 2)                           | YES           |                                               |
| max_dc_power_kw      | numeric(5, 2)                           | YES           |                                               |

## `vehicles`

| Cột                | Kiểu dữ liệu         | Cho phép Null | Ghi chú                                       |
| ------------------ | -------------------- | ------------- | --------------------------------------------- |
| id                 | uuid                 | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| owner_id           | uuid                 | NO            | Khóa ngoại (FK) → users.id ON DELETE CASCADE  |
| model_id           | uuid                 | NO            | Khóa ngoại (FK) → vehicle_models.id           |
| plate_number       | varchar(20)          | NO            | Duy nhất (UNIQUE)                             |
| color              | varchar(30)          | YES           |                                               |
| status             | vehicles_status_enum | NO            | Mặc định: 'active'                            |
| is_primary         | boolean              | NO            | Mặc định: false                               |
| mac_address        | varchar(17)          | YES           | Duy nhất một phần (nếu không NULL)           |
| vin_number         | varchar(17)          | YES           | Duy nhất một phần (nếu không NULL)           |
| autocharge_enabled | boolean              | NO            | Mặc định: false                               |
| version            | integer              | NO            | Mặc định: 1                                   |
| deleted_at         | timestamptz          | YES           |                                               |
| created_at         | timestamptz          | NO            | Mặc định: NOW()                               |
| updated_at         | timestamptz          | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_vehicles_owner_status` ON vehicles(owner_id, status)  
**Chỉ mục:** `idx_vehicles_mac_address` ON vehicles(mac_address) WHERE mac_address IS NOT NULL (Duy nhất)  
**Chỉ mục:** `idx_vehicles_vin_number` ON vehicles(vin_number) WHERE vin_number IS NOT NULL (Duy nhất)

## `vehicle_audit_logs`

| Cột        | Kiểu dữ liệu | Cho phép Null | Ghi chú                                       |
| ---------- | ------------ | ------------- | --------------------------------------------- |
| id         | uuid         | NO            | Khóa chính (PK)                               |
| vehicle_id | uuid         | NO            |                                               |
| user_id    | uuid         | NO            |                                               |
| action     | varchar(30)  | NO            | `'created'`, `'updated'`, `'deleted'`, `'set_primary'` |
| changes    | jsonb        | YES           | Snapshot các trường đã thay đổi               |
| changed_by | uuid         | YES           | ID admin/user thực hiện thay đổi              |
| created_at | timestamptz  | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_val_vehicle` ON vehicle_audit_logs(vehicle_id)  
**Chỉ mục:** `idx_val_user` ON vehicle_audit_logs(user_id)

## `profile_audit_logs`

| Cột        | Kiểu dữ liệu | Cho phép Null | Ghi chú                                       |
| ---------- | ------------ | ------------- | --------------------------------------------- |
| id         | uuid         | NO            | Khóa chính (PK)                               |
| user_id    | uuid         | NO            |                                               |
| action     | varchar(30)  | NO            | `'updated'`, `'deleted'`                      |
| changes    | jsonb        | YES           | Snapshot các trường đã thay đổi               |
| changed_by | uuid         | YES           | ID admin/user thực hiện thay đổi              |
| created_at | timestamptz  | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_pal_user` ON profile_audit_logs(user_id)

## `user_arrears`

| Cột            | Kiểu dữ liệu   | Cho phép Null | Ghi chú                                       |
| -------------- | -------------- | ------------- | --------------------------------------------- |
| id             | uuid           | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| user_id        | uuid           | NO            | Khóa ngoại (FK) → users.id ON DELETE CASCADE  |
| wallet_id      | uuid           | NO            |                                               |
| session_id     | uuid           | NO            |                                               |
| arrears_amount | numeric(12, 0) | NO            |                                               |
| status         | varchar(20)    | NO            | Mặc định: 'outstanding'                       |
| cleared_at     | timestamptz    | YES           |                                               |
| created_at     | timestamptz    | NO            | Mặc định: NOW()                               |
| updated_at     | timestamptz    | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_arrears_outstanding` ON user_arrears(user_id) WHERE status = 'outstanding'  
**Chỉ mục:** `idx_arrears_user_status` ON user_arrears(user_id, status)

## `users_cache`

| Cột                  | Kiểu dữ liệu   | Cho phép Null | Ghi chú            |
| -------------------- | -------------- | ------------- | ------------------ |
| user_id              | uuid           | NO            | Khóa chính (PK)    |
| email                | varchar(255)   | NO            |                    |
| full_name            | varchar(100)   | NO            |                    |
| phone                | varchar(20)    | YES           |                    |
| role_name            | varchar(50)    | NO            | Mặc định: 'user'   |
| status               | varchar(20)    | NO            | Mặc định: 'active' |
| email_verified       | boolean        | NO            | Mặc định: false    |
| has_outstanding_debt | boolean        | NO            | Mặc định: false    |
| arrears_amount       | numeric(12, 0) | NO            | Mặc định: 0        |
| synced_at            | timestamptz    | NO            | Mặc định: NOW()    |

## `subscriptions`

| Cột        | Kiểu dữ liệu | Cho phép Null | Ghi chú                                       |
| ---------- | ------------ | ------------- | --------------------------------------------- |
| id         | uuid         | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| user_id    | uuid         | NO            | Khóa ngoại (FK) → users.id ON DELETE CASCADE  |
| plan_id    | uuid         | NO            |                                               |
| plan_name  | varchar(100) | YES           |                                               |
| plan_type  | varchar(20)  | YES           |                                               |
| start_date | timestamptz  | NO            | Mặc định: NOW()                               |
| end_date   | timestamptz  | YES           |                                               |
| auto_renew | boolean      | NO            | Mặc định: true                                |
| status     | varchar(20)  | NO            | Mặc định: 'pending'                           |
| created_at | timestamptz  | NO            | Mặc định: NOW()                               |
| updated_at | timestamptz  | NO            | Mặc định: NOW()                               |

## `event_outbox`

| Cột            | Kiểu dữ liệu             | Cho phép Null | Ghi chú                                       |
| -------------- | ------------------------ | ------------- | --------------------------------------------- |
| id             | uuid                     | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| aggregate_type | varchar(100)             | NO            |                                               |
| aggregate_id   | uuid                     | NO            |                                               |
| event_type     | varchar(100)             | NO            |                                               |
| payload        | jsonb                    | NO            |                                               |
| status         | event_outbox_status_enum | NO            | Mặc định: 'pending'                           |
| retry_count    | smallint                 | NO            | Mặc định: 0                                   |
| error_message  | text                     | YES           |                                               |
| created_at     | timestamptz              | NO            | Mặc định: NOW()                               |
| processed_at   | timestamptz              | YES           |                                               |

**Chỉ mục:** `idx_outbox_pending` ON event_outbox(status, created_at) WHERE status = 'pending'

## `processed_events`

| Cột          | Kiểu dữ liệu | Cho phép Null | Ghi chú         |
| ------------ | ------------ | ------------- | --------------- |
| event_id     | varchar(100) | NO            | Khóa chính (PK) |
| event_type   | varchar(100) | NO            |                 |
| processed_at | timestamptz  | NO            | Mặc định: NOW() |

---

# Dịch vụ: Infrastructure Service (Hạ tầng Trạm Sạc)

**Cơ sở dữ liệu:** `ev_infrastructure_db` | **Bộ chứa (Container):** `ev-pg-infra`

### Enums

- `stations_status_enum`: `'active'`, `'closed'`, `'maintenance'`, `'inactive'`
- `charging_points_status_enum`: `'available'`, `'in_use'`, `'offline'`, `'faulted'`, `'reserved'`
- `connectors_connector_type_enum`: `'CCS'`, `'CHAdeMO'`, `'Type2'`, `'GB/T'`, `'Other'`
- `pricing_rules_connector_type_enum`: `'CCS'`, `'CHAdeMO'`, `'Type2'`, `'GB/T'`, `'Other'`
- `station_incidents_severity_enum`: `'low'`, `'medium'`, `'high'`, `'critical'`
- `station_incidents_status_enum`: `'pending_confirmation'`, `'in_progress'`, `'resolved'`, `'rejected'`
- `event_outbox_status_enum`: `'pending'`, `'processed'`, `'failed'`

## `cities`

| Cột          | Kiểu dữ liệu | Cho phép Null | Ghi chú                                       |
| ------------ | ------------ | ------------- | --------------------------------------------- |
| id           | uuid         | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| city_name    | varchar(100) | NO            | Duy nhất (UNIQUE)                             |
| region       | varchar(100) | NO            |                                               |
| country_code | char(2)      | NO            | Mặc định: 'VN'                                |

## `stations`

| Cột        | Kiểu dữ liệu         | Cho phép Null | Ghi chú                                       |
| ---------- | -------------------- | ------------- | --------------------------------------------- |
| id         | uuid                 | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| name       | varchar(255)         | NO            |                                               |
| address    | varchar(500)         | YES           |                                               |
| city_id    | uuid                 | NO            | Khóa ngoại (FK) → cities.id                   |
| latitude   | numeric(10, 7)       | YES           |                                               |
| longitude  | numeric(10, 7)       | YES           |                                               |
| status     | stations_status_enum | NO            | Mặc định: 'active'                            |
| owner_id   | uuid                 | YES           |                                               |
| owner_name | varchar(100)         | YES           |                                               |
| created_at | timestamptz          | NO            | Mặc định: NOW()                               |
| updated_at | timestamptz          | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_sta_city` ON stations(city_id)  
**Chỉ mục:** `idx_sta_geo` ON stations(latitude, longitude)  
**Chỉ mục:** `idx_sta_status` ON stations(status)

## `charging_points`

| Cột          | Kiểu dữ liệu                | Cho phép Null | Ghi chú                                         |
| ------------ | --------------------------- | ------------- | ----------------------------------------------- |
| id           | uuid                        | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4()   |
| station_id   | uuid                        | NO            | Khóa ngoại (FK) → stations.id ON DELETE CASCADE |
| name         | varchar(50)                 | NO            |                                                 |
| external_id  | varchar(100)                | YES           | Duy nhất (UNIQUE), OCPP chargePointId           |
| max_power_kw | numeric(8, 2)               | YES           |                                                 |
| status       | charging_points_status_enum | NO            | Mặc định: 'available'                           |
| created_at   | timestamptz                 | NO            | Mặc định: NOW()                                 |
| updated_at   | timestamptz                 | NO            | Mặc định: NOW()                                 |

**Chỉ mục:** `idx_cp_station` ON charging_points(station_id)  
**Chỉ mục:** `idx_cp_status` ON charging_points(status)

## `connectors`

| Cột               | Kiểu dữ liệu                   | Cho phép Null | Ghi chú                                                |
| ----------------- | ------------------------------ | ------------- | ------------------------------------------------------ |
| id                | uuid                           | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4()          |
| charging_point_id | uuid                           | NO            | Khóa ngoại (FK) → charging_points.id ON DELETE CASCADE |
| connector_type    | connectors_connector_type_enum | NO            |                                                        |
| max_power_kw      | numeric(8, 2)                  | YES           |                                                        |

**Chỉ mục:** `idx_conn_cp` ON connectors(charging_point_id)

## `pricing_rules`

| Cột                 | Kiểu dữ liệu                      | Cho phép Null | Ghi chú                                         |
| ------------------- | --------------------------------- | ------------- | ----------------------------------------------- |
| id                  | uuid                              | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4()   |
| station_id          | uuid                              | NO            | Khóa ngoại (FK) → stations.id ON DELETE CASCADE |
| connector_type      | pricing_rules_connector_type_enum | NO            |                                                 |
| valid_from          | timestamptz                       | NO            |                                                 |
| valid_to            | timestamptz                       | YES           | NULL = đang áp dụng                             |
| hour_start          | smallint                          | YES           | TOU: 0-23, NULL = cả ngày                       |
| hour_end            | smallint                          | YES           | TOU: 0-23                                       |
| day_mask            | smallint                          | NO            | Mặc định: 0, bitmask Thứ 2=1..Chủ nhật=64       |
| price_per_kwh       | numeric(10, 4)                    | NO            |                                                 |
| price_per_minute    | numeric(10, 4)                    | YES           |                                                 |
| idle_grace_minutes  | smallint                          | NO            | Mặc định: 20                                    |
| idle_fee_per_minute | numeric(10, 2)                    | NO            | Mặc định: 1000                                  |
| label               | varchar(100)                      | YES           | ví dụ: 'Giờ cao điểm'                           |
| currency            | char(3)                           | NO            | Mặc định: 'VND'                                 |
| created_at          | timestamptz                       | NO            | Mặc định: NOW()                                 |

**Chỉ mục:** `idx_price_lookup` ON pricing_rules(station_id, connector_type, valid_from)

## `station_incidents`

| Cột         | Kiểu dữ liệu                    | Cho phép Null | Ghi chú                                         |
| ----------- | ------------------------------- | ------------- | ----------------------------------------------- |
| id          | uuid                            | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4()   |
| station_id  | uuid                            | NO            | Khóa ngoại (FK) → stations.id ON DELETE CASCADE |
| point_id    | uuid                            | YES           |                                                 |
| reported_by | uuid                            | YES           |                                                 |
| description | text                            | YES           |                                                 |
| severity    | station_incidents_severity_enum | NO            | Mặc định: 'medium'                              |
| status      | station_incidents_status_enum   | NO            | Mặc định: 'pending_confirmation'                |
| resolved_at | timestamptz                     | YES           |                                                 |
| created_at  | timestamptz                     | NO            | Mặc định: NOW()                                 |
| updated_at  | timestamptz                     | NO            | Mặc định: NOW()                                 |

**Chỉ mục:** `idx_inc_station` ON station_incidents(station_id, status)

## `station_maintenance`

| Cột          | Kiểu dữ liệu | Cho phép Null | Ghi chú                                         |
| ------------ | ------------ | ------------- | ----------------------------------------------- |
| id           | uuid         | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4()   |
| station_id   | uuid         | NO            | Khóa ngoại (FK) → stations.id ON DELETE CASCADE |
| start_time   | timestamptz  | NO            |                                                 |
| end_time     | timestamptz  | NO            |                                                 |
| reason       | text         | NO            |                                                 |
| scheduled_by | uuid         | NO            |                                                 |
| created_at   | timestamptz  | NO            | Mặc định: NOW()                                 |

**Chỉ mục:** `idx_maint_station` ON station_maintenance(station_id, start_time)  
**Chỉ mục:** `idx_maint_time` ON station_maintenance(start_time, end_time)

## `event_outbox`

| Cột            | Kiểu dữ liệu             | Cho phép Null | Ghi chú                                       |
| -------------- | ------------------------ | ------------- | --------------------------------------------- |
| id             | uuid                     | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| aggregate_type | varchar(100)             | NO            |                                               |
| aggregate_id   | uuid                     | NO            |                                               |
| event_type     | varchar(100)             | NO            |                                               |
| payload        | jsonb                    | NO            |                                               |
| status         | event_outbox_status_enum | NO            | Mặc định: 'pending'                           |
| retry_count    | smallint                 | NO            | Mặc định: 0                                   |
| error_message  | text                     | YES           |                                               |
| created_at     | timestamptz              | NO            | Mặc định: NOW()                               |
| processed_at   | timestamptz              | YES           |                                               |

**Chỉ mục:** `idx_outbox_pending` ON event_outbox(status, created_at) WHERE status = 'pending'

## `processed_events`

| Cột          | Kiểu dữ liệu | Cho phép Null | Ghi chú         |
| ------------ | ------------ | ------------- | --------------- |
| event_id     | varchar(100) | NO            | Khóa chính (PK) |
| event_type   | varchar(100) | NO            |                 |
| processed_at | timestamptz  | NO            | Mặc định: NOW() |

---

# Dịch vụ: Session Service (Quản lý Phiên sạc)

**Cơ sở dữ liệu:** `ev_session_db` | **Bộ chứa (Container):** `ev-pg-session`

### Enums

- `bookings_status_enum`: `'pending_payment'`, `'confirmed'`, `'cancelled'`, `'completed'`, `'expired'`, `'no_show'`
- `queue_entries_status_enum`: `'waiting'`, `'notified'`, `'served'`, `'cancelled'`, `'expired'`
- `charger_state_availability_enum`: `'available'`, `'occupied'`, `'faulted'`, `'offline'`, `'reserved'`
- `charging_sessions_status_enum`: `'pending'`, `'active'`, `'completed'`, `'error'`, `'interrupted'`
- `event_outbox_status_enum`: `'pending'`, `'processed'`, `'published'`, `'failed'`

## `bookings`

| Cột                    | Kiểu dữ liệu         | Cho phép Null | Ghi chú                     |
| ---------------------- | -------------------- | ------------- | --------------------------- |
| id                     | uuid                 | NO            | Khóa chính (PK)             |
| user_id                | uuid                 | NO            |                             |
| vehicle_id             | uuid                 | YES           |                             |
| charger_id             | uuid                 | NO            |                             |
| pricing_snapshot_id    | uuid                 | YES           |                             |
| start_time             | timestamptz          | NO            |                             |
| end_time               | timestamptz          | NO            |                             |
| status                 | bookings_status_enum | NO            | Mặc định: 'pending_payment' |
| expires_at             | timestamptz          | YES           |                             |
| notes                  | text                 | YES           |                             |
| deposit_amount         | numeric(12, 0)       | YES           |                             |
| deposit_transaction_id | uuid                 | YES           |                             |
| qr_token               | varchar(40)          | YES           | Duy nhất (UNIQUE), sinh sau khi thanh toán |
| penalty_amount         | numeric(12, 0)       | YES           |                             |
| created_at             | timestamptz          | NO            | Mặc định: NOW()             |
| updated_at             | timestamptz          | NO            | Mặc định: NOW()             |

**Chỉ mục:** `idx_book_user_status` ON bookings(user_id, status, start_time)  
**Chỉ mục:** `idx_book_charger_time` ON bookings(charger_id, start_time)

## `booking_status_history`

| Cột        | Kiểu dữ liệu | Cho phép Null | Ghi chú                                         |
| ---------- | ------------ | ------------- | ----------------------------------------------- |
| id         | uuid         | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4()   |
| booking_id | uuid         | NO            | Khóa ngoại (FK) → bookings.id ON DELETE CASCADE |
| status     | varchar(20)  | NO            |                                                 |
| changed_at | timestamptz  | NO            | Mặc định: NOW()                                 |
| changed_by | uuid         | YES           |                                                 |
| reason     | text         | YES           |                                                 |

**Chỉ mục:** `idx_bsh_booking` ON booking_status_history(booking_id)

## `pricing_snapshots`

| Cột              | Kiểu dữ liệu   | Cho phép Null | Ghi chú                                       |
| ---------------- | -------------- | ------------- | --------------------------------------------- |
| id               | uuid           | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| charger_id       | uuid           | NO            |                                               |
| connector_type   | varchar(20)    | NO            |                                               |
| price_per_kwh    | numeric(10, 4) | NO            |                                               |
| price_per_minute | numeric(10, 4) | YES           |                                               |
| currency         | char(3)        | NO            | Mặc định: 'VND'                               |
| captured_at      | timestamptz    | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_psnap_charger` ON pricing_snapshots(charger_id)

## `queue_entries`

| Cột         | Kiểu dữ liệu              | Cho phép Null | Ghi chú                                       |
| ----------- | ------------------------- | ------------- | --------------------------------------------- |
| id          | uuid                      | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| user_id     | uuid                      | NO            |                                               |
| charger_id  | uuid                      | NO            |                                               |
| vehicle_id  | uuid                      | YES           |                                               |
| priority    | smallint                  | NO            | Mặc định: 100                                 |
| status      | queue_entries_status_enum | NO            | Mặc định: 'waiting'                           |
| joined_at   | timestamptz               | NO            | Mặc định: NOW()                               |
| notified_at | timestamptz               | YES           |                                               |
| served_at   | timestamptz               | YES           |                                               |
| expires_at  | timestamptz               | YES           |                                               |

**Chỉ mục:** `idx_queue_user` ON queue_entries(user_id, status)  
**Chỉ mục:** `idx_queue_charger` ON queue_entries(charger_id, priority, joined_at) WHERE status = 'waiting'

## `scheduling_slots`

| Cột              | Kiểu dữ liệu  | Cho phép Null | Ghi chú                                       |
| ---------------- | ------------- | ------------- | --------------------------------------------- |
| id               | uuid          | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| charger_id       | uuid          | NO            |                                               |
| user_id          | uuid          | NO            |                                               |
| vehicle_id       | uuid          | YES           |                                               |
| suggested_start  | timestamptz   | NO            |                                               |
| suggested_end    | timestamptz   | NO            |                                               |
| confidence_score | numeric(4, 3) | YES           | 0.0-1.0                                       |
| algorithm        | varchar(50)   | YES           | ví dụ: 'dp-optimizer'                         |
| generated_at     | timestamptz   | NO            | Mặc định: NOW()                               |
| accepted_at      | timestamptz   | YES           |                                               |
| booking_id       | uuid          | YES           |                                               |

**Chỉ mục:** `idx_slot_charger` ON scheduling_slots(charger_id, suggested_start)  
**Chỉ mục:** `idx_slot_user` ON scheduling_slots(user_id) WHERE accepted_at IS NULL

## `charger_state`

| Cột               | Kiểu dữ liệu                    | Cho phép Null | Ghi chú               |
| ----------------- | ------------------------------- | ------------- | --------------------- |
| charger_id        | uuid                            | NO            | Khóa chính (PK)       |
| availability      | charger_state_availability_enum | NO            | Mặc định: 'available' |
| active_session_id | uuid                            | YES           |                       |
| error_code        | varchar(100)                    | YES           |                       |
| last_heartbeat_at | timestamptz                     | YES           |                       |
| updated_at        | timestamptz                     | NO            | Mặc định: NOW()       |

## `charging_sessions`

| Cột          | Kiểu dữ liệu                  | Cho phép Null | Ghi chú             |
| ------------ | ----------------------------- | ------------- | ------------------- |
| id           | uuid                          | NO            | Khóa chính (PK)     |
| booking_id   | uuid                          | YES           | Duy nhất (UNIQUE)   |
| user_id      | uuid                          | NO            |                     |
| charger_id   | uuid                          | NO            |                     |
| start_time   | timestamptz                   | NO            | Mặc định: NOW()     |
| end_time     | timestamptz                   | YES           |                     |
| start_meter_wh | bigint                      | NO            | Mặc định: 0         |
| end_meter_wh | bigint                        | YES           |                     |
| status       | charging_sessions_status_enum | NO            | Mặc định: 'pending' |
| error_reason | varchar(500)                  | YES           |                     |
| initiated_by | varchar(20)                   | NO            | Mặc định: 'user'    |
| created_at   | timestamptz                   | NO            | Mặc định: NOW()     |

**Chỉ mục:** `idx_session_user_status` ON charging_sessions(user_id, status)  
**Chỉ mục:** `idx_session_charger_status` ON charging_sessions(charger_id, status)  
**Chỉ mục:** `idx_session_active` ON charging_sessions(charger_id, start_time) WHERE status = 'active'  
**Chỉ mục:** `idx_session_booking` ON charging_sessions(booking_id) WHERE booking_id IS NOT NULL

## `session_telemetry`

| Cột           | Kiểu dữ liệu  | Cho phép Null | Ghi chú                                                  |
| ------------- | ------------- | ------------- | -------------------------------------------------------- |
| id            | uuid          | NO            | Khóa chính (PK)                                          |
| session_id    | uuid          | NO            | Khóa ngoại (FK) → charging_sessions.id ON DELETE CASCADE |
| recorded_at   | timestamptz   | NO            | Mặc định: NOW()                                          |
| power_kw      | numeric(8, 3) | YES           |                                                          |
| meter_wh      | bigint        | YES           |                                                          |
| voltage_v     | numeric(7, 2) | YES           |                                                          |
| current_a     | numeric(7, 3) | YES           |                                                          |
| soc_percent   | smallint      | YES           |                                                          |
| temperature_c | numeric(5, 2) | YES           |                                                          |
| error_code    | varchar(50)   | YES           |                                                          |

**Chỉ mục:** `idx_telemetry_session` ON session_telemetry(session_id, recorded_at)

## `charger_read_models` (CQRS)

| Cột            | Kiểu dữ liệu  | Cho phép Null | Ghi chú                  |
| -------------- | ------------- | ------------- | ------------------------ |
| charger_id     | uuid          | NO            | Khóa chính (PK)          |
| station_id     | uuid          | NO            | Đồng bộ từ infra service |
| station_name   | varchar(255)  | NO            |                          |
| city_name      | varchar(100)  | YES           |                          |
| connector_type | varchar(20)   | NO            |                          |
| max_power_kw   | numeric(8, 2) | YES           |                          |
| is_active      | boolean       | NO            | Mặc định: true           |
| synced_at      | timestamptz   | NO            | Mặc định: NOW()          |

## `vehicle_read_models` (CQRS)

| Cột            | Kiểu dữ liệu | Cho phép Null | Ghi chú                |
| -------------- | ------------ | ------------- | ---------------------- |
| vehicle_id     | uuid         | NO            | Khóa chính (PK)        |
| owner_id       | uuid         | NO            | Đồng bộ từ IAM service |
| plate_number   | varchar(20)  | NO            |                        |
| connector_type | varchar(20)  | YES           |                        |
| model_label    | varchar(100) | YES           |                        |
| is_active      | boolean      | NO            | Mặc định: true         |
| synced_at      | timestamptz  | NO            | Mặc định: NOW()        |

## `user_debt_read_models` (CQRS)

| Cột                  | Kiểu dữ liệu   | Cho phép Null | Ghi chú         |
| -------------------- | -------------- | ------------- | --------------- |
| user_id              | uuid           | NO            | Khóa chính (PK) |
| has_outstanding_debt | boolean        | NO            | Mặc định: false |
| arrears_amount       | numeric(12, 0) | NO            | Mặc định: 0     |
| synced_at            | timestamptz    | NO            | Mặc định: NOW() |

**Chỉ mục:** `idx_debt_outstanding` ON user_debt_read_models(has_outstanding_debt) WHERE has_outstanding_debt = true

## `booking_read_models` (CQRS)

| Cột                    | Kiểu dữ liệu   | Cho phép Null | Ghi chú         |
| ---------------------- | -------------- | ------------- | --------------- |
| booking_id             | uuid           | NO            | Khóa chính (PK) |
| user_id                | uuid           | NO            |                 |
| charger_id             | uuid           | NO            |                 |
| start_time             | timestamptz    | NO            |                 |
| end_time               | timestamptz    | NO            |                 |
| qr_token               | varchar(40)    | YES           |                 |
| deposit_amount         | numeric(12, 0) | NO            | Mặc định: 0     |
| deposit_transaction_id | uuid           | YES           |                 |
| connector_type         | varchar(20)    | YES           |                 |
| synced_at              | timestamptz    | NO            | Mặc định: NOW() |

**Chỉ mục:** `idx_brm_user` ON booking_read_models(user_id)  
**Chỉ mục:** `idx_brm_charger` ON booking_read_models(charger_id)  
**Chỉ mục:** `idx_brm_qr` ON booking_read_models(qr_token) WHERE qr_token IS NOT NULL

## `event_outbox`

| Cột            | Kiểu dữ liệu             | Cho phép Null | Ghi chú                                       |
| -------------- | ------------------------ | ------------- | --------------------------------------------- |
| id             | uuid                     | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| aggregate_type | varchar(100)             | NO            |                                               |
| aggregate_id   | uuid                     | NO            |                                               |
| event_type     | varchar(100)             | NO            |                                               |
| payload        | jsonb                    | NO            |                                               |
| status         | event_outbox_status_enum | NO            | Mặc định: 'pending'                           |
| created_at     | timestamptz              | NO            | Mặc định: NOW()                               |
| published_at   | timestamptz              | YES           |                                               |
| processed_at   | timestamptz              | YES           |                                               |
| retry_count    | smallint                 | NO            | Mặc định: 0                                   |
| error_message  | text                     | YES           |                                               |

**Chỉ mục:** `idx_outbox_pending` ON event_outbox(status, created_at) WHERE status = 'pending'

## `processed_events`

| Cột          | Kiểu dữ liệu | Cho phép Null | Ghi chú         |
| ------------ | ------------ | ------------- | --------------- |
| event_id     | varchar(100) | NO            | Khóa chính (PK) |
| event_type   | varchar(100) | NO            |                 |
| processed_at | timestamptz  | NO            | Mặc định: NOW() |

---

# Dịch vụ: Billing Service (Thanh toán & Hóa đơn)

**Cơ sở dữ liệu:** `ev_billing_db` | **Bộ chứa (Container):** `ev-pg-billing`

### Enums

- `wallets_status_enum`: `'active'`, `'suspended'`, `'closed'`
- `transactions_type_enum`: `'topup'`, `'payment'`, `'refund'`
- `transactions_method_enum`: `'wallet'`, `'bank_transfer'`, `'cash'`
- `transactions_related_type_enum`: `'subscription'`, `'booking'`, `'charging_session'`, `'guest_charging'`
- `transactions_status_enum`: `'pending'`, `'completed'`, `'failed'`, `'cancelled'`
- `plans_plan_type_enum`: `'basic'`, `'standard'`, `'premium'`
- `subscriptions_status_enum`: `'pending'`, `'active'`, `'cancelled'`, `'expired'`
- `event_outbox_status_enum`: `'pending'`, `'processed'`, `'failed'`

## `wallets`

| Cột        | Kiểu dữ liệu        | Cho phép Null | Ghi chú                                       |
| ---------- | ------------------- | ------------- | --------------------------------------------- |
| id         | uuid                | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| user_id    | uuid                | NO            | Duy nhất (UNIQUE)                             |
| currency   | char(3)             | NO            | Mặc định: 'VND'                               |
| status     | wallets_status_enum | NO            | Mặc định: 'active'                            |
| created_at | timestamptz         | NO            | Mặc định: NOW()                               |
| updated_at | timestamptz         | NO            | Mặc định: NOW()                               |

## `transactions`

| Cột            | Kiểu dữ liệu                   | Cho phép Null | Ghi chú                                       |
| -------------- | ------------------------------ | ------------- | --------------------------------------------- |
| id             | uuid                           | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| user_id        | uuid                           | NO            |                                               |
| type           | transactions_type_enum         | NO            |                                               |
| amount         | numeric(14, 2)                 | NO            |                                               |
| currency       | char(3)                        | NO            | Mặc định: 'VND'                               |
| method         | transactions_method_enum       | NO            |                                               |
| related_id     | uuid                           | YES           |                                               |
| related_type   | transactions_related_type_enum | YES           |                                               |
| external_id    | varchar(100)                   | YES           |                                               |
| reference_code | varchar(100)                   | YES           | Duy nhất (UNIQUE)                             |
| status         | transactions_status_enum       | NO            | Mặc định: 'pending'                           |
| meta           | jsonb                          | YES           |                                               |
| created_at     | timestamptz                    | NO            | Mặc định: NOW()                               |
| updated_at     | timestamptz                    | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_tx_user_date` ON transactions(user_id, created_at)  
**Chỉ mục:** `idx_tx_status` ON transactions(status, created_at)  
**Chỉ mục:** `idx_tx_ref` ON transactions(reference_code) WHERE reference_code IS NOT NULL

## `wallet_ledger`

| Cột            | Kiểu dữ liệu   | Cho phép Null | Ghi chú                                       |
| -------------- | -------------- | ------------- | --------------------------------------------- |
| id             | uuid           | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| wallet_id      | uuid           | NO            |                                               |
| transaction_id | uuid           | NO            | Duy nhất (UNIQUE)                             |
| delta_amount   | numeric(14, 2) | NO            | + nạp / - trừ                                 |
| balance_after  | numeric(14, 2) | NO            |                                               |
| created_at     | timestamptz    | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_ledger_wallet` ON wallet_ledger(wallet_id, created_at)

## `invoices`

| Cột            | Kiểu dữ liệu   | Cho phép Null | Ghi chú                                       |
| -------------- | -------------- | ------------- | --------------------------------------------- |
| id             | uuid           | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| transaction_id | uuid           | NO            | Duy nhất (UNIQUE)                             |
| user_id        | uuid           | NO            |                                               |
| total_amount   | numeric(14, 2) | NO            |                                               |
| due_date       | timestamptz    | YES           |                                               |
| status         | varchar(20)    | NO            | Mặc định: 'unpaid'                            |
| created_at     | timestamptz    | NO            | Mặc định: NOW()                               |
| updated_at     | timestamptz    | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_inv_user_st` ON invoices(user_id, status)

## `plans`

| Cột            | Kiểu dữ liệu         | Cho phép Null | Ghi chú                                       |
| -------------- | -------------------- | ------------- | --------------------------------------------- |
| id             | uuid                 | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| name           | varchar(100)         | NO            | Duy nhất (UNIQUE)                             |
| plan_type      | plans_plan_type_enum | NO            | Mặc định: 'basic'                             |
| price_amount   | numeric(12, 2)       | NO            | Mặc định: 0                                   |
| price_currency | char(3)              | NO            | Mặc định: 'VND'                               |
| duration_days  | integer              | NO            |                                               |
| description    | text                 | YES           |                                               |
| is_active      | boolean              | NO            | Mặc định: true                                |
| created_at     | timestamptz          | NO            | Mặc định: NOW()                               |
| updated_at     | timestamptz          | NO            | Mặc định: NOW()                               |

## `subscriptions`

| Cột        | Kiểu dữ liệu              | Cho phép Null | Ghi chú                                       |
| ---------- | ------------------------- | ------------- | --------------------------------------------- |
| id         | uuid                      | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| user_id    | uuid                      | NO            |                                               |
| plan_id    | uuid                      | NO            |                                               |
| start_date | timestamptz               | NO            | Mặc định: NOW()                               |
| end_date   | timestamptz               | YES           |                                               |
| auto_renew | boolean                   | NO            | Mặc định: true                                |
| status     | subscriptions_status_enum | NO            | Mặc định: 'pending'                           |
| created_at | timestamptz               | NO            | Mặc định: NOW()                               |
| updated_at | timestamptz               | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_sub_user_st` ON subscriptions(user_id, status)  
**Chỉ mục:** `idx_sub_expires` ON subscriptions(end_date) WHERE status = 'active'

## `user_read_models` (CQRS)

| Cột       | Kiểu dữ liệu | Cho phép Null | Ghi chú                |
| --------- | ------------ | ------------- | ---------------------- |
| user_id   | uuid         | NO            | Khóa chính (PK)        |
| email     | varchar(255) | NO            | Đồng bộ từ IAM service |
| full_name | varchar(100) | YES           |                        |
| is_active | boolean      | NO            | Mặc định: true         |
| synced_at | timestamptz  | NO            | Mặc định: NOW()        |

## `event_outbox`

| Cột            | Kiểu dữ liệu             | Cho phép Null | Ghi chú                                       |
| -------------- | ------------------------ | ------------- | --------------------------------------------- |
| id             | uuid                     | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| aggregate_type | varchar(100)             | NO            |                                               |
| aggregate_id   | uuid                     | NO            |                                               |
| event_type     | varchar(100)             | NO            |                                               |
| payload        | jsonb                    | NO            |                                               |
| status         | event_outbox_status_enum | NO            | Mặc định: 'pending'                           |
| retry_count    | smallint                 | NO            | Mặc định: 0                                   |
| error_message  | text                     | YES           |                                               |
| created_at     | timestamptz              | NO            | Mặc định: NOW()                               |
| processed_at   | timestamptz              | YES           |                                               |

**Chỉ mục:** `idx_outbox_pending` ON event_outbox(status, created_at) WHERE status = 'pending'

## `processed_events`

| Cột          | Kiểu dữ liệu | Cho phép Null | Ghi chú         |
| ------------ | ------------ | ------------- | --------------- |
| event_id     | varchar(100) | NO            | Khóa chính (PK) |
| event_type   | varchar(100) | NO            |                 |
| processed_at | timestamptz  | NO            | Mặc định: NOW() |

---

# Dịch vụ: Analytics Service (Phân tích Dữ liệu)

**Cơ sở dữ liệu:** `ev_analytics_db` | **Bộ chứa (Container):** `ev-pg-analytics`

## `platform_kpi_snapshots`

| Cột                   | Kiểu dữ liệu | Cho phép Null | Ghi chú                                       |
| --------------------- | ------------ | ------------- | --------------------------------------------- |
| id                    | uuid         | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| captured_at           | timestamptz  | NO            |                                               |
| period                | varchar(20)  | NO            | ví dụ: '2026-04'                              |
| active_sessions       | integer      | NO            | Mặc định: 0                                   |
| total_chargers        | integer      | NO            | Mặc định: 0                                   |
| available_chargers    | integer      | NO            | Mặc định: 0                                   |
| bookings_last_hour    | integer      | NO            | Mặc định: 0                                   |
| revenue_last_hour_vnd | bigint       | NO            | Mặc định: 0                                   |

**Chỉ mục:** `idx_kpi_captured` ON platform_kpi_snapshots(captured_at)

## `daily_station_metrics`

| Cột               | Kiểu dữ liệu   | Cho phép Null | Ghi chú                                       |
| ----------------- | -------------- | ------------- | --------------------------------------------- |
| id                | uuid           | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| station_id        | uuid           | NO            |                                               |
| metric_date       | date           | NO            |                                               |
| total_sessions    | integer        | NO            | Mặc định: 0                                   |
| total_kwh         | numeric(12, 4) | NO            | Mặc định: 0                                   |
| total_revenue_vnd | bigint         | NO            | Mặc định: 0                                   |
| avg_session_min   | numeric(8, 2)  | NO            | Mặc định: 0                                   |
| utilization_rate  | numeric(5, 4)  | NO            | Mặc định: 0, range 0.0-1.0                    |
| updated_at        | timestamptz    | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_dsm_date` ON daily_station_metrics(metric_date)  
**Chỉ mục:** `idx_dsm_station_date` ON daily_station_metrics(station_id, metric_date)

## `daily_user_metrics`

| Cột              | Kiểu dữ liệu   | Cho phép Null | Ghi chú                                       |
| ---------------- | -------------- | ------------- | --------------------------------------------- |
| id               | uuid           | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| user_id          | uuid           | NO            |                                               |
| metric_date      | date           | NO            |                                               |
| sessions_count   | integer        | NO            | Mặc định: 0                                   |
| kwh_consumed     | numeric(10, 4) | NO            | Mặc định: 0                                   |
| amount_spent_vnd | bigint         | NO            | Mặc định: 0                                   |

**Chỉ mục:** `idx_dum_user_date` ON daily_user_metrics(user_id, metric_date)

## `hourly_usage_stats`

| Cột                | Kiểu dữ liệu   | Cho phép Null | Ghi chú                                       |
| ------------------ | -------------- | ------------- | --------------------------------------------- |
| id                 | uuid           | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| station_id         | uuid           | NO            |                                               |
| charger_id         | uuid           | NO            |                                               |
| hour_bucket        | timestamptz    | NO            | Làm tròn đến giờ                              |
| hour_of_day        | smallint       | NO            | 0-23                                          |
| sessions_count     | integer        | NO            | Mặc định: 0                                   |
| kwh_consumed       | numeric(10, 4) | NO            | Mặc định: 0                                   |
| total_duration_min | numeric(10, 2) | NO            | Mặc định: 0                                   |
| updated_at         | timestamptz    | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_hus_hour_of_day` ON hourly_usage_stats(hour_of_day, hour_bucket)  
**Chỉ mục:** `idx_hus_station_bucket` ON hourly_usage_stats(station_id, hour_bucket)

## `revenue_stats`

| Cột                | Kiểu dữ liệu | Cho phép Null | Ghi chú                                       |
| ------------------ | ------------ | ------------- | --------------------------------------------- |
| id                 | uuid         | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| station_id         | uuid         | YES           | NULL = tổng toàn hệ thống                     |
| billing_month      | varchar(7)   | NO            | Định dạng: YYYY-MM                            |
| total_revenue_vnd  | bigint       | NO            | Mặc định: 0                                   |
| total_transactions | integer      | NO            | Mặc định: 0                                   |
| updated_at         | timestamptz  | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_rev_month` ON revenue_stats(billing_month)  
**Chỉ mục:** `idx_rev_station_month` ON revenue_stats(station_id, billing_month)

## `booking_stats`

| Cột                | Kiểu dữ liệu | Cho phép Null | Ghi chú                                       |
| ------------------ | ------------ | ------------- | --------------------------------------------- |
| id                 | uuid         | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| station_id         | uuid         | NO            |                                               |
| metric_date        | date         | NO            |                                               |
| bookings_created   | integer      | NO            | Mặc định: 0                                   |
| bookings_confirmed | integer      | NO            | Mặc định: 0                                   |
| bookings_cancelled | integer      | NO            | Mặc định: 0                                   |
| updated_at         | timestamptz  | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_bks_station_date` ON booking_stats(station_id, metric_date)

## `user_behavior_stats`

| Cột                | Kiểu dữ liệu   | Cho phép Null | Ghi chú                                       |
| ------------------ | -------------- | ------------- | --------------------------------------------- |
| id                 | uuid           | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| user_id            | uuid           | NO            | Duy nhất (UNIQUE)                             |
| total_sessions     | integer        | NO            | Mặc định: 0                                   |
| total_kwh          | numeric(12, 4) | NO            | Mặc định: 0                                   |
| total_duration_min | numeric(10, 2) | NO            | Mặc định: 0                                   |
| avg_duration_min   | numeric(8, 2)  | NO            | Mặc định: 0                                   |
| last_session_at    | timestamptz    | YES           |                                               |
| updated_at         | timestamptz    | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_ubs_user` ON user_behavior_stats(user_id)

## `event_log`

| Cột            | Kiểu dữ liệu | Cho phép Null | Ghi chú                                       |
| -------------- | ------------ | ------------- | --------------------------------------------- |
| id             | uuid         | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| event_type     | varchar(100) | NO            |                                               |
| source_service | varchar(50)  | NO            |                                               |
| aggregate_id   | uuid         | YES           |                                               |
| user_id        | uuid         | YES           |                                               |
| payload        | jsonb        | NO            | Mặc định: '{}'                                |
| received_at    | timestamptz  | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_elog_type_time` ON event_log(event_type, received_at)  
**Chỉ mục:** `idx_elog_user_time` ON event_log(user_id, received_at)

## `processed_events`

| Cột          | Kiểu dữ liệu | Cho phép Null | Ghi chú         |
| ------------ | ------------ | ------------- | --------------- |
| event_id     | varchar(255) | NO            | Khóa chính (PK) |
| event_type   | varchar(100) | NO            |                 |
| processed_at | timestamptz  | NO            | Mặc định: NOW() |

---

# Dịch vụ: Notification Service (Thông báo)

**Cơ sở dữ liệu:** `ev_notification_db` | **Bộ chứa (Container):** `ev-pg-notify`

## `notification_preferences`

| Cột               | Kiểu dữ liệu | Cho phép Null | Ghi chú         |
| ----------------- | ------------ | ------------- | --------------- |
| user_id           | uuid         | NO            | Khóa chính (PK) |
| enable_push       | boolean      | NO            | Mặc định: true  |
| enable_realtime   | boolean      | NO            | Mặc định: true  |
| enable_email      | boolean      | NO            | Mặc định: true  |
| enable_sms        | boolean      | NO            | Mặc định: false |
| quiet_hours_start | smallint     | YES           | 0-23            |
| quiet_hours_end   | smallint     | YES           | 0-23            |
| updated_at        | timestamptz  | NO            | Mặc định: NOW() |

## `devices`

| Cột            | Kiểu dữ liệu | Cho phép Null | Ghi chú                                       |
| -------------- | ------------ | ------------- | --------------------------------------------- |
| id             | uuid         | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4() |
| user_id        | uuid         | NO            |                                               |
| platform       | varchar(20)  | NO            | ios\|android\|web                             |
| push_token     | varchar(512) | NO            | Duy nhất (UNIQUE), FCM token                  |
| device_name    | varchar(255) | YES           |                                               |
| last_active_at | timestamptz  | NO            | Mặc định: NOW()                               |
| created_at     | timestamptz  | NO            | Mặc định: NOW()                               |

**Chỉ mục:** `idx_dev_user` ON devices(user_id)  
**Chỉ mục:** `idx_dev_token` ON devices(push_token)

## `notifications`

| Cột        | Kiểu dữ liệu | Cho phép Null | Ghi chú                                                 |
| ---------- | ------------ | ------------- | ------------------------------------------------------- |
| id         | uuid         | NO            | Khóa chính (PK), Mặc định: uuid_generate_v4()           |
| user_id    | uuid         | NO            |                                                         |
| type       | varchar(50)  | NO            | booking_created\|charging_started\|payment_success\|... |
| channel    | varchar(20)  | NO            | push\|email\|sms\|in_app                                |
| title      | varchar(500) | NO            |                                                         |
| body       | text         | NO            |                                                         |
| status     | varchar(20)  | NO            | Mặc định: 'pending'                                     |
| metadata   | jsonb        | NO            | Mặc định: '{}'                                          |
| read_at    | timestamptz  | YES           | NULL = chưa đọc                                         |
| created_at | timestamptz  | NO            | Mặc định: NOW()                                         |

**Chỉ mục:** `idx_notif_user_status` ON notifications(user_id, status, created_at)  
**Chỉ mục:** `idx_notif_unread_user` ON notifications(user_id, read_at)

## `processed_events`

| Cột          | Kiểu dữ liệu | Cho phép Null | Ghi chú         |
| ------------ | ------------ | ------------- | --------------- |
| event_id     | varchar(255) | NO            | Khóa chính (PK) |
| event_type   | varchar(100) | NO            |                 |
| processed_at | timestamptz  | NO            | Mặc định: NOW() |

---

# Dịch vụ: Telemetry Ingestion Service (ClickHouse)

**Cơ sở dữ liệu:** ClickHouse | **Bảng:** `telemetry_logs`

> Bảng chuỗi thời gian (time-series) lưu trữ dữ liệu đo lường thô từ charger. Ghi với throughput cao, không dùng PostgreSQL. Dữ liệu được ingest từ `telemetry-ingestion-service` sau khi nhận từ `ev.telemetry` exchange.

## `telemetry_logs` (ClickHouse)

| Cột                | Kiểu dữ liệu  | Cho phép Null | Ghi chú                                      |
| ------------------ | ------------- | ------------- | -------------------------------------------- |
| event_id           | uuid          | NO            | Khóa chính (PK)                              |
| charger_id         | uuid          | NO            |                                              |
| session_id         | uuid          | YES           |                                              |
| power_kw           | Float32       | YES           | Công suất tức thời (kW)                      |
| current_a          | Float32       | YES           | Dòng điện (A)                                |
| voltage_v          | Float32       | YES           | Điện áp (V)                                  |
| meter_wh           | UInt64        | YES           | Chỉ số công tơ (Wh)                          |
| soc_percent        | UInt8         | YES           | State of Charge 0-100 (%)                    |
| temperature_c      | Float32       | YES           | Nhiệt độ (°C)                                |
| error_code         | String        | YES           | Mã lỗi OCPP                                  |
| hardware_timestamp | DateTime      | YES           | Thời gian ghi nhận tại phần cứng             |
| received_at        | DateTime      | NO            | Thời gian nhận tại server, Mặc định: NOW()   |

**Engine:** MergeTree() ORDER BY (charger_id, received_at)

---

## Ghi chú Kiến trúc (Architecture Notes)

### Các Pattern Hướng Sự Kiện (Event-Driven Patterns)

- **event_outbox**: Transactional Outbox Pattern — Đảm bảo phân phối sự kiện theo nguyên tắc ít-nhất-một-lần (At-least-once). Được tất cả các service sử dụng để xuất bản sự kiện lên event bus một cách đáng tin cậy mà không gặp vấn đề dual-write.
- **processed_events**: Kho lưu trữ Idempotency — Đảm bảo xử lý sự kiện đúng-một-lần (Exactly-once) cho các consumers. Theo dõi `event_id` để ngăn chặn việc xử lý trùng lặp.

- **CQRS Read Models** (ký hiệu bằng hậu tố `_read_models`): Các bản sao dữ liệu (projections) được phi chuẩn hóa từ các service khác, đồng bộ thông qua sự kiện:
  - `session_db.charger_read_models` ← đồng bộ từ `ev_infrastructure_db`
  - `session_db.vehicle_read_models` ← đồng bộ từ `ev_iam_db`
  - `session_db.user_debt_read_models` ← đồng bộ từ `ev_billing_db`
  - `session_db.booking_read_models` ← đồng bộ từ `session_db` (cache nội bộ)
  - `billing_db.user_read_models` ← đồng bộ từ `ev_iam_db`

### Tính Toàn Vẹn Dữ Liệu Xuyên Cơ Sở Dữ Liệu (Cross-Database Integrity)

- **Không sử dụng Khóa ngoại (Foreign Keys) giữa các cơ sở dữ liệu** — Mỗi service tự duy trì tính nhất quán dữ liệu của chính mình.
- **Nhất quán cuối cùng (Eventual consistency)** thông qua choreography sự kiện — Các sự kiện domain được xuất bản lên RabbitMQ đảm bảo tính nhất quán bất đồng bộ giữa các service.
- **Tính toàn vẹn tham chiếu** được duy trì qua:
  - Xác thực payload của sự kiện (Event payload validation)
  - Đồng bộ Read model với theo dõi trạng thái
  - Khử trùng lặp qua khóa idempotency (các cột `idempotency_key`)

### Các Pattern Giao Dịch An Toàn (Transaction-Safe Patterns)

- **Giao dịch đặt cọc (Deposit transactions)** (các cột `deposit_transaction_id`): Liên kết các phiên đặt chỗ/sạc với các giao dịch thanh toán để đối soát.
- **Bản lưu giá (Pricing snapshots)**: Lưu lại trạng thái giá tại thời điểm đặt chỗ nhằm ngăn ngừa các thay đổi giá hồi tố tác động đến khách hàng.
- **Enum trạng thái (Status enums)**: Các máy trạng thái (state machines) an toàn kiểu dữ liệu (Type-safe) dành cho các luồng quy trình quan trọng (bookings, charging_sessions, transactions).

### Chỉ Mục Tối Ưu Hiệu Năng (Performance Indexes)

- **Chỉ mục có bộ lọc (Filtered indexes)**: Các điều kiện `WHERE status = ...` giúp giảm kích thước chỉ mục, tập trung vào dữ liệu đang hoạt động.
- **Chỉ mục kết hợp (Composite indexes)**: Hỗ trợ các mẫu truy vấn phổ biến (user_id + status, station_id + date, v.v.).
- **Chỉ mục không gian (Geospatial indexing)**: `idx_sta_geo` trên (latitude, longitude) phục vụ các tìm kiếm trạm sạc lân cận.
- **Truy vấn theo thời gian (Time-range queries)**: Hầu hết các bảng được lập chỉ mục trên `created_at`, `metric_date`, hoặc `hour_bucket` để phục vụ phân tích dữ liệu chuỗi thời gian.
