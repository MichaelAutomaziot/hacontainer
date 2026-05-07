"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  alpha,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  CheckCircle as DoneIcon,
  CloudUpload as UploadIcon,
  ErrorOutline as ErrorIcon,
  Inventory2 as ProductIcon,
  Refresh as RefreshIcon,
  Schedule as ProgressIcon,
  WarningAmber as NeedsFixIcon,
} from "@mui/icons-material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useNotification } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import { BoardShell } from "@/components/board";
import { DataPanel, ImageThumb, SectionHeader } from "@/components/shared";
import { SingleProductUploadDialog } from "@/components/products/SingleProductUploadDialog";

type UploadBucket = "ready" | "needs_fix" | "failed" | "in_progress" | "uploaded";
type PlatformStatus = "uploaded" | "missing" | "failed" | "needs_fix" | "in_progress";

interface ProductRow {
  id: number;
  name: string | null;
  brand: string | null;
  category: string | null;
  ean: string | null;
  image: string | null;
  hacontainer_url: string | null;
  source_status: "uploaded" | "missing";
  superpharm_status: PlatformStatus;
  upload_bucket: UploadBucket;
  issues: string[];
}

interface BoardProductsResponse {
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
  rows: ProductRow[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
}

interface PushDryResponse {
  ok?: boolean;
  eligible?: number;
  needs_pm01_count?: number;
  blocked_by_source_catalog?: number;
  blocked_by_duplicate?: number;
  blocked_by_priceFor?: number;
  blocked_by_catalog?: number;
  blocked_by_pm01_data?: number;
  blocked_by_pm01_brand?: number;
  blocked_by_pm01_category?: number;
  rejected?: { sku: string; inv_id?: number; errors: string[] }[];
  error?: string;
}

interface PushResponse {
  ok?: boolean;
  sku_count?: number;
  pm01_dispatched_count?: number;
  rejected_count?: number;
  error?: string;
}

interface CheckResponse {
  ok?: boolean;
  checked?: number;
  summary?: Array<{ promoted_inv?: number; rolled_back_inv?: number }>;
  error?: string;
}

const fmt = new Intl.NumberFormat("he-IL");
const UPLOAD_PAGE_SIZE = 25;

const emptyCounts: BoardProductsResponse["counts"] = {
  total_products: 0,
  source_uploaded: 0,
  source_missing: 0,
  superpharm_uploaded: 0,
  superpharm_missing: 0,
  ready: 0,
  needs_fix: 0,
  failed: 0,
  in_progress: 0,
  upload_total: 0,
};

const BUCKET_LABEL: Record<UploadBucket, string> = {
  ready: "מוכן להעלאה",
  needs_fix: "צריך תיקון",
  failed: "נכשל",
  in_progress: "בתהליך",
  uploaded: "הועלה",
};

const BUCKET_COLOR: Record<UploadBucket, "success" | "warning" | "error" | "info" | "default"> = {
  ready: "success",
  needs_fix: "warning",
  failed: "error",
  in_progress: "info",
  uploaded: "default",
};

const previewCount = (preview: PushDryResponse | null): number =>
  (preview?.eligible ?? 0) + (preview?.needs_pm01_count ?? 0);

const blockedCount = (preview: PushDryResponse | null): number =>
  (preview?.blocked_by_source_catalog ?? 0) +
  (preview?.blocked_by_duplicate ?? 0) +
  (preview?.blocked_by_priceFor ?? 0) +
  (preview?.blocked_by_catalog ?? 0) +
  (preview?.blocked_by_pm01_data ?? 0) +
  (preview?.blocked_by_pm01_brand ?? 0) +
  (preview?.blocked_by_pm01_category ?? 0);

const fetchProducts = async (page: number): Promise<BoardProductsResponse> => {
  const res = await fetch(`/api/board/products?scope=upload&page=${page}&pageSize=${UPLOAD_PAGE_SIZE}`, { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as BoardProductsResponse;
  if (!res.ok || json.ok === false) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
};

const useInitialIds = (): number[] => {
  const params = useSearchParams();
  return useMemo(() => {
    const raw = params.get("ids");
    if (!raw) return [];
    return raw
      .split(",")
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0);
  }, [params]);
};

function StatusSummaryCard({
  title,
  value,
  helper,
  tone,
  icon,
}: {
  title: string;
  value: number;
  helper: string;
  tone: "success" | "warning" | "error" | "info";
  icon: React.ReactNode;
}) {
  return (
    <Card
      variant="outlined"
      sx={(theme) => ({
        height: "100%",
        backgroundImage: "none",
        borderColor: alpha(theme.palette.text.primary, 0.09),
        bgcolor: theme.palette.background.paper,
        boxShadow: "0 1px 2px rgba(27, 36, 34, 0.035)",
      })}
    >
      <CardContent sx={{ p: { xs: 1.8, md: 2 } }}>
        <Stack direction="row" spacing={1.35} alignItems="center">
          <Box
            sx={(theme) => ({
              color: theme.palette[tone].main,
              display: "inline-flex",
              "& svg": { fontSize: 26 },
            })}
          >
            {icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
              {title}
            </Typography>
            <Typography variant="h4" sx={{ mt: 0.35, lineHeight: 1, fontWeight: 700 }}>
              {fmt.format(value)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.45, display: "block" }}>
              {helper}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

const productColumns: GridColDef<ProductRow>[] = [
  {
    field: "image",
    headerName: "",
    width: 64,
    sortable: false,
    filterable: false,
    renderCell: (p) => <ImageThumb src={p.row.image} size={42} alt={p.row.name ?? ""} />,
  },
  {
    field: "name",
    headerName: "שם המוצר",
    flex: 1.6,
    minWidth: 220,
    renderCell: (p) => (
      <Tooltip title={p.row.name ?? ""}>
        <Typography
          variant="body2"
          sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}
        >
          {p.row.name ?? "—"}
        </Typography>
      </Tooltip>
    ),
  },
  {
    field: "brand",
    headerName: "מותג",
    width: 140,
    renderCell: (p) => (
      <Typography variant="body2" color="text.secondary" noWrap>
        {p.row.brand ?? "—"}
      </Typography>
    ),
  },
  {
    field: "ean",
    headerName: "ברקוד",
    width: 150,
    renderCell: (p) =>
      p.row.ean ? (
        <Typography
          variant="body2"
          sx={{ direction: "ltr", fontVariantNumeric: "tabular-nums", color: "text.secondary" }}
        >
          {p.row.ean}
        </Typography>
      ) : (
        <Typography variant="body2" color="text.disabled">—</Typography>
      ),
  },
  {
    field: "upload_bucket",
    headerName: "סטטוס",
    width: 150,
    renderCell: (p) => {
      const tone = BUCKET_COLOR[p.row.upload_bucket];
      return (
        <Chip
          size="small"
          color={tone === "default" ? undefined : tone}
          variant="outlined"
          label={BUCKET_LABEL[p.row.upload_bucket]}
          sx={{ borderRadius: 1, fontWeight: 600 }}
        />
      );
    },
  },
  {
    field: "issues",
    headerName: "בעיה / הערה",
    flex: 1.2,
    minWidth: 200,
    sortable: false,
    renderCell: (p) =>
      p.row.issues.length > 0 ? (
        <Tooltip title={p.row.issues.join(" · ")}>
          <Typography
            variant="caption"
            color={p.row.upload_bucket === "failed" ? "error.main" : "text.secondary"}
            sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {p.row.issues.slice(0, 2).join(" · ")}
          </Typography>
        </Tooltip>
      ) : (
        <Typography variant="caption" color="text.disabled">—</Typography>
      ),
  },
];

export default function BoardUpload() {
  const ids = useInitialIds();
  const { open } = useNotification();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [singleDialogOpen, setSingleDialogOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<PushDryResponse | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [checkBusy, setCheckBusy] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["board-products-upload", page],
    queryFn: () => fetchProducts(page),
    staleTime: 20_000,
  });

  const counts = data?.counts ?? emptyCounts;
  const rows = data?.rows ?? [];
  const totalVisible = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(totalVisible / (data?.pageSize ?? UPLOAD_PAGE_SIZE)));
  const selectedModeBody = useMemo(
    () => (ids.length > 0 ? { mode: "by_ids", ids } : { mode: "all_missing" }),
    [ids],
  );

  useEffect(() => {
    if (data && page > pages) setPage(pages);
  }, [data, page, pages]);

  const runPreview = async () => {
    setPreviewLoading(true);
    setResultMessage(null);
    try {
      const res = await fetch("/api/sync/superpharm/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...selectedModeBody, dry: true }),
      });
      const json = (await res.json().catch(() => ({}))) as PushDryResponse;
      if (!res.ok || json.ok === false) throw new Error(json.error ?? `HTTP ${res.status}`);
      setPreview(json);
    } catch (e) {
      setPreview(null);
      open?.({ type: "error", message: "הבדיקה נכשלה", description: (e as Error).message });
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (!dialogOpen) return;
    void runPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, selectedModeBody]);

  const runUpload = async () => {
    if (previewLoading || previewCount(preview) === 0) return;
    setPushBusy(true);
    setResultMessage(null);
    try {
      const res = await fetch("/api/sync/superpharm/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedModeBody),
      });
      const json = (await res.json().catch(() => ({}))) as PushResponse;
      if (!res.ok || json.ok === false) throw new Error(json.error ?? `HTTP ${res.status}`);

      const sent = (json.sku_count ?? 0) + (json.pm01_dispatched_count ?? 0);
      const msg =
        sent > 0
          ? `התחלנו להעלות ${fmt.format(sent)} מוצרים. אפשר לבדוק התקדמות בעוד כמה דקות.`
          : "לא נמצאו מוצרים חדשים שאפשר להעלות כרגע.";
      setResultMessage(msg);
      open?.({ type: "success", message: msg });
      await refetch();
      await runPreview();
    } catch (e) {
      open?.({ type: "error", message: "העלאה נכשלה", description: (e as Error).message });
    } finally {
      setPushBusy(false);
    }
  };

  const checkProgress = async () => {
    setCheckBusy(true);
    try {
      const res = await fetch("/api/sync/superpharm/check", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as CheckResponse;
      if (!res.ok || json.ok === false) throw new Error(json.error ?? `HTTP ${res.status}`);
      const promoted = (json.summary ?? []).reduce((sum, item) => sum + (item.promoted_inv ?? 0), 0);
      const failed = (json.summary ?? []).reduce((sum, item) => sum + (item.rolled_back_inv ?? 0), 0);
      const msg =
        promoted > 0 || failed > 0
          ? `עודכנו ${fmt.format(promoted)} מוצרים, ${fmt.format(failed)} צריכים תיקון.`
          : "אין עדכונים חדשים כרגע.";
      open?.({ type: "success", message: msg });
      await refetch();
    } catch (e) {
      open?.({ type: "error", message: "בדיקת התקדמות נכשלה", description: (e as Error).message });
    } finally {
      setCheckBusy(false);
    }
  };

  const canUpload = previewCount(preview) > 0 && !previewLoading && !pushBusy;
  const blocked = blockedCount(preview);

  return (
    <BoardShell
      eyebrow="העלאת מוצרים"
      title="העלאת מוצרים"
      description="המערכת בודקת את המוצרים ומעלה רק את מה שמוכן. אין צורך לבחור פלטפורמות או להבין פרטים טכניים."
      actions={
        <IconButton onClick={() => refetch()} disabled={isFetching} aria-label="רענון">
          {isFetching ? <CircularProgress size={20} /> : <RefreshIcon />}
        </IconButton>
      }
      maxWidth={1180}
    >
      {error ? <Alert severity="error">{(error as Error).message}</Alert> : null}

      <Card
        variant="outlined"
        sx={(theme) => ({
          backgroundImage: "none",
          borderColor: alpha(theme.palette.text.primary, 0.09),
          bgcolor: theme.palette.background.paper,
          boxShadow: "0 1px 2px rgba(27, 36, 34, 0.035)",
        })}
      >
        <CardContent sx={{ p: { xs: 2, md: 2.6 } }}>
          <Stack spacing={2.25} alignItems="stretch">
            <Stack direction={{ xs: "column", md: "row" }} spacing={2.5} alignItems={{ xs: "stretch", md: "center" }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h5" sx={{ lineHeight: 1.2, fontWeight: 600 }}>
                  מוכנים להתחיל
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, maxWidth: 680 }}>
                  לחיצה אחת פותחת בדיקה ברורה. מוצרים שחסרים בהם פרטים לא יישלחו, והמוצרים התקינים יועלו לסופר-פארם.
                </Typography>
              </Box>
              <Stack direction="row" spacing={2} alignItems="center" justifyContent={{ xs: "space-between", md: "flex-end" }}>
                <Box sx={{ minWidth: 92 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    ממתינים לטיפול
                  </Typography>
                  <Typography variant="h5" sx={{ lineHeight: 1.05, fontWeight: 700 }}>
                    {fmt.format(counts.upload_total)}
                  </Typography>
                </Box>
              <Stack direction="row" spacing={1.25}>
                <Button
                  size="large"
                  variant="outlined"
                  color="primary"
                  startIcon={<AddIcon />}
                  onClick={() => setSingleDialogOpen(true)}
                  sx={{ minHeight: 54, px: 2.6, fontSize: 16, fontWeight: 600 }}
                >
                  העלאת מוצר חדש
                </Button>
                <Button
                  size="large"
                  variant="contained"
                  color="primary"
                  startIcon={<UploadIcon />}
                  onClick={() => setDialogOpen(true)}
                  sx={{ minHeight: 54, px: 3.2, fontSize: 17, fontWeight: 600 }}
                >
                  העלאת מוצרים
                </Button>
              </Stack>
              </Stack>
            </Stack>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" },
                gap: 1.5,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <StatusSummaryCard
                  title="מוכנים"
                  value={counts.ready}
                  helper="יעברו בדיקה לפני שליחה"
                  tone="success"
                  icon={<DoneIcon />}
                />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <StatusSummaryCard
                  title="צריך תיקון"
                  value={counts.needs_fix}
                  helper="חסר פרט חשוב במוצר"
                  tone="warning"
                  icon={<NeedsFixIcon />}
                />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <StatusSummaryCard
                  title="נכשלו"
                  value={counts.failed}
                  helper="צריך בדיקה לפני ניסיון נוסף"
                  tone="error"
                  icon={<ErrorIcon />}
                />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <StatusSummaryCard
                  title="בתהליך"
                  value={counts.in_progress}
                  helper="כבר נשלחו וממתינים לסיום"
                  tone="info"
                  icon={<ProgressIcon />}
                />
              </Box>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <SectionHeader
        title="מוצרים שממתינים לטיפול"
        subtitle={`מציגים ${fmt.format(rows.length)} מתוך ${fmt.format(totalVisible)} מוצרים בעמוד זה · ${fmt.format(counts.upload_total)} ממתינים בסך הכל`}
        icon={<ProductIcon />}
        actions={
          <Button
            variant="outlined"
            color="secondary"
            onClick={checkProgress}
            disabled={checkBusy}
            startIcon={checkBusy ? <CircularProgress size={16} /> : <RefreshIcon />}
          >
            בדוק התקדמות
          </Button>
        }
      />

      {!isLoading && rows.length === 0 ? (
        <Alert severity="success" icon={<DoneIcon />}>
          אין מוצרים שממתינים להעלאה. הכל נראה מסודר.
        </Alert>
      ) : (
        <DataPanel>
          <DataGrid
            rows={rows}
            columns={productColumns}
            getRowId={(r) => r.id}
            autoHeight
            disableRowSelectionOnClick
            paginationMode="server"
            rowCount={totalVisible}
            paginationModel={{ page: page - 1, pageSize: data?.pageSize ?? UPLOAD_PAGE_SIZE }}
            onPaginationModelChange={(m) => setPage(m.page + 1)}
            pageSizeOptions={[12, 25, 50]}
            loading={isLoading || isFetching}
            rowHeight={72}
            sx={{ border: "none" }}
          />
        </DataPanel>
      )}

      <Dialog open={dialogOpen} onClose={() => !pushBusy && setDialogOpen(false)} dir="rtl" maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 24 }}>בדיקה לפני העלאה</DialogTitle>
        <DialogContent>
          <Stack spacing={2.2} sx={{ pt: 1 }}>
            {previewLoading ? (
              <Alert severity="info" icon={<CircularProgress size={18} />}>
                בודקים את המוצרים. זה יכול לקחת רגע.
              </Alert>
            ) : preview ? (
              <>
                <Alert severity={previewCount(preview) > 0 ? "success" : "warning"} icon={<DoneIcon />}>
                  {previewCount(preview) > 0
                    ? `${fmt.format(previewCount(preview))} מוצרים מוכנים להעלאה.`
                    : "אין כרגע מוצרים שעברו את כל הבדיקות."}
                </Alert>
                {blocked > 0 && (
                  <Alert severity="warning" icon={<NeedsFixIcon />}>
                    {fmt.format(blocked)} מוצרים לא יישלחו עכשיו כי חסרים בהם פרטים או שהם כבר קיימים.
                  </Alert>
                )}
                {(preview.rejected?.length ?? 0) > 0 && (
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      דוגמאות למה שצריך לתקן
                    </Typography>
                    <Stack spacing={0.8}>
                      {preview.rejected!.slice(0, 4).map((item) => (
                        <Typography key={`${item.sku}-${item.inv_id ?? ""}`} variant="body2" color="text.secondary">
                          {item.errors.slice(0, 2).join(" · ")}
                        </Typography>
                      ))}
                    </Stack>
                  </Box>
                )}
              </>
            ) : (
              <Alert severity="info">נפתח את הבדיקה מיד.</Alert>
            )}

            {resultMessage && <Alert severity="success">{resultMessage}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="text" color="inherit" onClick={() => setDialogOpen(false)} disabled={pushBusy}>
            סגירה
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            onClick={runPreview}
            disabled={previewLoading || pushBusy}
            startIcon={previewLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
          >
            בדוק שוב
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={runUpload}
            disabled={!canUpload}
            startIcon={pushBusy ? <CircularProgress size={18} color="inherit" /> : <UploadIcon />}
            sx={{ minHeight: 52, px: 3, fontSize: 17 }}
          >
            העלאת מוצרים
          </Button>
        </DialogActions>
      </Dialog>

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
