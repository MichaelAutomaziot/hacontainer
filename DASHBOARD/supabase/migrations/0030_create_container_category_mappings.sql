-- 0030: container_category_mappings — single source of truth for
-- Container Hebrew label → SP hierarchy code. PM01 push reads from here.
-- Seeded with one 'pending' row per distinct inventory.category text;
-- approved mappings are filled in via SQL UPDATEs (manual curation).

CREATE TABLE IF NOT EXISTS public.container_category_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  container_label text NOT NULL,
  container_label_normalized text NOT NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  sp_category_code text REFERENCES public.categories(sp_category_code) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('manual','heuristic','imported')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','superseded')),
  reasoning text,
  product_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ccm_unique_label UNIQUE (container_label_normalized)
);
ALTER TABLE public.container_category_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read ccm"   ON public.container_category_mappings;
CREATE POLICY "auth read ccm"   ON public.container_category_mappings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "editor write ccm" ON public.container_category_mappings;
CREATE POLICY "editor write ccm" ON public.container_category_mappings
  FOR ALL TO authenticated
  USING (public.is_editor_or_admin()) WITH CHECK (public.is_editor_or_admin());

DROP TRIGGER IF EXISTS trg_ccm_updated ON public.container_category_mappings;
CREATE TRIGGER trg_ccm_updated BEFORE UPDATE ON public.container_category_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.container_category_mappings (
  container_label, container_label_normalized, source, status, product_count
)
SELECT category, lower(btrim(category)), 'imported', 'pending', count(*)
  FROM public.inventory WHERE coalesce(category, '') <> ''
 GROUP BY category, lower(btrim(category))
ON CONFLICT (container_label_normalized) DO NOTHING;
