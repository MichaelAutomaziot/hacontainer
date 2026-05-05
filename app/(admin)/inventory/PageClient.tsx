"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  Paper, Stack, Typography, Chip, TextField, MenuItem, IconButton, Tooltip, Button,
} from "@mui/material";
import {
  Inventory2 as InventoryPageIcon,
  OpenInNew as ExtIcon,
  FilterAltOff as ClearIcon,
  PlaylistAddCheck as PilotAddIcon,
  Visibility as ShowIcon,
} from "@mui/icons-material";
import { DataGrid, type GridColDef, type GridRowSelectionModel } from "@mui/x-data-grid";
import { useList, useUpdate, useNotification } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import { DataPanel, FilterBar, ImageThumb, PageFrame, PageHeader } from "@/components/shared";
import { hebrewTranslations as t } from "@/locales/he";
import { supabaseDataClient } from "@/utils/supabase/client";

type Row = {
  id: number;
  hacontainer_id: string | null;
  hacontainer_url: string | null;
  name_he: string | null;
  ean: string | null;
  brand: string | null;
  category: string | null;
  images: string[] | null;
  price: number | null;
  pickup_cost: number | null;
  pilot_status: string | null;
  in_stock: boolean | null;
};

const fmt = new Intl.NumberFormat("he-IL");
const fmtCurr = (n: number | null | undefined) => (n == null ? "—" : `₪${fmt.format(n)}`);

const STATUS_COLORS: Record<string, "default" | "primary" | "success" | "warning" | "error" | "info"> = {
  draft: "default",
  imported: "info",
  approved_for_pilot: "primary",
  transformed: "warning",
  uploaded: "success",
  ran_approved: "success",
};

export default function InventoryPage() {
  const [brand, setBrand] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const deferredSearch = useDeferredValue(search);
  const [pilotStatus, setPilotStatus] = useState<string>("");
  const [hasEan, setHasEan] = useState<string>("any");
  const [page, setPage] = useState({ pageSize: 25, page: 0 });
  const [selection, setSelection] = useState<GridRowSelectionModel>([]);

  const filters = useMemo(() => {
    const f: Array<{ field: string; operator: string; value: unknown }> = [];
    if (brand) f.push({ field: "brand", operator: "eq", value: brand });
    if (category) f.push({ field: "category", operator: "eq", value: category });
    if (pilotStatus) f.push({ field: "pilot_status", operator: "eq", value: pilotStatus });
    if (deferredSearch) f.push({ field: "name_he", operator: "contains", value: deferredSearch });
    if (hasEan === "yes") f.push({ field: "ean", operator: "nnull", value: true });
    if (hasEan === "no") f.push({ field: "ean", operator: "null", value: true });
    return f;
  }, [brand, category, pilotStatus, deferredSearch, hasEan]);

  const { data, isFetching, refetch } = useList<Row>({
    resource: "inventory",
    pagination: { current: page.page + 1, pageSize: page.pageSize },
    filters: filters as never,
    sorters: [{ field: "id", order: "desc" }],
    queryOptions: { keepPreviousData: true, staleTime: 30_000 },
  });
  const total = data?.total ?? 0;
  const rows = (data?.data ?? []) as Row[];

  // Filter dropdowns: load distinct brands/categories ONCE per session,
  // not per-page. Previously the dropdowns only listed values from the
  // current 25-row page, so most options were missing.
  const { data: brands = [] } = useQuery({
    queryKey: ["inventory-distinct-brands"],
    queryFn: async () => {
      const { data: rows, error } = await supabaseDataClient
        .from("inventory")
        .select("brand")
        .not("brand", "is", null)
        .limit(5000);
      if (error) throw error;
      const set = new Set<string>();
      for (const r of (rows as { brand: string | null }[]) ?? []) {
        if (r.brand) set.add(r.brand);
      }
      return Array.from(set).sort();
    },
    staleTime: 5 * 60_000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["inventory-distinct-categories"],
    queryFn: async () => {
      const { data: rows, error } = await supabaseDataClient
        .from("inventory")
        .select("category")
        .not("category", "is", null)
        .limit(5000);
      if (error) throw error;
      const set = new Set<string>();
      for (const r of (rows as { category: string | null }[]) ?? []) {
        if (r.category) set.add(r.category);
      }
      return Array.from(set).sort();
    },
    staleTime: 5 * 60_000,
  });

  const { mutate: updateInv, isLoading: updating } = useUpdate();
  const { open } = useNotification();

  const addToPilot = async () => {
    if (selection.length === 0) return;
    const ids = selection as number[];
    let done = 0;
    for (const id of ids) {
      await new Promise<void>((resolve) => {
        updateInv(
          { resource: "inventory", id, values: { pilot_status: "approved_for_pilot" } },
          { onSuccess: () => { done++; resolve(); }, onError: () => resolve() }
        );
      });
    }
    open?.({ type: "success", message: `${done}/${ids.length} מוצרים נוספו לפיילוט` });
    setSelection([]);
    refetch();
  };

  const cols: GridColDef<Row>[] = [
    {
      field: "thumb", headerName: "", width: 60, sortable: false, filterable: false,
      renderCell: (p) => <ImageThumb src={p.row.images?.[0] ?? null} size={40} />,
    },
    { field: "name_he", headerName: t.pilot.columns.name, flex: 1.4, minWidth: 240,
      renderCell: (p) => (
        <Tooltip title={p.value ?? ""}><Typography variant="body2" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.value ?? "—"}</Typography></Tooltip>
      ),
    },
    { field: "ean", headerName: t.pilot.columns.ean, width: 140,
      renderCell: (p) => p.value ? <Chip size="small" label={p.value as string} sx={{ direction: "ltr" }} /> : <Chip size="small" label="—" variant="outlined" /> },
    { field: "brand", headerName: t.pilot.columns.brand, width: 130 },
    { field: "category", headerName: t.pilot.columns.category, width: 160 },
    { field: "price", headerName: t.pilot.columns.price, width: 100, align: "right",
      renderCell: (p) => fmtCurr(p.value as number | null) },
    { field: "pickup_cost", headerName: t.pilot.columns.pickupCost, width: 110, align: "right",
      renderCell: (p) => fmtCurr(p.value as number | null) },
    { field: "pilot_status", headerName: t.pilot.columns.status, width: 150,
      renderCell: (p) => p.value
        ? <Chip size="small" color={STATUS_COLORS[p.value as string] ?? "default"} label={(t.pilot.pilotStatus as Record<string, string>)[p.value as string] ?? p.value} />
        : <Chip size="small" label="—" variant="outlined" /> },
    { field: "in_stock", headerName: "במלאי", width: 90,
      renderCell: (p) => p.value ? <Chip size="small" color="success" label="כן" /> : <Chip size="small" color="default" label="לא" /> },
    {
      field: "actions", headerName: "", width: 100, sortable: false, filterable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title={t.actions.viewDetails}><IconButton size="small" component="a" href={`/inventory/show/${p.row.id}`}><ShowIcon fontSize="small" /></IconButton></Tooltip>
          {p.row.hacontainer_url && (
            <Tooltip title={t.pilot.actions.openInHaContainer}>
              <IconButton size="small" component="a" href={p.row.hacontainer_url} target="_blank" rel="noopener"><ExtIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <PageFrame>
      <PageHeader
        title={t.pilot.nav.inventoryHaContainer}
        subtitle="קטלוג HaContainer עם תמונות, ברקודים, סטטוס פיילוט ופעולות מעבר מהיר."
        icon={<InventoryPageIcon />}
        tone="primary"
        stats={
          <>
            <Chip label={`סה"כ ${fmt.format(total)}`} color="primary" />
            {selection.length > 0 && <Chip label={`${selection.length} נבחרו`} color="success" />}
          </>
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
          <TextField select size="small" label={t.pilot.filters.pilotStatus} value={pilotStatus} onChange={(e) => setPilotStatus(e.target.value)} sx={{ minWidth: 170 }}>
            <MenuItem value="">הכל</MenuItem>
            {Object.entries(t.pilot.pilotStatus).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="ברקוד" value={hasEan} onChange={(e) => setHasEan(e.target.value)} sx={{ minWidth: 130 }}>
            <MenuItem value="any">הכל</MenuItem>
            <MenuItem value="yes">יש</MenuItem>
            <MenuItem value="no">אין</MenuItem>
          </TextField>
          <TextField size="small" label={t.actions.search} value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1, minWidth: 180 }} />
          <Tooltip title="נקה סינון">
            <IconButton onClick={() => { setBrand(""); setCategory(""); setPilotStatus(""); setSearch(""); setHasEan("any"); }}>
              <ClearIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </FilterBar>

      {selection.length > 0 && (
        <Paper sx={{ p: 1.5, borderColor: "success.main", bgcolor: "rgba(47, 125, 79, 0.1)", boxShadow: "none" }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography sx={{ color: "text.primary", fontWeight: 850 }}>
              נבחרו {selection.length} מוצרים
            </Typography>
            <Button startIcon={<PilotAddIcon />} variant="contained" color="success" onClick={addToPilot} disabled={updating}>
              {t.pilot.actions.addSelectedToPilot}
            </Button>
          </Stack>
        </Paper>
      )}

      <DataPanel>
        <DataGrid
          rows={rows}
          columns={cols}
          getRowId={(r) => r.id}
          autoHeight
          checkboxSelection
          rowSelectionModel={selection}
          onRowSelectionModelChange={setSelection}
          paginationMode="server"
          rowCount={total}
          paginationModel={page}
          onPaginationModelChange={setPage}
          pageSizeOptions={[25, 50, 100]}
          loading={isFetching}
          disableRowSelectionOnClick
          sx={{ border: "none" }}
        />
      </DataPanel>
    </PageFrame>
  );
}
