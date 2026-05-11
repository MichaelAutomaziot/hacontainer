"use client";

import { useEffect, useMemo, useState } from "react";
import { Controller, type FieldValues, type SubmitHandler } from "react-hook-form";
import { useForm } from "@refinedev/react-hook-form";
import {
  Alert,
  AlertTitle,
  Autocomplete,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  FormControlLabel,
  Grid,
  Link as MuiLink,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";

const CHANNELS = [
  { value: "superpharm", label: "סופר-פארם" },
  { value: "zap", label: "Zap" },
  { value: "walla", label: "Walla שופס" },
  { value: "ace", label: "ACE" },
] as const;

type RuleType =
  | "shipping_addon"
  | "strike_multiplier"
  | "sale_duration"
  | "skip_extras"
  | "price_match";

/** Plain-Hebrew metadata for each rule. `value` is the code stored in the DB
 *  (`pricing_rules.rule_type`) and must not change; everything else is what the
 *  operator actually reads. */
const RULE_TYPES: {
  value: RuleType;
  title: string;
  what: string;
  example: string;
}[] = [
  {
    value: "shipping_addon",
    title: "תוספת דמי משלוח קבועה",
    what: "מוסיף סכום קבוע לכל הצעה שעולה לערוץ. ככה דמי המשלוח של הערוץ מכוסים בתוך המחיר.",
    example: "כרגע: כל מוצר שעולה לסופר-פארם מקבל תוספת של 39 ₪.",
  },
  {
    value: "strike_multiplier",
    title: "ניפוח “מחיר לפני הנחה”",
    what: "קובע כמה גבוה יוצג “המחיר לפני הנחה” (המחיר המחוק) ביחס למחיר שהלקוח באמת משלם. ככה נראית הנחה.",
    example: "1.15 = המחיר המחוק יהיה גבוה ב-15% מהמחיר בפועל.",
  },
  {
    value: "sale_duration",
    title: "אורך תקופת המבצע",
    what: "כמה ימים המבצע (ההנחה מ“המחיר לפני הנחה”) פעיל, החל מיום ההעלאה.",
    example: "כרגע: 30 ימים.",
  },
  {
    value: "skip_extras",
    title: "סוגי משלוח שלא מעתיקים",
    what: "אילו אפשרויות משלוח מיוחדות של הקונטיינר (משלוח מהיר, אזורים מרוחקים, קיבוצים, קומה גבוהה) לא יועברו לערוץ.",
    example: "כרגע מדלגים על: משלוח מהיר, אזור מרוחק, קיבוץ, מעל קומה ראשונה.",
  },
  {
    value: "price_match",
    title: "התאמת מחיר למתחרה",
    what: "מתאים אוטומטית את המחיר למחיר של המתחרה הזול ביותר במרקטפלייס. אפשר להוסיף 39 ₪ דמי משלוח גם אחרי ההתאמה.",
    example: "כרגע: פעיל, ומתווספים 39 ₪ דמי משלוח גם אחרי ההתאמה.",
  },
];

type FormValues = {
  channel: string;
  rule_type: RuleType;
  active: boolean;
  amount?: number;
  currency?: string;
  factor?: number;
  days?: number;
  labels?: string[];
  match_lowest_competitor?: boolean;
  always_add_shipping?: boolean;
  config_json?: string;
  config_override?: boolean;
};

const SKIP_LABEL_OPTIONS: { value: string; label: string }[] = [
  { value: "express", label: "משלוח מהיר" },
  { value: "distant_area", label: "אזור מרוחק" },
  { value: "kibbutz", label: "קיבוץ / מושב" },
  { value: "above_2nd_floor", label: "מעל קומה ראשונה" },
  { value: "above_1st_floor", label: "מעל קומת קרקע" },
];
const skipLabelHe = (v: string) => SKIP_LABEL_OPTIONS.find((o) => o.value === v)?.label ?? v;

interface Props {
  action: "create" | "edit";
  onSaved?: (id: string) => void;
}

export function PricingRuleForm({ action, onSaved }: Props) {
  const {
    register,
    control,
    watch,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
    refineCore: { onFinish, queryResult },
  } = useForm<FormValues>({
    refineCoreProps: {
      resource: "pricing_rules",
      action,
      redirect: false,
    },
    defaultValues: {
      channel: "superpharm",
      rule_type: "shipping_addon",
      active: true,
      amount: 39,
      currency: "ILS",
      factor: 1.15,
      days: 30,
      labels: ["express", "distant_area", "kibbutz", "above_2nd_floor"],
      match_lowest_competitor: true,
      always_add_shipping: true,
      config_override: false,
      config_json: "",
    },
  });

  const [showAdvanced, setShowAdvanced] = useState(false);

  const ruleType = watch("rule_type");
  const channel = watch("channel");
  const active = watch("active");
  const overrideOn = watch("config_override");

  const record = queryResult?.data?.data as
    | { id?: string; channel?: string; rule_type?: RuleType; config?: Record<string, unknown>; active?: boolean }
    | undefined;
  useEffect(() => {
    if (!record) return;
    setValue("channel", record.channel ?? "superpharm");
    setValue("rule_type", (record.rule_type as RuleType) ?? "shipping_addon");
    setValue("active", record.active ?? true);
    const c = record.config ?? {};
    if ("amount" in c) setValue("amount", Number(c.amount));
    if ("currency" in c) setValue("currency", String(c.currency));
    if ("factor" in c) setValue("factor", Number(c.factor));
    if ("days" in c) setValue("days", Number(c.days));
    if ("labels" in c && Array.isArray(c.labels)) setValue("labels", c.labels as string[]);
    if ("match_lowest_competitor" in c) setValue("match_lowest_competitor", !!c.match_lowest_competitor);
    if ("always_add_shipping" in c) setValue("always_add_shipping", !!c.always_add_shipping);
    setValue("config_json", JSON.stringify(c, null, 2));
  }, [record, setValue]);

  const previewConfig = useMemo<Record<string, unknown>>(() => {
    if (overrideOn) {
      try {
        return JSON.parse(watch("config_json") ?? "{}");
      } catch {
        return {};
      }
    }
    switch (ruleType) {
      case "shipping_addon":
        return { amount: Number(watch("amount") ?? 0), currency: watch("currency") ?? "ILS" };
      case "strike_multiplier":
        return { factor: Number(watch("factor") ?? 1) };
      case "sale_duration":
        return { days: Number(watch("days") ?? 30) };
      case "skip_extras":
        return { labels: watch("labels") ?? [] };
      case "price_match":
        return {
          match_lowest_competitor: !!watch("match_lowest_competitor"),
          always_add_shipping: !!watch("always_add_shipping"),
        };
      default:
        return {};
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    overrideOn,
    ruleType,
    watch("amount"),
    watch("currency"),
    watch("factor"),
    watch("days"),
    watch("labels"),
    watch("match_lowest_competitor"),
    watch("always_add_shipping"),
    watch("config_json"),
  ]);

  const onSubmit: SubmitHandler<FieldValues> = async (submittedValues) => {
    const raw = submittedValues as FormValues;
    let config: Record<string, unknown>;
    if (raw.config_override) {
      try {
        config = JSON.parse(raw.config_json ?? "{}");
      } catch (e) {
        throw new Error(`עריכה ידנית לא תקינה: ${(e as Error).message}`);
      }
    } else {
      config = previewConfig;
    }
    const values = {
      channel: raw.channel,
      rule_type: raw.rule_type,
      config,
      active: !!raw.active,
    };
    const r = (await onFinish(values)) as { data?: { id?: string } | null } | undefined;
    const id = r?.data?.id;
    if (id && onSaved) onSaved(String(id));
  };

  const ruleMeta = RULE_TYPES.find((r) => r.value === ruleType);
  const channelHe = CHANNELS.find((c) => c.value === channel)?.label ?? channel;

  /** One plain-Hebrew sentence describing what this rule will do once saved. */
  const plainSummary = useMemo(() => {
    const ch = channelHe;
    switch (ruleType) {
      case "shipping_addon":
        return `כל מוצר שעולה ל${ch} יקבל תוספת של ${Number(watch("amount") ?? 0)} ${
          watch("currency") === "ILS" || !watch("currency") ? "₪" : watch("currency")
        } על המחיר.`;
      case "strike_multiplier": {
        const f = Number(watch("factor") ?? 1);
        const pct = Math.round((f - 1) * 100);
        return `ב${ch}, “המחיר לפני הנחה” יוצג גבוה ב-${pct}% מהמחיר שהלקוח משלם בפועל.`;
      }
      case "sale_duration":
        return `ב${ch}, ההנחה תהיה פעילה ${Number(watch("days") ?? 30)} ימים מיום ההעלאה.`;
      case "skip_extras": {
        const ls = (watch("labels") ?? []).map(skipLabelHe);
        return ls.length
          ? `סוגי המשלוח הבאים לא יועברו ל${ch}: ${ls.join(", ")}.`
          : `כל סוגי המשלוח יועברו ל${ch}.`;
      }
      case "price_match":
        return `ב${ch}, המחיר יותאם אוטומטית למחיר של המתחרה הזול ביותר${
          watch("always_add_shipping") ? ", ועדיין יתווספו 39 ₪ דמי משלוח" : ""
        }.`;
      default:
        return "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleType, channelHe, watch("amount"), watch("currency"), watch("factor"), watch("days"), watch("labels"), watch("always_add_shipping")]);

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ pb: 4 }}>
      <Grid container spacing={2.5}>
        {/* --- step 1: pick what the rule does --- */}
        <Grid item xs={12}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            1 · מה החוק עושה?
          </Typography>
          <Divider sx={{ mt: 1, mb: 0.5 }} />
        </Grid>

        <Grid item xs={12} md={7}>
          <Controller
            name="rule_type"
            control={control}
            rules={{ required: "יש לבחור סוג חוק" }}
            render={({ field }) => (
              <TextField
                {...field}
                select
                label="סוג החוק"
                fullWidth
                SelectProps={{
                  renderValue: (v) => RULE_TYPES.find((r) => r.value === v)?.title ?? String(v ?? ""),
                }}
              >
                {RULE_TYPES.map((r) => (
                  <MenuItem key={r.value} value={r.value} sx={{ display: "block", py: 1 }}>
                    <Typography sx={{ fontWeight: 600 }}>{r.title}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "normal", display: "block" }}>
                      {r.what}
                    </Typography>
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </Grid>

        <Grid item xs={12} md={5}>
          <Controller
            name="channel"
            control={control}
            rules={{ required: "יש לבחור ערוץ" }}
            render={({ field }) => (
              <TextField {...field} select label="באיזה ערוץ זה חל?" fullWidth helperText="כרגע פעיל רק סופר-פארם">
                {CHANNELS.map((c) => (
                  <MenuItem key={c.value} value={c.value} disabled={c.value !== "superpharm"}>
                    {c.label}
                    {c.value !== "superpharm" ? " (בקרוב)" : ""}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </Grid>

        {ruleMeta && (
          <Grid item xs={12}>
            <Alert severity="info" icon={false} sx={{ "& a": { fontWeight: 600 } }}>
              <AlertTitle sx={{ mb: 0.25 }}>{ruleMeta.title}</AlertTitle>
              {ruleMeta.what}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {ruleMeta.example}
              </Typography>
            </Alert>
          </Grid>
        )}

        {/* --- step 2: the one value the operator sets --- */}
        <Grid item xs={12}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 1 }}>
            2 · הגדרת הערך
          </Typography>
          <Divider sx={{ mt: 1, mb: 0.5 }} />
        </Grid>

        {ruleType === "shipping_addon" && (
          <>
            <Grid item xs={12} md={6}>
              <TextField
                {...register("amount", {
                  required: "יש להזין סכום",
                  valueAsNumber: true,
                  min: { value: 0, message: "הסכום לא יכול להיות שלילי" },
                })}
                label="סכום התוספת (₪)"
                type="number"
                error={!!errors.amount}
                helperText={(errors.amount?.message as string | undefined) ?? "המספר שיתווסף למחיר של כל הצעה. כרגע: 39"}
                fullWidth
                disabled={overrideOn}
                inputProps={{ step: "0.01", min: 0 }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                {...register("currency")}
                label="מטבע"
                fullWidth
                disabled={overrideOn}
                helperText="ברירת מחדל: ₪ (ILS). אין צורך לשנות."
              />
            </Grid>
          </>
        )}

        {ruleType === "strike_multiplier" && (
          <Grid item xs={12} md={8}>
            <TextField
              {...register("factor", {
                required: "יש להזין מקדם",
                valueAsNumber: true,
                min: { value: 1, message: "המקדם חייב להיות לפחות 1" },
                max: { value: 3, message: "המקדם המקסימלי הוא 3" },
              })}
              label="פי כמה לנפח את 'המחיר לפני הנחה'"
              type="number"
              error={!!errors.factor}
              helperText={
                (errors.factor?.message as string | undefined) ??
                "1 = ללא הנחה מוצגת · 1.15 = המחיר המחוק גבוה ב-15% מהמחיר בפועל · 1.2 = גבוה ב-20%"
              }
              fullWidth
              disabled={overrideOn}
              inputProps={{ step: "0.01", min: 1, max: 3 }}
            />
          </Grid>
        )}

        {ruleType === "sale_duration" && (
          <Grid item xs={12} md={6}>
            <TextField
              {...register("days", {
                required: "יש להזין מספר ימים",
                valueAsNumber: true,
                min: { value: 1, message: "לפחות יום אחד" },
                max: { value: 365, message: "מקסימום 365 ימים" },
              })}
              label="אורך המבצע (בימים)"
              type="number"
              error={!!errors.days}
              helperText={(errors.days?.message as string | undefined) ?? "בין 1 ל-365. כרגע: 30"}
              fullWidth
              disabled={overrideOn}
              inputProps={{ step: 1, min: 1, max: 365 }}
            />
          </Grid>
        )}

        {ruleType === "skip_extras" && (
          <Grid item xs={12}>
            <Controller
              name="labels"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  multiple
                  options={SKIP_LABEL_OPTIONS.map((o) => o.value)}
                  value={field.value ?? []}
                  onChange={(_, v) => field.onChange(v)}
                  getOptionLabel={skipLabelHe}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip variant="outlined" label={skipLabelHe(option)} {...getTagProps({ index })} key={option} />
                    ))
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="סוגי משלוח שלא להעתיק לערוץ"
                      placeholder="בחרו מהרשימה"
                      helperText="כל מה שמופיע כאן לא יישלח לערוץ. השאר יועתק כפי שהוא מהקונטיינר."
                    />
                  )}
                  disabled={overrideOn}
                />
              )}
            />
          </Grid>
        )}

        {ruleType === "price_match" && (
          <>
            <Grid item xs={12}>
              <Alert severity="warning">
                <AlertTitle>שימו לב</AlertTitle>
                התאמת מחיר אוטומטית עוקבת אחרי המתחרה הזול ביותר — בלי רצפת רווח היא עלולה לרדוף
                אחרי מתחרה שמוכר בהפסד. כדאי לעקוב אחרי המחירים שיוצאים.
              </Alert>
            </Grid>
            <Grid item xs={12} md={6}>
              <Controller
                name="match_lowest_competitor"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                    label="להתאים למתחרה הזול ביותר"
                    disabled={overrideOn}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <Controller
                name="always_add_shipping"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                    label="להוסיף 39 ₪ משלוח גם אחרי ההתאמה"
                    disabled={overrideOn}
                  />
                )}
              />
            </Grid>
          </>
        )}

        {/* --- step 3: on/off + plain summary --- */}
        <Grid item xs={12}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 1 }}>
            3 · אישור
          </Typography>
          <Divider sx={{ mt: 1, mb: 0.5 }} />
        </Grid>

        <Grid item xs={12} md={5}>
          <Controller
            name="active"
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
                label={field.value ? "החוק פעיל" : "החוק כבוי"}
              />
            )}
          />
        </Grid>

        <Grid item xs={12}>
          <Alert severity={active ? "success" : "warning"} icon={false}>
            <AlertTitle sx={{ mb: 0.25 }}>כך זה יעבוד</AlertTitle>
            {plainSummary}
            {!active && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                החוק כבוי כרגע — לא ישפיע על שום מוצר עד שיופעל.
              </Typography>
            )}
          </Alert>
        </Grid>

        {/* --- advanced (collapsed) --- */}
        <Grid item xs={12}>
          <MuiLink
            component="button"
            type="button"
            underline="hover"
            color="text.secondary"
            onClick={() => setShowAdvanced((v) => !v)}
            sx={{ fontSize: "0.85rem" }}
          >
            {showAdvanced ? "הסתר אפשרויות למתקדמים" : "אפשרויות למתקדמים (עריכה ידנית)"}
          </MuiLink>
          <Collapse in={showAdvanced} unmountOnExit>
            <Stack spacing={1.5} sx={{ mt: 1.5 }}>
              <Controller
                name="config_override"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={!!field.value}
                        onChange={(e) => {
                          field.onChange(e.target.checked);
                          if (e.target.checked) setValue("config_json", JSON.stringify(previewConfig, null, 2));
                        }}
                      />
                    }
                    label="עריכה ידנית של התצורה (JSON) — למתקדמים בלבד"
                  />
                )}
              />
              {overrideOn && (
                <TextField
                  {...register("config_json")}
                  label="תצורה (JSON)"
                  fullWidth
                  multiline
                  rows={6}
                  className="ltr-input"
                  helperText="נשמר ישירות לעמודה pricing_rules.config. שינוי שגוי כאן עלול לשבור את התמחור."
                />
              )}
              <Box
                sx={(th) => ({
                  p: 1.5,
                  border: `1px dashed ${th.palette.divider}`,
                  borderRadius: 1,
                  bgcolor: "background.default",
                })}
              >
                <Typography variant="overline" color="text.secondary">
                  ערכי התצורה הגולמיים
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    fontFamily: "monospace",
                    fontSize: 12,
                    direction: "ltr",
                    m: 0,
                    mt: 0.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {JSON.stringify(previewConfig, null, 2)}
                </Box>
              </Box>
            </Stack>
          </Collapse>
        </Grid>
      </Grid>

      <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
        <Button type="submit" variant="contained" color="primary" disabled={isSubmitting} sx={{ minWidth: 160 }}>
          {isSubmitting ? "שומר…" : "שמירת החוק"}
        </Button>
      </Stack>
    </Box>
  );
}
