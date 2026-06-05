-- ============================================
-- Service : iam-service
-- Table   : auth_sessions
-- File    : database/seeds/iam-service/16_auth_sessions.sql
-- Depends : users
-- Records : 16
-- ============================================
SET session_replication_role = replica;
BEGIN;
  TRUNCATE TABLE auth_sessions CASCADE;
INSERT INTO auth_sessions (id, user_id, refresh_token_hash, device_fingerprint, ip_address, user_agent, expires_at, revoked_at, created_at) VALUES
  ('a7a7a7a7-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX01', 'fp-admin-01-aabbccdd', '192.168.1.100', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0', '2026-06-05 23:59:59Z', NULL, '2025-06-05 08:00:00Z'),
  ('a7a7a7a7-0000-4000-8000-000000000002', 'a0a0a0a0-0000-4000-8000-000000000002', '$2b$10$bcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY02', 'fp-admin-02-eeffgghh', '192.168.1.101', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0', '2026-06-05 23:59:59Z', NULL, '2025-06-05 08:30:00Z'),
  ('a7a7a7a7-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000001', '$2b$10$cdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ03', 'fp-staff-01-11223344', '10.0.0.50', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile/15E148', '2026-03-04 23:59:59Z', NULL, '2025-07-11 07:00:00Z'),
  ('a7a7a7a7-0000-4000-8000-000000000004', '22222222-0000-4000-8000-000000000010', '$2b$10$defghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZa04', 'fp-staff-10-55667788', '10.0.0.55', 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile', '2026-03-04 23:59:59Z', NULL, '2025-07-14 06:45:00Z'),
  ('a7a7a7a7-0000-4000-8000-000000000005', '22222222-0000-4000-8000-000000000025', '$2b$10$efghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZab05', 'fp-staff-25-99001122', '10.0.0.60', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0', '2026-03-04 23:59:59Z', NULL, '2025-07-20 09:00:00Z'),
  ('a7a7a7a7-0000-4000-8000-000000000006', '22222222-0000-4000-8000-000000000050', '$2b$10$fghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabc06', 'fp-staff-50-33445566', '10.0.0.65', 'Mozilla/5.0 (iPad; CPU OS 17_0) AppleWebKit/605.1.15 Mobile/15E148', '2026-03-04 23:59:59Z', NULL, '2025-07-24 07:30:00Z'),
  ('a7a7a7a7-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', '$2b$10$ghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcd07', 'fp-cust-01-77889900', '172.16.0.10', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 Mobile/15E148', '2026-06-05 23:59:59Z', NULL, '2025-08-04 10:00:00Z'),
  ('a7a7a7a7-0000-4000-8000-000000000008', '11111111-0000-4000-8000-000000000010', '$2b$10$hijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcde08', 'fp-cust-10-aabb0011', '172.16.0.15', 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/121.0.0.0 Mobile', '2026-06-05 23:59:59Z', NULL, '2025-08-11 11:00:00Z'),
  ('a7a7a7a7-0000-4000-8000-000000000009', '11111111-0000-4000-8000-000000000050', '$2b$10$ijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdef09', 'fp-cust-50-ccdd0022', '172.16.0.20', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0', '2026-06-05 23:59:59Z', NULL, '2025-08-19 12:00:00Z'),
  ('a7a7a7a7-0000-4000-8000-000000000010', '11111111-0000-4000-8000-000000000100', '$2b$10$jklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg10', 'fp-cust-100-eeff0033', '172.16.0.25', 'Mozilla/5.0 (Samsung Galaxy S24; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile', '2026-06-05 23:59:59Z', NULL, '2025-08-26 09:30:00Z'),
  ('a7a7a7a7-0000-4000-8000-000000000011', '11111111-0000-4000-8000-000000000200', '$2b$10$klmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh11', 'fp-cust-200-11223344', '172.16.0.30', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile/15E148', '2026-06-05 23:59:59Z', NULL, '2025-09-03 14:00:00Z'),
  ('a7a7a7a7-0000-4000-8000-000000000012', '11111111-0000-4000-8000-000000000300', '$2b$10$lmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi12', 'fp-cust-300-55667788', '172.16.0.35', 'Mozilla/5.0 (Pixel 8 Pro; Android 15) AppleWebKit/537.36 Chrome/121.0.0.0 Mobile', '2026-06-05 23:59:59Z', NULL, '2025-09-10 10:00:00Z'),
  ('a7a7a7a7-0000-4000-8000-000000000013', '11111111-0000-4000-8000-000000000400', '$2b$10$mnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij13', 'fp-cust-400-99001122', '172.16.0.40', 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile', '2026-06-05 23:59:59Z', NULL, '2025-09-19 08:00:00Z'),
  ('a7a7a7a7-0000-4000-8000-000000000014', '11111111-0000-4000-8000-000000000500', '$2b$10$nopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk14', 'fp-cust-500-33445566', '172.16.0.45', 'Mozilla/5.0 (Xiaomi 14; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile', '2026-06-05 23:59:59Z', NULL, '2025-09-26 11:00:00Z'),
  ('a7a7a7a7-0000-4000-8000-000000000015', 'a0a0a0a0-0000-4000-8000-000000000001', '$2b$10$opqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl15', 'fp-admin-01-mobile', '192.168.1.100', 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/121.0.0.0 Mobile', '2025-09-03 23:59:59Z', '2025-07-11 10:00:00Z', '2025-06-12 09:00:00Z'),
  ('a7a7a7a7-0000-4000-8000-000000000016', '11111111-0000-4000-8000-000000000005', '$2b$10$pqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm16', 'fp-cust-05-revoked', '172.16.0.12', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile/15E148', '2025-09-03 23:59:59Z', '2025-08-19 08:00:00Z', '2025-06-20 10:00:00Z');
COMMIT;
SET session_replication_role = DEFAULT;
