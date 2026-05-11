"use client";

/**
 * Per-product PM01 readiness drawer.
 *
 * Opens for one inventory id and shows everything blocking or warning a
 * PM01 upload (per the rules in /api/sync/superpharm/pm01/validate). The
 * operator can fill in the missing fields right here — name, brand, image
 * URL, EAN, plus any per-category required attribute (energy rating,
 * cooling volume, AC manufacturer, etc.) — and save back to inventory
 * without leaving the upload page.
 *
 * Save flow:
 *   1. PATCH /api/inventory/{id}/pm01-fields with only the changed fields.
 *   2. On success → invalidate the parent's validation query so the chip
 *      next to the row updates immediately.
 */

import { useEffect, useState } from "react";
import {
  Drawer,
  Box,
  Stack,
  Typography,
  TextField,
  Button,
  Alert,
  Chip,
  Divider,
  CircularProgress,
  IconButton,
  MenuItem,
} from "@mui/material";
import {
  Close as CloseIcon,
  ErrorOutline as BlockerIcon,
  WarningAmberOutlined as WarningIcon,
  AutoFixHigh as ExtractedIcon,
} from "@mui/icons-material";

interface MissingAttr {
  code: string;
  label: string;
  type: "text" | "number" | "list" | "boolean" | "date";
  list_code: string | null;
  current: string | null;
  extracted: string | null;
  default: string | null;
  uses_default: boolean;
}

export interface ValidationRow {
  inv_id: number;
  sku: string;
  name_he: string | null;
  blockers: string[];
  warnings: string[];
  missing_attrs: MissingAttr[];
}

export interface Pm01ReadinessDrawerProps {
  open: boolean;
  invId: number | null;
  validation: ValidationRow | null;
  /** Initial editable values pulled from the row in the parent table. */
  initial: {
    name_he: string | null;
    brand: string | null;
    ean: string | null;
    images: string[] | null;
  };
  onClose: () => void;
  /** Notify parent that the row was saved so it can refetch / re-validate. */
  onSaved: (invId: number) => void;
}

interface FormState {
  name_he: string;
  brand: string;
  ean: string;
  imagesText: string; // newline-separated; first line = primary
  attrs: Record<string, string>; // attribute_code → value
}

const buildInitialForm = (
  v: ValidationRow | null,
  initial: Pm01ReadinessDrawerProps["initial"]
): FormState => ({
  name_he: initial.name_he ?? "",
  brand: initial.brand ?? "",
  ean: initial.ean ?? "",
  imagesText: (initial.images ?? []).join("\n"),
  attrs: Object.fromEntries(
    (v?.missing_attrs ?? []).map((a) => [a.code, a.current ?? ""])
  ),
});

export default function Pm01ReadinessDrawer({
  open,
  invId,
  validation,
  initial,
  onClose,
  onSaved,
}: Pm01ReadinessDrawerProps) {
  const [form, setForm] = useState<FormState>(() => buildInitialForm(validation, initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever the drawer reopens with a different row.
  useEffect(() => {
    if (open) {
      setForm(buildInitialForm(validation, initial));
      setError(null);
    }
  }, [open, validation, initial]);

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setAttr = (code: string, v: string) =>
    setForm((f) => ({ ...f, attrs: { ...f.attrs, [code]: v } }));

  const applyExtractedValue = (a: MissingAttr) => {
    if (a.extracted) setAttr(a.code, a.extracted);
  };
  const applyDefaultValue = (a: MissingAttr) => {
    if (a.default) setAttr(a.code, a.default);
  };

  const save = async () => {
    if (!invId) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (form.name_he !== (initial.name_he ?? "")) body.name_he = form.name_he;
      if (form.brand !== (initial.brand ?? "")) body.brand = form.brand;
      if (form.ean !== (initial.ean ?? "")) body.ean = form.ean;
      const imagesNew = form.imagesText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const imagesOrig = initial.images ?? [];
      if (
        imagesNew.length !== imagesOrig.length ||
        imagesNew.some((s, i) => s !== imagesOrig[i])
      ) {
        body.images = imagesNew;
      }
      // Only include changed attribute values.
      const techPatch: Record<string, string> = {};
      for (const a of validation?.missing_attrs ?? []) {
        const v = (form.attrs[a.code] ?? "").trim();
        if (v !== (a.current ?? "")) techPatch[a.code] = v;
      }
      if (Object.keys(techPatch).length > 0) body.technical_specs_patch = techPatch;

      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }

      const res = await fetch(`/api/inventory/${invId}/pm01-fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      onSaved(invId);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const blockers = validation?.blockers ?? [];
  const warnings = validation?.warnings ?? [];
  const attrs = validation?.missing_attrs ?? [];
  const cleanRow = blockers.length === 0 && warnings.length === 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      anchor="left"
      dir="rtl"
      PaperProps={{ sx: { width: { xs: "100%", sm: 520 }, p: 2 } }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          השלמת נתונים · {validation?.sku ?? `inv:${invId}`}
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>
      {validation?.name_he && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
          {validation.name_he}
        </Typography>
      )}

      {cleanRow && (
        <Alert severity="success" sx={{ mb: 2 }}>
          הכל תקין. המוצר יעלה בלי שאלות.
        </Alert>
      )}

      {blockers.length > 0 && (
        <Alert severity="error" icon={<BlockerIcon />} sx={{ mb: 1 }}>
          <Typography variant="body2" fontWeight={700}>
            חוסמים העלאה ({blockers.length})
          </Typography>
          <ul style={{ margin: "4px 0 0 0", paddingInlineStart: 18 }}>
            {blockers.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
          <Typography variant="body2" fontWeight={700}>
            אזהרות איכות ({warnings.length})
          </Typography>
          <Typography variant="caption" color="text.secondary">
            המוצר יעלה אבל יישלח עם defaults. עדיף למלא ידנית.
          </Typography>
        </Alert>
      )}

      <Divider sx={{ my: 1 }} />

      <Typography variant="overline" color="text.secondary">שדות בסיס</Typography>
      <Stack spacing={1.5} sx={{ mt: 1 }}>
        <TextField
          label="שם מוצר"
          value={form.name_he}
          onChange={(e) => setField("name_he", e.target.value)}
          size="small"
          fullWidth
          error={form.name_he.trim().length === 0}
        />
        <TextField
          label="מותג"
          value={form.brand}
          onChange={(e) => setField("brand", e.target.value)}
          size="small"
          fullWidth
          helperText="חייב להיות שם שמופיע ברשימת המותגים של SP."
        />
        <TextField
          label="ברקוד EAN (אופציונלי, אם ריק יוצר אוטומטית)"
          value={form.ean}
          onChange={(e) => setField("ean", e.target.value)}
          size="small"
          fullWidth
        />
        <TextField
          label="תמונות (כתובת בכל שורה; הראשונה = ראשית)"
          value={form.imagesText}
          onChange={(e) => setField("imagesText", e.target.value)}
          size="small"
          fullWidth
          multiline
          minRows={2}
          maxRows={5}
        />
      </Stack>

      {attrs.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="overline" color="text.secondary">
            תכונות חובה לקטגוריה
          </Typography>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            {attrs.map((a) => {
              const current = form.attrs[a.code] ?? "";
              return (
                <Box key={a.code}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
                      {a.label} <code style={{ opacity: 0.5, fontSize: 11 }}>({a.code})</code>
                    </Typography>
                    {a.uses_default && (
                      <Chip size="small" color="warning" variant="outlined" label={`default: ${a.default}`} />
                    )}
                  </Stack>
                  {a.type === "boolean" ? (
                    <TextField
                      select
                      value={current}
                      onChange={(e) => setAttr(a.code, e.target.value)}
                      size="small"
                      fullWidth
                    >
                      <MenuItem value="true">כן (true)</MenuItem>
                      <MenuItem value="false">לא (false)</MenuItem>
                    </TextField>
                  ) : (
                    <TextField
                      value={current}
                      onChange={(e) => setAttr(a.code, e.target.value)}
                      size="small"
                      fullWidth
                      type={a.type === "number" ? "number" : "text"}
                      placeholder={a.extracted ?? a.default ?? ""}
                    />
                  )}
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                    {a.extracted && (
                      <Chip
                        size="small"
                        icon={<ExtractedIcon sx={{ fontSize: 14 }} />}
                        label={`חולץ מתיאור: ${a.extracted}`}
                        onClick={() => applyExtractedValue(a)}
                        sx={{ cursor: "pointer" }}
                      />
                    )}
                    {a.default && (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`השתמש ב-default: ${a.default}`}
                        onClick={() => applyDefaultValue(a)}
                        sx={{ cursor: "pointer" }}
                      />
                    )}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ flex: 1 }} />
      <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
        <Button onClick={onClose} disabled={saving} variant="text">ביטול</Button>
        <Box sx={{ flex: 1 }} />
        <Button
          onClick={save}
          disabled={saving}
          variant="contained"
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}
        >
          {saving ? "שומר…" : "שמור"}
        </Button>
      </Stack>
    </Drawer>
  );
}
