"use client";

import { useMemo, useState } from "react";
import {
  Stack, Chip, Button, TextField, MenuItem, IconButton, Tooltip,
} from "@mui/material";
import { Download as DownloadIcon, OpenInNew as ExtIcon, FilterAltOff as ClearIcon, ShoppingBasket as PeriIcon } from "@mui/icons-material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useList } from "@refinedev/core";
import { DataPanel, FilterBar, ImageThumb, PageFrame, PageHeader } from "@/components/shared";
import { hebrewTranslations as t } from "@/locales/he";

type Row = {
  match_id: number;
  inventory_id: number;
  name_he: string | null;
  inv_ean: string | null;
  inv_brand: string | null;
  inv_category: string | null;
  inv_thumb: string | null;
  inv_price: number | null;
  inv_pickup_cost: number | null;
  hacontainer_url: string | null;
};

const fmt = new Intl.NumberFormat("he-IL");
const fmtCurr = (n: number | null | undefined) => n == null ? "—" : `₪${fmt.format(n)}`;

export default function PeriQueuePage() {
  const [brand, setBrand] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [hasEan, setHasEan] = useState<string>("any");
  const [page, setPage] = useState({ pageSize: 25, page: 0 });

  const filters = useMemo(() => {
    const f: Array<{ field: string; operator: string; value: unknown }> = [
      { field: "verdict", operator: "eq", value: "missing" },
    ];
    if (brand)    f.push({ field: "inv_brand",    operator: "eq",       value: brand });
    if (category) f.push({ field: "inv_category", operator: "eq",       value: category });
    if (search)   f.push({ field: "name_he",      operator: "contains", value: search });
    if (hasEan === "yes") f.push({ field: "inv_ean", operator: "nnull", value: true });
    if (hasEan === "no")  f.push({ field: "inv_ean", operator: "null",  value: true });
    return f;
  }, [brand, category, search, hasEan]);

  const { data, isFetching } = useList<Row>({
    resource: "v_comparison",
    pagination: { current: page.page + 1, pageSize: page.pageSize },
    filters: filters as never,
    sorters: [{ field: "inv_category", order: "asc" }],
  });

  const total = data?.total ?? 0;

  const { data: brandsData } = useList({
    resource: "inventory",
    pagination: { pageSize: 1000 },
    queryOptions: { staleTime: 60_000 },
  });
  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const r of brandsData?.data ?? []) {
      const b = (r as { brand?: string | null }).brand;
      if (b) set.add(b);
    }
    return Array.from(set).sort().slice(0, 100);
  }, [brandsData]);
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of brandsData?.data ?? []) {
      const c = (r as { category?: string | null }).category;
      if (c) set.add(c);
    }
    return Array.from(set).sort();
  }, [brandsData]);

  const downloadCsv = () => {
    const params = new URLSearchParams();
    if (brand) params.set("brand", brand);
    if (category) params.set("category", category);
    if (hasEan === "yes") params.set("has_ean", "true");
    if (hasEan === "no") params.set("has_ean", "false");
    window.open(`/api/peri-queue.csv?${params.toString()}`, "_blank");
  };

  const cols: GridColDef<Row>[] = [
    { field: "inv_thumb", headerName: "", width: 60, sortable: false, filterable: false,
      renderCell: (p) => <ImageThumb src={p.value as string | null} size={40} /> },
    { field: "name_he", headerName: t.pilot.columns.name, flex: 1.4, minWidth: 240 },
    { field: "inv_ean", headerName: t.pilot.columns.ean, width: 140,
      renderCell: (p) => p.value ? <Chip size="small" label={p.value as string} sx={{ direction: "ltr" }} /> : "—" },
    { field: "inv_brand", headerName: t.pilot.columns.brand, width: 130 },
    { field: "inv_category", headerName: t.pilot.columns.category, width: 160 },
    { field: "inv_price", headerName: t.pilot.columns.price, width: 100, align: "right",
      renderCell: (p) => fmtCurr(p.value as number | null) },
    { field: "inv_pickup_cost", headerName: t.pilot.columns.pickupCost, width: 120, align: "right",
      renderCell: (p) => fmtCurr(p.value as number | null) },
    { field: "hacontainer_url", headerName: "", width: 60, sortable: false, filterable: false,
      renderCell: (p) => p.value ? (
        <Tooltip title={t.pilot.actions.openInHaContainer}>
          <IconButton size="small" component="a" href={p.value as string} target="_blank" rel="noopener"><ExtIcon fontSize="small" /></IconButton>
        </Tooltip>
      ) : null
    },
  ];

  return (
    <PageFrame>
      <PageHeader
        title={t.pilot.nav.periQueue}
        subtitle="מוצרים שחסרים ב־Super-Pharm וממתינים לקובץ PERI מסודר."
        icon={<PeriIcon />}
        tone="error"
        stats={<Chip label={`${fmt.format(total)} פריטים חסרים`} color="error" />}
        actions={
          <Button variant="contained" color="primary" startIcon={<DownloadIcon />} onClick={downloadCsv}>
            {t.pilot.actions.downloadPeriCsv}
          </Button>
        }
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
          <TextField select size="small" label="ברקוד" value={hasEan} onChange={(e) => setHasEan(e.target.value)} sx={{ minWidth: 130 }}>
            <MenuItem value="any">הכל</MenuItem>
            <MenuItem value="yes">יש</MenuItem>
            <MenuItem value="no">אין</MenuItem>
          </TextField>
          <TextField size="small" label={t.actions.search} value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1, minWidth: 180 }} />
          <Tooltip title="נקה סינון"><IconButton onClick={() => { setBrand(""); setCategory(""); setSearch(""); setHasEan("any"); }}><ClearIcon /></IconButton></Tooltip>
        </Stack>
      </FilterBar>

      <DataPanel>
        <DataGrid
          rows={data?.data ?? []}
          columns={cols}
          getRowId={(r) => r.match_id}
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
