-- ============================================
-- Service : billing-service
-- Table   : plans
-- File    : database/seeds/billing-service/01_plans.sql
-- Depends : none
-- Records : 3
-- Note    : plan_type here (basic/standard/premium) differs from iam-service
--           subscriptions.plan_type (free/paid). The billing plans define
--             pricing tiers; plan_type='basic' is the free tier.
-- ============================================
SET session_replication_role = replica;
BEGIN;
  TRUNCATE TABLE plans CASCADE;
INSERT INTO plans (id, name, plan_type, price_amount, price_currency, duration_days, description, is_active) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Basic', 'basic', 0, 'VND', 30, 'Gói miễn phí cơ bản', true),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Standard', 'standard', 199000, 'VND', 30, 'Gói tiêu chuẩn với nhiều ưu đãi', true),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'Premium', 'premium', 399000, 'VND', 30, 'Gói cao cấp với tất cả tính năng', true);
COMMIT;
SET session_replication_role = DEFAULT;
