# Database Schema — EV Charging Platform

# Service: IAM Service (Identity & Access Management)

**Database:** `ev_iam_db` | **Container:** `ev-pg-iam`

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

| Column             | Data Type         | Nullable | Notes                                        |
| ------------------ | ----------------- | -------- | -------------------------------------------- |
| id                 | uuid              | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| email              | varchar(255)      | NO       | Unique (UNIQUE)                              |
| full_name          | varchar(100)      | NO       |                                              |
| phone              | varchar(20)       | YES      |                                              |
| date_of_birth      | date              | NO       |                                              |
| password_hash      | varchar(255)      | NO       | bcrypt encrypted                             |
| status             | users_status_enum | NO       | Default: 'active'                            |
| email_verified     | boolean           | NO       | Default: false                               |
| mfa_enabled        | boolean           | NO       | Default: false                               |
| mfa_secret         | varchar(255)      | YES      | TOTP secret (encrypted)                      |
| failed_login_count | smallint          | NO       | Default: 0                                   |
| locked_until       | timestamptz       | YES      | Brute-force lock                             |
| created_at         | timestamptz       | NO       | Default: NOW()                               |
| updated_at         | timestamptz       | NO       | Default: NOW()                               |

**Index:** `idx_users_status` ON users(status)

## `user_profiles`

| Column     | Data Type    | Nullable | Notes                                                       |
| ---------- | ------------ | -------- | ----------------------------------------------------------- |
| user_id    | uuid         | NO       | Primary Key (PK), Foreign Key (FK) → users.id ON DELETE CASCADE |
| avatar_url | text         | YES      |                                                             |
| address    | text         | YES      |                                                             |
| updated_at | timestamptz  | NO       | Default: NOW()                                              |

## `roles`

| Column      | Data Type    | Nullable | Notes                                        |
| ----------- | ------------ | -------- | -------------------------------------------- |
| id          | uuid         | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| name        | varchar(50)  | NO       | Unique (UNIQUE)                              |
| description | text         | YES      |                                              |
| is_system   | boolean      | NO       | Default: false                               |
| created_at  | timestamptz  | NO       | Default: NOW()                               |
| updated_at  | timestamptz  | NO       | Default: NOW()                               |

## `permissions`

| Column      | Data Type    | Nullable | Notes                                        |
| ----------- | ------------ | -------- | -------------------------------------------- |
| id          | uuid         | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| name        | varchar(100) | NO       | Unique (UNIQUE)                              |
| resource    | varchar(50)  | NO       |                                              |
| action      | varchar(50)  | NO       |                                              |
| description | text         | YES      |                                              |
| created_at  | timestamptz  | NO       | Default: NOW()                               |

## `role_permissions`

| Column        | Data Type    | Nullable | Notes                                            |
| ------------- | ------------ | -------- | ------------------------------------------------ |
| role_id       | uuid         | NO       | Foreign Key (FK) → roles.id ON DELETE CASCADE       |
| permission_id | uuid         | NO       | Foreign Key (FK) → permissions.id ON DELETE CASCADE |
| granted_at    | timestamptz  | NO       | Default: NOW()                                    |

**PK:** (role_id, permission_id)

## `user_roles`

| Column      | Data Type    | Nullable | Notes                                        |
| ----------- | ------------ | -------- | -------------------------------------------- |
| user_id     | uuid         | NO       | Foreign Key (FK) → users.id ON DELETE CASCADE  |
| role_id     | uuid         | NO       | Foreign Key (FK) → roles.id ON DELETE CASCADE  |
| assigned_at | timestamptz  | NO       | Default: NOW()                               |
| assigned_by | uuid         | YES      | Foreign Key (FK) → users.id ON DELETE SET NULL |
| expires_at  | timestamptz  | YES      | Role expiration                              |

**PK:** (user_id, role_id)  
**Index:** `idx_user_roles_user_id` ON user_roles(user_id)

## `auth_sessions`

| Column             | Data Type    | Nullable | Notes                                        |
| ------------------ | ------------ | -------- | -------------------------------------------- |
| id                 | uuid         | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| user_id            | uuid         | NO       | Foreign Key (FK) → users.id ON DELETE CASCADE  |
| refresh_token_hash | varchar(255) | NO       | Unique (UNIQUE)                              |
| device_fingerprint | varchar(255) | YES      |                                              |
| ip_address         | inet         | YES      |                                              |
| user_agent         | text         | YES      |                                              |
| expires_at         | timestamptz  | NO       |                                              |
| revoked_at         | timestamptz  | YES      | NULL = active                                |
| created_at         | timestamptz  | NO       | Default: NOW()                               |

**Index:** `idx_auth_sessions_user_id` ON auth_sessions(user_id)

## `email_verification_tokens`

| Column      | Data Type    | Nullable | Notes                                        |
| ----------- | ------------ | -------- | -------------------------------------------- |
| id          | uuid         | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| user_id     | uuid         | NO       | Foreign Key (FK) → users.id ON DELETE CASCADE  |
| token_hash  | varchar(255) | NO       | Unique (UNIQUE)                              |
| short_code  | varchar(6)   | YES      | NULL if verified via token link              |
| expires_at  | timestamptz  | NO       |                                              |
| verified_at | timestamptz  | YES      |                                              |
| created_at  | timestamptz  | NO       | Default: NOW()                               |

## `password_reset_tokens`

| Column     | Data Type    | Nullable | Notes                                        |
| ---------- | ------------ | -------- | -------------------------------------------- |
| id         | uuid         | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| user_id    | uuid         | NO       | Foreign Key (FK) → users.id ON DELETE CASCADE  |
| token_hash | varchar(255) | NO       | Unique (UNIQUE)                              |
| expires_at | timestamptz  | NO       |                                              |
| used_at    | timestamptz  | YES      |                                              |
| created_at | timestamptz  | NO       | Default: NOW()                               |

## `staff_profiles`

| Column       | Data Type                  | Nullable | Notes                                                         |
| ------------ | -------------------------- | -------- | ------------------------------------------------------------- |
| id           | uuid                       | NO       | Primary Key (PK), Default: uuid_generate_v4()                 |
| user_id      | uuid                       | NO       | Unique (UNIQUE), Foreign Key (FK) → users.id ON DELETE CASCADE|
| station_id   | uuid                       | NO       |                                                               |
| station_name | varchar(255)               | YES      |                                                               |
| position     | staff_profiles_position_enum | NO     | Default: 'operator'                                           |
| shift        | staff_profiles_shift_enum  | NO       | Default: 'morning'                                            |
| hire_date    | date                       | NO       | Default: CURRENT_DATE                                         |
| is_active    | boolean                    | NO       | Default: true                                                 |
| notes        | text                       | YES      |                                                               |
| created_at   | timestamptz                | NO       | Default: NOW()                                                |
| updated_at   | timestamptz                | NO       | Default: NOW()                                                |

**Index:** `idx_staff_profiles_station_id` ON staff_profiles(station_id)

## `attendance`

| Column     | Data Type            | Nullable | Notes                                                |
| ---------- | -------------------- | -------- | ---------------------------------------------------- |
| id         | uuid                 | NO       | Primary Key (PK), Default: uuid_generate_v4()          |
| staff_id   | uuid                 | NO       | Foreign Key (FK) → staff_profiles.id ON DELETE CASCADE |
| work_date  | date                 | NO       |                                                      |
| check_in   | timestamptz          | YES      |                                                      |
| check_out  | timestamptz          | YES      |                                                      |
| status     | attendance_status_enum | NO     | Default: 'absent'                                    |
| notes      | text                 | YES      |                                                      |
| created_at | timestamptz          | NO       | Default: NOW()                                       |
| updated_at | timestamptz          | NO       | Default: NOW()                                       |

**Index:** `idx_attendance_staff_date` ON attendance(staff_id, work_date)

## `user_fcm_tokens`

| Column      | Data Type                      | Nullable | Notes                                        |
| ----------- | ------------------------------ | -------- | -------------------------------------------- |
| id          | uuid                           | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| user_id     | uuid                           | NO       | Foreign Key (FK) → users.id ON DELETE CASCADE  |
| fcm_token   | text                           | NO       | Unique (UNIQUE)                              |
| device_type | user_fcm_tokens_device_type_enum| NO      |                                              |
| is_active   | boolean                        | NO       | Default: true                                |
| created_at  | timestamptz                    | NO       | Default: NOW()                               |
| updated_at  | timestamptz                    | NO       | Default: NOW()                               |

**Index:** `idx_user_fcm_tokens_user_id` ON user_fcm_tokens(user_id)

## `vehicle_models`

| Column               | Data Type                             | Nullable | Notes                                        |
| -------------------- | ------------------------------------- | -------- | -------------------------------------------- |
| id                   | uuid                                  | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| brand                | varchar(50)                           | NO       |                                              |
| model_name           | varchar(50)                           | NO       |                                              |
| year                 | smallint                              | NO       |                                              |
| battery_capacity_kwh | numeric(6, 2)                         | YES      |                                              |
| usable_capacity_kwh  | numeric(6, 2)                         | YES      |                                              |
| default_charge_port  | vehicle_models_default_charge_port_enum| YES     |                                              |
| max_ac_power_kw      | numeric(5, 2)                         | YES      |                                              |
| max_dc_power_kw      | numeric(5, 2)                         | YES      |                                              |

## `vehicles`

| Column             | Data Type          | Nullable | Notes                                        |
| ------------------ | ------------------ | -------- | -------------------------------------------- |
| id                 | uuid               | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| owner_id           | uuid               | NO       | Foreign Key (FK) → users.id ON DELETE CASCADE  |
| model_id           | uuid               | NO       | Foreign Key (FK) → vehicle_models.id           |
| plate_number       | varchar(20)        | NO       | Unique (UNIQUE)                              |
| color              | varchar(30)        | YES      |                                              |
| status             | vehicles_status_enum| NO       | Default: 'active'                            |
| is_primary         | boolean            | NO       | Default: false                               |
| mac_address        | varchar(17)        | YES      | Partial unique (if not NULL)                 |
| vin_number         | varchar(17)        | YES      | Partial unique (if not NULL)                 |
| autocharge_enabled | boolean            | NO       | Default: false                               |
| version            | integer            | NO       | Default: 1                                   |
| deleted_at         | timestamptz        | YES      |                                              |
| created_at         | timestamptz        | NO       | Default: NOW()                               |
| updated_at         | timestamptz        | NO       | Default: NOW()                               |

**Index:** `idx_vehicles_owner_status` ON vehicles(owner_id, status)  
**Index:** `idx_vehicles_mac_address` ON vehicles(mac_address) WHERE mac_address IS NOT NULL (Unique)  
**Index:** `idx_vehicles_vin_number` ON vehicles(vin_number) WHERE vin_number IS NOT NULL (Unique)

## `vehicle_audit_logs`

| Column     | Data Type    | Nullable | Notes                                        |
| ---------- | ------------ | -------- | -------------------------------------------- |
| id         | uuid         | NO       | Primary Key (PK)                             |
| vehicle_id | uuid         | NO       |                                              |
| user_id    | uuid         | NO       |                                              |
| action     | varchar(30)  | NO       | `'created'`, `'updated'`, `'deleted'`, `'set_primary'` |
| changes    | jsonb        | YES      | Snapshot of changed fields                   |
| changed_by | uuid         | YES      | Admin/user who made the change               |
| created_at | timestamptz  | NO       | Default: NOW()                               |

**Index:** `idx_val_vehicle` ON vehicle_audit_logs(vehicle_id)  
**Index:** `idx_val_user` ON vehicle_audit_logs(user_id)

## `profile_audit_logs`

| Column     | Data Type    | Nullable | Notes                                        |
| ---------- | ------------ | -------- | -------------------------------------------- |
| id         | uuid         | NO       | Primary Key (PK)                             |
| user_id    | uuid         | NO       |                                              |
| action     | varchar(30)  | NO       | `'updated'`, `'deleted'`                     |
| changes    | jsonb        | YES      | Snapshot of changed fields                   |
| changed_by | uuid         | YES      | Admin/user who made the change               |
| created_at | timestamptz  | NO       | Default: NOW()                               |

**Index:** `idx_pal_user` ON profile_audit_logs(user_id)

## `user_arrears`

| Column         | Data Type      | Nullable | Notes                                        |
| -------------- | -------------- | -------- | -------------------------------------------- |
| id             | uuid           | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| user_id        | uuid           | NO       | Foreign Key (FK) → users.id ON DELETE CASCADE  |
| wallet_id      | uuid           | NO       |                                              |
| session_id     | uuid           | NO       |                                              |
| arrears_amount | numeric(12, 0) | NO       |                                              |
| status         | varchar(20)    | NO       | Default: 'outstanding'                       |
| cleared_at     | timestamptz    | YES      |                                              |
| created_at     | timestamptz    | NO       | Default: NOW()                               |
| updated_at     | timestamptz    | NO       | Default: NOW()                               |

**Index:** `idx_arrears_outstanding` ON user_arrears(user_id) WHERE status = 'outstanding'  
**Index:** `idx_arrears_user_status` ON user_arrears(user_id, status)

## `users_cache`

| Column               | Data Type       | Nullable | Notes             |
| -------------------- | --------------- | -------- | ----------------- |
| user_id              | uuid            | NO       | Primary Key (PK)  |
| email                | varchar(255)    | NO       |                   |
| full_name            | varchar(100)    | NO       |                   |
| phone                | varchar(20)     | YES      |                   |
| role_name            | varchar(50)     | NO       | Default: 'user'   |
| status               | varchar(20)     | NO       | Default: 'active' |
| email_verified       | boolean         | NO       | Default: false    |
| has_outstanding_debt | boolean         | NO       | Default: false    |
| arrears_amount       | numeric(12, 0)  | NO       | Default: 0        |
| synced_at            | timestamptz     | NO       | Default: NOW()    |

## `subscriptions`

| Column     | Data Type    | Nullable | Notes                                        |
| ---------- | ------------ | -------- | -------------------------------------------- |
| id         | uuid         | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| user_id    | uuid         | NO       | Foreign Key (FK) → users.id ON DELETE CASCADE  |
| plan_id    | uuid         | NO       |                                              |
| plan_name  | varchar(100) | YES      |                                              |
| plan_type  | varchar(20)  | YES      |                                              |
| start_date | timestamptz  | NO       | Default: NOW()                               |
| end_date   | timestamptz  | YES      |                                              |
| auto_renew | boolean      | NO       | Default: true                                |
| status     | varchar(20)  | NO       | Default: 'pending'                           |
| created_at | timestamptz  | NO       | Default: NOW()                               |
| updated_at | timestamptz  | NO       | Default: NOW()                               |

## `event_outbox`

| Column         | Data Type              | Nullable | Notes                                        |
| -------------- | ---------------------- | -------- | -------------------------------------------- |
| id             | uuid                   | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| aggregate_type | varchar(100)           | NO       |                                              |
| aggregate_id   | uuid                   | NO       |                                              |
| event_type     | varchar(100)           | NO       |                                              |
| payload        | jsonb                  | NO       |                                              |
| status         | event_outbox_status_enum| NO       | Default: 'pending'                           |
| retry_count    | smallint               | NO       | Default: 0                                   |
| error_message  | text                   | YES      |                                              |
| created_at     | timestamptz            | NO       | Default: NOW()                               |
| processed_at   | timestamptz            | YES      |                                              |

**Index:** `idx_outbox_pending` ON event_outbox(status, created_at) WHERE status = 'pending'

## `processed_events`

| Column       | Data Type    | Nullable | Notes           |
| ------------ | ------------ | -------- | --------------- |
| event_id     | varchar(100) | NO       | Primary Key (PK)|
| event_type   | varchar(100) | NO       |                 |
| processed_at | timestamptz  | NO       | Default: NOW()  |

---

# Service: Infrastructure Service (Station Infrastructure)

**Database:** `ev_infrastructure_db` | **Container:** `ev-pg-infra`

### Enums

- `stations_status_enum`: `'active'`, `'closed'`, `'maintenance'`, `'inactive'`
- `charging_points_status_enum`: `'available'`, `'in_use'`, `'offline'`, `'faulted'`, `'reserved'`
- `connectors_connector_type_enum`: `'CCS'`, `'CHAdeMO'`, `'Type2'`, `'GB/T'`, `'Other'`
- `pricing_rules_connector_type_enum`: `'CCS'`, `'CHAdeMO'`, `'Type2'`, `'GB/T'`, `'Other'`
- `station_incidents_severity_enum`: `'low'`, `'medium'`, `'high'`, `'critical'`
- `station_incidents_status_enum`: `'pending_confirmation'`, `'in_progress'`, `'resolved'`, `'rejected'`
- `event_outbox_status_enum`: `'pending'`, `'processed'`, `'failed'`

## `cities`

| Column       | Data Type     | Nullable | Notes                                        |
| ------------ | ------------- | -------- | -------------------------------------------- |
| id           | uuid          | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| city_name    | varchar(100)  | NO       | Unique (UNIQUE)                              |
| region       | varchar(100)  | NO       |                                              |
| country_code | char(2)       | NO       | Default: 'VN'                                |

## `stations`

| Column     | Data Type          | Nullable | Notes                                        |
| ---------- | ------------------ | -------- | -------------------------------------------- |
| id         | uuid               | NO       | Primary Key (PK), Default: uuid_generate_v4() |
| name       | varchar(255)       | NO       |                                              |
| address    | varchar(500)       | YES      |                                              |
| city_id    | uuid               | NO       | Foreign Key (FK) → cities.id                 |
| latitude   | numeric(10, 7)     | YES      |                                              |
| longitude  | numeric(10, 7)     | YES      |                                              |
| status     | stations_status_enum| NO       | Default: 'active'                            |
| owner_id   | uuid               | YES      |                                              |
| owner_name | varchar(100)       | YES      |                                              |
| created_at | timestamptz        | NO       | Default: NOW()                               |
| updated_at | timestamptz        | NO       | Default: NOW()                               |

**Index:** `idx_sta_city` ON stations(city_id)  
**Index:** `idx_sta_geo` ON stations(latitude, longitude)  
**Index:** `idx_sta_status` ON stations(status)

## `charging_points`

| Column       | Data Type                 | Nullable | Notes                                          |
| ------------ | ------------------------- | -------- | ---------------------------------------------- |
| id           | uuid                      | NO       | Primary Key (PK), Default: uuid_generate_v4()  |
| station_id   | uuid                      | NO       | Foreign Key (FK) → stations.id ON DELETE CASCADE |
| name         | varchar(50)               | NO       |                                                |
| external_id  | varchar(100)              | YES      | Unique (UNIQUE), OCPP chargePointId            |
| max_power_kw | numeric(8, 2)             | YES      |                                                |
| status       | charging_points_status_enum | NO      | Default: 'available'                           |
| created_at   | timestamptz               | NO       | Default: NOW()                                 |
| updated_at   | timestamptz               | NO       | Default: NOW()                                 |

**Index:** `idx_cp_station` ON charging_points(station_id)  
**Index:** `idx_cp_status` ON charging_points(status)

## `connectors`

| Column            | Data Type                    | Nullable | Notes                                                 |
| ----------------- | ---------------------------- | -------- | ----------------------------------------------------- |
| id                | uuid                         | NO       | Primary Key (PK), Default: uuid_generate_v4()         |
| charging_point_id | uuid                         | NO       | Foreign Key (FK) → charging_points.id ON DELETE CASCADE |
| connector_type    | connectors_connector_type_enum | NO     |                                                       |
| max_power_kw      | numeric(8, 2)                | YES      |                                                       |

**Index:** `idx_conn_cp` ON connectors(charging_point_id)

## `pricing_rules`

| Column              | Data Type                       | Nullable | Notes                                          |
| ------------------- | ------------------------------- | -------- | ---------------------------------------------- |
| id                  | uuid                            | NO       | Primary Key (PK), Default: uuid_generate_v4()  |
| station_id          | uuid                            | NO       | Foreign Key (FK) → stations.id ON DELETE CASCADE |
| connector_type      | pricing_rules_connector_type_enum| NO      |                                                |
| valid_from          | timestamptz                     | NO       |                                                |
| valid_to            | timestamptz                     | YES      | NULL = currently active                        |
| hour_start          | smallint                        | YES      | TOU: 0-23, NULL = all day                      |
| hour_end            | smallint                        | YES      | TOU: 0-23                                      |
| day_mask            | smallint                        | NO       | Default: 0, bitmask Mon=1..Sun=64              |
| price_per_kwh       | numeric(10, 4)                  | NO       |                                                |
| price_per_minute    | numeric(10, 4)                  | YES      |                                                |
| idle_grace_minutes  | smallint                        | NO       | Default: 20                                    |
| idle_fee_per_minute | numeric(10, 2)                  | NO       | Default: 1000                                  |
| label               | varchar(100)                    | YES      | e.g. 'Peak hours'                              |
| currency            | char(3)                         | NO       | Default: 'VND'                                 |
| created_at          | timestamptz                     | NO       | Default: NOW()                                 |

**Index:** `idx_price_lookup` ON pricing_rules(station_id, connector_type, valid_from)

## `station_incidents`

| Column      | Data Type                     | Nullable | Notes                                          |
| ----------- | ------------------------------| -------- | -----------------------------------------------|
| id          | uuid                           | NO       | Primary Key (PK), Default: uuid_generate_v4()  |
| station_id  | uuid                           | NO       | Foreign Key (FK) → stations.id ON DELETE CASCADE |
| point_id    | uuid                           | YES      |                                                |
| reported_by | uuid                           | YES      |                                                |
| description | text                           | YES      |                                                |
| severity    | station_incidents_severity_enum| NO       | Default: 'medium'                              |
| status      | station_incidents_status_enum  | NO       | Default: 'pending_confirmation'                |
| resolved_at | timestamptz                    | YES      |                                                |
| created_at  | timestamptz                    | NO       | Default: NOW()                                 |
| updated_at  | timestamptz                    | NO       | Default: NOW()                                 |

**Index:** `idx_inc_station` ON station_incidents(station_id, status)

## `station_maintenance`

| Column       | Data Type    | Nullable | Notes                                          |
| ------------ | ------------ | -------- | -----------------------------------------------|
| id           | uuid         | NO       | Primary Key (PK), Default: uuid_generate_v4()  |
| station_id   | uuid         | NO       | Foreign Key (FK) → stations.id ON DELETE CASCADE |
| start_time   | timestamptz  | NO       |                                                |
| end_time     | timestamptz  | NO       |                                                |
| reason       | text         | NO       |                                                |
| scheduled_by | uuid         | NO       |                                                |
| created_at   | timestamptz  | NO       | Default: NOW()                                 |

**Index:** `idx_maint_station` ON station_maintenance(station_id, start_time)  
**Index:** `idx_maint_time` ON station_maintenance(start_time, end_time)

## `event_outbox`

| Column         | Data Type              | Nullable | Notes                                        |
| -------------- | ---------------------- | -------- | -------------------------------------------- |
| id             | uuid                   | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| aggregate_type | varchar(100)           | NO       |                                              |
| aggregate_id   | uuid                   | NO       |                                              |
| event_type     | varchar(100)           | NO       |                                              |
| payload        | jsonb                  | NO       |                                              |
| status         | event_outbox_status_enum| NO       | Default: 'pending'                           |
| retry_count    | smallint               | NO       | Default: 0                                   |
| error_message  | text                   | YES      |                                              |
| created_at     | timestamptz            | NO       | Default: NOW()                               |
| processed_at   | timestamptz            | YES      |                                              |

**Index:** `idx_outbox_pending` ON event_outbox(status, created_at) WHERE status = 'pending'

## `processed_events`

| Column       | Data Type    | Nullable | Notes           |
| ------------ | ------------ | -------- | --------------- |
| event_id     | varchar(100) | NO       | Primary Key (PK)|
| event_type   | varchar(100) | NO       |                 |
| processed_at | timestamptz  | NO       | Default: NOW()  |

---

# Service: Session Service (Charging Session Management)

**Database:** `ev_session_db` | **Container:** `ev-pg-session`

### Enums

- `bookings_status_enum`: `'pending_payment'`, `'confirmed'`, `'cancelled'`, `'completed'`, `'expired'`, `'no_show'`
- `queue_entries_status_enum`: `'waiting'`, `'notified'`, `'served'`, `'cancelled'`, `'expired'`
- `charger_state_availability_enum`: `'available'`, `'occupied'`, `'faulted'`, `'offline'`, `'reserved'`
- `charging_sessions_status_enum`: `'pending'`, `'active'`, `'completed'`, `'error'`, `'interrupted'`
- `event_outbox_status_enum`: `'pending'`, `'processed'`, `'published'`, `'failed'`

## `bookings`

| Column                 | Data Type              | Nullable | Notes                        |
| ---------------------- | ---------------------- | -------- | ---------------------------- |
| id                     | uuid                   | NO       | Primary Key (PK)             |
| user_id                | uuid                   | NO       |                              |
| vehicle_id             | uuid                   | YES      |                              |
| charger_id             | uuid                   | NO       |                              |
| pricing_snapshot_id    | uuid                   | YES      |                              |
| start_time             | timestamptz            | NO       |                              |
| end_time               | timestamptz            | NO       |                              |
| status                 | bookings_status_enum   | NO       | Default: 'pending_payment'   |
| expires_at             | timestamptz            | YES      |                              |
| notes                  | text                   | YES      |                              |
| deposit_amount         | numeric(12, 0)         | YES      |                              |
| deposit_transaction_id | uuid                   | YES      |                              |
| qr_token               | varchar(40)            | YES      | Unique (UNIQUE), generated after payment |
| penalty_amount         | numeric(12, 0)         | YES      |                              |
| created_at             | timestamptz            | NO       | Default: NOW()               |
| updated_at             | timestamptz            | NO       | Default: NOW()               |

**Index:** `idx_book_user_status` ON bookings(user_id, status, start_time)  
**Index:** `idx_book_charger_time` ON bookings(charger_id, start_time)

## `booking_status_history`

| Column     | Data Type    | Nullable | Notes                                          |
| ---------- | ------------ | -------- | ---------------------------------------------- |
| id         | uuid         | NO       | Primary Key (PK), Default: uuid_generate_v4()  |
| booking_id | uuid         | NO       | Foreign Key (FK) → bookings.id ON DELETE CASCADE |
| status     | varchar(20)  | NO       |                                                |
| changed_at | timestamptz  | NO       | Default: NOW()                                 |
| changed_by | uuid         | YES      |                                                |
| reason     | text         | YES      |                                                |

**Index:** `idx_bsh_booking` ON booking_status_history(booking_id)

## `pricing_snapshots`

| Column           | Data Type       | Nullable | Notes                                        |
| ---------------- | --------------- | -------- | -------------------------------------------- |
| id               | uuid            | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| charger_id       | uuid            | NO       |                                              |
| connector_type   | varchar(20)     | NO       |                                              |
| price_per_kwh    | numeric(10, 4)  | NO       |                                              |
| price_per_minute | numeric(10, 4)  | YES      |                                              |
| currency         | char(3)         | NO       | Default: 'VND'                               |
| captured_at      | timestamptz     | NO       | Default: NOW()                               |

**Index:** `idx_psnap_charger` ON pricing_snapshots(charger_id)

## `queue_entries`

| Column      | Data Type               | Nullable | Notes                                        |
| ----------- | ----------------------- | -------- | -------------------------------------------- |
| id          | uuid                    | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| user_id     | uuid                    | NO       |                                              |
| charger_id  | uuid                    | NO       |                                              |
| vehicle_id  | uuid                    | YES      |                                              |
| priority    | smallint                | NO       | Default: 100                                 |
| status      | queue_entries_status_enum | NO      | Default: 'waiting'                           |
| joined_at   | timestamptz             | NO       | Default: NOW()                               |
| notified_at | timestamptz             | YES      |                                              |
| served_at   | timestamptz             | YES      |                                              |
| expires_at  | timestamptz             | YES      |                                              |

**Index:** `idx_queue_user` ON queue_entries(user_id, status)  
**Index:** `idx_queue_charger` ON queue_entries(charger_id, priority, joined_at) WHERE status = 'waiting'

## `scheduling_slots`

| Column           | Data Type     | Nullable | Notes                                        |
| ---------------- | ------------- | -------- | -------------------------------------------- |
| id               | uuid          | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| charger_id       | uuid          | NO       |                                              |
| user_id          | uuid          | NO       |                                              |
| vehicle_id       | uuid          | YES      |                                              |
| suggested_start  | timestamptz   | NO       |                                              |
| suggested_end    | timestamptz   | NO       |                                              |
| confidence_score | numeric(4, 3) | YES      | 0.0-1.0                                      |
| algorithm        | varchar(50)   | YES      | e.g. 'dp-optimizer'                          |
| generated_at     | timestamptz   | NO       | Default: NOW()                               |
| accepted_at      | timestamptz   | YES      |                                              |
| booking_id       | uuid          | YES      |                                              |

**Index:** `idx_slot_charger` ON scheduling_slots(charger_id, suggested_start)  
**Index:** `idx_slot_user` ON scheduling_slots(user_id) WHERE accepted_at IS NULL

## `charger_state`

| Column            | Data Type                     | Nullable | Notes               |
| ----------------- | ----------------------------- | -------- | ------------------- |
| charger_id        | uuid                          | NO       | Primary Key (PK)    |
| availability      | charger_state_availability_enum| NO       | Default: 'available'|
| active_session_id | uuid                          | YES      |                     |
| error_code        | varchar(100)                  | YES      |                     |
| last_heartbeat_at | timestamptz                   | YES      |                     |
| updated_at        | timestamptz                   | NO       | Default: NOW()      |

## `charging_sessions`

| Column       | Data Type                   | Nullable | Notes              |
| ------------ | --------------------------- | -------- | ------------------ |
| id           | uuid                        | NO       | Primary Key (PK)   |
| booking_id   | uuid                        | YES      | Unique (UNIQUE)    |
| user_id      | uuid                        | NO       |                    |
| charger_id   | uuid                        | NO       |                    |
| start_time   | timestamptz                 | NO       | Default: NOW()     |
| end_time     | timestamptz                 | YES      |                    |
| start_meter_wh | bigint                    | NO       | Default: 0         |
| end_meter_wh | bigint                      | YES      |                    |
| status       | charging_sessions_status_enum| NO       | Default: 'pending' |
| error_reason | varchar(500)                | YES      |                    |
| initiated_by | varchar(20)                 | NO       | Default: 'user'    |
| created_at   | timestamptz                 | NO       | Default: NOW()     |

**Index:** `idx_session_user_status` ON charging_sessions(user_id, status)  
**Index:** `idx_session_charger_status` ON charging_sessions(charger_id, status)  
**Index:** `idx_session_active` ON charging_sessions(charger_id, start_time) WHERE status = 'active'  
**Index:** `idx_session_booking` ON charging_sessions(booking_id) WHERE booking_id IS NOT NULL

## `session_telemetry`

| Column        | Data Type       | Nullable | Notes                                                   |
| ------------- | --------------- | -------- | ------------------------------------------------------- |
| id            | uuid            | NO       | Primary Key (PK)                                        |
| session_id    | uuid            | NO       | Foreign Key (FK) → charging_sessions.id ON DELETE CASCADE|
| recorded_at   | timestamptz     | NO       | Default: NOW()                                          |
| power_kw      | numeric(8, 3)   | YES      |                                                         |
| meter_wh      | bigint          | YES      |                                                         |
| voltage_v     | numeric(7, 2)   | YES      |                                                         |
| current_a     | numeric(7, 3)   | YES      |                                                         |
| soc_percent   | smallint        | YES      |                                                         |
| temperature_c | numeric(5, 2)   | YES      |                                                         |
| error_code    | varchar(50)     | YES      |                                                         |

**Index:** `idx_telemetry_session` ON session_telemetry(session_id, recorded_at)

## `charger_read_models` (CQRS)

| Column         | Data Type       | Nullable | Notes                   |
| -------------- | --------------- | -------- | ----------------------- |
| charger_id     | uuid            | NO       | Primary Key (PK)        |
| station_id     | uuid            | NO       | Synced from infra service|
| station_name   | varchar(255)    | NO       |                         |
| city_name      | varchar(100)    | YES      |                         |
| connector_type | varchar(20)     | NO       |                         |
| max_power_kw   | numeric(8, 2)   | YES      |                         |
| is_active      | boolean         | NO       | Default: true           |
| synced_at      | timestamptz     | NO       | Default: NOW()          |

## `vehicle_read_models` (CQRS)

| Column         | Data Type     | Nullable | Notes                 |
| -------------- | ------------- | -------- | --------------------- |
| vehicle_id     | uuid          | NO       | Primary Key (PK)      |
| owner_id       | uuid          | NO       | Synced from IAM service|
| plate_number   | varchar(20)   | NO       |                       |
| connector_type | varchar(20)   | YES      |                       |
| model_label    | varchar(100)  | YES      |                       |
| is_active      | boolean       | NO       | Default: true         |
| synced_at      | timestamptz   | NO       | Default: NOW()        |

## `user_debt_read_models` (CQRS)

| Column               | Data Type       | Nullable | Notes           |
| -------------------- | --------------- | -------- | --------------- |
| user_id              | uuid            | NO       | Primary Key (PK)|
| has_outstanding_debt | boolean         | NO       | Default: false  |
| arrears_amount       | numeric(12, 0)  | NO       | Default: 0      |
| synced_at            | timestamptz     | NO       | Default: NOW()  |

**Index:** `idx_debt_outstanding` ON user_debt_read_models(has_outstanding_debt) WHERE has_outstanding_debt = true

## `booking_read_models` (CQRS)

| Column                 | Data Type       | Nullable | Notes           |
| ---------------------- | --------------- | -------- | --------------- |
| booking_id             | uuid            | NO       | Primary Key (PK)|
| user_id                | uuid            | NO       |                 |
| charger_id             | uuid            | NO       |                 |
| start_time             | timestamptz     | NO       |                 |
| end_time               | timestamptz     | NO       |                 |
| qr_token               | varchar(40)     | YES      |                 |
| deposit_amount         | numeric(12, 0)  | NO       | Default: 0      |
| deposit_transaction_id | uuid            | YES      |                 |
| connector_type         | varchar(20)     | YES      |                 |
| synced_at              | timestamptz     | NO       | Default: NOW()  |

**Index:** `idx_brm_user` ON booking_read_models(user_id)  
**Index:** `idx_brm_charger` ON booking_read_models(charger_id)  
**Index:** `idx_brm_qr` ON booking_read_models(qr_token) WHERE qr_token IS NOT NULL

## `event_outbox`

| Column         | Data Type              | Nullable | Notes                                        |
| -------------- | ---------------------- | -------- | -------------------------------------------- |
| id             | uuid                   | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| aggregate_type | varchar(100)           | NO       |                                              |
| aggregate_id   | uuid                   | NO       |                                              |
| event_type     | varchar(100)           | NO       |                                              |
| payload        | jsonb                  | NO       |                                              |
| status         | event_outbox_status_enum| NO       | Default: 'pending'                           |
| created_at     | timestamptz            | NO       | Default: NOW()                               |
| published_at   | timestamptz            | YES      |                                              |
| processed_at   | timestamptz            | YES      |                                              |
| retry_count    | smallint               | NO       | Default: 0                                   |
| error_message  | text                   | YES      |                                              |

**Index:** `idx_outbox_pending` ON event_outbox(status, created_at) WHERE status = 'pending'

## `processed_events`

| Column       | Data Type    | Nullable | Notes           |
| ------------ | ------------ | -------- | --------------- |
| event_id     | varchar(100) | NO       | Primary Key (PK)|
| event_type   | varchar(100) | NO       |                 |
| processed_at | timestamptz  | NO       | Default: NOW()  |

---

# Service: Billing Service (Payment & Invoicing)

**Database:** `ev_billing_db` | **Container:** `ev-pg-billing`

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

| Column     | Data Type         | Nullable | Notes                                        |
| ---------- | ----------------- | -------- | -------------------------------------------- |
| id         | uuid              | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| user_id    | uuid              | NO       | Unique (UNIQUE)                              |
| currency   | char(3)           | NO       | Default: 'VND'                               |
| status     | wallets_status_enum| NO       | Default: 'active'                            |
| created_at | timestamptz       | NO       | Default: NOW()                               |
| updated_at | timestamptz       | NO       | Default: NOW()                               |

## `transactions`

| Column        | Data Type                    | Nullable | Notes                                        |
| ------------- | ---------------------------- | -------- | -------------------------------------------- |
| id            | uuid                         | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| user_id       | uuid                         | NO       |                                              |
| type          | transactions_type_enum       | NO       |                                              |
| amount        | numeric(14, 2)               | NO       |                                              |
| currency      | char(3)                      | NO       | Default: 'VND'                               |
| method        | transactions_method_enum     | NO       |                                              |
| related_id    | uuid                         | YES      |                                              |
| related_type  | transactions_related_type_enum| YES      |                                              |
| external_id   | varchar(100)                 | YES      |                                              |
| reference_code| varchar(100)                 | YES      | Unique (UNIQUE)                              |
| status        | transactions_status_enum     | NO       | Default: 'pending'                           |
| meta          | jsonb                        | YES      |                                              |
| created_at    | timestamptz                  | NO       | Default: NOW()                               |
| updated_at    | timestamptz                  | NO       | Default: NOW()                               |

**Index:** `idx_tx_user_date` ON transactions(user_id, created_at)  
**Index:** `idx_tx_status` ON transactions(status, created_at)  
**Index:** `idx_tx_ref` ON transactions(reference_code) WHERE reference_code IS NOT NULL

## `wallet_ledger`

| Column         | Data Type       | Nullable | Notes                                        |
| -------------- | --------------- | -------- | -------------------------------------------- |
| id             | uuid            | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| wallet_id      | uuid            | NO       |                                              |
| transaction_id | uuid            | NO       | Unique (UNIQUE)                              |
| delta_amount   | numeric(14, 2)  | NO       | + topup / - deduct                           |
| balance_after  | numeric(14, 2)  | NO       |                                              |
| created_at     | timestamptz     | NO       | Default: NOW()                               |

**Index:** `idx_ledger_wallet` ON wallet_ledger(wallet_id, created_at)

## `invoices`

| Column         | Data Type       | Nullable | Notes                                        |
| -------------- | --------------- | -------- | -------------------------------------------- |
| id             | uuid            | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| transaction_id | uuid            | NO       | Unique (UNIQUE)                              |
| user_id        | uuid            | NO       |                                              |
| total_amount   | numeric(14, 2)  | NO       |                                              |
| due_date       | timestamptz     | YES      |                                              |
| status         | varchar(20)     | NO       | Default: 'unpaid'                            |
| created_at     | timestamptz     | NO       | Default: NOW()                               |
| updated_at     | timestamptz     | NO       | Default: NOW()                               |

**Index:** `idx_inv_user_st` ON invoices(user_id, status)

## `plans`

| Column         | Data Type          | Nullable | Notes                                        |
| -------------- | ------------------ | -------- | -------------------------------------------- |
| id             | uuid               | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| name           | varchar(100)       | NO       | Unique (UNIQUE)                              |
| plan_type      | plans_plan_type_enum| NO       | Default: 'basic'                             |
| price_amount   | numeric(12, 2)     | NO       | Default: 0                                   |
| price_currency | char(3)            | NO       | Default: 'VND'                               |
| duration_days  | integer            | NO       |                                              |
| description    | text               | YES      |                                              |
| is_active      | boolean            | NO       | Default: true                                |
| created_at     | timestamptz        | NO       | Default: NOW()                               |
| updated_at     | timestamptz        | NO       | Default: NOW()                               |

## `subscriptions`

| Column     | Data Type               | Nullable | Notes                                        |
| ---------- | ----------------------- | -------- | -------------------------------------------- |
| id         | uuid                    | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| user_id    | uuid                    | NO       |                                              |
| plan_id    | uuid                    | NO       |                                              |
| start_date | timestamptz             | NO       | Default: NOW()                               |
| end_date   | timestamptz             | YES      |                                              |
| auto_renew | boolean                 | NO       | Default: true                                |
| status     | subscriptions_status_enum| NO       | Default: 'pending'                           |
| created_at | timestamptz             | NO       | Default: NOW()                               |
| updated_at | timestamptz             | NO       | Default: NOW()                               |

**Index:** `idx_sub_user_st` ON subscriptions(user_id, status)  
**Index:** `idx_sub_expires` ON subscriptions(end_date) WHERE status = 'active'

## `user_read_models` (CQRS)

| Column    | Data Type     | Nullable | Notes                 |
| --------- | ------------- | -------- | --------------------- |
| user_id   | uuid          | NO       | Primary Key (PK)      |
| email     | varchar(255)  | NO       | Synced from IAM service|
| full_name | varchar(100)  | YES      |                       |
| is_active | boolean       | NO       | Default: true         |
| synced_at | timestamptz   | NO       | Default: NOW()        |

## `event_outbox`

| Column         | Data Type              | Nullable | Notes                                        |
| -------------- | ---------------------- | -------- | -------------------------------------------- |
| id             | uuid                   | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| aggregate_type | varchar(100)           | NO       |                                              |
| aggregate_id   | uuid                   | NO       |                                              |
| event_type     | varchar(100)           | NO       |                                              |
| payload        | jsonb                  | NO       |                                              |
| status         | event_outbox_status_enum| NO       | Default: 'pending'                           |
| retry_count    | smallint               | NO       | Default: 0                                   |
| error_message  | text                   | YES      |                                              |
| created_at     | timestamptz            | NO       | Default: NOW()                               |
| processed_at   | timestamptz            | YES      |                                              |

**Index:** `idx_outbox_pending` ON event_outbox(status, created_at) WHERE status = 'pending'

## `processed_events`

| Column       | Data Type    | Nullable | Notes           |
| ------------ | ------------ | -------- | --------------- |
| event_id     | varchar(100) | NO       | Primary Key (PK)|
| event_type   | varchar(100) | NO       |                 |
| processed_at | timestamptz  | NO       | Default: NOW()  |

---

# Service: Analytics Service (Data Analytics)

**Database:** `ev_analytics_db` | **Container:** `ev-pg-analytics`

## `platform_kpi_snapshots`

| Column                | Data Type     | Nullable | Notes                                        |
| --------------------- | ------------- | -------- | -------------------------------------------- |
| id                    | uuid          | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| captured_at           | timestamptz   | NO       |                                              |
| period                | varchar(20)   | NO       | e.g. '2026-04'                               |
| active_sessions       | integer       | NO       | Default: 0                                   |
| total_chargers        | integer       | NO       | Default: 0                                   |
| available_chargers    | integer       | NO       | Default: 0                                   |
| bookings_last_hour    | integer       | NO       | Default: 0                                   |
| revenue_last_hour_vnd | bigint        | NO       | Default: 0                                   |

**Index:** `idx_kpi_captured` ON platform_kpi_snapshots(captured_at)

## `daily_station_metrics`

| Column              | Data Type        | Nullable | Notes                                        |
| ------------------- | ---------------- | -------- | -------------------------------------------- |
| id                  | uuid             | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| station_id          | uuid             | NO       |                                              |
| metric_date         | date             | NO       |                                              |
| total_sessions      | integer          | NO       | Default: 0                                   |
| total_kwh           | numeric(12, 4)   | NO       | Default: 0                                   |
| total_revenue_vnd   | bigint           | NO       | Default: 0                                   |
| avg_session_min     | numeric(8, 2)    | NO       | Default: 0                                   |
| utilization_rate    | numeric(5, 4)    | NO       | Default: 0, range 0.0-1.0                    |
| updated_at          | timestamptz      | NO       | Default: NOW()                               |

**Index:** `idx_dsm_date` ON daily_station_metrics(metric_date)  
**Index:** `idx_dsm_station_date` ON daily_station_metrics(station_id, metric_date)

## `daily_user_metrics`

| Column           | Data Type        | Nullable | Notes                                        |
| ---------------- | ---------------- | -------- | -------------------------------------------- |
| id               | uuid             | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| user_id          | uuid             | NO       |                                              |
| metric_date      | date             | NO       |                                              |
| sessions_count   | integer          | NO       | Default: 0                                   |
| kwh_consumed     | numeric(10, 4)   | NO       | Default: 0                                   |
| amount_spent_vnd | bigint           | NO       | Default: 0                                   |

**Index:** `idx_dum_user_date` ON daily_user_metrics(user_id, metric_date)

## `hourly_usage_stats`

| Column             | Data Type        | Nullable | Notes                                        |
| ------------------ | ---------------- | -------- | -------------------------------------------- |
| id                 | uuid             | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| station_id         | uuid             | NO       |                                              |
| charger_id         | uuid             | NO       |                                              |
| hour_bucket        | timestamptz      | NO       | Rounded to hour                              |
| hour_of_day        | smallint         | NO       | 0-23                                         |
| sessions_count     | integer          | NO       | Default: 0                                   |
| kwh_consumed       | numeric(10, 4)   | NO       | Default: 0                                   |
| total_duration_min | numeric(10, 2)   | NO       | Default: 0                                   |
| updated_at         | timestamptz      | NO       | Default: NOW()                               |

**Index:** `idx_hus_hour_of_day` ON hourly_usage_stats(hour_of_day, hour_bucket)  
**Index:** `idx_hus_station_bucket` ON hourly_usage_stats(station_id, hour_bucket)

## `revenue_stats`

| Column             | Data Type     | Nullable | Notes                                        |
| ------------------ | ------------- | -------- | -------------------------------------------- |
| id                 | uuid          | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| station_id         | uuid          | YES      | NULL = system-wide total                     |
| billing_month      | varchar(7)    | NO       | Format: YYYY-MM                              |
| total_revenue_vnd  | bigint        | NO       | Default: 0                                   |
| total_transactions | integer       | NO       | Default: 0                                   |
| updated_at         | timestamptz   | NO       | Default: NOW()                               |

**Index:** `idx_rev_month` ON revenue_stats(billing_month)  
**Index:** `idx_rev_station_month` ON revenue_stats(station_id, billing_month)

## `booking_stats`

| Column                | Data Type     | Nullable | Notes                                        |
| --------------------- | ------------- | -------- | -------------------------------------------- |
| id                    | uuid          | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| station_id            | uuid          | NO       |                                              |
| metric_date           | date          | NO       |                                              |
| bookings_created      | integer       | NO       | Default: 0                                   |
| bookings_confirmed    | integer       | NO       | Default: 0                                   |
| bookings_cancelled    | integer       | NO       | Default: 0                                   |
| updated_at            | timestamptz   | NO       | Default: NOW()                               |

**Index:** `idx_bks_station_date` ON booking_stats(station_id, metric_date)

## `user_behavior_stats`

| Column             | Data Type        | Nullable | Notes                                        |
| ------------------ | ---------------- | -------- | -------------------------------------------- |
| id                 | uuid             | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| user_id            | uuid             | NO       | Unique (UNIQUE)                              |
| total_sessions     | integer          | NO       | Default: 0                                   |
| total_kwh          | numeric(12, 4)   | NO       | Default: 0                                   |
| total_duration_min | numeric(10, 2)   | NO       | Default: 0                                   |
| avg_duration_min   | numeric(8, 2)    | NO       | Default: 0                                   |
| last_session_at    | timestamptz      | YES      |                                              |
| updated_at         | timestamptz      | NO       | Default: NOW()                               |

**Index:** `idx_ubs_user` ON user_behavior_stats(user_id)

## `event_log`

| Column         | Data Type     | Nullable | Notes                                        |
| -------------- | ------------- | -------- | -------------------------------------------- |
| id             | uuid          | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| event_type     | varchar(100)  | NO       |                                              |
| source_service | varchar(50)   | NO       |                                              |
| aggregate_id   | uuid          | YES      |                                              |
| user_id        | uuid          | YES      |                                              |
| payload        | jsonb         | NO       | Default: '{}'                                |
| received_at    | timestamptz   | NO       | Default: NOW()                               |

**Index:** `idx_elog_type_time` ON event_log(event_type, received_at)  
**Index:** `idx_elog_user_time` ON event_log(user_id, received_at)

## `processed_events`

| Column       | Data Type     | Nullable | Notes           |
| ------------ | ------------- | -------- | --------------- |
| event_id     | varchar(255)  | NO       | Primary Key (PK)|
| event_type   | varchar(100)  | NO       |                 |
| processed_at | timestamptz   | NO       | Default: NOW()  |

---

# Service: Notification Service

**Database:** `ev_notification_db` | **Container:** `ev-pg-notify`

## `notification_preferences`

| Column            | Data Type    | Nullable | Notes           |
| ----------------- | ------------ | -------- | --------------- |
| user_id           | uuid         | NO       | Primary Key (PK)|
| enable_push       | boolean      | NO       | Default: true   |
| enable_realtime   | boolean      | NO       | Default: true   |
| enable_email      | boolean      | NO       | Default: true   |
| enable_sms        | boolean      | NO       | Default: false  |
| quiet_hours_start | smallint     | YES      | 0-23            |
| quiet_hours_end   | smallint     | YES      | 0-23            |
| updated_at        | timestamptz  | NO       | Default: NOW()  |

## `devices`

| Column         | Data Type      | Nullable | Notes                                        |
| -------------- | -------------- | -------- | -------------------------------------------- |
| id             | uuid           | NO       | Primary Key (PK), Default: uuid_generate_v4()|
| user_id        | uuid           | NO       |                                              |
| platform       | varchar(20)    | NO       | ios\|android\|web                            |
| push_token     | varchar(512)   | NO       | Unique (UNIQUE), FCM token                   |
| device_name    | varchar(255)   | YES      |                                              |
| last_active_at | timestamptz    | NO       | Default: NOW()                               |
| created_at     | timestamptz    | NO       | Default: NOW()                               |

**Index:** `idx_dev_user` ON devices(user_id)  
**Index:** `idx_dev_token` ON devices(push_token)

## `notifications`

| Column     | Data Type     | Nullable | Notes                                                    |
| ---------- | ------------- | -------- | -------------------------------------------------------- |
| id         | uuid          | NO       | Primary Key (PK), Default: uuid_generate_v4()            |
| user_id    | uuid          | NO       |                                                          |
| type       | varchar(50)   | NO       | booking_created\|charging_started\|payment_success\|...  |
| channel    | varchar(20)   | NO       | push\|email\|sms\|in_app                                 |
| title      | varchar(500)  | NO       |                                                          |
| body       | text          | NO       |                                                          |
| status     | varchar(20)   | NO       | Default: 'pending'                                       |
| metadata   | jsonb         | NO       | Default: '{}'                                            |
| read_at    | timestamptz   | YES      | NULL = unread                                            |
| created_at | timestamptz   | NO       | Default: NOW()                                           |

**Index:** `idx_notif_user_status` ON notifications(user_id, status, created_at)  
**Index:** `idx_notif_unread_user` ON notifications(user_id, read_at)

## `processed_events`

| Column       | Data Type     | Nullable | Notes           |
| ------------ | ------------- | -------- | --------------- |
| event_id     | varchar(255)  | NO       | Primary Key (PK)|
| event_type   | varchar(100)  | NO       |                 |
| processed_at | timestamptz   | NO       | Default: NOW()  |

---

# Service: Telemetry Ingestion Service (ClickHouse)

**Database:** ClickHouse | **Table:** `telemetry_logs`

> Time-series table storing raw measurement data from chargers. High-throughput writes, does not use PostgreSQL. Data is ingested from `telemetry-ingestion-service` after receiving from `ev.telemetry` exchange.

## `telemetry_logs` (ClickHouse)

| Column             | Data Type    | Nullable | Notes                                        |
| ------------------ | ------------ | -------- | -------------------------------------------- |
| event_id           | uuid         | NO       | Primary Key (PK)                             |
| charger_id         | uuid         | NO       |                                              |
| session_id         | uuid         | YES      |                                              |
| power_kw           | Float32      | YES      | Instantaneous power (kW)                     |
| current_a          | Float32      | YES      | Current (A)                                  |
| voltage_v          | Float32      | YES      | Voltage (V)                                  |
| meter_wh           | UInt64       | YES      | Meter reading (Wh)                           |
| soc_percent        | UInt8        | YES      | State of Charge 0-100 (%)                    |
| temperature_c      | Float32      | YES      | Temperature (°C)                             |
| error_code         | String       | YES      | OCPP error code                              |
| hardware_timestamp | DateTime     | YES      | Timestamp recorded at hardware               |
| received_at        | DateTime     | NO       | Server receive time, Default: NOW()          |

**Engine:** MergeTree() ORDER BY (charger_id, received_at)

---

## Architecture Notes

### Event-Driven Patterns

- **event_outbox**: Transactional Outbox Pattern — Ensures at-least-once event delivery to the event bus. All services use this pattern to publish events reliably without dual-write issues.
- **processed_events**: Idempotency Store — Ensures exactly-once event processing for consumers. Tracks `event_id` to prevent duplicate processing.

- **CQRS Read Models** (suffix `_read_models`): Denormalized data projections synced from other services via events:
  - `session_db.charger_read_models` ← synced from `ev_infrastructure_db`
  - `session_db.vehicle_read_models` ← synced from `ev_iam_db`
  - `session_db.user_debt_read_models` ← synced from `ev_billing_db`
  - `session_db.booking_read_models` ← synced from `session_db` (internal cache)
  - `billing_db.user_read_models` ← synced from `ev_iam_db`

### Cross-Database Integrity

- **No Foreign Keys across databases** — Each service maintains its own data consistency.
- **Eventual consistency** through event choreography — Domain events published to RabbitMQ ensure asynchronous consistency between services.
- **Referential integrity** maintained via:
  - Event payload validation
  - State-tracked Read Model synchronization
  - Deduplication via idempotency keys (`idempotency_key` columns)

### Transaction-Safe Patterns

- **Deposit transactions** (`deposit_transaction_id` columns): Link booking/charging sessions to payment transactions for reconciliation.
- **Pricing snapshots**: Capture price state at booking time to prevent retroactive price changes affecting customers.
- **Status enums**: Type-safe state machines for critical workflows (bookings, charging_sessions, transactions).

### Performance Indexes

- **Filtered indexes**: `WHERE status = ...` conditions reduce index size, focusing on active data.
- **Composite indexes**: Support common query patterns (user_id + status, station_id + date, etc.).
- **Geospatial indexing**: `idx_sta_geo` on (latitude, longitude) for nearby station searches.
- **Time-range queries**: Most tables indexed on `created_at`, `metric_date`, or `hour_bucket` for time-series analysis.
