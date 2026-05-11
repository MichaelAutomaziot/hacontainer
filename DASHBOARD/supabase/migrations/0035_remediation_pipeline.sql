-- Auto-remediation pipeline for Super-Pharm catalog rejections.
--
-- The XLSX export from SP's merchandiser review surface (Error Details
-- sheet) is ingested into remediation_queue. The orchestrator picks up
-- pending rows, fans out to per-error fixers (image / text / category /
-- attribute) and on success retriggers PM01 for the affected inv_ids.

CREATE TABLE IF NOT EXISTS public.remediation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inv_id bigint NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  shop_sku text NOT NULL,
  error_code text NOT NULL,
  error_message text,
  attribute_codes text,
  source text NOT NULL DEFAULT 'xlsx',
  status text NOT NULL DEFAULT 'pending',
  fix_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  fixed_at timestamptz,
  re_pushed_at timestamptz,
  pm01_sync_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS remediation_queue_inv_id_idx ON public.remediation_queue (inv_id);
CREATE INDEX IF NOT EXISTS remediation_queue_status_idx ON public.remediation_queue (status);
CREATE UNIQUE INDEX IF NOT EXISTS remediation_queue_inv_err_key
  ON public.remediation_queue (inv_id, error_code);

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS original_image_url text,
  ADD COLUMN IF NOT EXISTS processed_image_url text,
  ADD COLUMN IF NOT EXISTS remediation_status text;

-- Snapshot of the live SP hierarchy so the LLM category-fixer has a stable
-- candidate list. Refreshed on demand by the orchestrator the first time
-- the table is empty or older than 7 days.
CREATE TABLE IF NOT EXISTS public.sp_hierarchy_snapshot (
  code text PRIMARY KEY,
  label text NOT NULL,
  parent_code text,
  level integer NOT NULL,
  is_leaf boolean NOT NULL DEFAULT false,
  full_path text,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sp_hierarchy_snapshot_leaf_idx
  ON public.sp_hierarchy_snapshot (is_leaf) WHERE is_leaf;

-- Storage bucket for remediated product images (white-bg, ≥1000×1000 JPEG).
INSERT INTO storage.buckets (id, name, public)
VALUES ('processed-images', 'processed-images', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'processed_images_public_read'
  ) THEN
    CREATE POLICY processed_images_public_read
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'processed-images');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'processed_images_service_write'
  ) THEN
    CREATE POLICY processed_images_service_write
      ON storage.objects FOR INSERT
      TO service_role
      WITH CHECK (bucket_id = 'processed-images');
  END IF;
END $$;

-- RLS for remediation_queue: read for authenticated (admins use it from the
-- dashboard); writes happen via service-role from the orchestrator.
ALTER TABLE public.remediation_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'remediation_queue'
      AND policyname = 'remediation_queue_authenticated_read'
  ) THEN
    CREATE POLICY remediation_queue_authenticated_read
      ON public.remediation_queue FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

ALTER TABLE public.sp_hierarchy_snapshot ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sp_hierarchy_snapshot'
      AND policyname = 'sp_hierarchy_snapshot_authenticated_read'
  ) THEN
    CREATE POLICY sp_hierarchy_snapshot_authenticated_read
      ON public.sp_hierarchy_snapshot FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;
