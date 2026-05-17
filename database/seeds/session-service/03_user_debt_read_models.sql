-- ============================================
-- Service : session-service
-- Table   : user_debt_read_models
-- File    : database/seeds/session-service/03_user_debt_read_models.sql
-- Depends : none
-- Records : 10
-- ============================================
SET session_replication_role = replica;
BEGIN;
  TRUNCATE TABLE user_debt_read_models CASCADE;

INSERT INTO user_debt_read_models (user_id, has_outstanding_debt, arrears_amount) VALUES
  ('11111111-0000-0000-0000-000000000001', true, 21173),
  ('11111111-0000-0000-0000-000000000002', true, 45582),
  ('11111111-0000-0000-0000-000000000003', true, 26855),
  ('11111111-0000-0000-0000-000000000004', true, 24359),
  ('11111111-0000-0000-0000-000000000005', true, 41221),
  ('11111111-0000-0000-0000-000000000006', true, 27750),
  ('11111111-0000-0000-0000-000000000007', true, 49326),
  ('11111111-0000-0000-0000-000000000008', true, 38123),
  ('11111111-0000-0000-0000-000000000009', true, 26171),
  ('11111111-0000-0000-0000-000000000010', true, 43484);


COMMIT;
SET session_replication_role = DEFAULT;
