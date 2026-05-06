"use client";

import { Box, Chip, Stack, Switch, Typography, alpha } from "@mui/material";
import type { ReactNode } from "react";

export interface ChannelToggleRowProps {
  icon: ReactNode;
  label: string;
  description?: string;
  enabled: boolean;
  comingSoon?: boolean;
  onToggle?: (next: boolean) => void;
}

export function ChannelToggleRow({
  icon,
  label,
  description,
  enabled,
  comingSoon = false,
  onToggle,
}: ChannelToggleRowProps) {
  const disabled = comingSoon || !onToggle;
  return (
    <Box
      sx={(theme) => ({
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
        p: 1.6,
        borderRadius: 1.5,
        border: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
        bgcolor: enabled
          ? alpha(theme.palette.success.main, 0.04)
          : "transparent",
      })}
    >
      <Stack direction="row" spacing={1.6} alignItems="center" sx={{ minWidth: 0 }}>
        <Box
          sx={(theme) => ({
            width: 38,
            height: 38,
            borderRadius: 1.2,
            display: "grid",
            placeItems: "center",
            bgcolor: alpha(theme.palette.text.primary, 0.05),
            color: theme.palette.text.primary,
            "& svg": { fontSize: 22 },
          })}
        >
          {icon}
        </Box>
        <Stack spacing={0.2} sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle2" sx={{ lineHeight: 1.15 }}>
              {label}
            </Typography>
            {comingSoon && <Chip label="בקרוב" size="small" variant="outlined" />}
            {enabled && !comingSoon && <Chip label="פעיל" size="small" color="success" />}
          </Stack>
          {description && (
            <Typography variant="caption" color="text.secondary">
              {description}
            </Typography>
          )}
        </Stack>
      </Stack>
      <Switch
        checked={enabled}
        onChange={(_, next) => onToggle?.(next)}
        disabled={disabled}
      />
    </Box>
  );
}
