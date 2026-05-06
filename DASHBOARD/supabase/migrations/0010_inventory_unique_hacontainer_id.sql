-- 0010_inventory_unique_hacontainer_id.sql
-- Live version 20260504082202. Mirrored from production 2026-05-05.
-- Adds UNIQUE on inventory.hacontainer_id, removing duplicates first.

DELETE FROM public.inventory a
USING public.inventory b
WHERE a.hacontainer_id = b.hacontainer_id
  AND a.hacontainer_id IS NOT NULL
  AND a.id < b.id;

ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_hacontainer_id_unique UNIQUE (hacontainer_id);
