"use client";

import { dataProvider as refineSupabaseDataProvider } from "@refinedev/supabase";
import { supabaseDataClient } from "@/utils/supabase/client";
import type { BaseRecord, DataProvider, GetListParams, GetListResponse } from "@refinedev/core";

const baseDataProvider = refineSupabaseDataProvider(supabaseDataClient);
const DEFAULT_LIST_COUNT = "estimated";

const SEARCHABLE_RESOURCES = new Set([
  "shipments",
  "inventory",
  "suppliers",
  "users",
]);

// Per-resource minimal column projections. Keep list payloads small — JSONB
// fields like `products_clean`, `shipping_log`, `order_data`, `technical_specs`
// are 3-5× the row size and are not needed for list rendering.
const DEFAULT_SELECT: Record<string, string> = {
  shipments:
    "id,order_number,status_code,status_text,customer_phone,first_name,last_name,city,is_pickup,pickup_ready,picked_up,is_cancelled,api_created_at,api_updated_at,products_clean,chatwoot_conversation_id",
  inventory:
    "id,hacontainer_id,hacontainer_url,name_he,ean,brand,category,images,price,pickup_cost,pilot_status,in_stock",
};

// `query.ilike(field, pattern)` uses SQL LIKE syntax: `%` and `_` are
// wildcards, `\` is the escape character. Escape all three so user input is
// matched literally.
const escapeIlikeSqlPattern = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

// Inside an `or(...)` argument PostgREST uses GLOB syntax: `*` is the only
// wildcard. Special chars `,` `(` `)` `:` `"` need quoting. Wrap the value in
// double-quotes and escape `\` and `"` so the parser sees it as one literal
// pattern. `*` in user input is escaped to neutralise the wildcard.
const buildIlikeOrTerm = (field: string, value: string): string => {
  const inner = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\*/g, "\\*");
  return `${field}.ilike.*"${inner}"*`;
};

interface OrSearchMeta {
  fields: string[];
  value: string;
}

type ListMeta = NonNullable<GetListParams["meta"]> & {
  count?: "exact" | "planned" | "estimated";
  select?: string;
};

const isOrSearch = (m: unknown): m is OrSearchMeta =>
  !!m &&
  typeof m === "object" &&
  Array.isArray((m as OrSearchMeta).fields) &&
  typeof (m as OrSearchMeta).value === "string";

/** Translate a single Refine filter onto a PostgREST query builder. Used when
 *  we need to bypass @refinedev/supabase's filter coercion (it serializes
 *  `operator: 'null'` as `is.true` and unwrapped `not.in.x,y,z` inside `or()`,
 *  both of which PostgREST rejects with "failed to parse logic tree"). */
// PostgREST filter builder type is awkward to import — use any internally.
// The runtime methods (.eq, .in, .is, .not, .ilike, .or, .order, .range)
// are all standard on a PostgrestFilterBuilder.
type AnyQuery = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const applyLeafFilter = (
  q: AnyQuery,
  field: string,
  operator: string,
  value: unknown,
): AnyQuery => {
  switch (operator) {
    case "eq":   return q.eq(field, value as never);
    case "ne":   return q.neq(field, value as never);
    case "lt":   return q.lt(field, value as never);
    case "lte":  return q.lte(field, value as never);
    case "gt":   return q.gt(field, value as never);
    case "gte":  return q.gte(field, value as never);
    case "in":   return q.in(field, (value as unknown[]) ?? []);
    case "nin":  return q.not(field, "in", `(${((value as unknown[]) ?? []).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")})`);
    case "null": return q.is(field, null);
    case "nnull": return q.not(field, "is", null);
    case "contains": return q.ilike(field, `%${escapeIlikeSqlPattern(String(value ?? ""))}%`);
    default: return q;
  }
};

/** Render a single leaf filter as a PostgREST `or(...)` argument fragment. */
const renderOrLeaf = (field: string, operator: string, value: unknown): string => {
  switch (operator) {
    case "eq":   return `${field}.eq.${value}`;
    case "ne":   return `${field}.neq.${value}`;
    case "lt":   return `${field}.lt.${value}`;
    case "lte":  return `${field}.lte.${value}`;
    case "gt":   return `${field}.gt.${value}`;
    case "gte":  return `${field}.gte.${value}`;
    case "in":   return `${field}.in.(${((value as unknown[]) ?? []).join(",")})`;
    case "nin":  return `${field}.not.in.(${((value as unknown[]) ?? []).join(",")})`;
    case "null": return `${field}.is.null`;
    case "nnull": return `${field}.not.is.null`;
    default:     return `${field}.eq.${value}`;
  }
};

const isLogicalOr = (
  f: unknown,
): f is { operator: "or" | "and"; value: { field: string; operator: string; value: unknown }[] } =>
  !!f &&
  typeof f === "object" &&
  (f as { operator?: string }).operator !== undefined &&
  ["or", "and"].includes((f as { operator: string }).operator) &&
  Array.isArray((f as { value?: unknown }).value);

const RAW_QUERY_RESOURCES = new Set(["v_comparison"]);

export const dataProvider: DataProvider = {
  ...baseDataProvider,
  getList: async <TData extends BaseRecord = BaseRecord>(
    params: GetListParams,
  ): Promise<GetListResponse<TData>> => {
    const { resource, pagination, sorters, filters, meta } = params;
    const fastMeta: ListMeta = {
      ...(meta as ListMeta | undefined),
      count: (meta as ListMeta | undefined)?.count ?? DEFAULT_LIST_COUNT,
      select:
        (meta as ListMeta | undefined)?.select ?? DEFAULT_SELECT[resource],
    };

    // Resources that need correct nested or/null/nin handling go through the
    // raw client. Refine's filter coercion mis-serializes these operators
    // inside `or()`, producing PostgREST parse errors.
    if (RAW_QUERY_RESOURCES.has(resource)) {
      const { current = 1, pageSize = 25 } = pagination || {};
      const fromRow = (current - 1) * pageSize;
      const toRow = fromRow + pageSize - 1;
      let query: AnyQuery = supabaseDataClient
        .from(resource)
        .select(fastMeta.select ?? "*", { count: fastMeta.count });

      for (const f of filters ?? []) {
        if (isLogicalOr(f)) {
          type Leaf = { field: string; operator: string; value: unknown };
          const leaves = f.value as unknown as Leaf[];
          const arg = leaves
            .map((leaf) => renderOrLeaf(leaf.field, leaf.operator, leaf.value))
            .join(",");
          if (f.operator === "or") {
            query = query.or(arg);
          } else {
            for (const leaf of leaves) {
              query = applyLeafFilter(query, leaf.field, leaf.operator, leaf.value);
            }
          }
        } else {
          const maybeLeaf = f as { field?: string; operator?: string; value?: unknown };
          if (maybeLeaf.field && maybeLeaf.operator) {
            query = applyLeafFilter(query, maybeLeaf.field, maybeLeaf.operator, maybeLeaf.value);
          }
        }
      }

      for (const s of sorters ?? []) {
        query = query.order(s.field, { ascending: s.order === "asc" });
      }
      query = query.range(fromRow, toRow);

      const { data, count, error } = await query;
      if (error) throw error;
      return { data: (data as unknown as TData[]) ?? [], total: count ?? 0 };
    }

    const orSearchMeta = (fastMeta as { orSearch?: unknown } | undefined)?.orSearch;
    if (
      isOrSearch(orSearchMeta) &&
      orSearchMeta.value.trim() !== "" &&
      orSearchMeta.fields.length > 0 &&
      SEARCHABLE_RESOURCES.has(resource)
    ) {
      const { current = 1, pageSize = 25 } = pagination || {};
      const from = (current - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabaseDataClient
        .from(resource)
        .select(fastMeta.select ?? "*", { count: fastMeta.count });

      const orArg = orSearchMeta.fields
        .map((f) => buildIlikeOrTerm(f, orSearchMeta.value.trim()))
        .join(",");
      query = query.or(orArg);

      if (filters) {
        for (const filter of filters) {
          if ("field" in filter && filter.field && "operator" in filter) {
            const field = filter.field as string;
            const value = "value" in filter ? filter.value : undefined;
            switch (filter.operator) {
              case "eq":
                query = query.eq(field, value);
                break;
              case "ne":
                query = query.neq(field, value);
                break;
              case "contains": {
                const safe =
                  typeof value === "string" ? escapeIlikeSqlPattern(value) : String(value ?? "");
                query = query.ilike(field, `%${safe}%`);
                break;
              }
            }
          }
        }
      }

      if (sorters && sorters.length > 0) {
        for (const sorter of sorters) {
          query = query.order(sorter.field, { ascending: sorter.order === "asc" });
        }
      }

      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      return { data: (data as unknown as TData[]) || [], total: count || 0 };
    }

    return baseDataProvider.getList<TData>({ ...params, meta: fastMeta });
  },
};
