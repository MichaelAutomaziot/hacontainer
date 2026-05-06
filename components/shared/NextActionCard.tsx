"use client";

import Link from "next/link";
import { Box, Button, Paper, Stack, Typography, alpha, type SxProps, type Theme } from "@mui/material";
import { ArrowBack as ArrowIcon } from "@mui/icons-material";
import type { ReactNode } from "react";

type Tone = "primary" | "secondary" | "success" | "warning" | "error" | "info";

export interface NextActionCardProps {
  title: ReactNode;
  description?: ReactNode;
  ctaLabel?: ReactNode;
  href?: string;
  onClick?: () => void;
  tone?: Tone;
  count?: number | null;
  countSuffix?: string;
  icon?: ReactNode;
  disabled?: boolean;
  sx?: SxProps<Theme>;
}

const fmt = new Intl.NumberFormat("he-IL");

export function NextActionCard({
  title,
  description,
  ctaLabel,
  href,
  onClick,
  tone = "primary",
  count,
  countSuffix,
  icon,
  disabled,
  sx,
}: NextActionCardProps) {
  const buttonProps = href ? ({ component: Link, href } as const) : ({ onClick } as const);

  return (
    <Paper
      elevation={0}
      sx={[
        (theme) => ({
          p: { xs: 2, md: 2.5 },
          borderRadius: 2,
          border: `1px solid ${alpha(theme.palette[tone].main, 0.22)}`,
          background: alpha(theme.palette[tone].main, 0.045),
          backgroundImage: "none",
          position: "relative",
          overflow: "hidden",
          "&:before": {
            content: '""',
            position: "absolute",
            insetBlock: 0,
            insetInlineStart: 0,
            width: 4,
            background: theme.palette[tone].main,
          },
        }),
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems={{ xs: "stretch", md: "center" }}
        justifyContent="space-between"
      >
        <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
          {icon && (
            <Box
              sx={(theme) => ({
                width: 48,
                height: 48,
                borderRadius: 1.5,
                display: "grid",
                placeItems: "center",
                color: theme.palette[tone].main,
                bgcolor: alpha(theme.palette[tone].main, 0.12),
                flex: "0 0 auto",
                "& .MuiSvgIcon-root": { fontSize: 26 },
              })}
            >
              {icon}
            </Box>
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: "block", lineHeight: 1.1 }}>
              {countSuffix ?? "מומלץ עכשיו"}
            </Typography>
            <Typography variant="h6" sx={{ mt: 0.3, lineHeight: 1.2 }}>
              {typeof count === "number" ? `${fmt.format(count)} ` : ""}
              {title}
            </Typography>
            {description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4, maxWidth: 640 }}>
                {description}
              </Typography>
            )}
          </Box>
        </Stack>

        {ctaLabel && (
          <Button
            variant="contained"
            color={tone}
            endIcon={<ArrowIcon />}
            disabled={disabled}
            size="large"
            sx={{ minHeight: 46, alignSelf: { xs: "stretch", md: "center" } }}
            {...buttonProps}
          >
            {ctaLabel}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
