-- 0009_operator_custom_fields_add_entity.sql
-- Live version 20260504075129. Mirrored from production 2026-05-05.

ALTER TABLE public.operator_custom_fields
  ADD COLUMN IF NOT EXISTS entity text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS editable boolean,
  ADD COLUMN IF NOT EXISTS accepted_values jsonb;
CREATE INDEX IF NOT EXISTS operator_custom_fields_entity_idx ON public.operator_custom_fields (entity);
