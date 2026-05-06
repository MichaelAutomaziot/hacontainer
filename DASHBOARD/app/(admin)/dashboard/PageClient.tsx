"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Alert,
  Box,
  Button,
  Chip,
  Grid,
  IconButton,
  LinearProgress,
  Paper,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  Inventory2 as InventoryIcon,
  PlaylistAddCheck as PilotIcon,
  Refresh as RefreshIcon,
  ReportProblem as MissingIcon,
  Storefront as SuperPharmIcon,
  Sync as SyncIcon,
  TrendingUp as TrendIcon,
} from "@mui/icons-material";
import { KpiCard, PageFrame } from "@/components/shared";
import { hebrewTranslations as t } from "@/locales/he";

const ChartFallback = () => <Skeleton variant="rounded" height={356} sx={{ minHeight: 356 }} />;

const VerdictPiePanel = dynamic(
  () => import("./DashboardCharts").then((m) => m.VerdictPiePanel),
  { ssr: false, loading: ChartFallback }
);
const TopMissingPanel = dynamic(
  () => import("./DashboardCharts").then((m) => m.TopMissingPanel),
  { ssr: false, loading: ChartFallback }
);
const LogisticRadialPanel = dynamic(
  () => import("./DashboardCharts").then((m) => m.LogisticRadialPanel),
  { ssr: false, loading: ChartFallback }
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

const syncLabel = (type: string) => {
  const labels: Record<string, string> = {
    "sync-konimbo-full": t.pilot.sync.konimboFull,
    "sync-konimbo-orphans": t.pilot.sync.konimboDelta,
    "sync-superpharm-full": t.pilot.sync.superpharmFull,
    "sync-superpharm-orphans": t.pilot.nav.superpharmOffers,
    "rerun-matching": t.pilot.sync.rerunMatching,
  };
  return labels[type] ?? type;
};

export default function DashboardPage() {
  const theme = useTheme();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard-summary");
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
  const spMatchedUnique = data?.sp_matched_unique ?? 0;
  const spDuplicateUnique = data?.sp_duplicate_unique ?? 0;
  const missingCount = verdicts.missing ?? 0;
  const totalVerdicts = Object.values(verdicts).reduce((sum, n) => sum + n, 0);
  const matchedCount = Math.max(totalVerdicts - missingCount, 0);
  const pilotApproved =
    (pilotStatus.approved_for_pilot ?? 0) +
    (pilotStatus.transformed ?? 0) +
    (pilotStatus.uploaded ?? 0) +
    (pilotStatus.ran_approved ?? 0);
  const gapPct = inventoryTotal > 0 ? Math.round((missingCount / inventoryTotal) * 100) : 0;
  const coveragePct = inventoryTotal > 0 ? Math.round((matchedCount / inventoryTotal) * 100) : 0;
  const spMatchedPct = spActive > 0 ? Math.round((spMatchedUnique / spActive) * 100) : 0;
  const pilotPct = missingCount > 0 ? Math.round((pilotApproved / missingCount) * 100) : 0;

  const verdictPie = useMemo(
    () =>
      Object.entries(verdicts).map(([key, value]) => ({
        name: (t.pilot.verdict as Record<string, string>)[key] ?? key,
        value,
        key,
      })),
    [verdicts]
  );

  const topMissing = useMemo(
    () => (data?.top_missing_categories ?? []).slice(0, 10),
    [data?.top_missing_categories]
  );

  const logisticData = useMemo(
    () =>
      Object.entries(data?.sp_logistic_class ?? {})
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    [data?.sp_logistic_class]
  );

  const primarySync = lastSyncs["sync-konimbo-orphans"];
  const superPharmSync = lastSyncs["sync-superpharm-full"] ?? lastSyncs["sync-superpharm-orphans"];

  return (
    <PageFrame>
      <Paper
        sx={{
          position: "relative",
          overflow: "hidden",
          p: { xs: 2.2, md: 3 },
          mb: 2.5,
          bgcolor: "rgba(251,252,248,0.88)",
          "&:before": {
            content: '""',
            position: "absolute",
            insetInlineStart: 0,
            top: 0,
            bottom: 0,
            width: 6,
            background: "linear-gradient(180deg, #006d77, #b85c38)",
          },
        }}
      >
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2.5}>
          <Box sx={{ maxWidth: 760 }}>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.2 }}>
              <Chip size="small" color="primary" label={`${t.pilot.dashboard.catalogGapPct}: ${gapPct}%`} />
              <Chip size="small" variant="outlined" label={`${t.pilot.kpi.pilotApproved}: ${fmt.format(pilotApproved)}`} />
              <Chip size="small" variant="outlined" label={`${t.pilot.kpi.spActive}: ${fmt.format(spActive)}`} />
            </Stack>
            <Typography variant="h3" sx={{ mb: 0.8 }}>
              {t.pilot.dashboard.title}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              מבט תפעולי על פערי הקטלוג, מוצרים חסרים, אישורי פיילוט וסנכרוני Konimbo / Super-Pharm.
            </Typography>
          </Box>

          <Stack spacing={1.25} sx={{ minWidth: { md: 360 } }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="overline" color="text.secondary">
                {t.pilot.dashboard.recentSyncs}
              </Typography>
              <Tooltip title={t.actions.refresh}>
                <span>
                  <IconButton onClick={load} disabled={loading} size="small">
                    <RefreshIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
            <Box
              sx={{
                p: 1.4,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: alpha(theme.palette.primary.main, 0.05),
              }}
            >
              <Stack spacing={0.7}>
                <Stack direction="row" justifyContent="space-between" spacing={2}>
                  <Typography variant="body2" color="text.secondary">
                    Konimbo
                  </Typography>
                  <Typography variant="body2" fontWeight={800}>
                    {fmtTs(primarySync)}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" spacing={2}>
                  <Typography variant="body2" color="text.secondary">
                    Super-Pharm
                  </Typography>
                  <Typography variant="body2" fontWeight={800}>
                    {fmtTs(superPharmSync)}
                  </Typography>
                </Stack>
              </Stack>
            </Box>
          </Stack>
        </Stack>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} lg={3}>
          <KpiCard
            label={t.pilot.kpi.konimboTotal}
            value={inventoryTotal}
            icon={<InventoryIcon />}
            color="primary"
            href="/inventory"
            loading={loading}
            helper={`${coveragePct}% ממוצרי HaContainer עם התאמה`}
            progress={coveragePct}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <KpiCard
            label={t.pilot.kpi.spActive}
            value={spActive}
            icon={<SuperPharmIcon />}
            color="info"
            href="/superpharm"
            loading={loading}
            helper={`${fmt.format(spDuplicateUnique)} הצעות SP ייחודיות עם התאמה ודאית`}
            progress={spMatchedPct}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <KpiCard
            label={t.pilot.kpi.missing}
            value={missingCount}
            icon={<MissingIcon />}
            color="error"
            href="/comparison?verdict=missing"
            loading={loading}
            helper={`${gapPct}% מתוך קטלוג HaContainer`}
            progress={gapPct}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <KpiCard
            label={t.pilot.kpi.pilotApproved}
            value={pilotApproved}
            icon={<PilotIcon />}
            color="success"
            href="/pilot"
            loading={loading}
            helper={`${pilotPct}% מהמוצרים החסרים`}
            progress={pilotPct}
          />
        </Grid>
      </Grid>

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

        <Grid item xs={12}>
          <Paper sx={{ p: 2.2 }}>
            <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} justifyContent="space-between" spacing={2}>
              <Box>
                <Typography variant="subtitle1">{t.pilot.dashboard.recentSyncs}</Typography>
                <Typography variant="body2" color="text.secondary">
                  מעקב מהיר אחרי משימות הסנכרון האחרונות והזמן שבו כל מקור עודכן.
                </Typography>
              </Box>
              <Button startIcon={<SyncIcon />} variant="outlined" onClick={load} disabled={loading}>
                {t.actions.refresh}
              </Button>
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
              {Object.entries(lastSyncs).length === 0 ? (
                <Typography color="text.secondary">{t.pilot.sync.noJobs}</Typography>
              ) : (
                Object.entries(lastSyncs).map(([type, ts]) => (
                  <Chip
                    key={type}
                    icon={<TrendIcon />}
                    label={`${syncLabel(type)} · ${fmtTs(ts)}`}
                    variant="outlined"
                    sx={{ maxWidth: "100%" }}
                  />
                ))
              )}
            </Stack>

            {loading && <LinearProgress sx={{ mt: 2, borderRadius: 999 }} />}
          </Paper>
        </Grid>
      </Grid>
    </PageFrame>
  );
}
