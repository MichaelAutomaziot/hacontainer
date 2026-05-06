"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ArrowForward as StepArrowIcon,
  CheckCircle as DoneIcon,
  CloudUpload as UploadIcon,
  Compare as CompareIcon,
  Download as PullIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  Storefront as SuperPharmIcon,
  Sync as RunningIcon,
  Warning as WarnIcon,
} from "@mui/icons-material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useList, useNotification } from "@refinedev/core";
import Link from "next/link";
import {
  CountChip,
  DataPanel,
  KpiCard,
  PageFrame,
  PageHeader,
  SectionPanel,
  SyncTriggerButton,
} from "@/components/shared";
import { hebrewTranslations as t } from "@/locales/he";

const fmtNum = new Intl.NumberFormat("he-IL");

const fmtTs = (s?: string | null) => {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return s;
  }
};

const StatusChip = ({ status }: { status: string }) => {
  if (status === "completed")
    return <Chip size="small" color="success" icon={<DoneIcon />} label="הושלם" />;
  if (status === "failed")
    return <Chip size="small" color="error" icon={<ErrorIcon />} label="נכשל" />;
  if (status === "running")
    return <Chip size="small" color="info" icon={<RunningIcon />} label="רץ" />;
  return <Chip size="small" label={status} />;
};

interface SyncJobRow {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown> | null;
  last_error: string | null;
  created_at: string;
  completed_at: string | null;
}

interface DashboardSummary {
  inventory_total?: number;
  sp_active?: number;
  sp_matched_unique?: number;
  sp_duplicate_unique?: number;
  verdicts?: Record<string, number>;
  pilot_status?: Record<string, number>;
  last_syncs?: Record<string, { status: string; at: string }>;
}

const StepHeader = ({
  num,
  title,
  hint,
  done,
}: {
  num: number;
  title: string;
  hint?: string;
  done?: boolean;
}) => (
  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
    <Box
      sx={(th) => ({
        width: 34,
        height: 34,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        bgcolor: done ? th.palette.success.main : th.palette.primary.main,
        color: "#fff",
        fontWeight: 800,
        fontSize: 16,
        flex: "0 0 auto",
      })}
    >
      {done ? <DoneIcon fontSize="small" /> : num}
    </Box>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Box>
  </Stack>
);

export default function SyncPage() {
  const { open } = useNotification();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(true);
  const [pushBusy, setPushBusy] = useState<boolean>(false);
  const [pushDialog, setPushDialog] = useState<boolean>(false);
  const [pushPreview, setPushPreview] = useState<{
    eligible: number;
    blockedByDup: number;
    blockedByPriceFor: number;
  } | null>(null);
  const [pushPreviewLoading, setPushPreviewLoading] = useState<boolean>(false);

  const fetchSummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/dashboard-summary", { cache: "no-store" });
      const body = await res.json();
      if (body?.ok) setSummary(body as DashboardSummary);
    } catch (e) {
      console.warn("dashboard-summary fetch failed", e);
    } finally {
      setSummaryLoading(false);
    }
  };

  const refreshPushPreview = async () => {
    setPushPreviewLoading(true);
    try {
      const res = await fetch("/api/sync/superpharm/push?mode=all_missing&dry=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all_missing", dry: true }),
      });
      const body = await res.json();
      if (res.ok && body?.ok) {
        setPushPreview({
          eligible: body.eligible ?? 0,
          blockedByDup: body.blocked_by_duplicate ?? 0,
          blockedByPriceFor: body.blocked_by_priceFor ?? 0,
        });
      } else {
        setPushPreview(null);
      }
    } catch (e) {
      console.warn("push preview failed", e);
      setPushPreview(null);
    } finally {
      setPushPreviewLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    refreshPushPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: jobsData, isFetching: jobsFetching, refetch: refetchJobs } = useList<SyncJobRow>({
    resource: "sync_jobs",
    pagination: { pageSize: 50 },
    sorters: [{ field: "created_at", order: "desc" }],
    queryOptions: { refetchInterval: 5000 },
  });

  const jobs = (jobsData?.data ?? []) as SyncJobRow[];

  const lastByType = useMemo(() => {
    const m = new Map<string, SyncJobRow>();
    for (const j of jobs) {
      const cur = m.get(j.type);
      const at = j.completed_at ?? j.created_at;
      const curAt = cur?.completed_at ?? cur?.created_at ?? "";
      if (!cur || at > curAt) m.set(j.type, j);
    }
    return m;
  }, [jobs]);

  const verdicts = summary?.verdicts ?? {};
  const pilotStatus = summary?.pilot_status ?? {};
  const inventoryTotal = summary?.inventory_total ?? 0;
  const spActive = summary?.sp_active ?? 0;
  const missingCount = verdicts.missing ?? 0;
  const candidateCount = (verdicts.candidate ?? 0) + (verdicts.manual_review ?? 0);
  const uploadedCount = pilotStatus.uploaded ?? 0;
  const eligible = pushPreview?.eligible ?? 0;
  const blockedDup = pushPreview?.blockedByDup ?? 0;
  const blockedBuild = pushPreview?.blockedByPriceFor ?? 0;

  const handlePush = async () => {
    setPushBusy(true);
    try {
      const res = await fetch("/api/sync/superpharm/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all_missing" }),
      });
      const body = await res.json();
      if (!res.ok || body?.ok === false) {
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      open?.({
        type: "success",
        message: t.pilot.syncCenter.pushStarted.replace("{id}", String(body.import_id ?? "?")),
        description: `${body.sku_count ?? 0} מוצרים · נדחו: ${body.rejected_count ?? 0}`,
      });
      setPushDialog(false);
      refetchJobs();
      fetchSummary();
      refreshPushPreview();
    } catch (e) {
      const msg = (e as Error).message;
      open?.({
        type: "error",
        message: t.pilot.syncCenter.pushFailed.replace("{err}", msg),
      });
    } finally {
      setPushBusy(false);
    }
  };

  const cols: GridColDef[] = [
    {
      field: "type",
      headerName: "סוג",
      width: 220,
      renderCell: (p) => {
        const v = p.value as string;
        const map: Record<string, string> = {
          "sync-konimbo-orphans": "ניקוי יתומים — HaContainer",
          "sync-superpharm-full": "משיכה מלאה — סופר-פארם",
          "sync-superpharm-orphans": "ניקוי יתומים — סופר-פארם",
          "match-catalog": "השוואת קטלוגים",
          "superpharm_of01": "העלאה ל-Mirakl OF01",
        };
        return <span dir="rtl">{map[v] ?? v}</span>;
      },
    },
    {
      field: "status",
      headerName: "סטטוס",
      width: 120,
      renderCell: (p) => <StatusChip status={p.value as string} />,
    },
    {
      field: "created_at",
      headerName: "התחיל",
      width: 160,
      renderCell: (p) => fmtTs(p.value as string),
    },
    {
      field: "completed_at",
      headerName: "הסתיים",
      width: 160,
      renderCell: (p) => fmtTs(p.value as string | null),
    },
    {
      field: "elapsed",
      headerName: "משך (שנ׳)",
      width: 110,
      sortable: false,
      renderCell: (p) => {
        const v = (p.row.payload as Record<string, unknown> | null)?.["elapsed_s"];
        return typeof v === "number" ? v : "—";
      },
    },
    {
      field: "summary",
      headerName: "סיכום",
      flex: 1,
      sortable: false,
      renderCell: (p) => {
        const pl = p.row.payload as Record<string, unknown> | null;
        if (!pl) return "—";
        const parts: string[] = [];
        if (typeof pl.sku_count === "number") parts.push(`SKUs: ${pl.sku_count}`);
        if (typeof pl.rejected_count === "number" && pl.rejected_count > 0)
          parts.push(`נדחו: ${pl.rejected_count}`);
        if (typeof pl.keep_count === "number") parts.push(`נשמרו: ${pl.keep_count}`);
        if (typeof pl.deleted === "number") parts.push(`נמחקו: ${pl.deleted}`);
        if (typeof pl.pages === "number") parts.push(`דפים: ${pl.pages}`);
        if (typeof pl.total_seen === "number") parts.push(`נראו: ${pl.total_seen}`);
        if (typeof pl.lines_in_success === "number")
          parts.push(`הצליחו: ${pl.lines_in_success}`);
        if (typeof pl.lines_in_error === "number" && pl.lines_in_error > 0)
          parts.push(`שגיאות: ${pl.lines_in_error}`);
        return <Typography variant="body2">{parts.join(" · ") || "—"}</Typography>;
      },
    },
    {
      field: "last_error",
      headerName: "שגיאה",
      width: 70,
      sortable: false,
      renderCell: (p) =>
        p.value ? (
          <Tooltip title={String(p.value).slice(0, 400)}>
            <ErrorIcon color="error" fontSize="small" />
          </Tooltip>
        ) : null,
    },
  ];

  const lastPull_HC = lastByType.get("sync-konimbo-orphans");
  const lastPull_SP = lastByType.get("sync-superpharm-full");
  const lastMatch = lastByType.get("match-catalog");

  return (
    <PageFrame>
      <PageHeader
        title={t.pilot.nav.syncCenter}
        subtitle={t.pilot.syncCenter.subtitle}
        icon={<RunningIcon />}
        tone="primary"
        actions={
          <Tooltip title={t.actions.refresh}>
            <span>
              <IconButton
                onClick={() => {
                  refetchJobs();
                  fetchSummary();
                  refreshPushPreview();
                }}
                disabled={jobsFetching || summaryLoading}
              >
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
        }
      />

      {/* KPI strip */}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={2.4}>
          <KpiCard
            label="סה״כ HaContainer"
            value={inventoryTotal}
            icon={<PullIcon />}
            color="primary"
            loading={summaryLoading}
            href="/inventory"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <KpiCard
            label="פעילים בסופר-פארם"
            value={spActive}
            icon={<SuperPharmIcon />}
            color="info"
            loading={summaryLoading}
            href="/superpharm"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <KpiCard
            label={t.pilot.kpi.missing}
            value={missingCount}
            icon={<WarnIcon />}
            color="warning"
            loading={summaryLoading}
            href="/comparison?verdict=missing"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <KpiCard
            label={t.pilot.kpi.needsReview}
            value={candidateCount}
            icon={<CompareIcon />}
            color="secondary"
            loading={summaryLoading}
            href="/comparison?verdict=manual_review"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <KpiCard
            label={t.pilot.kpi.uploaded}
            value={uploadedCount}
            icon={<DoneIcon />}
            color="success"
            loading={summaryLoading}
          />
        </Grid>
      </Grid>

      {/* Step 1 — Pull data */}
      <SectionPanel>
        <StepHeader
          num={1}
          title={t.pilot.syncCenter.step1Title}
          hint={t.pilot.syncCenter.step1Hint}
        />
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
          <Stack spacing={0.5}>
            <SyncTriggerButton
              source="konimbo"
              label={t.pilot.sync.konimboFull}
              color="primary"
              onCompleted={() => {
                refetchJobs();
                fetchSummary();
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {lastPull_HC
                ? `סנכרון אחרון: ${fmtTs(lastPull_HC.completed_at ?? lastPull_HC.created_at)}`
                : "טרם רץ"}
            </Typography>
          </Stack>
          <Stack spacing={0.5}>
            <SyncTriggerButton
              source="superpharm"
              label={t.pilot.sync.superpharmFull}
              color="warning"
              onCompleted={() => {
                refetchJobs();
                fetchSummary();
                refreshPushPreview();
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {lastPull_SP
                ? `סנכרון אחרון: ${fmtTs(lastPull_SP.completed_at ?? lastPull_SP.created_at)}`
                : "טרם רץ. ~3 דקות"}
            </Typography>
          </Stack>
        </Stack>
      </SectionPanel>

      {/* Step 2 — Match catalogs */}
      <SectionPanel>
        <StepHeader
          num={2}
          title={t.pilot.syncCenter.step2Title}
          hint={t.pilot.syncCenter.step2Hint}
          done={!!lastMatch && lastMatch.status === "completed"}
        />
        <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap" useFlexGap>
          <Stack spacing={0.5} sx={{ minWidth: 180 }}>
            <Typography variant="overline" color="text.secondary">
              נמצאו אוטומטית
            </Typography>
            <Stack direction="row" spacing={1}>
              <CountChip
                label={`${fmtNum.format(verdicts.duplicate ?? 0)} כפולים`}
                tone="info"
                variant="outlined"
              />
              <CountChip
                label={`${fmtNum.format(missingCount)} חסרים`}
                tone="warning"
                variant="outlined"
              />
            </Stack>
          </Stack>
          <Divider orientation="vertical" flexItem />
          <Stack spacing={0.5} sx={{ minWidth: 180 }}>
            <Typography variant="overline" color="text.secondary">
              דורשים בדיקה ידנית
            </Typography>
            <CountChip
              label={`${fmtNum.format(candidateCount)} פריטים`}
              tone={candidateCount > 0 ? "secondary" : "primary"}
              variant="filled"
            />
          </Stack>
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {lastMatch
              ? `הרצת ההתאמה האחרונה: ${fmtTs(lastMatch.completed_at ?? lastMatch.created_at)}`
              : "ההתאמה רצה אוטומטית כל 15 דקות מהworker."}
          </Typography>
        </Stack>
      </SectionPanel>

      {/* Step 3 — Manual review */}
      <SectionPanel>
        <StepHeader
          num={3}
          title={t.pilot.syncCenter.step3Title}
          hint={t.pilot.syncCenter.step3Hint}
          done={candidateCount === 0}
        />
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button
            component={Link}
            href="/comparison?verdict=manual_review"
            variant={candidateCount > 0 ? "contained" : "outlined"}
            color="secondary"
            startIcon={<CompareIcon />}
            endIcon={<StepArrowIcon style={{ transform: "scaleX(-1)" }} />}
          >
            פתח בדיקה ידנית ({fmtNum.format(candidateCount)})
          </Button>
          {candidateCount === 0 && (
            <Typography variant="body2" color="success.main">
              ✓ כל הפריטים הוכרעו אוטומטית
            </Typography>
          )}
        </Stack>
      </SectionPanel>

      {/* Step 4 — Push to Super-Pharm */}
      <Paper
        sx={(th) => ({
          p: { xs: 2, md: 2.5 },
          borderInlineStart: `6px solid ${th.palette.success.main}`,
          background: `linear-gradient(135deg, rgba(47,125,79,0.06), rgba(255,255,255,1) 60%)`,
        })}
      >
        <StepHeader
          num={4}
          title={t.pilot.syncCenter.step4Title}
          hint={t.pilot.syncCenter.step4Hint}
        />

        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={5}>
            <Stack spacing={0.5}>
              <Typography variant="overline" color="text.secondary">
                מוכנים להעלאה (אחרי בדיקת כפילות)
              </Typography>
              <Typography variant="h3" sx={{ lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {pushPreviewLoading ? <CircularProgress size={28} /> : fmtNum.format(eligible)}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                {blockedDup > 0 && (
                  <Tooltip title="EAN שלהם כבר קיים בסופר-פארם — לא נעלה כדי לא ליצור כפילות">
                    <Chip
                      size="small"
                      icon={<WarnIcon fontSize="small" />}
                      label={`${fmtNum.format(blockedDup)} נחסמו (כפילות)`}
                      color="warning"
                      variant="outlined"
                    />
                  </Tooltip>
                )}
                {blockedBuild > 0 && (
                  <Tooltip title="המוצר נדחה ב-priceFor pre-flight: בעיה במחיר / EAN / שם / קטגוריה">
                    <Chip
                      size="small"
                      icon={<ErrorIcon fontSize="small" />}
                      label={`${fmtNum.format(blockedBuild)} לא buildable`}
                      color="default"
                      variant="outlined"
                    />
                  </Tooltip>
                )}
              </Stack>
            </Stack>
          </Grid>

          <Grid item xs={12} md={7}>
            <Stack
              direction="row"
              spacing={1.5}
              alignItems="center"
              justifyContent={{ xs: "flex-start", md: "flex-end" }}
            >
              <Tooltip
                title={
                  eligible === 0
                    ? t.pilot.syncCenter.pushBlockedNoMissing
                    : `יישלחו ${fmtNum.format(eligible)} מוצרים דרך Mirakl OF01`
                }
              >
                <span>
                  <Button
                    size="large"
                    variant="contained"
                    color="success"
                    startIcon={<UploadIcon />}
                    disabled={eligible === 0 || pushBusy || pushPreviewLoading}
                    onClick={() => setPushDialog(true)}
                    sx={{ minHeight: 56, px: 3, fontSize: 16, fontWeight: 700 }}
                  >
                    {t.pilot.actions.pushAllMissing}
                  </Button>
                </span>
              </Tooltip>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* History */}
      <SectionPanel title={t.pilot.syncCenter.historyTitle}>
        <DataPanel sx={{ mt: 1 }}>
          <DataGrid
            autoHeight
            rows={jobs}
            columns={cols}
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            loading={jobsFetching && jobs.length === 0}
            disableRowSelectionOnClick
            getRowId={(r) => r.id}
            sx={{ border: 0 }}
          />
        </DataPanel>
      </SectionPanel>

      {/* Push confirmation dialog */}
      <Dialog open={pushDialog} onClose={() => !pushBusy && setPushDialog(false)} dir="rtl">
        <DialogTitle>{t.pilot.syncCenter.pushConfirmTitle}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t.pilot.syncCenter.pushConfirmBody.replace("{n}", fmtNum.format(eligible))}
          </DialogContentText>
          {(blockedDup > 0 || blockedBuild > 0) && (
            <Box sx={{ mt: 2, p: 1.5, bgcolor: "warning.lighter", borderRadius: 1 }}>
              <Typography variant="body2">
                <strong>{fmtNum.format(blockedDup + blockedBuild)} מוצרים לא ייכללו</strong>: {fmtNum.format(blockedDup)} כפילות, {fmtNum.format(blockedBuild)} pre-flight כשל.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPushDialog(false)} disabled={pushBusy}>
            {t.actions.cancel}
          </Button>
          <Button
            onClick={handlePush}
            variant="contained"
            color="success"
            startIcon={pushBusy ? <CircularProgress size={16} color="inherit" /> : <UploadIcon />}
            disabled={pushBusy}
          >
            {pushBusy ? "שולח..." : `שלח ${fmtNum.format(eligible)} מוצרים`}
          </Button>
        </DialogActions>
      </Dialog>
    </PageFrame>
  );
}
