-- ============================================
-- Service : iam-service
-- Table   : vehicle_models
-- File    : database/seeds/iam-service/01_vehicle_models.sql
-- Depends : none
-- Records : 17
-- ============================================
SET session_replication_role = replica;
BEGIN;
  TRUNCATE TABLE vehicle_models CASCADE;

INSERT INTO vehicle_models (id, brand, model_name, year, battery_capacity_kwh, usable_capacity_kwh, default_charge_port, max_ac_power_kw, max_dc_power_kw) VALUES
  ('f2f2f2f2-0000-0000-0000-000000000001', 'VinFast', 'VF3', 2024, 15, 14.5, 'GB/T', 7, 30),
  ('f2f2f2f2-0000-0000-0000-000000000002', 'VinFast', 'VF5 Plus', 2023, 37, 36, 'GB/T', 11, 70),
  ('f2f2f2f2-0000-0000-0000-000000000003', 'VinFast', 'VF6', 2023, 59.6, 58, 'GB/T', 11, 80),
  ('f2f2f2f2-0000-0000-0000-000000000004', 'VinFast', 'VF7', 2024, 75.3, 73, 'GB/T', 11, 150),
  ('f2f2f2f2-0000-0000-0000-000000000005', 'VinFast', 'VF8', 2022, 87.7, 85, 'GB/T', 11, 150),
  ('f2f2f2f2-0000-0000-0000-000000000006', 'VinFast', 'VF9', 2023, 123, 120, 'GB/T', 11, 150),
  ('f2f2f2f2-0000-0000-0000-000000000007', 'VinFast', 'VF e34', 2021, 42, 40, 'GB/T', 7, 70),
  ('f2f2f2f2-0000-0000-0000-000000000008', 'Tesla', 'Model 3 SR', 2023, 60, 57.5, 'CCS', 11, 170),
  ('f2f2f2f2-0000-0000-0000-000000000009', 'Tesla', 'Model Y LR', 2023, 82, 78.4, 'CCS', 11, 250),
  ('f2f2f2f2-0000-0000-0000-000000000010', 'BMW', 'iX xDrive50', 2023, 111.5, 105.2, 'CCS', 11, 195),
  ('f2f2f2f2-0000-0000-0000-000000000011', 'BMW', 'i4 eDrive40', 2023, 83.9, 80.7, 'CCS', 11, 180),
  ('f2f2f2f2-0000-0000-0000-000000000012', 'Hyundai', 'IONIQ 5', 2023, 77.4, 74, 'CCS', 11, 220),
  ('f2f2f2f2-0000-0000-0000-000000000013', 'Hyundai', 'IONIQ 6', 2023, 77.4, 74, 'CCS', 11, 233),
  ('f2f2f2f2-0000-0000-0000-000000000014', 'Kia', 'EV6 GT-Line', 2023, 77.4, 74, 'CCS', 11, 233),
  ('f2f2f2f2-0000-0000-0000-000000000015', 'BYD', 'Atto 3', 2023, 60.5, 60, 'CCS', 11, 88),
  ('f2f2f2f2-0000-0000-0000-000000000016', 'BYD', 'Seal', 2023, 82.5, 80, 'CCS', 11, 150),
  ('f2f2f2f2-0000-0000-0000-000000000017', 'MG', 'MG4 Electric', 2023, 64, 61.7, 'CCS', 11, 135);


COMMIT;
SET session_replication_role = DEFAULT;
