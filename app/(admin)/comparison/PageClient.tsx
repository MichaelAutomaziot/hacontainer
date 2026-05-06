"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Box, Paper, Stack, Typography, Chip, Button, TextField, MenuItem, IconButton, Tooltip, LinearProgress, Drawer, Divider,
} from "@mui/material";
import {
  Compare as CompareIcon,
  OpenInNew as ExtIcon,
  CloudUpload as MarkMissingIcon,
  CheckCircle as MarkExistsIcon,
  Block as MarkIgnoredIcon,
  FilterAltOff as ClearIcon,
  Info as InfoIcon,
} from "@mui/icons-material";
import { DataGrid, type GridColDef, type GridRowSelectionModel } from "@mui/x-data-grid";
import { useList, useUpdate, useNotification } from "@refinedev/core";
import { useSearchParams } from "next/navigation";
import { DataPanel, FilterBar, ImageThumb, PageFrame, PageHeader, VerdictBadge } from "@/components/shared";
import { hebrewTranslations as t } from "@/locales/he";
import { supabaseDataClient } from "@/utils/supabase/client";

type Row = {
  match_id: number;
  inventory_id: number;
  superpharm_offer_id: string | null;
  match_method: string;
  confidence: number;
  verdict: string;
  notes: string | null;
  name_he: string | null;
  inv_ean: string | null;
  inv_brand: string | null;
  inv_category: string | null;
  inv_thumb: string | null;
  inv_price: number | null;
  inv_pickup_cost: number | null;
  pilot_status: string | null;
  hacontainer_url: string | null;
  product_title: string | null;
  sp_ean: string | null;
  shop_sku: string | null;
  sp_brand: string | null;
  sp_category: string | null;
  sp_price: number | null;
  logistic_class_label: string | null;
};

const fmt = new Intl.NumberFormat("he-IL");
const fmtCurr = (n: number | null | undefined) => n == null ? "—" : `₪${fmt.format(n)}`;

export default function ComparisonPage() {
  const params = useSearchParams();
  const [verdict, setVerdict] = useState<string>(params.get("verdict") ?? "manual_review");
  const [brand, setBrand] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const deferredSearch = useDeferredValue(search);
  const [hasEan, setHasEan] = useState<string>("any");
  const [page, setPage] = useState({ pageSize: 25, page: 0 });
  const [selection, setSelection] = useState<GridRowSelectionModel>([]);
  const [drawer, setDrawer] = useState<Row | null>(null);

  const filters = useMemo(() => {
    type Logical = { field: string; operator: string; value: unknown };
    type Cond = { operator: "or" | "and"; value: Logical[] };
    const f: Array<Logical | Cond> = [];
    if (verdict)  f.push({ field: "verdict",      operator: "eq",       value: verdict });
    if (brand)    f.push({ field: "inv_brand",    operator: "eq",       value: brand });
    if (category) f.push({ field: "inv_category", operator: "eq",       value: category });
    if (deferredSearch) f.push({ field: "name_he", operator: "contains", value: deferredSearch });
    if (hasEan === "yes") f.push({ field: "inv_ean", operator: "nnull", value: true });
    if (hasEan === "no")  f.push({ field: "inv_ean", operator: "null",  value: true });
    // Hide rows already moved to the upload queue. NULL pilot_status (untouched
    // rows) must still pass — PostgREST `not.in` excludes NULL by SQL semantics,
    // so wrap in an OR with an explicit null branch.
    f.push({
      operator: "or",
      value: [
        { field: "pilot_status", operator: "null", value: true },
        { field: "pilot_status", operator: "nin",  value: ["approved_for_pilot", "transformed", "uploading", "uploaded", "ran_approved"] },
      ],
    });
    return f;
  }, [verdict, brand, category, deferredSearch, hasEan]);

  const { data, isFetching } = useList<Row>({
    resource: "v_comparison",
    pagination: { current: page.page + 1, pageSize: page.pageSize },
    filters: filters as never,
    sorters: [{ field: "match_id", order: "asc" }],
    queryOptions: { keepPreviousData: true, staleTime: 30_000 },
  });

  const total = data?.total ?? 0;
  const rows = (data?.data ?? []) as Row[];

  // Verdict totals across the whole catalog (independent of current filter).
  // Powered by the dashboard_summary() RPC so we get all 4 in one round-trip.
  const [verdictTotals, setVerdictTotals] = useState<{
    missing: number;
    duplicate: number;
    candidate: number;
    manual_review: number;
    inventory_total: number;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: rpcData, error } = await supabaseDataClient.rpc("dashboard_summary");
      if (cancelled || error || !rpcData) return;
      const v = (rpcData as { verdicts?: Record<string, number>; inventory_total?: number }).verdicts ?? {};
      setVerdictTotals({
        missing: v.missing ?? 0,
        duplicate: v.duplicate ?? 0,
        candidate: v.candidate ?? 0,
        manual_review: v.manual_review ?? 0,
        inventory_total: (rpcData as { inventory_total?: number }).inventory_total ?? 0,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.inv_brand) set.add(r.inv_brand);
    return Array.from(set).sort().slice(0, 100);
  }, [rows]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.inv_category) set.add(r.inv_category);
    return Array.from(set).sort();
  }, [rows]);

  const { mutate: updateInventory, isLoading: updating } = useUpdate();
  const { open } = useNotification();

  type ReviewAction = "mark_missing" | "mark_exists" | "mark_ignored";

  /**
   * Apply a manual-review decision to a set of catalog_matches rows.
   * Updates BOTH catalog_matches (verdict) and inventory (pilot_status).
   * Notes:
   *   - 'mark_exists' uses verdict='duplicate' which is the existing schema's
   *     "found a match in SP" value. UI labels it as "קיים בסופר-פארם".
   *   - 'mark_ignored' keeps the verdict at 'manual_review' (so it stays out of
   *     the upload bucket) but flips pilot_status='ignored' to remove it from
   *     the review queue.
   */
  const applyAction = async (action: ReviewAction, matchIds: number[]) => {
    if (matchIds.length === 0) return;
    const targetRows = rows.filter((r) => matchIds.includes(r.match_id));

    const verdictNext: string =
      action === "mark_missing" ? "missing"
      : action === "mark_exists" ? "duplicate"
      : "manual_review";

    const pilotNext: string =
      action === "mark_missing" ? "approved_for_pilot"
      : action === "mark_exists" ? "exists_in_sp"
      : "ignored";

    const okToast =
      action === "mark_missing" ? "סומנו כחסרים — מוכנים להעלאה"
      : action === "mark_exists" ? "סומנו כקיימים בסופר-פארם"
      : "הוסרו מתור הבדיקה";

    let done = 0;
    for (const row of targetRows) {
      // 1) catalog_matches.verdict
      await new Promise<void>((resolve) => {
        updateInventory(
          {
            resource: "catalog_matches",
            id: row.match_id,
            values: { verdict: verdictNext, notes: action },
          },
          { onSuccess: () => resolve(), onError: () => resolve() }
        );
      });
      // 2) inventory.pilot_status
      await new Promise<void>((resolve) => {
        updateInventory(
          {
            resource: "inventory",
            id: row.inventory_id,
            values: { pilot_status: pilotNext },
          },
          { onSuccess: () => { done++; resolve(); }, onError: () => resolve() }
        );
      });
    }
    open?.({
      type: "success",
      message: `${done}/${targetRows.length} ${okToast}`,
    });
    setSelection([]);
  };

  const clearFilters = () => {
    setVerdict("missing"); setBrand(""); setCategory(""); setSearch(""); setHasEan("any");
  };

  const cols: GridColDef<Row>[] = [
    {
      field: "inv_thumb", headerName: "", width: 60, sortable: false, filterable: false,
      renderCell: (p) => <ImageThumb src={p.value as string | null} size={40} />,
    },
    { field: "name_he", headerName: t.pilot.columns.name, flex: 1.4, minWidth: 240,
      renderCell: (p) => (
        <Tooltip title={p.value ?? ""}><Typography variant="body2" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.value ?? "—"}</Typography></Tooltip>
      ),
    },
    { field: "inv_ean", headerName: t.pilot.columns.ean, width: 130,
      renderCell: (p) => p.value ? <Chip size="small" label={p.value as string} sx={{ direction: "ltr" }} /> : "—",
    },
    { field: "inv_brand", headerName: t.pilot.columns.brand, width: 120 },
    { field: "inv_category", headerName: t.pilot.columns.category, width: 140 },
    { field: "inv_price", headerName: t.pilot.columns.price, width: 90, align: "right",
      renderCell: (p) => fmtCurr(p.value as number | null) },
    { field: "verdict", headerName: t.pilot.columns.verdict, width: 110,
      renderCell: (p) => <VerdictBadge verdict={p.value as string} /> },
    { field: "match_method", headerName: t.pilot.columns.matchMethod, width: 150 },
    { field: "confidence", headerName: t.pilot.columns.confidence, width: 110, align: "right",
      renderCell: (p) => {
        const c = (p.value as number) ?? 0;
        return (
          <Box sx={{ width: "100%" }}>
            <LinearProgress variant="determinate" value={c * 100} sx={{ height: 6, borderRadius: 1, direction: "ltr" }} />
            <Typography variant="caption" sx={{ direction: "ltr", display: "block", textAlign: "right" }}>{(c * 100).toFixed(0)}%</Typography>
          </Box>
        );
      }
    },
    { field: "product_title", headerName: "כותרת בסופר-פארם", flex: 1, minWidth: 220,
      renderCell: (p) => p.value ? (
        <Tooltip title={p.value as string}><Typography variant="body2" color="text.secondary" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.value}</Typography></Tooltip>
      ) : "—",
    },
    { field: "sp_price", headerName: "מחיר SP", width: 90, align: "right",
      renderCell: (p) => fmtCurr(p.value as number | null) },
    {
      field: "actions", headerName: "החלטה", width: 200, sortable: false, filterable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.3}>
          <Tooltip title={t.pilot.actions.markMissingFromSp}>
            <span>
              <IconButton
                size="small"
                color="warning"
                disabled={updating}
                onClick={() => applyAction("mark_missing", [p.row.match_id])}
              >
                <MarkMissingIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={t.pilot.actions.markExistsInSp}>
            <span>
              <IconButton
                size="small"
                color="success"
                disabled={updating}
                onClick={() => applyAction("mark_exists", [p.row.match_id])}
              >
                <MarkExistsIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={t.pilot.actions.markIgnored}>
            <span>
              <IconButton
                size="small"
                disabled={updating}
                onClick={() => applyAction("mark_ignored", [p.row.match_id])}
              >
                <MarkIgnoredIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="פרטים">
            <IconButton size="small" onClick={() => setDrawer(p.row)}>
              <InfoIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {p.row.hacontainer_url && (
            <Tooltip title={t.pilot.actions.openInHaContainer}>
              <IconButton size="small" component="a" href={p.row.hacontainer_url} target="_blank" rel="noopener">
                <ExtIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <PageFrame>
      <PageHeader
        title={t.pilot.nav.comparison}
        subtitle="HaContainer מול סופר-פארם — אישור ידני: קיים/חסר/דלג."
        icon={<CompareIcon />}
        tone="warning"
        stats={
          <>
          <Chip label={`דורשים בדיקה: ${verdictTotals ? fmt.format(verdictTotals.manual_review + verdictTotals.candidate) : "…"}`} color="info" variant="filled" />
          <Chip label={`חסרים: ${verdictTotals ? fmt.format(verdictTotals.missing) : "…"}`} color="warning" variant="outlined" />
          <Chip label={`קיימים בסופר-פארם: ${verdictTotals ? fmt.format(verdictTotals.duplicate) : "…"}`} color="success" variant="outlined" />
          <Chip label={`סה"כ במלאי: ${verdictTotals ? fmt.format(verdictTotals.inventory_total) : "…"}`} variant="outlined" />
          </>
        }
      />

      <FilterBar>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
          <TextField select size="small" label={t.pilot.filters.verdict} value={verdict} onChange={(e) => setVerdict(e.target.value)} sx={{ minWidth: 200 }}>
            <MenuItem value="">הכל</MenuItem>
            <MenuItem value="manual_review">דורש בדיקה ידנית</MenuItem>
            <MenuItem value="candidate">מועמד אוטומטי</MenuItem>
            <MenuItem value="missing">{t.pilot.verdict.missing}</MenuItem>
            <MenuItem value="duplicate">קיים בסופר-פארם</MenuItem>
          </TextField>
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
          <Tooltip title="נקה סינון"><IconButton onClick={clearFilters}><ClearIcon /></IconButton></Tooltip>
        </Stack>
      </FilterBar>

      {selection.length > 0 && (
        <Paper sx={{ p: 1.5, borderColor: "primary.main", bgcolor: "rgba(193, 32, 38, 0.06)", boxShadow: "none" }}>
          <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} justifyContent="space-between" spacing={1.5}>
            <Typography sx={{ color: "text.primary", fontWeight: 850 }}>
              {t.pilot.review.bulkActionsLabel}: {selection.length} פריטים
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                startIcon={<MarkMissingIcon />}
                variant="contained"
                color="warning"
                disabled={updating}
                onClick={() => applyAction("mark_missing", selection as number[])}
              >
                {t.pilot.review.bulkMarkMissing}
              </Button>
              <Button
                startIcon={<MarkExistsIcon />}
                variant="contained"
                color="success"
                disabled={updating}
                onClick={() => applyAction("mark_exists", selection as number[])}
              >
                {t.pilot.review.bulkMarkExists}
              </Button>
              <Button
                startIcon={<MarkIgnoredIcon />}
                variant="outlined"
                color="inherit"
                disabled={updating}
                onClick={() => applyAction("mark_ignored", selection as number[])}
              >
                {t.pilot.review.bulkMarkIgnored}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}

      <DataPanel>
        <DataGrid
          rows={rows}
          columns={cols}
          getRowId={(r) => r.match_id}
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

      <Drawer
        anchor="left"
        open={!!drawer}
        onClose={() => setDrawer(null)}
        PaperProps={{ sx: { width: { xs: "100%", md: 600 }, p: 3, bgcolor: "background.paper", color: "text.primary" } }}
      >
        {drawer && (
          <Box dir="rtl">
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>{drawer.name_he}</Typography>
            <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
              <ImageThumb src={drawer.inv_thumb} size={120} />
              <Stack spacing={0.5}>
                <Typography><b>EAN:</b> {drawer.inv_ean ?? "—"}</Typography>
                <Typography><b>מותג:</b> {drawer.inv_brand ?? "—"}</Typography>
                <Typography><b>קטגוריה:</b> {drawer.inv_category ?? "—"}</Typography>
                <Typography><b>מחיר:</b> {fmtCurr(drawer.inv_price)}</Typography>
                <Typography><b>איסוף:</b> {fmtCurr(drawer.inv_pickup_cost)}</Typography>
                <VerdictBadge verdict={drawer.verdict} />
              </Stack>
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>צד סופר-פארם</Typography>
            {drawer.superpharm_offer_id ? (
              <Stack spacing={0.5}>
                <Typography><b>כותרת:</b> {drawer.product_title ?? "—"}</Typography>
                <Typography><b>EAN:</b> {drawer.sp_ean ?? "—"}</Typography>
                <Typography><b>shop_sku:</b> {drawer.shop_sku ?? "—"}</Typography>
                <Typography><b>מחיר SP:</b> {fmtCurr(drawer.sp_price)}</Typography>
                <Typography><b>מחלקת לוגיסטיקה:</b> {drawer.logistic_class_label ?? "—"}</Typography>
                <Typography variant="caption" color="text.secondary">offer_id: {drawer.superpharm_offer_id}</Typography>
              </Stack>
            ) : (
              <Typography color="text.secondary">לא נמצאה הצעה תואמת בסופר-פארם.</Typography>
            )}
            <Divider sx={{ my: 2 }} />
            <Stack direction="row" spacing={1}>
              <Button component="a" href={drawer.hacontainer_url ?? "#"} target="_blank" startIcon={<ExtIcon />} disabled={!drawer.hacontainer_url}>
                {t.pilot.actions.openInHaContainer}
              </Button>
              <Button component="a" href={`/inventory/show/${drawer.inventory_id}`} variant="outlined">{t.actions.viewDetails}</Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
              שיטה: {drawer.match_method} · ביטחון: {(drawer.confidence * 100).toFixed(0)}%
              {drawer.notes ? ` · ${drawer.notes}` : ""}
            </Typography>
          </Box>
        )}
      </Drawer>
    </PageFrame>
  );
}
