"use client";

import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import {
  Close as CloseIcon,
  OpenInNew as ExtIcon,
  CloudUpload as UploadIcon,
  CheckCircle as MarkExistsIcon,
  Block as MarkIgnoredIcon,
  ReportProblem as MarkMissingIcon,
} from "@mui/icons-material";
import { ImageThumb, VerdictBadge } from "@/components/shared";
import { ProductPresenceBadge } from "./ProductPresenceBadge";
import { PricingPreview } from "./PricingPreview";

const fmt = new Intl.NumberFormat("he-IL");
const fmtCurr = (n: number | null | undefined) => (n == null ? "—" : `₪${fmt.format(n)}`);

export interface ComparisonRow {
  match_id: number;
  inventory_id: number;
  superpharm_offer_id: string | null;
  match_method: string;
  confidence: number;
  verdict: string;
  notes: string | null;
  name_he: string | null;
  inv_ean: string | null;
  inv_brand: string | null;
  inv_category: string | null;
  inv_thumb: string | null;
  inv_price: number | null;
  inv_pickup_cost: number | null;
  pilot_status: string | null;
  hacontainer_url: string | null;
  product_title: string | null;
  sp_ean: string | null;
  shop_sku: string | null;
  sp_brand: string | null;
  sp_category: string | null;
  sp_price: number | null;
  logistic_class_label: string | null;
}

export interface ProductDetailDrawerProps {
  row: ComparisonRow | null;
  open: boolean;
  onClose: () => void;
  onUpload?: (row: ComparisonRow) => void;
  onMarkMissing?: (row: ComparisonRow) => void;
  onMarkExists?: (row: ComparisonRow) => void;
  onMarkIgnored?: (row: ComparisonRow) => void;
  busy?: boolean;
}

export function ProductDetailDrawer({
  row,
  open,
  onClose,
  onUpload,
  onMarkMissing,
  onMarkExists,
  onMarkIgnored,
  busy,
}: ProductDetailDrawerProps) {
  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: "100%", md: 640 },
          bgcolor: "background.paper",
          color: "text.primary",
          backgroundImage: "none",
          borderInlineEnd: 0,
          borderInlineStart: (theme) => `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
          boxShadow: "-12px 0 32px rgba(20,14,15,0.06)",
        },
      }}
    >
      {row && (
        <Box dir="rtl" sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <Box sx={(theme) => ({ p: 2.5, borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.08)}` })}>
            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="overline" color="text.secondary" sx={{ display: "block", lineHeight: 1.1 }}>
                  פרטי מוצר
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1.2, mt: 0.4 }}>
                  {row.name_he ?? "—"}
                </Typography>
              </Box>
              <IconButton onClick={onClose} size="small">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>

            <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
              <ImageThumb src={row.inv_thumb} size={108} />
              <Stack spacing={0.6} sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <ProductPresenceBadge verdict={row.verdict as never} size="small" showLabel />
                  <VerdictBadge verdict={row.verdict} />
                </Stack>
                <Detail label="מותג" value={row.inv_brand} />
                <Detail label="קטגוריה" value={row.inv_category} />
                {row.inv_ean && (
                  <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                    <Typography variant="body2" color="text.secondary">
                      ברקוד
                    </Typography>
                    <Chip size="small" label={row.inv_ean} sx={{ direction: "ltr" }} />
                  </Box>
                )}
              </Stack>
            </Stack>
          </Box>

          <Box sx={{ p: 2.5, flex: 1, overflowY: "auto", display: "grid", gap: 2.4 }}>
            <Section title="תמחור">
              <PricingPreview
                product={{ base_price: row.inv_price, pickup_cost: row.inv_pickup_cost }}
              />
            </Section>

            <Section title="צד סופר-פארם">
              {row.superpharm_offer_id ? (
                <Stack spacing={0.5}>
                  <Detail label="כותרת" value={row.product_title} />
                  <Detail label="ברקוד SP" value={row.sp_ean} />
                  <Detail label="shop_sku" value={row.shop_sku} />
                  <Detail label="מחיר SP" value={fmtCurr(row.sp_price)} />
                  <Detail label="מחלקת לוגיסטיקה" value={row.logistic_class_label} />
                  <Typography variant="caption" color="text.secondary" sx={{ direction: "ltr" }}>
                    offer_id: {row.superpharm_offer_id}
                  </Typography>
                </Stack>
              ) : (
                <Typography color="text.secondary">לא נמצאה הצעה תואמת בסופר-פארם.</Typography>
              )}
            </Section>

            <Section title="ניתוח התאמה">
              <Stack spacing={0.6}>
                <Box>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">
                      ביטחון
                    </Typography>
                    <Typography variant="body2" sx={{ direction: "ltr", fontWeight: 800 }}>
                      {(row.confidence * 100).toFixed(0)}%
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={row.confidence * 100}
                    sx={{ mt: 0.6, height: 6, borderRadius: 999, direction: "ltr" }}
                  />
                </Box>
                <Detail label="שיטת התאמה" value={row.match_method} />
                {row.notes && <Detail label="הערות" value={row.notes} />}
              </Stack>
            </Section>
          </Box>

          <Box sx={(theme) => ({ p: 2, borderTop: `1px solid ${alpha(theme.palette.text.primary, 0.08)}` })}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {onUpload && (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<UploadIcon />}
                  disabled={busy}
                  onClick={() => onUpload(row)}
                  sx={{ flex: 1, minWidth: 160 }}
                >
                  העלה מוצר זה
                </Button>
              )}
              {onMarkMissing && (
                <Tooltip title="סמן כחסר ב-SP — יעבור להעלאה">
                  <span>
                    <Button
                      variant="outlined"
                      color="warning"
                      size="small"
                      startIcon={<MarkMissingIcon />}
                      disabled={busy}
                      onClick={() => onMarkMissing(row)}
                    >
                      חסר
                    </Button>
                  </span>
                </Tooltip>
              )}
              {onMarkExists && (
                <Tooltip title="סמן כקיים בסופר-פארם">
                  <span>
                    <Button
                      variant="outlined"
                      color="success"
                      size="small"
                      startIcon={<MarkExistsIcon />}
                      disabled={busy}
                      onClick={() => onMarkExists(row)}
                    >
                      קיים
                    </Button>
                  </span>
                </Tooltip>
              )}
              {onMarkIgnored && (
                <Tooltip title="התעלם מהמוצר">
                  <span>
                    <Button
                      variant="outlined"
                      color="inherit"
                      size="small"
                      startIcon={<MarkIgnoredIcon />}
                      disabled={busy}
                      onClick={() => onMarkIgnored(row)}
                    >
                      התעלם
                    </Button>
                  </span>
                </Tooltip>
              )}
              {row.hacontainer_url && (
                <Tooltip title="פתח בהקונטיינר">
                  <IconButton component="a" href={row.hacontainer_url} target="_blank" rel="noopener">
                    <ExtIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          </Box>
        </Box>
      )}
    </Drawer>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Box>
    <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 0.8 }}>
      {title}
    </Typography>
    <Box>{children}</Box>
    <Divider sx={{ mt: 1.6 }} />
  </Box>
);

const Detail = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body2" sx={{ fontWeight: 700, textAlign: "right" }}>
      {value == null || value === "" ? "—" : value}
    </Typography>
  </Box>
);
