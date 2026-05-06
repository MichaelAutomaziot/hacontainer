-- 0029: extend public.categories with level / is_leaf / label_normalized
-- so the PM01 push route can hard-filter to leaves and normalised labels
-- without an in-memory fuzzy match.
--
-- Levels are derived from the SP code pattern (verified live as 14/189/1710/1218):
--   __000000mp = L1, ____0000mp = L2, ______00mp = L3, else L4 leaf.
-- is_leaf is computed structurally: a row is a leaf when no other row
-- references it as parent_code.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS level smallint,
  ADD COLUMN IF NOT EXISTS is_leaf boolean,
  ADD COLUMN IF NOT EXISTS label_normalized text;

UPDATE public.categories SET level = CASE
  WHEN sp_category_code LIKE '__000000mp' THEN 1
  WHEN sp_category_code LIKE '____0000mp' THEN 2
  WHEN sp_category_code LIKE '______00mp' THEN 3
  ELSE 4
END;

UPDATE public.categories c SET is_leaf = NOT EXISTS (
  SELECT 1 FROM public.categories child WHERE child.parent_code = c.sp_category_code
);

UPDATE public.categories
   SET label_normalized = lower(btrim(name_he));

CREATE INDEX IF NOT EXISTS categories_level_idx       ON public.categories (level);
CREATE INDEX IF NOT EXISTS categories_is_leaf_idx     ON public.categories (is_leaf) WHERE is_leaf;
CREATE INDEX IF NOT EXISTS categories_label_norm_idx  ON public.categories (label_normalized);
