"use client";

import { alpha, Box, Chip, Paper, Stack, Typography, type SxProps, type Theme } from "@mui/material";
import type { ReactNode } from "react";

type Tone = "primary" | "secondary" | "success" | "warning" | "error" | "info";

const toneFallback: Record<Tone, string> = {
  primary: "#2563eb",
  secondary: "#242121",
  success: "#2f7d4f",
  warning: "#c77912",
  error: "#dc2626",
  info: "#4f5864",
};

const withSx = (base: SxProps<Theme>, sx?: SxProps<Theme>): SxProps<Theme> => {
  if (!sx) return base;
  return (Array.isArray(sx) ? [base, ...sx] : [base, sx]) as SxProps<Theme>;
};

export function PageFrame({
  children,
  maxWidth = 1680,
  sx,
}: {
  children: ReactNode;
  maxWidth?: number | string;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      dir="rtl"
      className="workbench-page"
      sx={withSx({
        width: "100%",
        boxSizing: "border-box",
        maxWidth,
        mx: "auto",
        p: { xs: 2, md: 3 },
        display: "grid",
        gap: { xs: 2, md: 2.5 },
      }, sx)}
    >
      {children}
    </Box>
  );
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  icon,
  actions,
  stats,
  tone = "primary",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  stats?: ReactNode;
  tone?: Tone;
}) {
  return (
    <Box
      className="workbench-header"
      sx={(theme) => {
        const main = theme.palette[tone]?.main ?? toneFallback[tone];
        return {
          borderRadius: 2,
          p: { xs: 2, md: 2.6 },
          border: `1px solid ${alpha(main, 0.16)}`,
          backgroundColor: theme.palette.background.paper,
          backgroundImage: "none",
          boxShadow: `0 1px 2px ${alpha(theme.palette.common.black, 0.04)}`,
        };
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        alignItems={{ xs: "stretch", md: "center" }}
        justifyContent="space-between"
        spacing={2.4}
      >
        <Stack direction="row" spacing={1.7} alignItems="center" sx={{ minWidth: 0 }}>
          {icon && (
            <Box
              sx={(theme) => {
                const main = theme.palette[tone]?.main ?? toneFallback[tone];
                return {
                  width: 52,
                  height: 52,
                  borderRadius: 2,
                  display: "grid",
                  placeItems: "center",
                  color: main,
                  bgcolor: alpha(main, 0.11),
                  boxShadow: `inset 0 0 0 1px ${alpha(main, 0.2)}`,
                  flex: "0 0 auto",
                  "& .MuiSvgIcon-root": { fontSize: 28 },
                };
              }}
            >
              {icon}
            </Box>
          )}

          <Box sx={{ minWidth: 0 }}>
            {eyebrow && (
              <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 0.2 }}>
                {eyebrow}
              </Typography>
            )}
            <Typography variant="h4" component="h1" sx={{ lineHeight: 1.14 }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, maxWidth: 780 }}>
                {subtitle}
              </Typography>
            )}
            {stats && (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.4 }}>
                {stats}
              </Stack>
            )}
          </Box>
        </Stack>

        {actions && (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent={{ xs: "flex-start", md: "flex-end" }}>
            {actions}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

export function FilterBar({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Paper
      className="workbench-filter"
      sx={withSx({
        p: { xs: 1.5, md: 1.75 },
      }, sx)}
    >
      {children}
    </Paper>
  );
}

export function DataPanel({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Paper
      className="workbench-data-panel"
      sx={withSx({
        overflow: "hidden",
      }, sx)}
    >
      {children}
    </Paper>
  );
}

export function SectionPanel({
  title,
  subtitle,
  action,
  children,
  sx,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  sx?: SxProps<Theme>;
}) {
  return (
    <Paper sx={withSx({ p: { xs: 1.75, md: 2.1 } }, sx)}>
      {(title || subtitle || action) && (
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} sx={{ mb: 1.5 }}>
          <Box>
            {title && <Typography variant="subtitle1">{title}</Typography>}
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          {action}
        </Stack>
      )}
      {children}
    </Paper>
  );
}

export function CountChip({
  label,
  tone = "primary",
  variant = "filled",
}: {
  label: ReactNode;
  tone?: Tone;
  variant?: "filled" | "outlined";
}) {
  return <Chip label={label} color={tone} variant={variant} size="small" />;
}
