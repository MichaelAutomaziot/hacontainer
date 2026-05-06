"use client";

import { Box, Chip, Stack, Tooltip, Typography, alpha } from "@mui/material";
import {
  Storefront as SuperPharmIcon,
  ShoppingBag as ZapIcon,
  Public as WallaIcon,
  Storage as AceIcon,
} from "@mui/icons-material";
import type { ReactNode } from "react";

export type ChannelKey = "superpharm" | "zap" | "walla" | "ace";

export interface ChannelOption {
  key: ChannelKey;
  label: string;
  icon: ReactNode;
  enabled: boolean;
  hint?: string;
}

export const DEFAULT_CHANNELS: ChannelOption[] = [
  {
    key: "superpharm",
    label: "סופר-פארם",
    icon: <SuperPharmIcon fontSize="small" />,
    enabled: true,
    hint: "ערוץ פעיל — Mirakl OF01 + PM01",
  },
  {
    key: "zap",
    label: "Zap",
    icon: <ZapIcon fontSize="small" />,
    enabled: false,
    hint: "ערוץ עתידי — בקרוב",
  },
  {
    key: "walla",
    label: "Walla שופס",
    icon: <WallaIcon fontSize="small" />,
    enabled: false,
    hint: "ערוץ עתידי — בקרוב",
  },
  {
    key: "ace",
    label: "ACE",
    icon: <AceIcon fontSize="small" />,
    enabled: false,
    hint: "ערוץ עתידי — בקרוב",
  },
];

export interface ChannelSelectorProps {
  value: ChannelKey;
  onChange: (next: ChannelKey) => void;
  channels?: ChannelOption[];
}

export function ChannelSelector({ value, onChange, channels = DEFAULT_CHANNELS }: ChannelSelectorProps) {
  return (
    <Stack spacing={1.2}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.1 }}>
        ערוץ יעד
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {channels.map((ch) => {
          const active = value === ch.key;
          return (
            <Tooltip key={ch.key} title={ch.hint ?? ""} arrow>
              <Box
                role="button"
                aria-disabled={!ch.enabled}
                onClick={() => ch.enabled && onChange(ch.key)}
                sx={(theme) => ({
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 1,
                  px: 1.5,
                  py: 1,
                  borderRadius: 1.5,
                  cursor: ch.enabled ? "pointer" : "not-allowed",
                  border: `1px solid ${
                    active ? theme.palette.primary.main : alpha(theme.palette.text.primary, 0.1)
                  }`,
                  bgcolor: active
                    ? alpha(theme.palette.primary.main, 0.08)
                    : ch.enabled
                      ? "transparent"
                      : alpha(theme.palette.text.primary, 0.03),
                  opacity: ch.enabled ? 1 : 0.55,
                  transition: "all 160ms ease",
                  "&:hover": ch.enabled && !active
                    ? { bgcolor: alpha(theme.palette.primary.main, 0.04) }
                    : undefined,
                })}
              >
                <Box
                  sx={(theme) => ({
                    width: 26,
                    height: 26,
                    borderRadius: 1,
                    display: "grid",
                    placeItems: "center",
                    color: active ? theme.palette.primary.main : theme.palette.text.secondary,
                    bgcolor: active
                      ? alpha(theme.palette.primary.main, 0.14)
                      : alpha(theme.palette.text.primary, 0.06),
                  })}
                >
                  {ch.icon}
                </Box>
                <Stack spacing={0} alignItems="flex-start">
                  <Typography variant="body2" sx={{ lineHeight: 1.1, fontWeight: 800 }}>
                    {ch.label}
                  </Typography>
                  {!ch.enabled && (
                    <Chip label="בקרוב" size="small" variant="outlined" sx={{ height: 16, fontSize: "0.62rem", mt: 0.3 }} />
                  )}
                </Stack>
              </Box>
            </Tooltip>
          );
        })}
      </Stack>
    </Stack>
  );
}
