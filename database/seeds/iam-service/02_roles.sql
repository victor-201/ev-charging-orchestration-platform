-- ============================================
-- Service : iam-service
-- Table   : roles
-- File    : database/seeds/iam-service/02_roles.sql
-- Depends : none
-- Records : 3
-- ============================================
SET session_replication_role = replica;
BEGIN;
  TRUNCATE TABLE roles CASCADE;

INSERT INTO roles (id, name, description, is_system) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin', 'Administrator', true),
  ('22222222-2222-2222-2222-222222222222', 'user', 'Customer', true),
  ('33333333-3333-3333-3333-333333333333', 'staff', 'Operator Staff', true);


COMMIT;
SET session_replication_role = DEFAULT;
