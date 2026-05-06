-- 0022_disable_price_match.sql
-- Disable price_match for the first push. Per locked decision (2026-05-05):
-- price_match has no margin floor → risk of matching a competitor loss-leader.
-- Re-enable once a min-markup or cost-floor field lands on pricing_rules.config.

UPDATE public.pricing_rules
SET active = false
WHERE channel = 'superpharm' AND rule_type = 'price_match';
