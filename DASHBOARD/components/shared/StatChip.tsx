"use client";

import { Box, Stack, Typography, alpha, type SxProps, type Theme } from "@mui/material";
import type { ReactNode } from "react";

type Tone = "primary" | "secondary" | "success" | "warning" | "error" | "info" | "neutral";

export interface StatChipProps {
  label: ReactNode;
  value: number | string;
  tone?: Tone;
  icon?: ReactNode;
  sx?: SxProps<Theme>;
  href?: string;
  onClick?: () => void;
}

const fmt = new Intl.NumberFormat("he-IL");

const formatValue = (v: number | string) => (typeof v === "number" ? fmt.format(v) : v);

export function StatChip({ label, value, tone = "neutral", icon, sx, href, onClick }: StatChipProps) {
  return (
    <Box
      component={href ? "a" : "div"}
      href={href}
      onClick={onClick}
      sx={[
        (theme) => {
          const main =
            tone === "neutral" ? theme.palette.text.primary : theme.palette[tone].main;
          return {
            display: "inline-flex",
            alignItems: "center",
            gap: 1,
            px: 1.4,
            py: 0.85,
            borderRadius: 1.5,
            border: `1px solid ${alpha(main, 0.22)}`,
            bgcolor: alpha(main, 0.06),
            color: theme.palette.text.primary,
            textDecoration: "none",
            cursor: href || onClick ? "pointer" : "default",
            transition: "transform 140ms ease, background-color 140ms ease",
            "&:hover": href || onClick ? { transform: "translateY(-1px)", bgcolor: alpha(main, 0.1) } : undefined,
            "& .stat-label": { color: theme.palette.text.secondary },
            "& .stat-icon": { color: main, display: "grid", placeItems: "center", "& svg": { fontSize: 18 } },
          };
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      {icon && <Box className="stat-icon">{icon}</Box>}
      <Stack spacing={0} alignItems="flex-start">
        <Typography
          variant="caption"
          className="stat-label"
          sx={{ lineHeight: 1, fontSize: "0.72rem" }}
        >
          {label}
        </Typography>
        <Typography
          variant="subtitle1"
          sx={{ lineHeight: 1.05, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}
        >
          {formatValue(value)}
        </Typography>
      </Stack>
    </Box>
  );
}
