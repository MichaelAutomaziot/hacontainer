"use client";

import { Controller, type FieldValues, type SubmitHandler } from "react-hook-form";
import { useForm } from "@refinedev/react-hook-form";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { hebrewTranslations as t } from "@/locales/he";

type ImportType = "official" | "parallel";

export type ProductFormValues = {
  name_he: string;
  description_he: string | null;
  ean: string | null;
  sku: string | null;
  brand: string | null;
  category: string | null;
  price: number | null;
  pickup_cost: number | null;
  hacontainer_url: string | null;
  images_csv: string | null; // comma-separated URLs; serialised to images[]
  warranty: string | null;   // copied into technical_specs.warranty
  import_type: ImportType;
  pilot_status: string;
  in_stock: boolean;
};

const PILOT_STATUSES = [
  "draft",
  "imported",
  "approved_for_pilot",
  "transformed",
  "uploaded",
  "exists_in_sp",
  "ran_approved",
] as const;

const IMPORT_TYPES: { value: ImportType; label: string }[] = [
  { value: "official", label: "יבוא רשמי" },
  { value: "parallel", label: "יבוא מקביל" },
];

// EAN-13/EAN-8 GS1 checksum validator (lenient — empty allowed, used for
// non-required field validation).
const isValidEan = (raw: string | null | undefined): boolean => {
  if (!raw) return true; // EAN is optional
  const digits = raw.trim().replace(/\D/g, "");
  if (digits.length !== 8 && digits.length !== 12 && digits.length !== 13 && digits.length !== 14) {
    return false;
  }
  let sum = 0;
  const rev = digits.split("").reverse().map((d) => parseInt(d, 10));
  for (let i = 1; i < rev.length; i++) {
    sum += rev[i] * (i % 2 === 1 ? 3 : 1);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === rev[0];
};

interface Props {
  action: "create" | "edit";
  /** Optional callback after successful save; useful when the wrapper Page
   *  wants to redirect instead of letting Refine bounce to /list. */
  onSaved?: (id: number) => void;
  /** When true, the form translates `name_he/price/pickup_cost` defaults to
   *  ready-to-upload values and pre-selects pilot_status='approved_for_pilot'. */
  defaultApproved?: boolean;
}

export function ProductEntryForm({ action, onSaved, defaultApproved = true }: Props) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    refineCore: { onFinish, queryResult },
  } = useForm<ProductFormValues>({
    refineCoreProps: {
      resource: "inventory",
      action,
      redirect: false,
    },
    defaultValues: {
      name_he: "",
      description_he: "",
      ean: "",
      sku: "",
      brand: "",
      category: "",
      price: null,
      pickup_cost: null,
      hacontainer_url: "",
      images_csv: "",
      warranty: "",
      import_type: "official",
      pilot_status: defaultApproved ? "approved_for_pilot" : "draft",
      in_stock: true,
    },
  });

  // Sync edit-mode loaded record back into form fields. `useForm.refineCore`
  // already pre-fills using the resource record, but `images_csv` and
  // `warranty` are derived (images[] → CSV; technical_specs.warranty → string).
  const record = queryResult?.data?.data as Record<string, unknown> | undefined;

  const onSubmit: SubmitHandler<FieldValues> = async (submittedValues) => {
    const raw = submittedValues as ProductFormValues;
    const tech = (record?.technical_specs as Record<string, unknown>) ?? {};
    const warranty = (raw.warranty ?? "").trim();
    const next_specs: Record<string, unknown> = { ...tech };
    if (warranty) next_specs.warranty = warranty;
    else delete next_specs.warranty;

    const images = (raw.images_csv ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const values: Record<string, unknown> = {
      name_he: raw.name_he?.trim() || null,
      product_name: raw.name_he?.trim() || null, // legacy text column
      description_he: raw.description_he?.trim() || null,
      ean: raw.ean?.trim() || null,
      sku: raw.sku?.trim() || null,
      brand: raw.brand?.trim() || null,
      category: raw.category?.trim() || null,
      price:
        typeof raw.price === "number" && Number.isFinite(raw.price) ? raw.price : null,
      pickup_cost:
        typeof raw.pickup_cost === "number" && Number.isFinite(raw.pickup_cost)
          ? raw.pickup_cost
          : null,
      hacontainer_url: raw.hacontainer_url?.trim() || null,
      images: images.length > 0 ? images : null,
      technical_specs: Object.keys(next_specs).length > 0 ? next_specs : null,
      pilot_status: raw.pilot_status,
      in_stock: !!raw.in_stock,
    };

    const r = (await onFinish(values)) as
      | { data?: { id?: number | string } | null }
      | undefined;
    const newId = r?.data?.id;
    if (newId !== undefined && newId !== null && onSaved) onSaved(Number(newId));
  };

  const price = watch("price");
  const pickupCost = watch("pickup_cost");
  const previewCurrent =
    price !== null && price !== undefined
      ? Number(price) + (Number(pickupCost) || 0)
      : null;
  const previewStrike =
    previewCurrent !== null ? Math.round(previewCurrent * 1.15) : null;

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ pb: 4 }}>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>
            {t.products.formSections?.identity ?? "זהות המוצר"}
          </Typography>
          <Divider sx={{ mb: 2 }} />
        </Grid>

        <Grid item xs={12} md={8}>
          <TextField
            {...register("name_he", {
              required: t.forms.validation.required,
              minLength: { value: 2, message: "מינימום 2 תווים" },
            })}
            label={t.products.formLabels?.nameHe ?? "שם מוצר (עברית)"}
            placeholder={
              t.products.formPlaceholders?.nameHe ?? "לדוגמה: מקרר 2 דלתות 540 ליטר"
            }
            error={!!errors.name_he}
            helperText={(errors.name_he?.message as string | undefined) ?? "ללא שפה מסחרית, אחריות, יבואן"}
            required
            fullWidth
          />
        </Grid>

        <Grid item xs={12} md={4}>
          <Controller
            name="import_type"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                select
                label={t.pilot.columns.importType}
                fullWidth
              >
                {IMPORT_TYPES.map((it) => (
                  <MenuItem key={it.value} value={it.value}>
                    {it.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            {...register("description_he")}
            label={t.products.formLabels?.descriptionHe ?? "תיאור מוצר"}
            placeholder="תיאור עובדתי על המוצר. לא לכלול מידע על משלוח, אחריות, או יבואן."
            multiline
            rows={4}
            fullWidth
          />
        </Grid>

        <Grid item xs={12} md={4}>
          <TextField
            {...register("ean", {
              validate: (v) => isValidEan(v) || "EAN לא תקין (GS1 checksum נכשל)",
            })}
            label={t.pilot.columns.ean}
            placeholder="7290012345678"
            error={!!errors.ean}
            helperText={(errors.ean?.message as string | undefined) ?? "אופציונלי. EAN-8/12/13/14, GS1 valid"}
            fullWidth
            className="ltr-input"
            inputProps={{ inputMode: "numeric" }}
          />
        </Grid>

        <Grid item xs={12} md={4}>
          <TextField
            {...register("sku")}
            label={t.pilot.columns.productSku}
            placeholder="SP-12345"
            fullWidth
            className="ltr-input"
          />
        </Grid>

        <Grid item xs={12} md={4}>
          <TextField
            {...register("brand")}
            label={t.pilot.columns.brand}
            placeholder="לדוגמה: Bosch"
            fullWidth
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField
            {...register("category")}
            label={t.pilot.columns.category}
            placeholder="לדוגמה: מקררים"
            fullWidth
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField
            {...register("hacontainer_url")}
            label={t.products.formLabels?.sourceUrl ?? "URL בקונטיינר (לא חובה)"}
            placeholder="https://www.hacontainer.co.il/items/..."
            fullWidth
            className="ltr-input"
          />
        </Grid>

        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            {t.products.formSections?.pricing ?? "תמחור"}
          </Typography>
          <Divider sx={{ mb: 2 }} />
        </Grid>

        <Grid item xs={12} md={4}>
          <TextField
            {...register("price", {
              required: t.forms.validation.required,
              valueAsNumber: true,
              min: { value: 1, message: "מחיר חייב להיות חיובי" },
            })}
            label={t.products.formLabels?.basePrice ?? "מחיר בסיס בקונטיינר (₪)"}
            type="number"
            error={!!errors.price}
            helperText={(errors.price?.message as string | undefined) ?? "לפני pickup_cost"}
            required
            fullWidth
            inputProps={{ step: "0.01", min: 0 }}
          />
        </Grid>

        <Grid item xs={12} md={4}>
          <TextField
            {...register("pickup_cost", { valueAsNumber: true })}
            label={t.pilot.columns.pickupCost}
            type="number"
            fullWidth
            helperText="עלות איסוף פרטנית למוצר; מתווסף ל-current_price"
            inputProps={{ step: "0.01", min: 0 }}
          />
        </Grid>

        <Grid item xs={12} md={4}>
          <Box
            sx={(th) => ({
              p: 1.5,
              border: `1px dashed ${th.palette.divider}`,
              borderRadius: 1,
              bgcolor: "background.default",
            })}
          >
            <Typography variant="caption" color="text.secondary">
              תצוגה מקדימה (לפי חוקי SP פעילים)
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
              <Chip
                label={`current: ${previewCurrent !== null ? "₪" + previewCurrent.toLocaleString("he-IL") : "—"}`}
                size="small"
                color="primary"
              />
              <Chip
                label={`strike (×1.15): ${previewStrike !== null ? "₪" + previewStrike.toLocaleString("he-IL") : "—"}`}
                size="small"
                color="warning"
                variant="outlined"
              />
              <Chip label="shipping: ₪39" size="small" variant="outlined" />
            </Stack>
          </Box>
        </Grid>

        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            {t.products.formSections?.media ?? "תמונות ומפרט"}
          </Typography>
          <Divider sx={{ mb: 2 }} />
        </Grid>

        <Grid item xs={12}>
          <TextField
            {...register("images_csv")}
            label={t.products.formLabels?.imagesCsv ?? "תמונות (URL מופרדים בפסיק)"}
            placeholder="https://.../1.jpg, https://.../2.jpg"
            helperText="לפחות 1 תמונה בגודל ≥300×300, רקע לבן (פרי דרש זאת ל-SP)"
            fullWidth
            multiline
            rows={2}
            className="ltr-input"
          />
        </Grid>

        <Grid item xs={12} md={8}>
          <TextField
            {...register("warranty")}
            label={t.products.formLabels?.warranty ?? "אחריות (חובה במוצרי חשמל)"}
            placeholder="לדוגמה: 12 חודשים על ידי היבואן"
            fullWidth
            helperText="נשמר ב-technical_specs.warranty. דרישה של פרי לעולמות חשמל"
          />
        </Grid>

        <Grid item xs={12} md={4}>
          <Controller
            name="pilot_status"
            control={control}
            render={({ field }) => (
              <TextField {...field} select label="סטטוס פיילוט" fullWidth>
                {PILOT_STATUSES.map((ps) => (
                  <MenuItem key={ps} value={ps}>
                    {(t.pilot.pilotStatus as Record<string, string>)[ps] ?? ps}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <Controller
            name="in_stock"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                control={
                  <Switch
                    checked={!!field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    color="success"
                  />
                }
                label="במלאי"
              />
            )}
          />
        </Grid>
      </Grid>

      <Alert severity="info" sx={{ mt: 3 }}>
        סטטוס ברירת המחדל הוא <strong>{`"מוכן להעלאה"`}</strong>. המוצר יופיע
        בתור ההעלאה (<code>/pilot</code>) מיד אחרי השמירה.
      </Alert>

      <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
        <Button
          type="submit"
          variant="contained"
          color="primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? "שומר…" : t.actions.save}
        </Button>
      </Stack>
    </Box>
  );
}
