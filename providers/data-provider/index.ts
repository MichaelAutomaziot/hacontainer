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
