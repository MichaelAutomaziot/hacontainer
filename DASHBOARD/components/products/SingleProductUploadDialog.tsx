"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
  alpha,
} from "@mui/material";
import {
  Add as AddPhotoIcon,
  CheckCircle as DoneIcon,
  Close as CloseIcon,
  ErrorOutline as ErrorIcon,
  ExpandMore as ExpandIcon,
  PlayCircleFilled as RunIcon,
  Refresh as RefreshIcon,
  WarningAmber as WarnIcon,
} from "@mui/icons-material";
import {
  productInputSchema,
  type ProductInput,
} from "@/lib/shared/single-product-schema";
import { isElectronicsCategory, isImportPickRequiredBrand } from "@/lib/shared/electronics-categories";
import { validateImageDimensions } from "@/lib/client/image-validator";
import { supabaseDataClient } from "@/utils/supabase/client";

interface PreviewResponse {
  ok: boolean;
  rules?: {
    ok: boolean;
    blockers: { code: string; field: string; message: string }[];
    warnings: { code: string; field: string; message: string }[];
    derived: {
      import_type: "official" | "parallel" | null;
      cleaned_name: string;
      cleaned_description: string;
    };
  };
  perConnector?: { id: string; willPush: boolean; blockers: string[]; warnings: string[] }[];
  validation?: unknown;
}

interface SubmitResponse {
  ok: boolean;
  inventoryId?: number;
  jobId?: string;
  perConnector?: {
    id: string;
    status: "success" | "pm01_dispatched" | "skipped" | "failed";
    externalId?: string;
    externalUrl?: string;
    error?: { code: string; message: string };
    warnings?: string[];
  }[];
}

interface CategoryOption {
  id: string;
  sp_category_code: string;
  name_he: string;
  full_path: string | null;
}

const PREVIEW_FRESHNESS_MS = 60_000;

const defaultValues: Partial<ProductInput> = {
  name_he: "",
  description_he: "",
  ean: null,
  sku: "",
  brand: "",
  sp_category_code: "",
  category_id: null,
  category_label: "",
  price: 0,
  pickup_cost: 0,
  warranty: "",
  images: [],
  importer_text: "",
  import_type: undefined,
  hacontainer_url: null,
  technical_specs: {},
};

function ConnectorStatusChip({ status }: { status: SubmitResponse["perConnector"] extends (infer U)[] | undefined ? U extends { status: infer S } ? S : never : never }) {
  const map = {
    success: { color: "success" as const, label: "הצלחה", icon: <DoneIcon fontSize="small" /> },
    pm01_dispatched: { color: "info" as const, label: "PM01 נשלח", icon: <RunIcon fontSize="small" /> },
    skipped: { color: "default" as const, label: "דולג", icon: <WarnIcon fontSize="small" /> },
    failed: { color: "error" as const, label: "נכשל", icon: <ErrorIcon fontSize="small" /> },
  } as const;
  const m = map[status];
  return <Chip size="small" color={m.color === "default" ? undefined : m.color} icon={m.icon} label={m.label} sx={{ fontWeight: 600 }} />;
}

export function SingleProductUploadDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess?: (inventoryId: number) => void;
}) {
  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isValid },
  } = useForm<ProductInput>({
    resolver: zodResolver(productInputSchema),
    mode: "onChange",
    defaultValues: defaultValues as ProductInput,
  });

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [brandStatus, setBrandStatus] = useState<{ state: "idle" | "checking" | "ok" | "missing"; message?: string }>({
    state: "idle",
  });
  const brandCheckRef = useRef<number>(0);

  const [preview, setPreview] = useState<{ data: PreviewResponse; ts: number } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResponse | null>(null);

  const watchedBrand = watch("brand");
  const watchedCategory = watch("sp_category_code");
  const watchedImages = watch("images");

  // Reset state when reopening.
  useEffect(() => {
    if (!open) return;
    reset(defaultValues as ProductInput);
    setPreview(null);
    setSubmitResult(null);
    setImageError(null);
    setBrandStatus({ state: "idle" });
  }, [open, reset]);

  // Fetch leaf categories on open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCategoriesLoading(true);
    void supabaseDataClient
      .from("categories")
      .select("id, sp_category_code, name_he, full_path")
      .eq("is_leaf", true)
      .order("name_he", { ascending: true })
      .limit(2000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn("[SingleProductUploadDialog] categories fetch:", error.message);
          setCategories([]);
        } else {
          setCategories((data ?? []) as CategoryOption[]);
        }
        setCategoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Debounced brand resolution.
  useEffect(() => {
    const brand = (watchedBrand ?? "").trim();
    if (!brand) {
      setBrandStatus({ state: "idle" });
      return;
    }
    const tag = ++brandCheckRef.current;
    setBrandStatus({ state: "checking" });
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/superpharm/brand-resolve?brand=${encodeURIComponent(brand)}`);
        const json = (await res.json()) as { ok: boolean; code?: string; message?: string };
        if (tag !== brandCheckRef.current) return;
        if (json.ok) setBrandStatus({ state: "ok", message: json.code });
        else setBrandStatus({ state: "missing", message: json.message ?? "לא נמצא" });
      } catch (e) {
        if (tag !== brandCheckRef.current) return;
        setBrandStatus({ state: "missing", message: (e as Error).message });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [watchedBrand]);

  const previewFresh = preview ? Date.now() - preview.ts < PREVIEW_FRESHNESS_MS : false;
  const previewOk = preview?.data.ok ?? false;
  const submitDisabled = !isValid || !previewOk || !previewFresh || submitBusy || imageBusy;
  const isElectronics = isElectronicsCategory(watchedCategory);
  const showImportPick = isImportPickRequiredBrand(watchedBrand);

  // Aggregate live issues for the sticky bottom bar.
  const liveIssues = useMemo(() => {
    const out: { severity: "error" | "warning"; tag: string; message: string }[] = [];
    for (const [field, err] of Object.entries(errors)) {
      const msg = (err as { message?: string })?.message;
      if (msg) out.push({ severity: "error", tag: "טופס", message: `${field}: ${msg}` });
    }
    if (preview?.data.rules?.blockers) {
      for (const b of preview.data.rules.blockers) {
        out.push({ severity: "error", tag: "חוקה", message: b.message });
      }
    }
    if (preview?.data.rules?.warnings) {
      for (const w of preview.data.rules.warnings) {
        out.push({ severity: "warning", tag: "חוקה", message: w.message });
      }
    }
    if (preview?.data.perConnector) {
      for (const c of preview.data.perConnector) {
        const tag = c.id === "konimbo" ? "Konimbo" : "סופר-פארם";
        for (const b of c.blockers) out.push({ severity: "error", tag, message: b });
        for (const w of c.warnings) out.push({ severity: "warning", tag, message: w });
      }
    }
    return out.slice(0, 12);
  }, [errors, preview]);

  const onPickImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImageError(null);
    setImageBusy(true);
    try {
      const existing = watchedImages ?? [];
      const next = [...existing];
      for (const file of Array.from(files)) {
        if (next.length >= 10) {
          setImageError("מקסימום 10 תמונות");
          break;
        }
        const dims = await validateImageDimensions(file);
        if (!dims.ok) {
          setImageError(dims.error ?? "תמונה לא תקינה");
          continue;
        }
        const fd = new FormData();
        fd.append("file", file);
        fd.append("width", String(dims.width));
        fd.append("height", String(dims.height));
        const res = await fetch("/api/products/upload-image", { method: "POST", body: fd });
        const json = (await res.json()) as
          | { ok: true; url: string; width: number; height: number; mime: string }
          | { ok: false; error: string };
        if (!("ok" in json) || !json.ok) {
          setImageError(("error" in json && json.error) || "העלאת תמונה נכשלה");
          continue;
        }
        next.push({ url: json.url, width: json.width, height: json.height, mime: json.mime as "image/jpeg" | "image/png" | "image/webp" });
      }
      setValue("images", next, { shouldValidate: true });
    } finally {
      setImageBusy(false);
    }
  };

  const removeImage = (idx: number) => {
    const cur = watchedImages ?? [];
    const next = cur.filter((_, i) => i !== idx);
    setValue("images", next, { shouldValidate: true });
  };

  const runPreview = async (values: ProductInput) => {
    setPreviewBusy(true);
    try {
      const res = await fetch("/api/products/single-upload/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = (await res.json()) as PreviewResponse;
      setPreview({ data: json, ts: Date.now() });
    } catch (e) {
      setPreview({
        data: { ok: false, rules: { ok: false, blockers: [{ code: "preview_throw", field: "_", message: (e as Error).message }], warnings: [], derived: { import_type: null, cleaned_name: "", cleaned_description: "" } } },
        ts: Date.now(),
      });
    } finally {
      setPreviewBusy(false);
    }
  };

  const onSubmit = async (values: ProductInput) => {
    setSubmitBusy(true);
    try {
      const res = await fetch("/api/products/single-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = (await res.json()) as SubmitResponse;
      setSubmitResult(json);
      if (json.ok && typeof json.inventoryId === "number") {
        onSuccess?.(json.inventoryId);
      }
    } finally {
      setSubmitBusy(false);
    }
  };

  const closeIfIdle = () => {
    if (submitBusy || imageBusy || previewBusy) return;
    onClose();
  };

  return (
    <Dialog open={open} onClose={closeIfIdle} dir="rtl" maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontSize: 22, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        העלאת מוצר חדש
        <IconButton size="small" onClick={closeIfIdle} disabled={submitBusy || imageBusy}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      {(previewBusy || submitBusy) && <LinearProgress />}

      <DialogContent dividers sx={{ p: { xs: 1.5, md: 2 } }}>
        {submitResult ? (
          <Stack spacing={2}>
            <Alert severity={submitResult.ok ? "success" : "error"} icon={submitResult.ok ? <DoneIcon /> : <ErrorIcon />}>
              {submitResult.ok
                ? `המוצר נוצר בהצלחה (inventoryId ${submitResult.inventoryId})`
                : "ההעלאה נכשלה. בדוק את הסטטוס לכל פלטפורמה למטה"}
            </Alert>
            <Stack spacing={1}>
              {submitResult.perConnector?.map((c) => (
                <Box
                  key={c.id}
                  sx={(theme) => ({
                    p: 1.5,
                    borderRadius: 1,
                    border: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
                  })}
                >
                  <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
                    <Typography sx={{ fontWeight: 600 }}>
                      {c.id === "konimbo" ? "Konimbo (קונטיינר)" : "Super-Pharm (Mirakl)"}
                    </Typography>
                    <ConnectorStatusChip status={c.status} />
                  </Stack>
                  {c.externalId && (
                    <Typography variant="caption" color="text.secondary" sx={{ direction: "ltr", display: "block", mt: 0.5 }}>
                      ID: {c.externalId}
                      {c.externalUrl ? ` · ${c.externalUrl}` : ""}
                    </Typography>
                  )}
                  {c.error && (
                    <Alert severity="error" sx={{ mt: 1, py: 0.5 }}>
                      {c.error.message}
                    </Alert>
                  )}
                  {c.warnings?.map((w, i) => (
                    <Typography key={i} variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                      {w}
                    </Typography>
                  ))}
                </Box>
              ))}
            </Stack>
          </Stack>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} id="single-upload-form">
            <Stack spacing={1}>
              {/* Section 1: Product details */}
              <Accordion defaultExpanded disableGutters>
                <AccordionSummary expandIcon={<ExpandIcon />}>
                  <Typography sx={{ fontWeight: 600 }}>פרטי מוצר</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={2}>
                    <TextField
                      label="שם המוצר (עברית)"
                      fullWidth
                      required
                      {...register("name_he")}
                      error={!!errors.name_he}
                      helperText={errors.name_he?.message ?? "ללא יבוא / משלוח / אחריות / יבואן"}
                    />
                    <TextField
                      label="תיאור המוצר"
                      multiline
                      minRows={3}
                      fullWidth
                      required
                      {...register("description_he")}
                      error={!!errors.description_he}
                      helperText={errors.description_he?.message ?? "מידע על המוצר עצמו בלבד"}
                    />
                    <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                      <TextField
                        label="מותג"
                        fullWidth
                        required
                        {...register("brand")}
                        error={!!errors.brand}
                        helperText={
                          errors.brand?.message ??
                          (brandStatus.state === "checking"
                            ? "בודק במאגר..."
                            : brandStatus.state === "ok"
                              ? `קוד מותג: ${brandStatus.message}`
                              : brandStatus.state === "missing"
                                ? `אזהרה: ${brandStatus.message}`
                                : " ")
                        }
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              {brandStatus.state === "checking" && <CircularProgress size={14} />}
                              {brandStatus.state === "ok" && <DoneIcon color="success" fontSize="small" />}
                              {brandStatus.state === "missing" && <ErrorIcon color="error" fontSize="small" />}
                            </InputAdornment>
                          ),
                        }}
                      />
                      <TextField
                        label="SKU"
                        fullWidth
                        required
                        {...register("sku")}
                        error={!!errors.sku}
                        helperText={errors.sku?.message ?? " "}
                      />
                    </Stack>
                  </Stack>
                </AccordionDetails>
              </Accordion>

              {/* Section 2: Category */}
              <Accordion disableGutters>
                <AccordionSummary expandIcon={<ExpandIcon />}>
                  <Typography sx={{ fontWeight: 600 }}>קטגוריה</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Controller
                    name="sp_category_code"
                    control={control}
                    render={({ field }) => (
                      <Autocomplete<CategoryOption>
                        options={categories}
                        loading={categoriesLoading}
                        getOptionLabel={(o) => `${o.name_he} (${o.sp_category_code})`}
                        isOptionEqualToValue={(a, b) => a.sp_category_code === b.sp_category_code}
                        value={categories.find((c) => c.sp_category_code === field.value) ?? null}
                        onChange={(_, value) => {
                          field.onChange(value?.sp_category_code ?? "");
                          setValue("category_id", value?.id ?? null, { shouldValidate: true });
                          setValue("category_label", value?.name_he ?? "", { shouldValidate: true });
                        }}
                        renderInput={(p) => (
                          <TextField
                            {...p}
                            label="קטגוריית סופר-פארם (leaf בלבד)"
                            required
                            error={!!errors.sp_category_code}
                            helperText={errors.sp_category_code?.message ?? " "}
                          />
                        )}
                      />
                    )}
                  />
                </AccordionDetails>
              </Accordion>

              {/* Section 3: Pricing */}
              <Accordion disableGutters>
                <AccordionSummary expandIcon={<ExpandIcon />}>
                  <Typography sx={{ fontWeight: 600 }}>תמחור</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={2}>
                    <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                      <TextField
                        label="מחיר מכירה (₪)"
                        type="number"
                        fullWidth
                        required
                        inputProps={{ step: "0.01", min: 0 }}
                        {...register("price", { valueAsNumber: true })}
                        error={!!errors.price}
                        helperText={errors.price?.message ?? "המחיר ללקוח, כפי שמופיע באתר הקונטיינר"}
                      />
                      <TextField
                        label="עלות איסוף מהקונטיינר (₪)"
                        type="number"
                        fullWidth
                        inputProps={{ step: "0.01", min: 0 }}
                        {...register("pickup_cost", { valueAsNumber: true })}
                        error={!!errors.pickup_cost}
                        helperText={
                          errors.pickup_cost?.message ??
                          "כמה הקונטיינר גובה על איסוף מהמחסן שלו. לא דמי המשלוח שסופר-פארם גובה מהלקוח (אלה תמיד 39 ₪)."
                        }
                      />
                    </Stack>
                    <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
                      &quot;עלות איסוף&quot; מתייחסת לקונטיינר בלבד — זו העלות הפנימית של איסוף הסחורה,
                      ולא משפיעה על המחיר או דמי המשלוח בסופר-פארם.
                    </Alert>
                  </Stack>
                </AccordionDetails>
              </Accordion>

              {/* Section 4: Images */}
              <Accordion disableGutters>
                <AccordionSummary expandIcon={<ExpandIcon />}>
                  <Typography sx={{ fontWeight: 600 }}>
                    תמונות ({watchedImages?.length ?? 0})
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={1.5}>
                    <Button
                      variant="outlined"
                      component="label"
                      startIcon={<AddPhotoIcon />}
                      disabled={imageBusy || (watchedImages?.length ?? 0) >= 10}
                      sx={{ alignSelf: "flex-start" }}
                    >
                      {imageBusy ? "מעלה..." : "הוסף תמונות (מינימום 300×300, JPG/PNG/WEBP)"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        hidden
                        onChange={(e) => {
                          void onPickImages(e.target.files);
                          e.currentTarget.value = "";
                        }}
                      />
                    </Button>
                    {imageError && <Alert severity="error">{imageError}</Alert>}
                    {errors.images && !imageError && (
                      <Alert severity="error">
                        {(errors.images as { message?: string })?.message ?? "שגיאה בתמונות"}
                      </Alert>
                    )}
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 1.25 }}>
                      {(watchedImages ?? []).map((img, i) => (
                        <Box
                          key={img.url}
                          sx={(theme) => ({
                            position: "relative",
                            borderRadius: 1,
                            border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
                            overflow: "hidden",
                            aspectRatio: "1 / 1",
                          })}
                        >
                          <img
                            src={img.url}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                          <Box
                            sx={{
                              position: "absolute",
                              inset: 0,
                              display: "flex",
                              alignItems: "flex-end",
                              justifyContent: "space-between",
                              p: 0.5,
                              background:
                                "linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.55))",
                            }}
                          >
                            <Chip size="small" label={`${img.width}×${img.height}`} sx={{ bgcolor: "rgba(255,255,255,.92)", fontWeight: 600 }} />
                            <IconButton
                              size="small"
                              onClick={() => removeImage(i)}
                              sx={{ bgcolor: "rgba(255,255,255,.92)", "&:hover": { bgcolor: "white" } }}
                            >
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </Stack>
                </AccordionDetails>
              </Accordion>

              {/* Section 5: EAN + Import */}
              <Accordion disableGutters>
                <AccordionSummary expandIcon={<ExpandIcon />}>
                  <Typography sx={{ fontWeight: 600 }}>ברקוד ויבוא</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={2}>
                    <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
                      הברקוד חייב להיות <strong>ברקוד בינלאומי תקני</strong> (EAN / GTIN) — כמו זה
                      שמודפס על אריזת היצרן. לא מק&quot;ט פנימי של הקונטיינר ולא קוד של הספק.
                    </Alert>
                    <TextField
                      label={`ברקוד בינלאומי · EAN/GTIN${isElectronics ? " (חובה למוצרי חשמל)" : " (אופציונלי)"}`}
                      fullWidth
                      {...register("ean", { setValueAs: (v) => (v === "" ? null : v) })}
                      error={!!errors.ean}
                      helperText={errors.ean?.message ?? "8 עד 14 ספרות, ברקוד בינלאומי תקני (GS1)"}
                      InputProps={{ sx: { direction: "ltr", fontVariantNumeric: "tabular-nums" } }}
                    />
                    <TextField
                      label="טקסט יבואן (מהמוצר המקור)"
                      fullWidth
                      {...register("importer_text")}
                      helperText="לדוגמה: 'יבואן רשמי בישראל' / 'מובייל' / 'ברוכין'"
                    />
                    {showImportPick && (
                      <Box>
                        <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 600 }}>
                          סוג יבוא (Dyson / Sharp / Ninja דורשים בחירה ידנית)
                        </Typography>
                        <Controller
                          name="import_type"
                          control={control}
                          render={({ field }) => (
                            <RadioGroup
                              row
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value as "official" | "parallel")}
                            >
                              <FormControlLabel value="official" control={<Radio />} label="יבוא רשמי" />
                              <FormControlLabel value="parallel" control={<Radio />} label="יבוא מקביל" />
                            </RadioGroup>
                          )}
                        />
                      </Box>
                    )}
                  </Stack>
                </AccordionDetails>
              </Accordion>

              {/* Section 6: Warranty */}
              <Accordion disableGutters>
                <AccordionSummary expandIcon={<ExpandIcon />}>
                  <Typography sx={{ fontWeight: 600 }}>
                    אחריות{isElectronics ? " (חובה למוצרי חשמל)" : ""}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <TextField
                    label="פרטי אחריות"
                    fullWidth
                    {...register("warranty")}
                    error={!!errors.warranty}
                    helperText={errors.warranty?.message ?? "לדוגמה: '12 חודשים על ידי X'"}
                  />
                </AccordionDetails>
              </Accordion>
            </Stack>
          </form>
        )}

        {/* Sticky issues panel */}
        {!submitResult && liveIssues.length > 0 && (
          <Box
            sx={(theme) => ({
              mt: 2,
              p: 1.25,
              borderRadius: 1,
              border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
              bgcolor: alpha(theme.palette.warning.main, 0.04),
            })}
          >
            <Typography variant="subtitle2" sx={{ mb: 0.75, fontWeight: 600 }}>
              נושאים פתוחים ({liveIssues.length})
            </Typography>
            <Stack spacing={0.5}>
              {liveIssues.map((it, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center">
                  {it.severity === "error" ? (
                    <ErrorIcon color="error" fontSize="small" />
                  ) : (
                    <WarnIcon color="warning" fontSize="small" />
                  )}
                  <Chip size="small" label={it.tag} />
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {it.message}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.5, pb: 2, gap: 1, flexWrap: "wrap" }}>
        {submitResult ? (
          <>
            <Button variant="outlined" color="inherit" onClick={onClose}>
              סגור
            </Button>
            {!submitResult.ok && submitResult.inventoryId && (
              <Button
                variant="contained"
                color="primary"
                onClick={async () => {
                  if (!submitResult.inventoryId) return;
                  setSubmitBusy(true);
                  try {
                    const res = await fetch("/api/sync/superpharm/push", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ mode: "by_ids", ids: [submitResult.inventoryId] }),
                    });
                    const json = await res.json();
                    setSubmitResult({ ok: !!json.ok, inventoryId: submitResult.inventoryId, perConnector: [{ id: "superpharm", status: json.ok ? "pm01_dispatched" : "failed", error: json.ok ? undefined : { code: "retry_failed", message: json.error ?? "" } }] });
                  } finally {
                    setSubmitBusy(false);
                  }
                }}
                disabled={submitBusy}
                startIcon={submitBusy ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
              >
                נסה רק סופר-פארם
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="text" color="inherit" onClick={closeIfIdle} disabled={submitBusy}>
              ביטול
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              onClick={handleSubmit(runPreview)}
              disabled={previewBusy || submitBusy || imageBusy}
              startIcon={previewBusy ? <CircularProgress size={16} /> : <RefreshIcon />}
            >
              בדוק לפני שליחה
            </Button>
            <Button
              type="submit"
              form="single-upload-form"
              variant="contained"
              color="primary"
              disabled={submitDisabled}
              startIcon={submitBusy ? <CircularProgress size={16} color="inherit" /> : <RunIcon />}
              sx={{ minWidth: 180 }}
            >
              אשר והעלה
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default SingleProductUploadDialog;
