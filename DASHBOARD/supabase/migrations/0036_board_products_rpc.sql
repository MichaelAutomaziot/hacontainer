-- 0036_board_products_rpc.sql
-- Server-side list for the catalog ("רשימת מוצרים") and upload ("העלאת מוצרים")
-- boards. Replaces the per-request full-table scan + JS aggregation in
-- app/api/board/products/route.ts with a single SQL call that does the
-- derivation, scope filter, search, sort, pagination and headline counts.
--
-- Returns one jsonb: { ok, counts, rows, total, page, pageSize }.
--   scope='catalog'  → every product, newest id first.
--   scope='upload'   → products whose upload_bucket <> 'uploaded', ordered
--                      ready → needs_fix → failed → in_progress, then id desc.
-- `counts` is always over the full catalog (pre-scope, pre-search).

create or replace function public.board_products(
  p_scope text default 'catalog',
  p_q text default '',
  p_page int default 1,
  p_page_size int default 24
)
returns jsonb
language sql
stable
set search_path = public
as $fn$
with base as (
  select
    i.id,
    i.name_he                        as name,
    i.brand,
    i.category,
    i.ean,
    (i.images)[1]                    as image,
    i.price,
    i.pickup_cost,
    i.hacontainer_url,
    nullif(btrim(coalesce(i.pilot_status,'')),'') as pilot_status,
    m.verdict                        as match_verdict,
    cl.state                         as cl_state,
    (coalesce(btrim(i.hacontainer_id),'') <> '' or coalesce(btrim(i.hacontainer_url),'') <> '') as has_source,
    array_remove(array[
      case when not (coalesce(btrim(i.hacontainer_id),'') <> '' or coalesce(btrim(i.hacontainer_url),'') <> '') then 'המוצר לא נמצא ב-HaContainer' end,
      case when coalesce(btrim(i.name_he),'') = '' then 'חסר שם מוצר' end,
      case when coalesce(btrim(i.brand),'') = '' then 'חסר מותג' end,
      case when coalesce(btrim(i.category),'') = '' and coalesce(btrim(i.category_id::text),'') = '' then 'חסרה קטגוריה' end,
      case when i.images is null or array_length(i.images,1) is null or coalesce(btrim((i.images)[1]),'') = '' then 'חסרה תמונה' end,
      case when i.price is null or i.price <= 0 then 'חסר מחיר תקין' end,
      case when i.pickup_cost is not null and i.pickup_cost < 0 then 'עלות איסוף לא תקינה' end
    ], null) as issues,
    op.other_platforms
  from inventory i
  left join lateral (
    select cm.verdict from catalog_matches cm
    where cm.inventory_id = i.id order by cm.id desc limit 1
  ) m on true
  left join channel_listings cl on cl.product_id = i.id and cl.channel = 'superpharm'
  left join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
      'channel', cl2.channel,
      'status', case when cl2.state in ('rejected','validation_failed') then 'failed'
                     when cl2.state in ('active','pending','price_matched') then 'uploaded'
                     else 'missing' end
    )), '[]'::jsonb) as other_platforms
    from channel_listings cl2
    where cl2.product_id = i.id and cl2.channel not in ('superpharm','konimbo')
  ) op on true
),
derived as (
  select b.*,
    case when b.cl_state in ('rejected','validation_failed') then 'failed'
         when b.cl_state in ('active','pending','price_matched') then 'uploaded'
         else null end as listing_status
  from base b
),
statused as (
  select d.*,
    case
      when coalesce(d.pilot_status,'') = 'rejected' or d.listing_status = 'failed' then 'failed'
      when coalesce(d.pilot_status,'') in ('uploaded','exists_in_sp','complete','offer_submitted','offer_approved') or d.listing_status = 'uploaded' or coalesce(d.match_verdict,'') = 'duplicate' then 'uploaded'
      when coalesce(d.pilot_status,'') in ('pending_catalog','catalog_synced','uploading') or d.listing_status = 'in_progress' then 'in_progress'
      when coalesce(array_length(d.issues,1),0) > 0 or coalesce(d.match_verdict,'') in ('candidate','manual_review') or coalesce(d.pilot_status,'') = 'ignored' then 'needs_fix'
      else 'missing'
    end as superpharm_status
  from derived d
),
bucketed as (
  select s.*,
    case
      when s.superpharm_status = 'uploaded' then 'uploaded'
      when s.superpharm_status = 'failed' then 'failed'
      when s.superpharm_status = 'in_progress' then 'in_progress'
      when s.superpharm_status = 'needs_fix' then 'needs_fix'
      when coalesce(s.match_verdict,'') = 'missing'
        or coalesce(s.pilot_status,'') in ('approved_for_pilot','transformed','imported','draft')
        or coalesce(s.pilot_status,'') = '' then 'ready'
      else 'needs_fix'
    end as upload_bucket,
    case when s.has_source then 'uploaded' else 'missing' end as source_status
  from statused s
),
counts as (
  select jsonb_build_object(
    'total_products', count(*),
    'source_uploaded', count(*) filter (where source_status='uploaded'),
    'source_missing', count(*) filter (where source_status='missing'),
    'superpharm_uploaded', count(*) filter (where superpharm_status='uploaded'),
    'superpharm_missing', count(*) filter (where superpharm_status='missing'),
    'ready', count(*) filter (where upload_bucket='ready'),
    'needs_fix', count(*) filter (where upload_bucket='needs_fix'),
    'failed', count(*) filter (where upload_bucket='failed'),
    'in_progress', count(*) filter (where upload_bucket='in_progress'),
    'upload_total', count(*) filter (where upload_bucket <> 'uploaded')
  ) j from bucketed
),
scoped as (
  select * from bucketed where (p_scope <> 'upload' or upload_bucket <> 'uploaded')
),
filtered as (
  select * from scoped
  where coalesce(p_q,'') = ''
     or strpos(lower(coalesce(name,'')||' '||coalesce(brand,'')||' '||coalesce(category,'')||' '||coalesce(ean,'')), lower(p_q)) > 0
),
ordered as (
  select *, case upload_bucket when 'ready' then 0 when 'needs_fix' then 1 when 'failed' then 2 when 'in_progress' then 3 else 4 end as bucket_ord
  from filtered
),
page_rows as (
  select * from ordered
  order by case when p_scope='upload' then bucket_ord else 0 end asc, id desc
  limit greatest(coalesce(p_page_size,24),1)
  offset (greatest(coalesce(p_page,1),1)-1) * greatest(coalesce(p_page_size,24),1)
)
select jsonb_build_object(
  'ok', true,
  'counts', (select j from counts),
  'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'brand', brand, 'category', category, 'ean', ean,
      'image', image, 'price', price, 'pickup_cost', pickup_cost,
      'hacontainer_url', hacontainer_url, 'pilot_status', pilot_status,
      'match_verdict', match_verdict, 'source_status', source_status,
      'superpharm_status', superpharm_status, 'upload_bucket', upload_bucket,
      'issues', to_jsonb(issues), 'other_platforms', other_platforms
  )) from page_rows), '[]'::jsonb),
  'total', (select count(*) from filtered),
  'page', greatest(coalesce(p_page,1),1),
  'pageSize', greatest(coalesce(p_page_size,24),1)
);
$fn$;

revoke all on function public.board_products(text,text,int,int) from public;
grant execute on function public.board_products(text,text,int,int) to authenticated, service_role;
