"use client";

import { Box, Paper, Stack, Typography, alpha } from "@mui/material";

export interface PricingPreviewInput {
  base_price: number | null | undefined;
  pickup_cost: number | null | undefined;
}

const fmt = new Intl.NumberFormat("he-IL");
const fmtCurr = (n: number) => `₪${fmt.format(n)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Locked Super-Pharm rules (mirror lib/shared/pricing.ts):
 *   shipping_addon = 39
 *   strike_multiplier = 1.15 (applied to current + shipping)
 *   sale_duration = 30 days
 */
const SHIPPING = 39;
const STRIKE_MULT = 1.15;

export interface PricingPreviewProps {
  product: PricingPreviewInput;
  /** show as compact strip, otherwise as a 2-column "before/after" panel */
  variant?: "panel" | "strip";
}

const computePreview = (product: PricingPreviewInput) => {
  const base = product.base_price ?? 0;
  const pickup = product.pickup_cost ?? 0;
  const current = round2(base + pickup);
  const strike = Math.round((current + SHIPPING) * STRIKE_MULT);
  return { base, pickup, current, strike, shipping: SHIPPING };
};

export function PricingPreview({ product, variant = "panel" }: PricingPreviewProps) {
  const { base, pickup, current, strike, shipping } = computePreview(product);

  if (variant === "strip") {
    return (
      <Stack direction="row" spacing={1.4} alignItems="baseline" flexWrap="wrap" useFlexGap>
        <Typography variant="caption" color="text.secondary">
          לפני: {fmtCurr(round2(base))} + איסוף {fmtCurr(round2(pickup))}
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 700 }}>
          → אחרי: {fmtCurr(current)} + משלוח {fmtCurr(shipping)} (רגיל {fmtCurr(strike)})
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ width: "100%" }}>
      <Paper
        variant="outlined"
        sx={(theme) => ({
          flex: 1,
          p: 1.6,
          bgcolor: alpha(theme.palette.text.primary, 0.025),
          border: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
        })}
      >
        <Typography variant="overline" color="text.secondary">
          לפני (הקונטיינר)
        </Typography>
        <Stack spacing={0.4} sx={{ mt: 0.6 }}>
          <Row label="מחיר מבצע" value={fmtCurr(round2(base))} />
          <Row label="עלות איסוף" value={fmtCurr(round2(pickup))} />
        </Stack>
      </Paper>
      <Paper
        variant="outlined"
        sx={(theme) => ({
          flex: 1,
          p: 1.6,
          bgcolor: alpha(theme.palette.success.main, 0.05),
          border: `1px solid ${alpha(theme.palette.success.main, 0.2)}`,
        })}
      >
        <Typography variant="overline" color="success.main">
          אחרי (סופר-פארם)
        </Typography>
        <Stack spacing={0.4} sx={{ mt: 0.6 }}>
          <Row label="מחיר מבצע" value={fmtCurr(current)} bold />
          <Row label="מחיר רגיל (לפני הנחה)" value={fmtCurr(strike)} />
          <Row label="משלוח" value={fmtCurr(shipping)} />
          <Row label="משך מבצע" value="30 ימים" />
        </Stack>
      </Paper>
    </Stack>
  );
}

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body2" sx={{ fontWeight: bold ? 900 : 700 }}>
      {value}
    </Typography>
  </Box>
);
