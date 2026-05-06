"use client";

import { Box, Paper, Skeleton, Stack, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
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
import { hebrewTranslations as t } from "@/locales/he";

const VERDICT_COLORS: Record<string, string> = {
  missing: "#bd3f32",
  duplicate: "#2f7d4f",
  candidate: "#c77912",
  manual_review: "#2f6ea5",
};

const LOGISTIC_COLORS = ["#006d77", "#b85c38", "#2f7d4f", "#c77912", "#2f6ea5", "#6b5b95"];

const fmt = new Intl.NumberFormat("he-IL");

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

export interface VerdictDatum {
  name: string;
  value: number;
  key: string;
}

export interface MissingDatum {
  category: string;
  n: number;
}

export interface LogisticDatum {
  name: string;
  value: number;
}

export function VerdictPiePanel({
  data,
  totalVerdicts,
  loading,
}: {
  data: VerdictDatum[];
  totalVerdicts: number;
  loading: boolean;
}) {
  const theme = useTheme();
  return (
    <ChartPanel title={t.pilot.dashboard.verdictDistribution} kicker={`${fmt.format(totalVerdicts)} רשומות התאמה`}>
      {loading ? (
        <Skeleton variant="rounded" height={280} />
      ) : data.length === 0 ? (
        <EmptyState />
      ) : (
        <ResponsiveContainer width="100%" height={282}>
          <PieChart>
            <Pie
              data={data}
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
              {data.map((entry) => (
                <Cell key={entry.key} fill={VERDICT_COLORS[entry.key] ?? theme.palette.grey[500]} />
              ))}
            </Pie>
            <RTooltip formatter={(value: number) => fmt.format(value)} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartPanel>
  );
}

export function TopMissingPanel({ data, loading }: { data: MissingDatum[]; loading: boolean }) {
  const theme = useTheme();
  return (
    <ChartPanel title={t.pilot.dashboard.topMissingCategories} kicker="עד 10 קטגוריות">
      {loading ? (
        <Skeleton variant="rounded" height={280} />
      ) : data.length === 0 ? (
        <EmptyState />
      ) : (
        <ResponsiveContainer width="100%" height={282}>
          <BarChart data={data} layout="vertical" margin={{ left: 18, right: 18, top: 8, bottom: 8 }}>
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
  );
}

export function LogisticRadialPanel({ data, loading }: { data: LogisticDatum[]; loading: boolean }) {
  const theme = useTheme();
  return (
    <ChartPanel title={t.pilot.dashboard.logisticClassDistribution} kicker="Super-Pharm">
      {loading ? (
        <Skeleton variant="rounded" height={280} />
      ) : data.length === 0 ? (
        <EmptyState />
      ) : (
        <ResponsiveContainer width="100%" height={282}>
          <RadialBarChart data={data} innerRadius="24%" outerRadius="96%" startAngle={90} endAngle={-270}>
            <RadialBar dataKey="value" background={{ fill: alpha(theme.palette.text.primary, 0.08) }}>
              {data.map((_, i) => (
                <Cell key={i} fill={LOGISTIC_COLORS[i % LOGISTIC_COLORS.length]} />
              ))}
            </RadialBar>
            <RTooltip formatter={(value: number) => fmt.format(value)} />
          </RadialBarChart>
        </ResponsiveContainer>
      )}
    </ChartPanel>
  );
}
