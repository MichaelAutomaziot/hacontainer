"use client";

import { useEffect, useMemo } from "react";
import { Controller, type FieldValues, type SubmitHandler } from "react-hook-form";
import { useForm } from "@refinedev/react-hook-form";
import {
  Alert,
  Autocomplete,
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

const CHANNELS = [
  { value: "superpharm", label: "סופר-פארם" },
  { value: "zap", label: "Zap" },
  { value: "walla", label: "Walla" },
  { value: "ace", label: "ACE" },
] as const;

type RuleType =
  | "shipping_addon"
  | "strike_multiplier"
  | "sale_duration"
  | "skip_extras"
  | "price_match";

const RULE_TYPES: { value: RuleType; label: string; hint: string }[] = [
  {
    value: "shipping_addon",
    label: "shipping_addon · תוספת משלוח",
    hint: "סכום קבוע שמתווסף לכל הצעה. מצופה: 39 ₪ ל-SP.",
  },
  {
    value: "strike_multiplier",
    label: "strike_multiplier · מקדם מחיר רגיל",
    hint: "מקדם נגד current_price ליצירת strike_price. מצופה: 1.15.",
  },
  {
    value: "sale_duration",
    label: "sale_duration · אורך מבצע",
    hint: "ימים מתאריך ההעלאה עד סיום המבצע. מצופה: 30 יום.",
  },
  {
    value: "skip_extras",
    label: "skip_extras · דילוג על תוספות משלוח",
    hint: "תיוגים שלא מועתקים מהמקור. מצופה: express, distant_area, kibbutz, above_2nd_floor.",
  },
  {
    value: "price_match",
    label: "price_match · התאמת מחיר מתחרה",
    hint: "מתאים לשווה למתחרה הזול ביותר. כרגע מושבת ב-DB עד שיוגדר רצפת מרווח.",
  },
];

const DEFAULT_CONFIG_BY_TYPE: Record<RuleType, Record<string, unknown>> = {
  shipping_addon: { amount: 39, currency: "ILS" },
  strike_multiplier: { factor: 1.15 },
  sale_duration: { days: 30 },
  skip_extras: { labels: ["express", "distant_area", "kibbutz", "above_2nd_floor"] },
  price_match: { match_lowest_competitor: true, always_add_shipping: true },
};

type FormValues = {
  channel: string;
  rule_type: RuleType;
  active: boolean;
  // Per-rule typed config
  amount?: number;
  currency?: string;
  factor?: number;
  days?: number;
  labels?: string[];
  match_lowest_competitor?: boolean;
  always_add_shipping?: boolean;
  // Free-form override (advanced)
  config_json?: string;
  config_override?: boolean;
};

const SKIP_LABEL_OPTIONS = [
  "express",
  "distant_area",
  "kibbutz",
  "above_2nd_floor",
  "above_1st_floor",
];

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

  const ruleType = watch("rule_type");
  const channel = watch("channel");
  const active = watch("active");
  const overrideOn = watch("config_override");

  // Edit-mode hydration: when the record loads, expand `config` jsonb back into
  // typed fields so the user can edit one field at a time instead of raw JSON.
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
    if ("labels" in c && Array.isArray(c.labels))
      setValue("labels", c.labels as string[]);
    if ("match_lowest_competitor" in c)
      setValue("match_lowest_competitor", !!c.match_lowest_competitor);
    if ("always_add_shipping" in c)
      setValue("always_add_shipping", !!c.always_add_shipping);
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
        throw new Error(`config_json לא תקין: ${(e as Error).message}`);
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
    const r = (await onFinish(values)) as
      | { data?: { id?: string } | null }
      | undefined;
    const id = r?.data?.id;
    if (id && onSaved) onSaved(String(id));
  };

  const ruleMeta = RULE_TYPES.find((r) => r.value === ruleType);

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ pb: 4 }}>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>
            ערוץ וסוג חוק
          </Typography>
          <Divider sx={{ mb: 2 }} />
        </Grid>

        <Grid item xs={12} md={6}>
          <Controller
            name="channel"
            control={control}
            rules={{ required: "שדה חובה" }}
            render={({ field }) => (
              <TextField {...field} select label="ערוץ" fullWidth>
                {CHANNELS.map((c) => (
                  <MenuItem key={c.value} value={c.value}>
                    {c.label} ({c.value})
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <Controller
            name="rule_type"
            control={control}
            rules={{ required: "שדה חובה" }}
            render={({ field }) => (
              <TextField {...field} select label="סוג חוק" fullWidth>
                {RULE_TYPES.map((r) => (
                  <MenuItem key={r.value} value={r.value}>
                    {r.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </Grid>

        <Grid item xs={12}>
          <Alert severity="info" icon={false}>
            <strong>{ruleMeta?.label}</strong> — {ruleMeta?.hint}
          </Alert>
        </Grid>

        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            תצורה
          </Typography>
          <Divider sx={{ mb: 2 }} />
        </Grid>

        {/* Typed editor per rule_type — only the fields relevant to the
            currently selected rule_type are shown. */}
        {ruleType === "shipping_addon" && (
          <>
            <Grid item xs={12} md={6}>
              <TextField
                {...register("amount", {
                  required: "שדה חובה",
                  valueAsNumber: true,
                  min: { value: 0, message: "לא יכול להיות שלילי" },
                })}
                label="סכום"
                type="number"
                error={!!errors.amount}
                helperText={errors.amount?.message as string | undefined}
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
                helperText="ברירת מחדל: ILS"
              />
            </Grid>
          </>
        )}

        {ruleType === "strike_multiplier" && (
          <Grid item xs={12} md={6}>
            <TextField
              {...register("factor", {
                required: "שדה חובה",
                valueAsNumber: true,
                min: { value: 1, message: "מקדם חייב ≥1" },
                max: { value: 3, message: "מקדם מקסימלי 3" },
              })}
              label="מקדם strike"
              type="number"
              error={!!errors.factor}
              helperText={(errors.factor?.message as string | undefined) ?? "1.15 → strike גדול ב-15% מ-current"}
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
                required: "שדה חובה",
                valueAsNumber: true,
                min: { value: 1, message: "לפחות יום אחד" },
                max: { value: 365, message: "מקסימום 365 ימים" },
              })}
              label="אורך מבצע (ימים)"
              type="number"
              error={!!errors.days}
              helperText={(errors.days?.message as string | undefined) ?? "טווח: 1-365"}
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
                  freeSolo
                  options={SKIP_LABEL_OPTIONS}
                  value={field.value ?? []}
                  onChange={(_, v) => field.onChange(v)}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip
                        variant="outlined"
                        label={option}
                        {...getTagProps({ index })}
                        key={option}
                      />
                    ))
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="תיוגים לדילוג"
                      placeholder="הוסף תיוג"
                      helperText="לחץ Enter לאחר כל תיוג"
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
                <strong>זהירות:</strong> כרגע ה-DB משבית price_match (migration
                0022). הפעלה מחודשת דורשת רצפת מרווח בקונפיג כדי למנוע התאמה
                למתחרה שמוכר בהפסד.
              </Alert>
            </Grid>
            <Grid item xs={12} md={6}>
              <Controller
                name="match_lowest_competitor"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={!!field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    }
                    label="התאם למתחרה הזול ביותר"
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
                    control={
                      <Switch
                        checked={!!field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    }
                    label="תמיד להוסיף 39 ₪ משלוח גם בהתאמה"
                    disabled={overrideOn}
                  />
                )}
              />
            </Grid>
          </>
        )}

        <Grid item xs={12}>
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
                      if (e.target.checked) {
                        // Seed override box with the current typed preview
                        setValue(
                          "config_json",
                          JSON.stringify(previewConfig, null, 2),
                        );
                      }
                    }}
                  />
                }
                label="עריכה כ-JSON (advanced)"
              />
            )}
          />
        </Grid>

        {overrideOn && (
          <Grid item xs={12}>
            <TextField
              {...register("config_json")}
              label="config (JSON)"
              fullWidth
              multiline
              rows={6}
              className="ltr-input"
              helperText="ישמר ישירות לעמודת jsonb של pricing_rules.config"
            />
          </Grid>
        )}

        <Grid item xs={12} md={6}>
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
                label={field.value ? "פעיל" : "כבוי"}
              />
            )}
          />
        </Grid>

        <Grid item xs={12}>
          <Box
            sx={(th) => ({
              p: 2,
              border: `1px dashed ${th.palette.divider}`,
              borderRadius: 1,
              bgcolor: "background.default",
            })}
          >
            <Typography variant="overline" color="text.secondary">
              תצוגה מקדימה
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5, mb: 1 }} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={`channel: ${channel}`} color="primary" />
              <Chip size="small" label={`rule_type: ${ruleType}`} />
              <Chip
                size="small"
                color={active ? "success" : "default"}
                label={active ? "פעיל" : "כבוי"}
              />
            </Stack>
            <Box
              component="pre"
              sx={{
                fontFamily: "monospace",
                fontSize: 12,
                direction: "ltr",
                m: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {JSON.stringify(previewConfig, null, 2)}
            </Box>
          </Box>
        </Grid>
      </Grid>

      <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
        <Button type="submit" variant="contained" color="primary" disabled={isSubmitting}>
          {isSubmitting ? "שומר…" : "שמור חוק"}
        </Button>
      </Stack>
    </Box>
  );
}
