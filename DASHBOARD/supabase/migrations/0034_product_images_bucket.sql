-- Storage bucket for product images uploaded via the single-product flow.
-- Public read so Mirakl + Konimbo can fetch URLs; writes are service-role only.

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Allow public SELECT on objects in this bucket so the marketplace
-- crawlers can fetch the image URLs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'product_images_public_read'
  ) THEN
    CREATE POLICY product_images_public_read
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'product-images');
  END IF;
END $$;

-- Writes (INSERT / UPDATE / DELETE) are restricted to service_role.
-- Anonymous + authenticated cannot write directly; uploads must go
-- through the server-proxy /api/products/upload-image route.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'product_images_service_write'
  ) THEN
    CREATE POLICY product_images_service_write
      ON storage.objects FOR INSERT
      TO service_role
      WITH CHECK (bucket_id = 'product-images');
  END IF;
END $$;
