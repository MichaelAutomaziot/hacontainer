"use client";

import {
  alpha,
  Box,
  Card,
  CardActionArea,
  CardContent,
  LinearProgress,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import Link from "next/link";
import type { ReactNode } from "react";

export interface KpiCardProps {
  label: string;
  value: number | string;
  delta?: { value: number; positive?: boolean; suffix?: string } | null;
  icon?: ReactNode;
  href?: string;
  color?: "primary" | "secondary" | "success" | "warning" | "error" | "info";
  loading?: boolean;
  helper?: string;
  progress?: number;
}

const formatNumber = (v: number | string) => {
  if (typeof v === "string") return v;
  return new Intl.NumberFormat("he-IL").format(v);
};

export const KpiCard = ({
  label,
  value,
  delta,
  icon,
  href,
  color = "primary",
  loading,
  helper,
  progress,
}: KpiCardProps) => {
  const inner = (
    <CardContent sx={{ direction: "rtl", p: 2.35, "&:last-child": { pb: 2.35 } }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 0.55 }}>
            {label}
          </Typography>
          {loading ? (
            <Skeleton variant="text" width={96} height={42} />
          ) : (
            <Typography
              variant="h4"
              component="div"
              sx={{
                lineHeight: 1,
                color: "text.primary",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatNumber(value)}
            </Typography>
          )}
          {delta && (
            <Typography
              variant="caption"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.4,
                mt: 0.55,
                color: delta.positive ? "success.main" : "error.main",
                fontWeight: 600,
              }}
            >
              {delta.positive ? "▲" : "▼"} {formatNumber(Math.abs(delta.value))}
              {delta.suffix ?? ""}
            </Typography>
          )}
          {helper && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.7 }}>
              {helper}
            </Typography>
          )}
        </Box>
        {icon && (
          <Box
            sx={(t) => ({
              color: t.palette[color].main,
              display: "inline-flex",
              flex: "0 0 auto",
              "& .MuiSvgIcon-root": { fontSize: 28 },
            })}
          >
            {icon}
          </Box>
        )}
      </Stack>
      {typeof progress === "number" && (
        <LinearProgress
          variant="determinate"
          value={Math.max(0, Math.min(100, progress))}
          color={color}
          sx={{
            mt: 2,
            height: 6,
            borderRadius: 999,
            bgcolor: "rgba(29, 37, 35, 0.06)",
            "& .MuiLinearProgress-bar": {
              borderRadius: 999,
            },
          }}
        />
      )}
    </CardContent>
  );

  if (href) {
    return (
      <Card
        sx={(t) => ({
          height: "100%",
          position: "relative",
          overflow: "hidden",
          "&:before": {
            content: '""',
            position: "absolute",
            insetBlock: 0,
            insetInlineStart: 0,
            width: 4,
            bgcolor: t.palette[color].main,
          },
        })}
      >
        <CardActionArea
          component={Link}
          href={href}
          prefetch={false}
          sx={{
            height: "100%",
            transition: "background-color 160ms ease",
            "&:hover": { bgcolor: "rgba(37, 99, 235, 0.04)" },
          }}
        >
          {inner}
        </CardActionArea>
      </Card>
    );
  }

  return (
    <Card
      sx={(t) => ({
        height: "100%",
        position: "relative",
        overflow: "hidden",
        "&:before": {
          content: '""',
          position: "absolute",
          insetBlock: 0,
          insetInlineStart: 0,
          width: 4,
          bgcolor: t.palette[color].main,
        },
      })}
    >
      {inner}
    </Card>
  );
};
