"use client";

import { Chip, type ChipProps } from "@mui/material";

export type Verdict = "missing" | "duplicate" | "candidate" | "manual_review" | string;

const labels: Record<string, string> = {
  missing: "חסר",
  duplicate: "כפול",
  candidate: "מועמד",
  manual_review: "בדיקה ידנית",
};

const colors: Record<string, ChipProps["color"]> = {
  missing: "error",
  duplicate: "success",
  candidate: "warning",
  manual_review: "info",
};

export interface VerdictBadgeProps {
  verdict: Verdict;
  size?: "small" | "medium";
}

export const VerdictBadge = ({ verdict, size = "small" }: VerdictBadgeProps) => {
  return (
    <Chip
      label={labels[verdict] ?? verdict}
      color={colors[verdict] ?? "default"}
      size={size}
      sx={{ fontWeight: 600, minWidth: 64 }}
    />
  );
};
