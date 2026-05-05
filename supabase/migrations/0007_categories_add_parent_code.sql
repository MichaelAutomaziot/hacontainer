-- 0007_categories_add_parent_code.sql
-- Live version 20260504074737. Mirrored from production 2026-05-05.

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS parent_code text;
CREATE INDEX IF NOT EXISTS categories_parent_code_idx ON public.categories (parent_code);
