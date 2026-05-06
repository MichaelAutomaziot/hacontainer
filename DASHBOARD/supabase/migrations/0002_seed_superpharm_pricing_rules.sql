-- 0002_seed_superpharm_pricing_rules.sql
-- Applied live as `seed_superpharm_pricing_rules` 2026-04-30. Rule set verified
-- against production 2026-05-05 (5 rows present, all active=true).

INSERT INTO public.pricing_rules (channel, rule_type, config, active) VALUES
  ('superpharm', 'shipping_addon',     '{"amount": 39, "currency": "ILS"}'::jsonb, true),
  ('superpharm', 'strike_multiplier',  '{"factor": 1.15}'::jsonb, true),
  ('superpharm', 'sale_duration',      '{"days": 30}'::jsonb, true),
  ('superpharm', 'skip_extras',        '{"labels": ["express","distant_area","kibbutz","above_2nd_floor"]}'::jsonb, true),
  ('superpharm', 'price_match',        '{"match_lowest_competitor": true, "always_add_shipping": true}'::jsonb, true)
ON CONFLICT DO NOTHING;
