"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Grid,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import {
  Inventory2 as InventoryIcon,
  PlaylistAddCheck as PilotIcon,
  Refresh as RefreshIcon,
  ReportProblem as MissingIcon,
  Storefront as SuperPharmIcon,
  Compare as CompareIcon,
  CheckCircle as DoneIcon,
  CloudUpload as UploadIcon,
  Cancel as RejectedIcon,
} from "@mui/icons-material";
import { BoardShell } from "@/components/board";
import { KpiCard, NextActionCard, SectionHeader } from "@/components/shared";

const ChartFallback = () => <Skeleton variant="rounded" height={300} sx={{ minHeight: 300 }} />;

const VerdictPiePanel = dynamic(
  () =>
    import("../../dashboard/DashboardCharts").then((m) => m.VerdictPiePanel),
  { ssr: false, loading: ChartFallback },
);
const TopMissingPanel = dynamic(
  () =>
    import("../../dashboard/DashboardCharts").then((m) => m.TopMissingPanel),
  { ssr: false, loading: ChartFallback },
);
const LogisticRadialPanel = dynamic(
  () =>
    import("../../dashboard/DashboardCharts").then((m) => m.LogisticRadialPanel),
  { ssr: false, loading: ChartFallback },
);

interface SummaryData {
  inventory_total?: number;
  sp_active?: number;
  verdicts?: Record<string, number>;
  pilot_status?: Record<string, number>;
  top_missing_categories?: Array<{ category: string; n: number }>;
  sp_logistic_class?: Record<string, number>;
  last_syncs?: Record<string, string>;
  sp_matched_unique?: number;
  sp_duplicate_unique?: number;
}

const fmt = new Intl.NumberFormat("he-IL");

const fmtTs = (s?: string | null) => {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return s;
  }
};

const SYNC_LABELS: Record<string, string> = {
  "sync-konimbo-orphans": "הקונטיינר",
  "sync-konimbo-full": "הקונטיינר",
  "sync-superpharm-full": "סופר-פארם",
  "sync-superpharm-orphans": "סופר-פארם · ניקוי",
  "rerun-matching": "השוואת קטלוגים",
  "match-catalog": "השוואת קטלוגים",
  superpharm_pm01: "יצירה בקטלוג (PM01)",
  superpharm_of01: "פרסום הצעה (OF01)",
};

export default function BoardDashboard() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard-summary", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
      setData(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const verdicts = data?.verdicts ?? {};
  const pilotStatus = data?.pilot_status ?? {};
  const lastSyncs = data?.last_syncs ?? {};

  const inventoryTotal = data?.inventory_total ?? 0;
  const spActive = data?.sp_active ?? 0;
  const missingCount = verdicts.missing ?? 0;
  const reviewCount = (verdicts.candidate ?? 0) + (verdicts.manual_review ?? 0);
  const existsCount = verdicts.duplicate ?? 0;
  const totalVerdicts = Object.values(verdicts).reduce((sum, n) => sum + n, 0);
  const matchedCount = Math.max(totalVerdicts - missingCount, 0);
  const ready = (pilotStatus.approved_for_pilot ?? 0) + (pilotStatus.catalog_synced ?? 0);
  const uploaded =
    (pilotStatus.uploaded ?? 0) +
    (pilotStatus.uploading ?? 0) +
    (pilotStatus.offer_submitted ?? 0) +
    (pilotStatus.offer_approved ?? 0) +
    (pilotStatus.complete ?? 0);
  const failed = pilotStatus.rejected ?? 0;

  const coveragePct = inventoryTotal > 0 ? Math.round((matchedCount / inventoryTotal) * 100) : 0;
  const gapPct = inventoryTotal > 0 ? Math.round((missingCount / inventoryTotal) * 100) : 0;

  const verdictPie = useMemo(
    () =>
      Object.entries(verdicts).map(([key, value]) => ({
        name: VERDICT_LABEL[key] ?? key,
        value,
        key,
      })),
    [verdicts],
  );
  const topMissing = useMemo(() => (data?.top_missing_categories ?? []).slice(0, 10), [data?.top_missing_categories]);
  const logisticData = useMemo(
    () =>
      Object.entries(data?.sp_logistic_class ?? {})
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    [data?.sp_logistic_class],
  );

  return (
    <BoardShell
      eyebrow="דשבורד"
      title="ברוכים הבאים"
      description="מצב המערכת ופעולות מומלצות. כל המספרים מתעדכנים אוטומטית."
      actions={
        <Tooltip title="רענן">
          <span>
            <IconButton onClick={load} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </span>
        </Tooltip>
      }
    >
      {error && <Alert severity="error">{error}</Alert>}

      {/* Next-best-action */}
      <Stack spacing={1.5}>
        {missingCount > 0 && (
          <NextActionCard
            tone="success"
            count={missingCount}
            countSuffix="פעולה מומלצת"
            title="מוצרים חסרים בסופר-פארם, מוכנים להעלאה"
            description="עברו לבורד 'העלאת מוצרים', בחרו מהרשימה ולחצו 'העלה'. הכל אוטומטי."
            ctaLabel="עבור להעלאה"
            href="/board/upload"
            icon={<UploadIcon />}
          />
        )}
        {reviewCount > 0 && (
          <NextActionCard
            tone="warning"
            count={reviewCount}
            countSuffix="דורש תשומת לב"
            title="מוצרים מחכים להחלטה ידנית"
            description="התאמות שלא הוכרעו אוטומטית. החליטו האם המוצר כבר קיים בסופר-פארם או צריך להעלות."
            ctaLabel="פתח קטלוג"
            href="/board/catalog?tab=comparison"
            icon={<CompareIcon />}
          />
        )}
        {missingCount === 0 && reviewCount === 0 && (
          <NextActionCard
            tone="info"
            title="הכל מסונכרן"
            description="אין פעולה דחופה. כשיגיעו מוצרים חדשים מהקונטיינר או מסופר-פארם, נפעיל אותם כאן."
            ctaLabel="פתח קטלוג"
            href="/board/catalog"
            icon={<DoneIcon />}
          />
        )}
      </Stack>

      {/* Primary KPIs */}
      <SectionHeader title="מספרים מרכזיים" subtitle="מצב נוכחי של הקטלוג ושל זרם ההעלאה" />
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} lg={3}>
          <KpiCard
            label="סה״כ מוצרים בהקונטיינר"
            value={inventoryTotal}
            icon={<InventoryIcon />}
            color="primary"
            loading={loading}
            href="/board/catalog?tab=inventory"
            helper={`${coveragePct}% עם התאמה לסופר-פארם`}
            progress={coveragePct}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <KpiCard
            label="הצעות פעילות בסופר-פארם"
            value={spActive}
            icon={<SuperPharmIcon />}
            color="info"
            loading={loading}
            href="/board/catalog?tab=superpharm"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <KpiCard
            label="חסרים בסופר-פארם"
            value={missingCount}
            icon={<MissingIcon />}
            color="error"
            loading={loading}
            href="/board/catalog?tab=comparison&verdict=missing"
            helper={`${gapPct}% פער קטלוגי`}
            progress={gapPct}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <KpiCard
            label="קיימים בסופר-פארם"
            value={existsCount}
            icon={<DoneIcon />}
            color="success"
            loading={loading}
            href="/board/catalog?tab=comparison&verdict=duplicate"
          />
        </Grid>

        <Grid item xs={12} sm={6} lg={3}>
          <KpiCard
            label="דורשים בדיקה"
            value={reviewCount}
            icon={<CompareIcon />}
            color="warning"
            loading={loading}
            href="/board/catalog?tab=comparison&verdict=manual_review"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <KpiCard
            label="מוכנים להעלאה"
            value={ready}
            icon={<PilotIcon />}
            color="success"
            loading={loading}
            href="/board/upload"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <KpiCard
            label="הועלו לסופר-פארם"
            value={uploaded}
            icon={<UploadIcon />}
            color="info"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <KpiCard
            label="העלאות שנכשלו"
            value={failed}
            icon={<RejectedIcon />}
            color="error"
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* Charts */}
      <SectionHeader title="ניתוח קטלוג" subtitle="התפלגות התאמות, קטגוריות חסרות, מחלקות לוגיסטיקה" />
      <Grid container spacing={2}>
        <Grid item xs={12} lg={4}>
          <VerdictPiePanel data={verdictPie} totalVerdicts={totalVerdicts} loading={loading} />
        </Grid>
        <Grid item xs={12} lg={5}>
          <TopMissingPanel data={topMissing} loading={loading} />
        </Grid>
        <Grid item xs={12} lg={3}>
          <LogisticRadialPanel data={logisticData} loading={loading} />
        </Grid>
      </Grid>

      {/* Last syncs */}
      <SectionHeader
        title="סנכרונים אחרונים"
        subtitle="מתי כל מקור נתונים עודכן בפעם האחרונה"
        actions={
          <Button
            component={Link}
            href="/board/settings?tab=jobs"
            variant="text"
            color="primary"
          >
            פתח היסטוריה מלאה
          </Button>
        }
      />
      <Paper sx={{ p: 2, backgroundImage: "none" }}>
        {Object.entries(lastSyncs).length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            עוד לא נרשמו סנכרונים.
          </Typography>
        ) : (
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            {Object.entries(lastSyncs).map(([type, ts]) => (
              <Box
                key={type}
                sx={(theme) => ({
                  px: 1.4,
                  py: 1,
                  borderRadius: 1.5,
                  border: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
                  bgcolor: "transparent",
                  minWidth: 200,
                })}
              >
                <Typography variant="overline" color="text.secondary" sx={{ display: "block", lineHeight: 1.1 }}>
                  {SYNC_LABELS[type] ?? type}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {fmtTs(ts)}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </Paper>
    </BoardShell>
  );
}

const VERDICT_LABEL: Record<string, string> = {
  missing: "חסר",
  duplicate: "קיים",
  candidate: "מועמד",
  manual_review: "בדיקה ידנית",
};
