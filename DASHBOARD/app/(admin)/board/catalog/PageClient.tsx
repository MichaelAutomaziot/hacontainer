"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import {
  Add as AddIcon,
  CheckCircle as MarkExistsIcon,
  Block as MarkIgnoredIcon,
  CloudUpload as MarkMissingIcon,
  FilterAltOff as ClearIcon,
  Info as InfoIcon,
  OpenInNew as ExtIcon,
  Visibility as ShowIcon,
  Inventory2 as InventoryIcon,
  Compare as CompareIcon,
  Storefront as SuperPharmIcon,
  AccountTree as CategoryIcon,
} from "@mui/icons-material";
import { DataGrid, type GridColDef, type GridRowSelectionModel } from "@mui/x-data-grid";
import { useList, useNotification, useUpdate } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import { BoardShell, ProductDetailDrawer, ProductPresenceBadge, type ComparisonRow } from "@/components/board";
import { DataPanel, FilterBar, ImageThumb, SectionHeader, VerdictBadge } from "@/components/shared";
import { SingleProductUploadDialog } from "@/components/products/SingleProductUploadDialog";
import { supabaseDataClient } from "@/utils/supabase/client";

type CatalogTab = "inventory" | "comparison" | "superpharm" | "categories";

const TABS: Array<{ key: CatalogTab; label: string; icon: React.ReactElement }> = [
  { key: "inventory", label: "מוצרי הקונטיינר", icon: <InventoryIcon fontSize="small" /> },
  { key: "comparison", label: "השוואה", icon: <CompareIcon fontSize="small" /> },
  { key: "superpharm", label: "הצעות סופר-פארם", icon: <SuperPharmIcon fontSize="small" /> },
  { key: "categories", label: "קטגוריות SP", icon: <CategoryIcon fontSize="small" /> },
];

const fmt = new Intl.NumberFormat("he-IL");
const fmtCurr = (n: number | null | undefined) => (n == null ? "—" : `₪${fmt.format(n)}`);

const STATUS_LABELS: Record<string, string> = {
  draft: "טיוטה",
  imported: "בקונטיינר בלבד",
  approved_for_pilot: "מוכן להעלאה",
  transformed: "הומר",
  pending_catalog: "מחכה לקטלוג",
  catalog_synced: "נוצר ב-SP",
  uploading: "בהעלאה",
  uploaded: "הועלה",
  exists_in_sp: "קיים ב-SP",
  ignored: "התעלמו",
  rejected: "נדחה",
};

type PlatformStatus = "uploaded" | "missing" | "failed" | "needs_fix" | "in_progress";

type SimpleProductRow = {
  id: number;
  name: string | null;
  brand: string | null;
  category: string | null;
  ean: string | null;
  image: string | null;
  hacontainer_url: string | null;
  source_status: "uploaded" | "missing";
  superpharm_status: PlatformStatus;
  issues: string[];
  other_platforms: Array<{ channel: string; status: PlatformStatus }>;
};

type SimpleProductsResponse = {
  ok: boolean;
  counts: {
    total_products: number;
    source_uploaded: number;
    source_missing: number;
    superpharm_uploaded: number;
    superpharm_missing: number;
    ready: number;
    needs_fix: number;
    failed: number;
    in_progress: number;
    upload_total: number;
  };
  rows: SimpleProductRow[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
};

const SIMPLE_STATUS: Record<PlatformStatus, { label: string; color: "success" | "warning" | "error" | "info" }> = {
  uploaded: { label: "הועלה", color: "success" },
  missing: { label: "חסר", color: "warning" },
  failed: { label: "נכשל", color: "error" },
  needs_fix: { label: "צריך תיקון", color: "warning" },
  in_progress: { label: "בתהליך", color: "info" },
};

function PlatformStatusBadge({ status }: { status: PlatformStatus }) {
  const meta = SIMPLE_STATUS[status];
  return (
    <Stack direction="row" spacing={0.7} alignItems="center" sx={{ minWidth: 0 }}>
      <Box
        sx={(theme) => ({
          width: 8,
          height: 8,
          borderRadius: "50%",
          flex: "0 0 auto",
          bgcolor: theme.palette[meta.color].main,
        })}
      />
      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
        {meta.label}
      </Typography>
    </Stack>
  );
}

const fetchSimpleProducts = async (page: number, q: string): Promise<SimpleProductsResponse> => {
  const sp = new URLSearchParams({
    scope: "catalog",
    page: String(page),
    pageSize: "18",
  });
  if (q.trim()) sp.set("q", q.trim());

  const res = await fetch(`/api/board/products?${sp.toString()}`, { cache: "no-store" });
  const json = (await res.json()) as SimpleProductsResponse;
  if (!res.ok || !json.ok) throw new Error(json.error ?? "לא הצלחנו לטעון את רשימת המוצרים");
  return json;
};

export default function BoardCatalog() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedTab = params.get("tab");
  const rawTab = TABS.some((item) => item.key === requestedTab) ? (requestedTab as CatalogTab) : null;
  const tabParam = rawTab ?? "inventory";
  const [tab, setTab] = useState<CatalogTab>(tabParam);

  useEffect(() => {
    setTab((params.get("tab") as CatalogTab | null) ?? "inventory");
  }, [params]);

  const onTabChange = (next: CatalogTab) => {
    setTab(next);
    const sp = new URLSearchParams(params.toString());
    sp.set("tab", next);
    router.replace(`/board/catalog?${sp.toString()}`);
  };

  if (!rawTab) {
    return <SimpleProductList />;
  }

  return (
    <BoardShell
      eyebrow="קטלוג"
      title="מוצרי הקונטיינר"
      description="חיפוש, מיון וניהול המלאי. השוואה מול סופר-פארם והצעות הספק זמינים מהמסך הזה."
    >
      {/* Tab strip hidden by request — only the inventory view is visible.
          The other three views (comparison, superpharm, categories) live on
          dedicated query strings (?tab=…) for power users and old bookmarks. */}
      <Box sx={{ pt: 1 }}>
        {tab === "inventory" && <InventoryTab />}
        {tab === "comparison" && <ComparisonTab />}
        {tab === "superpharm" && <SuperpharmTab />}
        {tab === "categories" && <CategoriesTab />}
      </Box>
    </BoardShell>
  );
}

function SimpleProductList() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const [singleDialogOpen, setSingleDialogOpen] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch]);

  const { data, isError, isFetching, isLoading, error, refetch } = useQuery({
    queryKey: ["board-simple-products", page, deferredSearch],
    queryFn: () => fetchSimpleProducts(page, deferredSearch),
    staleTime: 30_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 18;

  const cols: GridColDef<SimpleProductRow>[] = useMemo(
    () => [
      {
        field: "image",
        headerName: "",
        width: 64,
        sortable: false,
        filterable: false,
        renderCell: (p) => <ImageThumb src={p.row.image} size={42} />,
      },
      {
        field: "name",
        headerName: "שם המוצר",
        flex: 1.6,
        minWidth: 240,
        renderCell: (p) => (
          <Tooltip title={p.row.name ?? ""}>
            <Typography variant="body2" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
              {p.row.name || "מוצר ללא שם"}
            </Typography>
          </Tooltip>
        ),
      },
      {
        field: "brand",
        headerName: "מותג",
        width: 130,
        renderCell: (p) => (
          <Typography variant="body2" color="text.secondary" noWrap>
            {p.row.brand ?? "—"}
          </Typography>
        ),
      },
      {
        field: "category",
        headerName: "קטגוריה",
        width: 160,
        renderCell: (p) => (
          <Typography variant="body2" color="text.secondary" noWrap>
            {p.row.category ?? "—"}
          </Typography>
        ),
      },
      {
        field: "ean",
        headerName: "ברקוד",
        width: 150,
        renderCell: (p) =>
          p.row.ean ? (
            <Typography variant="body2" sx={{ direction: "ltr", fontVariantNumeric: "tabular-nums", color: "text.secondary" }}>
              {p.row.ean}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.disabled">—</Typography>
          ),
      },
      {
        field: "source_status",
        headerName: "הקונטיינר",
        width: 130,
        sortable: false,
        renderCell: (p) => <PlatformStatusBadge status={p.row.source_status} />,
      },
      {
        field: "superpharm_status",
        headerName: "סופר-פארם",
        width: 130,
        sortable: false,
        renderCell: (p) => <PlatformStatusBadge status={p.row.superpharm_status} />,
      },
      {
        field: "issues",
        headerName: "בעיה / הערה",
        flex: 1.1,
        minWidth: 180,
        sortable: false,
        renderCell: (p) =>
          p.row.issues.length > 0 ? (
            <Tooltip title={p.row.issues.join(" · ")}>
              <Typography
                variant="caption"
                color={p.row.superpharm_status === "failed" ? "error.main" : "text.secondary"}
                sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {p.row.issues.slice(0, 2).join(" · ")}
              </Typography>
            </Tooltip>
          ) : (
            <Typography variant="caption" color="text.disabled">—</Typography>
          ),
      },
    ],
    [],
  );

  return (
    <BoardShell
      eyebrow="רשימת מוצרים"
      title="כל המוצרים במקום אחד"
      description="כאן אפשר לראות בפשטות איפה כל מוצר כבר קיים, ומה עדיין חסר."
    >
      <Stack spacing={3}>
        <Paper
          elevation={0}
          sx={(theme) => ({
            p: { xs: 1.5, md: 1.75 },
            borderRadius: 1,
            border: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
            bgcolor: theme.palette.background.paper,
            boxShadow: "0 1px 2px rgba(27, 36, 34, 0.03)",
          })}
        >
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.4} alignItems={{ md: "center" }}>
            <TextField
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              label="חיפוש מוצר"
              placeholder="שם, מותג או ברקוד"
              fullWidth
              inputProps={{ style: { fontSize: 16 } }}
            />
            <Button
              variant="contained"
              size="large"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => setSingleDialogOpen(true)}
              sx={{ minHeight: 48, px: 2.6, fontWeight: 600, whiteSpace: "nowrap" }}
            >
              מוצר חדש
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={() => refetch()}
              disabled={isFetching}
              sx={{ minHeight: 48, px: 3, fontWeight: 600, whiteSpace: "nowrap" }}
            >
              רענון
            </Button>
          </Stack>
        </Paper>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" },
            gap: 1.25,
          }}
        >
          <SimpleStatCard label="כל המוצרים" value={data?.counts.total_products ?? 0} tone="primary" />
          <SimpleStatCard label="קיים ב-HaContainer" value={data?.counts.source_uploaded ?? 0} tone="success" />
          <SimpleStatCard label="קיים ב-Super-Pharm" value={data?.counts.superpharm_uploaded ?? 0} tone="success" />
          <SimpleStatCard label="צריך טיפול" value={(data?.counts.needs_fix ?? 0) + (data?.counts.failed ?? 0)} tone="warning" />
        </Box>

        {isError && (
          <Alert severity="error" sx={{ borderRadius: 1, fontSize: 18 }}>
            {(error as Error).message}
          </Alert>
        )}

        <SectionHeader
          title="מוצרים"
          subtitle={data ? `${fmt.format(total)} מוצרים נמצאו` : "טוען מוצרים"}
        />

        {!isLoading && rows.length === 0 ? (
          <Stack alignItems="center" spacing={2} sx={{ py: 8, px: 2, textAlign: "center" }}>
            <Typography variant="h5" fontWeight={600}>
              אין מוצרים להצגה כרגע
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 520 }}>
              נסו לחפש שם אחר, או עברו למסך ההעלאה כדי לבדוק מוצרים שממתינים לטיפול.
            </Typography>
            <Button href="/board/upload" variant="contained" size="large" sx={{ minHeight: 52, px: 4, fontWeight: 600 }}>
              למסך העלאת מוצרים
            </Button>
          </Stack>
        ) : (
          <DataPanel>
            <DataGrid
              rows={rows}
              columns={cols}
              getRowId={(r) => r.id}
              autoHeight
              disableRowSelectionOnClick
              paginationMode="server"
              rowCount={total}
              paginationModel={{ page: page - 1, pageSize }}
              onPaginationModelChange={(m) => setPage(m.page + 1)}
              pageSizeOptions={[18, 25, 50]}
              loading={isLoading || isFetching}
              rowHeight={72}
              sx={{ border: "none" }}
            />
          </DataPanel>
        )}
      </Stack>
      <SingleProductUploadDialog
        open={singleDialogOpen}
        onClose={() => setSingleDialogOpen(false)}
        onSuccess={() => {
          void refetch();
        }}
      />
    </BoardShell>
  );
}

function SimpleStatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "primary" | "success" | "warning";
}) {
  return (
    <Card
      variant="outlined"
      sx={(theme) => ({
        borderRadius: 1,
        bgcolor: theme.palette.background.paper,
        borderColor: alpha(theme.palette.text.primary, 0.09),
        boxShadow: "none",
        position: "relative",
        overflow: "hidden",
        "&:before": {
          content: '""',
          position: "absolute",
          insetBlock: 0,
          insetInlineStart: 0,
          width: 3,
          backgroundColor: theme.palette[tone].main,
        },
      })}
    >
      <CardContent sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary" fontWeight={600}>
          {label}
        </Typography>
        <Typography
          variant="h4"
          fontWeight={700}
          sx={{ mt: 0.75, color: "text.primary", letterSpacing: 0 }}
        >
          {fmt.format(value)}
        </Typography>
      </CardContent>
    </Card>
  );
}

/* -----------------------  inventory tab  ----------------------- */

function InventoryTab() {
  const router = useRouter();
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [pilotStatus, setPilotStatus] = useState("");
  const [hasEan, setHasEan] = useState("any");
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

  type Row = {
    id: number;
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

  const { data, isFetching, refetch } = useList<Row>({
    resource: "inventory",
    pagination: { current: page.page + 1, pageSize: page.pageSize },
    filters: filters as never,
    sorters: [{ field: "id", order: "desc" }],
    queryOptions: { keepPreviousData: true, staleTime: 30_000 },
  });
  const total = data?.total ?? 0;
  const rows = (data?.data ?? []) as Row[];

  const { data: brands = [] } = useQuery({
    queryKey: ["board-inv-brands"],
    queryFn: async () => {
      const { data: rs } = await supabaseDataClient
        .from("inventory")
        .select("brand")
        .not("brand", "is", null)
        .limit(5000);
      const set = new Set<string>();
      for (const r of (rs as { brand: string | null }[]) ?? []) if (r.brand) set.add(r.brand);
      return Array.from(set).sort();
    },
    staleTime: 5 * 60_000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["board-inv-cats"],
    queryFn: async () => {
      const { data: rs } = await supabaseDataClient
        .from("inventory")
        .select("category")
        .not("category", "is", null)
        .limit(5000);
      const set = new Set<string>();
      for (const r of (rs as { category: string | null }[]) ?? []) if (r.category) set.add(r.category);
      return Array.from(set).sort();
    },
    staleTime: 5 * 60_000,
  });

  const { mutate: updateInv, isLoading: updating } = useUpdate();
  const { open } = useNotification();

  const addToUpload = async () => {
    if (selection.length === 0) return;
    const ids = selection as number[];
    let done = 0;
    for (const id of ids) {
      await new Promise<void>((resolve) => {
        updateInv(
          { resource: "inventory", id, values: { pilot_status: "approved_for_pilot" } },
          { onSuccess: () => { done++; resolve(); }, onError: () => resolve() },
        );
      });
    }
    open?.({ type: "success", message: `${done}/${ids.length} מוצרים הוספו לתור ההעלאה` });
    setSelection([]);
    refetch();
  };

  const cols: GridColDef<Row>[] = [
    {
      field: "thumb",
      headerName: "",
      width: 60,
      sortable: false,
      filterable: false,
      renderCell: (p) => <ImageThumb src={p.row.images?.[0] ?? null} size={40} />,
    },
    {
      field: "name_he",
      headerName: "שם",
      flex: 1.4,
      minWidth: 240,
      renderCell: (p) => (
        <Tooltip title={p.value ?? ""}>
          <Typography variant="body2" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.value ?? "—"}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: "ean",
      headerName: "ברקוד",
      width: 140,
      renderCell: (p) =>
        p.value ? (
          <Chip size="small" label={p.value as string} sx={{ direction: "ltr" }} />
        ) : (
          <Chip size="small" label="—" variant="outlined" />
        ),
    },
    { field: "brand", headerName: "מותג", width: 130 },
    { field: "category", headerName: "קטגוריה", width: 160 },
    {
      field: "price",
      headerName: "מחיר",
      width: 100,
      align: "right",
      renderCell: (p) => fmtCurr(p.value as number | null),
    },
    {
      field: "pickup_cost",
      headerName: "איסוף",
      width: 110,
      align: "right",
      renderCell: (p) => fmtCurr(p.value as number | null),
    },
    {
      field: "pilot_status",
      headerName: "סטטוס",
      width: 150,
      renderCell: (p) =>
        p.value ? (
          <Chip size="small" label={STATUS_LABELS[p.value as string] ?? p.value} />
        ) : (
          <Chip size="small" label="—" variant="outlined" />
        ),
    },
    {
      field: "in_stock",
      headerName: "במלאי",
      width: 90,
      renderCell: (p) =>
        p.value ? <Chip size="small" color="success" label="כן" /> : <Chip size="small" label="לא" />,
    },
    {
      field: "actions",
      headerName: "",
      width: 100,
      sortable: false,
      filterable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="צפה">
            <IconButton size="small" component="a" href={`/inventory/show/${p.row.id}`}>
              <ShowIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {p.row.hacontainer_url && (
            <Tooltip title="פתח בהקונטיינר">
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
    <Stack spacing={2}>
      <SectionHeader
        title="מוצרי הקונטיינר"
        subtitle={`סה"כ ${fmt.format(total)} פריטים`}
        actions={
          selection.length > 0 ? (
            <Button variant="contained" color="success" disabled={updating} onClick={addToUpload}>
              הוסף {selection.length} לתור העלאה
            </Button>
          ) : null
        }
      />

      <FilterBar>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
          <TextField
            select
            size="small"
            label="מותג"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">הכל</MenuItem>
            {brands.map((b) => (
              <MenuItem key={b} value={b}>
                {b}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="קטגוריה"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">הכל</MenuItem>
            {categories.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="סטטוס"
            value={pilotStatus}
            onChange={(e) => setPilotStatus(e.target.value)}
            sx={{ minWidth: 170 }}
          >
            <MenuItem value="">הכל</MenuItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <MenuItem key={k} value={k}>
                {v}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="ברקוד"
            value={hasEan}
            onChange={(e) => setHasEan(e.target.value)}
            sx={{ minWidth: 130 }}
          >
            <MenuItem value="any">הכל</MenuItem>
            <MenuItem value="yes">יש</MenuItem>
            <MenuItem value="no">אין</MenuItem>
          </TextField>
          <TextField
            size="small"
            label="חיפוש"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1, minWidth: 180 }}
          />
          <Tooltip title="נקה סינון">
            <IconButton
              onClick={() => {
                setBrand("");
                setCategory("");
                setPilotStatus("");
                setSearch("");
                setHasEan("any");
              }}
            >
              <ClearIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </FilterBar>

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
    </Stack>
  );
}

/* -----------------------  comparison tab  ----------------------- */

function ComparisonTab() {
  const router = useRouter();
  const params = useSearchParams();
  const [verdict, setVerdict] = useState(params.get("verdict") ?? "manual_review");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [hasEan, setHasEan] = useState("any");
  const [page, setPage] = useState({ pageSize: 25, page: 0 });
  const [selection, setSelection] = useState<GridRowSelectionModel>([]);
  const [drawer, setDrawer] = useState<ComparisonRow | null>(null);

  const filters = useMemo(() => {
    type Logical = { field: string; operator: string; value: unknown };
    type Cond = { operator: "or" | "and"; value: Logical[] };
    const f: Array<Logical | Cond> = [];
    if (verdict) f.push({ field: "verdict", operator: "eq", value: verdict });
    if (brand) f.push({ field: "inv_brand", operator: "eq", value: brand });
    if (category) f.push({ field: "inv_category", operator: "eq", value: category });
    if (deferredSearch) f.push({ field: "name_he", operator: "contains", value: deferredSearch });
    if (hasEan === "yes") f.push({ field: "inv_ean", operator: "nnull", value: true });
    if (hasEan === "no") f.push({ field: "inv_ean", operator: "null", value: true });
    f.push({
      operator: "or",
      value: [
        { field: "pilot_status", operator: "null", value: true },
        {
          field: "pilot_status",
          operator: "nin",
          value: [
            "approved_for_pilot",
            "transformed",
            "pending_catalog",
            "catalog_synced",
            "uploading",
            "uploaded",
            "ran_approved",
          ],
        },
      ],
    });
    return f;
  }, [verdict, brand, category, deferredSearch, hasEan]);

  const { data, isFetching, refetch } = useList<ComparisonRow>({
    resource: "v_comparison",
    pagination: { current: page.page + 1, pageSize: page.pageSize },
    filters: filters as never,
    sorters: [{ field: "match_id", order: "asc" }],
    queryOptions: { keepPreviousData: true, staleTime: 30_000 },
  });
  const total = data?.total ?? 0;
  const rows = (data?.data ?? []) as ComparisonRow[];

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

  const applyAction = async (action: ReviewAction, matchIds: number[]) => {
    if (matchIds.length === 0) return;
    const targetRows = rows.filter((r) => matchIds.includes(r.match_id));

    const verdictNext =
      action === "mark_missing" ? "missing" : action === "mark_exists" ? "duplicate" : "manual_review";
    const pilotNext =
      action === "mark_missing" ? "approved_for_pilot" : action === "mark_exists" ? "exists_in_sp" : "ignored";
    const okToast =
      action === "mark_missing"
        ? "סומנו כחסרים — מוכנים להעלאה"
        : action === "mark_exists"
          ? "סומנו כקיימים בסופר-פארם"
          : "הוסרו מתור הבדיקה";

    let done = 0;
    for (const row of targetRows) {
      await new Promise<void>((resolve) => {
        updateInventory(
          { resource: "catalog_matches", id: row.match_id, values: { verdict: verdictNext, notes: action } },
          { onSuccess: () => resolve(), onError: () => resolve() },
        );
      });
      await new Promise<void>((resolve) => {
        updateInventory(
          { resource: "inventory", id: row.inventory_id, values: { pilot_status: pilotNext } },
          { onSuccess: () => { done++; resolve(); }, onError: () => resolve() },
        );
      });
    }
    open?.({ type: "success", message: `${done}/${targetRows.length} ${okToast}` });
    setSelection([]);
    setDrawer(null);
    refetch();
  };

  const cols: GridColDef<ComparisonRow>[] = [
    {
      field: "inv_thumb",
      headerName: "",
      width: 60,
      sortable: false,
      filterable: false,
      renderCell: (p) => <ImageThumb src={p.value as string | null} size={40} />,
    },
    {
      field: "presence",
      headerName: "נוכחות",
      width: 110,
      sortable: false,
      filterable: false,
      renderCell: (p) => <ProductPresenceBadge verdict={p.row.verdict as never} size="small" />,
    },
    {
      field: "name_he",
      headerName: "שם",
      flex: 1.3,
      minWidth: 240,
      renderCell: (p) => (
        <Tooltip title={p.value ?? ""}>
          <Typography variant="body2" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.value ?? "—"}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: "inv_ean",
      headerName: "ברקוד",
      width: 130,
      renderCell: (p) =>
        p.value ? <Chip size="small" label={p.value as string} sx={{ direction: "ltr" }} /> : "—",
    },
    { field: "inv_brand", headerName: "מותג", width: 120 },
    { field: "inv_category", headerName: "קטגוריה", width: 140 },
    {
      field: "inv_price",
      headerName: "מחיר",
      width: 90,
      align: "right",
      renderCell: (p) => fmtCurr(p.value as number | null),
    },
    {
      field: "verdict",
      headerName: "סטטוס התאמה",
      width: 130,
      renderCell: (p) => <VerdictBadge verdict={p.value as string} />,
    },
    {
      field: "confidence",
      headerName: "ביטחון",
      width: 110,
      align: "right",
      renderCell: (p) => {
        const c = (p.value as number) ?? 0;
        return (
          <Box sx={{ width: "100%" }}>
            <LinearProgress variant="determinate" value={c * 100} sx={{ height: 6, borderRadius: 1, direction: "ltr" }} />
            <Typography variant="caption" sx={{ direction: "ltr", display: "block", textAlign: "right" }}>
              {(c * 100).toFixed(0)}%
            </Typography>
          </Box>
        );
      },
    },
    {
      field: "sp_price",
      headerName: "מחיר SP",
      width: 90,
      align: "right",
      renderCell: (p) => fmtCurr(p.value as number | null),
    },
    {
      field: "actions",
      headerName: "החלטה",
      width: 220,
      sortable: false,
      filterable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.3}>
          <Tooltip title="פתח פרטים">
            <IconButton size="small" onClick={() => setDrawer(p.row)}>
              <InfoIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="סמן כחסר — להעלאה">
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
          <Tooltip title="סמן כקיים בסופר-פארם">
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
          <Tooltip title="התעלם / דלג">
            <span>
              <IconButton size="small" disabled={updating} onClick={() => applyAction("mark_ignored", [p.row.match_id])}>
                <MarkIgnoredIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  const goUploadFor = (row: ComparisonRow) => {
    router.push(`/board/upload?ids=${row.inventory_id}`);
  };

  return (
    <Stack spacing={2}>
      <SectionHeader
        title="השוואת קטלוגים"
        subtitle="התאמות אוטומטיות ובדיקה ידנית מול הצעות סופר-פארם"
        meta={
          <>
            <Chip label={`סה"כ ${fmt.format(total)}`} size="small" color="primary" variant="outlined" />
          </>
        }
      />

      <FilterBar>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
          <TextField
            select
            size="small"
            label="סטטוס התאמה"
            value={verdict}
            onChange={(e) => setVerdict(e.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">הכל</MenuItem>
            <MenuItem value="manual_review">דורש בדיקה ידנית</MenuItem>
            <MenuItem value="candidate">מועמד אוטומטי</MenuItem>
            <MenuItem value="missing">חסר בסופר-פארם</MenuItem>
            <MenuItem value="duplicate">קיים בסופר-פארם</MenuItem>
          </TextField>
          <TextField select size="small" label="מותג" value={brand} onChange={(e) => setBrand(e.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="">הכל</MenuItem>
            {brands.map((b) => <MenuItem key={b} value={b}>{b}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="קטגוריה" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ minWidth: 180 }}>
            <MenuItem value="">הכל</MenuItem>
            {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="ברקוד" value={hasEan} onChange={(e) => setHasEan(e.target.value)} sx={{ minWidth: 130 }}>
            <MenuItem value="any">הכל</MenuItem>
            <MenuItem value="yes">יש</MenuItem>
            <MenuItem value="no">אין</MenuItem>
          </TextField>
          <TextField size="small" label="חיפוש" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1, minWidth: 180 }} />
          <Tooltip title="נקה סינון">
            <IconButton
              onClick={() => {
                setVerdict("manual_review");
                setBrand("");
                setCategory("");
                setSearch("");
                setHasEan("any");
              }}
            >
              <ClearIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </FilterBar>

      {selection.length > 0 && (
        <Paper sx={{ p: 1.5, backgroundImage: "none", borderColor: "primary.main", bgcolor: "rgba(37, 99, 235, 0.05)" }}>
          <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} justifyContent="space-between" spacing={1.5}>
            <Typography sx={{ fontWeight: 600 }}>
              {selection.length} פריטים נבחרו
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                startIcon={<MarkMissingIcon />}
                variant="contained"
                color="warning"
                disabled={updating}
                onClick={() => applyAction("mark_missing", selection as number[])}
              >
                סמן את הנבחרים כחסרים
              </Button>
              <Button
                startIcon={<MarkExistsIcon />}
                variant="contained"
                color="success"
                disabled={updating}
                onClick={() => applyAction("mark_exists", selection as number[])}
              >
                סמן כקיימים
              </Button>
              <Button
                startIcon={<MarkIgnoredIcon />}
                variant="outlined"
                color="inherit"
                disabled={updating}
                onClick={() => applyAction("mark_ignored", selection as number[])}
              >
                התעלם
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
          onRowClick={(p) => setDrawer(p.row as ComparisonRow)}
          sx={{ border: "none" }}
        />
      </DataPanel>

      <ProductDetailDrawer
        row={drawer}
        open={Boolean(drawer)}
        onClose={() => setDrawer(null)}
        busy={updating}
        onUpload={(r) => goUploadFor(r)}
        onMarkMissing={(r) => applyAction("mark_missing", [r.match_id])}
        onMarkExists={(r) => applyAction("mark_exists", [r.match_id])}
        onMarkIgnored={(r) => applyAction("mark_ignored", [r.match_id])}
      />
    </Stack>
  );
}

/* -----------------------  superpharm tab  ----------------------- */

function SuperpharmTab() {
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState({ pageSize: 25, page: 0 });

  type Row = {
    offer_id: string;
    shop_sku: string | null;
    product_brand: string | null;
    product_title: string | null;
    ean: string | null;
    price: number | null;
    quantity: number | null;
    logistic_class_label: string | null;
    category_label: string | null;
    import_type: string | null;
  };

  const filters = useMemo(() => {
    const f: Array<{ field: string; operator: string; value: unknown }> = [];
    if (brand) f.push({ field: "product_brand", operator: "eq", value: brand });
    if (category) f.push({ field: "category_label", operator: "eq", value: category });
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
    { field: "shop_sku", headerName: "שופ SKU", width: 130 },
    { field: "product_brand", headerName: "מותג", width: 120 },
    { field: "product_title", headerName: "כותרת", flex: 1, minWidth: 280 },
    {
      field: "ean",
      headerName: "ברקוד",
      width: 140,
      renderCell: (p) => (p.value ? <Chip size="small" label={p.value as string} sx={{ direction: "ltr" }} /> : "—"),
    },
    {
      field: "price",
      headerName: "מחיר",
      width: 90,
      align: "right",
      renderCell: (p) => (p.value != null ? `₪${fmt.format(p.value as number)}` : "—"),
    },
    { field: "quantity", headerName: "כמות", width: 90, align: "right", renderCell: (p) => fmt.format((p.value as number) ?? 0) },
    { field: "logistic_class_label", headerName: "מחלקת לוגיסטיקה", width: 200 },
    { field: "category_label", headerName: "קטגוריה", width: 180 },
    {
      field: "import_type",
      headerName: "סוג יבוא",
      width: 110,
      renderCell: (p) => <Chip size="small" label={p.value ?? "—"} variant="outlined" />,
    },
  ];

  return (
    <Stack spacing={2}>
      <SectionHeader
        title="הצעות סופר-פארם"
        subtitle={`סה"כ ${fmt.format(total)} הצעות פעילות`}
      />
      <FilterBar>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
          <TextField select size="small" label="מותג" value={brand} onChange={(e) => setBrand(e.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="">הכל</MenuItem>
            {brands.map((b) => <MenuItem key={b} value={b}>{b}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="קטגוריה" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ minWidth: 180 }}>
            <MenuItem value="">הכל</MenuItem>
            {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          <TextField size="small" label="חיפוש" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1, minWidth: 180 }} />
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
    </Stack>
  );
}

/* -----------------------  categories tab  ----------------------- */

function CategoriesTab() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState({ pageSize: 50, page: 0 });

  type Row = {
    id: string;
    sp_category_code: string;
    parent_code: string | null;
    name_he: string;
  };

  const filters = useMemo(
    () => (deferredSearch ? [{ field: "name_he", operator: "contains", value: deferredSearch }] : []),
    [deferredSearch],
  );

  const { data, isFetching } = useList<Row>({
    resource: "categories",
    pagination: { current: page.page + 1, pageSize: page.pageSize },
    filters: filters as never,
    sorters: [{ field: "name_he", order: "asc" }],
    queryOptions: { keepPreviousData: true, staleTime: 30_000 },
  });
  const total = data?.total ?? 0;

  const cols: GridColDef<Row>[] = [
    {
      field: "sp_category_code",
      headerName: "קוד SP",
      width: 130,
      renderCell: (p) => <Chip size="small" label={p.value as string} variant="outlined" sx={{ direction: "ltr" }} />,
    },
    { field: "name_he", headerName: "שם", flex: 1, minWidth: 200 },
    {
      field: "parent_code",
      headerName: "הורה",
      width: 130,
      renderCell: (p) =>
        p.value ? (
          <Chip size="small" label={p.value as string} variant="outlined" sx={{ direction: "ltr" }} />
        ) : (
          <Chip size="small" label="שורש" color="success" />
        ),
    },
  ];

  return (
    <Stack spacing={2}>
      <SectionHeader
        title="קטגוריות סופר-פארם"
        subtitle={`סה"כ ${fmt.format(total)} קטגוריות`}
      />
      <FilterBar>
        <TextField fullWidth size="small" label="חיפוש" value={search} onChange={(e) => setSearch(e.target.value)} />
      </FilterBar>
      <DataPanel>
        <DataGrid
          rows={data?.data ?? []}
          columns={cols}
          getRowId={(r) => r.id}
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
    </Stack>
  );
}
