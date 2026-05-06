"use client";

import { Box, Container, Fade, Stack, Typography, type SxProps, type Theme } from "@mui/material";
import type { ReactNode } from "react";

export interface BoardShellProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  sx?: SxProps<Theme>;
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
  maxWidth = 1440,
}: BoardShellProps) {
  return (
    <Box
      dir="rtl"
      sx={[
        {
          width: "100%",
          py: { xs: 2, md: 3 },
          px: { xs: 1.25, md: 2 },
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      <Container
        maxWidth={false}
        disableGutters
        sx={{ width: "100%", maxWidth, mx: "auto" }}
      >
        <Fade in timeout={260}>
          <Box>
            <Stack
              direction={{ xs: "column", md: "row" }}
              alignItems={{ xs: "stretch", md: "flex-end" }}
              justifyContent="space-between"
              spacing={2}
              sx={{ mb: { xs: 2, md: 2.5 } }}
            >
              <Box sx={{ minWidth: 0 }}>
                {eyebrow && (
                  <Typography variant="overline" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>
                    {eyebrow}
                  </Typography>
                )}
                <Typography variant="h4" component="h1" sx={{ lineHeight: 1.16, mt: eyebrow ? 0.4 : 0 }}>
                  {title}
                </Typography>
                {description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.8, maxWidth: 760 }}>
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
            <Stack spacing={{ xs: 2, md: 2.5 }}>{children}</Stack>
          </Box>
        </Fade>
      </Container>
    </Box>
  );
}
