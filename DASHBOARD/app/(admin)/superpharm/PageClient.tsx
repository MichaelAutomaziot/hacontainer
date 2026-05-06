"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Stack, Chip, TextField, MenuItem, IconButton, Tooltip } from "@mui/material";
import { FilterAltOff as ClearIcon, Storefront as SuperPharmIcon } from "@mui/icons-material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useList } from "@refinedev/core";
import { DataPanel, FilterBar, PageFrame, PageHeader } from "@/components/shared";
import { hebrewTranslations as t } from "@/locales/he";

type Row = {
  offer_id: string;
  shop_sku: string | null;
  product_brand: string | null;
  product_title: string | null;
  ean: string | null;
  price: number | null;
  msrp: number | null;
  quantity: number | null;
  logistic_class_label: string | null;
  category_label: string | null;
  import_type: string | null;
};

const fmt = new Intl.NumberFormat("he-IL");

export default function SuperPharmPage() {
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState({ pageSize: 25, page: 0 });

  const filters = useMemo(() => {
    const f: Array<{ field: string; operator: string; value: unknown }> = [];
    if (brand)    f.push({ field: "product_brand", operator: "eq",       value: brand });
    if (category) f.push({ field: "category_label", operator: "eq",      value: category });
    if (deferredSearch) f.push({ field: "product_title", operator: "contains", value: deferredSearch });
    return f;
  }, [brand, category, deferredSearch]);

  const { data, isFetching } = useList<Row>({
    resource: "superpharm_offers_raw",
    pagination: { current: page.page + 1, pageSize: page.pageSize },
    filters: filters as never,
    sorters: [{ field: "product_title", order: "asc" }],
    queryOptions: { keepPreviousData: true, staleTime: 30_000 },
  });

  const total = data?.total ?? 0;
  const rows = (data?.data ?? []) as Row[];

  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.product_brand) set.add(r.product_brand);
    return Array.from(set).sort().slice(0, 100);
  }, [rows]);
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.category_label) set.add(r.category_label);
    return Array.from(set).sort().slice(0, 200);
  }, [rows]);

  const cols: GridColDef<Row>[] = [
    { field: "shop_sku",      headerName: t.pilot.columns.shopSku,    width: 130 },
    { field: "product_brand", headerName: t.pilot.columns.brand,      width: 120 },
    { field: "product_title", headerName: t.pilot.columns.name,       flex: 1, minWidth: 280 },
    { field: "ean",           headerName: t.pilot.columns.ean,        width: 140,
      renderCell: (p) => p.value ? <Chip size="small" label={p.value as string} sx={{ direction: "ltr" }} /> : "—" },
    { field: "price",         headerName: t.pilot.columns.price,      width: 90,  align: "right",
      renderCell: (p) => p.value != null ? `₪${fmt.format(p.value as number)}` : "—" },
    { field: "quantity",      headerName: t.pilot.columns.quantity,   width: 90,  align: "right",
      renderCell: (p) => fmt.format((p.value as number) ?? 0) },
    { field: "logistic_class_label", headerName: t.pilot.columns.logisticClass, width: 200 },
    { field: "category_label", headerName: t.pilot.columns.category,  width: 180 },
    { field: "import_type",   headerName: t.pilot.columns.importType, width: 110,
      renderCell: (p) => <Chip size="small" label={p.value ?? "—"} variant="outlined" /> },
  ];

  return (
    <PageFrame>
      <PageHeader
        title={t.pilot.nav.superpharmOffers}
        subtitle="הצעות Super-Pharm פעילות, לפי מותג, קטגוריה, מחיר ומחלקת לוגיסטיקה."
        icon={<SuperPharmIcon />}
        tone="info"
        stats={<Chip label={`סה"כ ${fmt.format(total)}`} color="info" />}
      />

      <FilterBar>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
          <TextField select size="small" label={t.pilot.filters.brand} value={brand} onChange={(e) => setBrand(e.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="">הכל</MenuItem>
            {brands.map((b) => <MenuItem key={b} value={b}>{b}</MenuItem>)}
          </TextField>
          <TextField select size="small" label={t.pilot.filters.category} value={category} onChange={(e) => setCategory(e.target.value)} sx={{ minWidth: 180 }}>
            <MenuItem value="">הכל</MenuItem>
            {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          <TextField size="small" label={t.actions.search} value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1, minWidth: 180 }} />
          <Tooltip title="נקה סינון"><IconButton onClick={() => { setBrand(""); setCategory(""); setSearch(""); }}><ClearIcon /></IconButton></Tooltip>
        </Stack>
      </FilterBar>

      <DataPanel>
        <DataGrid
          rows={rows}
          columns={cols}
          getRowId={(r) => r.offer_id}
          autoHeight
          paginationMode="server"
          rowCount={total}
          paginationModel={page}
          onPaginationModelChange={setPage}
          pageSizeOptions={[25, 50, 100]}
          loading={isFetching}
          sx={{ border: "none" }}
        />
      </DataPanel>
    </PageFrame>
  );
}
