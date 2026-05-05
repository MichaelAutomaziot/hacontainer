"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiCard, PageFrame } from "@/components/shared";
import { hebrewTranslations as t } from "@/locales/he";

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

const VERDICT_COLORS: Record<string, string> = {
  missing: "#bd3f32",
  duplicate: "#2f7d4f",
  candidate: "#c77912",
  manual_review: "#2f6ea5",
};

const LOGISTIC_COLORS = ["#006d77", "#b85c38", "#2f7d4f", "#c77912", "#2f6ea5", "#6b5b95"];

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

const ChartPanel = ({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker?: string;
  children: React.ReactNode;
}) => (
  <Paper sx={{ p: 2.2, height: "100%", minHeight: 356, overflow: "hidden" }}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
      <Box>
        <Typography variant="subtitle1">{title}</Typography>
        {kicker && (
          <Typography variant="caption" color="text.secondary">
            {kicker}
          </Typography>
        )}
      </Box>
    </Stack>
    {children}
  </Paper>
);

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

  const topMissing = (data?.top_missing_categories ?? []).slice(0, 10);
  const logisticData = Object.entries(data?.sp_logistic_class ?? {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

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
          <ChartPanel title={t.pilot.dashboard.verdictDistribution} kicker={`${fmt.format(totalVerdicts)} רשומות התאמה`}>
            {loading ? (
              <Skeleton variant="rounded" height={280} />
            ) : verdictPie.length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={282}>
                <PieChart>
                  <Pie
                    data={verdictPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={64}
                    outerRadius={104}
                    paddingAngle={3}
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                  >
                    {verdictPie.map((entry) => (
                      <Cell key={entry.key} fill={VERDICT_COLORS[entry.key] ?? theme.palette.grey[500]} />
                    ))}
                  </Pie>
                  <RTooltip formatter={(value: number) => fmt.format(value)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12} lg={5}>
          <ChartPanel title={t.pilot.dashboard.topMissingCategories} kicker="עד 10 קטגוריות">
            {loading ? (
              <Skeleton variant="rounded" height={280} />
            ) : topMissing.length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={282}>
                <BarChart data={topMissing} layout="vertical" margin={{ left: 18, right: 18, top: 8, bottom: 8 }}>
                  <XAxis type="number" reversed tick={{ fontSize: 12, fill: theme.palette.text.secondary }} />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={158}
                    orientation="right"
                    tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
                  />
                  <RTooltip formatter={(value: number) => fmt.format(value)} />
                  <Bar dataKey="n" fill={theme.palette.error.main} radius={[7, 7, 7, 7]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
        </Grid>

        <Grid item xs={12} lg={3}>
          <ChartPanel title={t.pilot.dashboard.logisticClassDistribution} kicker="Super-Pharm">
            {loading ? (
              <Skeleton variant="rounded" height={280} />
            ) : logisticData.length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={282}>
                <RadialBarChart data={logisticData} innerRadius="24%" outerRadius="96%" startAngle={90} endAngle={-270}>
                  <RadialBar dataKey="value" background={{ fill: alpha(theme.palette.text.primary, 0.08) }}>
                    {logisticData.map((_, i) => (
                      <Cell key={i} fill={LOGISTIC_COLORS[i % LOGISTIC_COLORS.length]} />
                    ))}
                  </RadialBar>
                  <RTooltip formatter={(value: number) => fmt.format(value)} />
                </RadialBarChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>
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

const EmptyState = () => (
  <Box
    sx={{
      height: 282,
      display: "grid",
      placeItems: "center",
      color: "text.secondary",
      border: "1px dashed rgba(29, 37, 35, 0.18)",
      borderRadius: 2,
      bgcolor: "rgba(255,255,255,0.42)",
    }}
  >
    <Typography variant="body2">{t.pilot.sync.noJobs}</Typography>
  </Box>
);
