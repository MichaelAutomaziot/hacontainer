"use client";

import { Box, Stack, Typography, alpha } from "@mui/material";
import {
  CheckCircle as PassIcon,
  Cancel as FailIcon,
  Warning as WarnIcon,
  Info as InfoIcon,
} from "@mui/icons-material";
import type { ReactNode } from "react";

export type ValidationKind = "pass" | "fail" | "warn" | "info";

export interface ValidationItem {
  kind: ValidationKind;
  message: ReactNode;
  hint?: ReactNode;
}

export interface ValidationChecklistProps {
  items: ValidationItem[];
  emptyLabel?: string;
}

const kindIcon = (kind: ValidationKind) => {
  switch (kind) {
    case "pass":
      return <PassIcon fontSize="small" />;
    case "fail":
      return <FailIcon fontSize="small" />;
    case "warn":
      return <WarnIcon fontSize="small" />;
    case "info":
    default:
      return <InfoIcon fontSize="small" />;
  }
};

const kindColor = (kind: ValidationKind): "success" | "error" | "warning" | "info" => {
  if (kind === "pass") return "success";
  if (kind === "fail") return "error";
  if (kind === "warn") return "warning";
  return "info";
};

export function ValidationChecklist({ items, emptyLabel = "אין בעיות לדווח." }: ValidationChecklistProps) {
  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 1.4 }}>
        {emptyLabel}
      </Typography>
    );
  }
  return (
    <Stack spacing={1}>
      {items.map((item, idx) => {
        const tone = kindColor(item.kind);
        return (
          <Stack
            key={idx}
            direction="row"
            spacing={1.2}
            alignItems="flex-start"
            sx={(theme) => ({
              p: 1.2,
              borderRadius: 1.2,
              bgcolor: alpha(theme.palette[tone].main, 0.06),
              border: `1px solid ${alpha(theme.palette[tone].main, 0.18)}`,
            })}
          >
            <Box sx={(theme) => ({ color: theme.palette[tone].main, lineHeight: 0, mt: 0.3 })}>
              {kindIcon(item.kind)}
            </Box>
            <Stack spacing={0.3} sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 800, lineHeight: 1.3 }}>
                {item.message}
              </Typography>
              {item.hint && (
                <Typography variant="caption" color="text.secondary">
                  {item.hint}
                </Typography>
              )}
            </Stack>
          </Stack>
        );
      })}
    </Stack>
  );
}
