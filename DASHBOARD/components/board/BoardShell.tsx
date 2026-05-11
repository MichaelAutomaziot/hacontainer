"use client";

import { Box, Stack, Typography, alpha, type SxProps, type Theme } from "@mui/material";
import type { ReactNode } from "react";

export interface BoardShellProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  sx?: SxProps<Theme>;
  /** Optional cap. When undefined the shell fills the available width. */
  maxWidth?: number | "xl" | "lg" | "md";
}

export function BoardShell({
  eyebrow,
  title,
  description,
  actions,
  meta,
  children,
  sx,
  maxWidth,
}: BoardShellProps) {
  return (
    <Box
      dir="rtl"
      sx={[
        {
          flex: 1,
          width: "100%",
          minHeight: "100%",
          boxSizing: "border-box",
          py: { xs: 2, md: 3 },
          px: { xs: 1.5, md: 3 },
          bgcolor: "background.default",
          overflowX: "clip",
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      <Box sx={{ width: "100%", maxWidth, boxSizing: "border-box" }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          alignItems={{ xs: "stretch", md: "flex-end" }}
          justifyContent="space-between"
          spacing={2}
          sx={(theme) => ({
            mb: { xs: 2, md: 2.5 },
            pb: { xs: 1.5, md: 2 },
            borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.07)}`,
          })}
        >
          <Box sx={{ minWidth: 0, maxWidth: 820 }}>
            {eyebrow && (
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ display: "block", lineHeight: 1.2, mb: 0.45, fontWeight: 600 }}
              >
                {eyebrow}
              </Typography>
            )}
            <Typography
              variant="h4"
              component="h1"
              sx={{ lineHeight: 1.18, mt: 0, color: "text.primary", fontWeight: 700 }}
            >
              {title}
            </Typography>
            {description && (
              <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75, maxWidth: 720 }}>
                {description}
              </Typography>
            )}
            {meta && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.4 }}>
                {meta}
              </Stack>
            )}
          </Box>
          {actions && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center" justifyContent={{ xs: "flex-start", md: "flex-end" }}>
              {actions}
            </Stack>
          )}
        </Stack>
        <Stack spacing={{ xs: 2, md: 2.25 }}>{children}</Stack>
      </Box>
    </Box>
  );
}
