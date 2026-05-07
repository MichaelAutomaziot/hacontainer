"use client";

import { Box, Stack, Typography, type SxProps, type Theme } from "@mui/material";
import type { ReactNode } from "react";

export interface SectionHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  sx?: SxProps<Theme>;
}

export function SectionHeader({
  title,
  subtitle,
  icon,
  meta,
  actions,
  sx,
}: SectionHeaderProps) {
  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      alignItems={{ xs: "stretch", md: "center" }}
      justifyContent="space-between"
      spacing={1.5}
      sx={[{ width: "100%" }, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}
    >
      <Stack direction="row" spacing={1.1} alignItems="center" sx={{ minWidth: 0 }}>
        {icon && (
          <Box
            sx={{
              color: "primary.main",
              display: "inline-flex",
              flex: "0 0 auto",
              "& .MuiSvgIcon-root": { fontSize: 22 },
            }}
          >
            {icon}
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h2" sx={{ lineHeight: 1.18, m: 0 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Stack>
      {(meta || actions) && (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" justifyContent={{ xs: "flex-start", md: "flex-end" }}>
          {meta}
          {actions}
        </Stack>
      )}
    </Stack>
  );
}
