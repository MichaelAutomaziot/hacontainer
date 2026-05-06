"use client";

import { useMemo, useState } from "react";
import {
  Box, Paper, Stack, Typography, Chip, Button, IconButton, Card, CardContent, CardActions, Grid, Skeleton, Tooltip, Alert,
} from "@mui/material";
import { Refresh as RefreshIcon, OpenInNew as ExtIcon, RemoveCircle as RemoveIcon, BuildCircle as TransformIcon, CloudUpload as UploadIcon } from "@mui/icons-material";
import { useList, useUpdate, useNotification } from "@refinedev/core";
import { FilterBar, ImageThumb, PageFrame, PageHeader } from "@/components/shared";
import { hebrewTranslations as t } from "@/locales/he";

type Inv = {
  id: number;
  name_he: string | null;
  brand: string | null;
  category: string | null;
  ean: string | null;
  hacontainer_url: string | null;
  images: string[] | null;
  price: number | null;
  pickup_cost: number | null;
  pilot_status: string | null;
};

const fmt = new Intl.NumberFormat("he-IL");
const fmtCurr = (n: number | null | undefined) => n == null ? "—" : `₪${fmt.format(n)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

const STATUSES = ["approved_for_pilot", "transformed", "pending_catalog", "catalog_synced", "uploading", "uploaded", "ran_approved"] as const;

export default function PilotPage() {
  const [statusFilter, setStatusFilter] = useState<string>("approved_for_pilot");
  const [pushBusy, setPushBusy] = useState<boolean>(false);
  const [transformBusyId, setTransformBusyId] = useState<number | null>(null);
  const { data, isFetching, refetch } = useList<Inv>({
    resource: "inventory",
    pagination: { pageSize: 200 },
    filters: [{ field: "pilot_status", operator: "in", value: STATUSES as unknown as string[] } as never],
    queryOptions: { refetchInterval: 15_000 },
  });
  const rows = (data?.data ?? []) as Inv[];
  const filtered = useMemo(() => statusFilter ? rows.filter((r) => r.pilot_status === statusFilter) : rows, [rows, statusFilter]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.pilot_status ?? "unset"] = (c[r.pilot_status ?? "unset"] ?? 0) + 1;
    return c;
  }, [rows]);

  const { mutate: updateInv } = useUpdate();
  const { open } = useNotification();

  const removeFromPilot = (id: number) => updateInv({ resource: "inventory", id, values: { pilot_status: "imported" } }, {
    onSuccess: () => { open?.({ type: "success", message: "הוסר מהפיילוט" }); refetch(); },
  });

  const runTransform = async (id: number) => {
    if (transformBusyId !== null) return;
    setTransformBusyId(id);
    try {
      const res = await fetch("/api/sync/superpharm/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "by_ids", ids: [id], dry: true }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        eligible?: number;
        blocked_by_priceFor?: number;
        rejected?: { sku: string; errors: string[] }[];
        error?: string;
      };
      if (!res.ok || !json.ok || (json.eligible ?? 0) < 1) {
        const reason =
          json.rejected?.[0]?.errors?.filter(Boolean).join(", ") ||
          json.error ||
          ((json.blocked_by_priceFor ?? 0) > 0
            ? "המוצר לא מוכן להפצה. בדוק שם, מחיר, ברקוד ותמונות."
            : "לא נמצא מוצר מוכן להמרה.");
        open?.({ type: "error", message: `המרה נכשלה: ${reason}` });
        return;
      }
      updateInv(
        { resource: "inventory", id, values: { pilot_status: "transformed" } },
        {
          onSuccess: () => { open?.({ type: "success", message: "המרה הושלמה" }); refetch(); },
          onError: (e) => open?.({ type: "error", message: `עדכון סטטוס נכשל: ${(e as unknown as Error).message}` }),
        }
      );
    } catch (e) {
      open?.({ type: "error", message: `שגיאת רשת: ${(e as Error).message}` });
    } finally {
      setTransformBusyId(null);
    }
  };

  return (
    <PageFrame>
      <PageHeader
        title={t.pilot.nav.pilotQueue}
        subtitle="תור מוצרים שאושרו לפיילוט, כולל תצוגת OF01, מצב העלאה וקישורים למקור."
        icon={<UploadIcon />}
        tone="success"
        stats={
          <>
            <Chip label={`${fmt.format(filtered.length)} מוצגים`} color="success" />
            <Chip label={`${fmt.format(rows.length)} בפיילוט`} variant="outlined" />
          </>
        }
        actions={<Tooltip title={t.actions.refresh}><IconButton onClick={() => refetch()} disabled={isFetching}><RefreshIcon /></IconButton></Tooltip>}
      />

      <FilterBar>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
        {STATUSES.map((s) => (
          <Chip key={s} label={`${(t.pilot.pilotStatus as Record<string, string>)[s] ?? s}: ${counts[s] ?? 0}`}
                onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
                color={statusFilter === s ? "primary" : "default"}
                variant={statusFilter === s ? "filled" : "outlined"} />
        ))}
        <Box sx={{ flex: 1 }} />
        <Tooltip title={pushBusy ? "שולח לסופר-פארם…" : "שלח את כל המוצרים בסטטוס approved_for_pilot או transformed"}>
          <span>
            <Button
              startIcon={<UploadIcon />}
              variant="contained"
              color="success"
              disabled={pushBusy || ((counts.approved_for_pilot ?? 0) + (counts.transformed ?? 0)) === 0}
              onClick={async () => {
                if (pushBusy) return;
                const sendIds = rows
                  .filter((r) => r.pilot_status === "approved_for_pilot" || r.pilot_status === "transformed")
                  .map((r) => r.id);
                if (sendIds.length === 0) return;
                setPushBusy(true);
                try {
                  const res = await fetch("/api/sync/superpharm/push", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mode: "by_ids", ids: sendIds }),
                  });
                  const json = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    import_id?: string | number;
                    sku_count?: number;
                    rejected?: { sku: string; errors: string[] }[];
                    error?: string;
                    pm01_dispatched_count?: number;
                    pm01_sync_job_id?: string | null;
                  };
                  if (!res.ok || !json.ok) {
                    open?.({ type: "error", message: `שגיאה בשליחה: ${json.error ?? res.statusText}` });
                  } else {
                    const ofCount = json.sku_count ?? 0;
                    const pmCount = json.pm01_dispatched_count ?? 0;
                    const rej = json.rejected?.length ?? 0;
                    const parts: string[] = [];
                    if (ofCount > 0) parts.push(`${ofCount} הצעות (OF01) נשלחו · import_id=${json.import_id}`);
                    if (pmCount > 0) parts.push(`${pmCount} מוצרים חדשים נשלחו ליצירה בקטלוג SP (PM01)`);
                    if (rej) parts.push(`${rej} נדחו`);
                    if (parts.length === 0) parts.push("אין מוצרים זמינים לשליחה");
                    open?.({ type: "success", message: parts.join(" · ") });
                    refetch();
                  }
                } catch (e) {
                  open?.({ type: "error", message: `שגיאת רשת: ${(e as Error).message}` });
                } finally {
                  setPushBusy(false);
                }
              }}
            >
              {pushBusy ? "שולח…" : "שלח לסופר-פארם (OF01)"}
            </Button>
          </span>
        </Tooltip>
      </Stack>
      </FilterBar>

      {filtered.length === 0 && !isFetching && (
        <Alert severity="info" sx={{ mb: 2 }}>
          אין מוצרים בסטטוס זה. בחר מוצרים מתוך {`"${t.pilot.nav.comparison}"`} ולחץ {`"${t.pilot.actions.addSelectedToPilot}"`}.
        </Alert>
      )}

      <Grid container spacing={2}>
        {isFetching && filtered.length === 0 && Array.from({ length: 6 }).map((_, i) => (
          <Grid item xs={12} md={6} xl={4} key={i}>
            <Card><Skeleton variant="rectangular" height={300} /></Card>
          </Grid>
        ))}
        {filtered.map((p) => (
          <Grid item xs={12} md={6} xl={4} key={p.id}>
            <Card sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <Box sx={{ p: 2, display: "flex", gap: 2 }}>
                <ImageThumb src={p.images?.[0] ?? null} size={120} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2, mb: 0.5 }}>{p.name_he}</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                    {p.brand && <Chip size="small" label={p.brand} variant="outlined" />}
                    {p.category && <Chip size="small" label={p.category} />}
                    <Chip size="small" color="primary" label={(t.pilot.pilotStatus as Record<string, string>)[p.pilot_status ?? ""] ?? p.pilot_status ?? "—"} />
                  </Stack>
                  {p.ean && <Typography variant="caption" sx={{ direction: "ltr", display: "block" }}>EAN: {p.ean}</Typography>}
                </Box>
              </Box>
              <CardContent sx={{ pt: 0, flex: 1 }}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
                  <Paper variant="outlined" sx={{ p: 1.5, flex: 1, bgcolor: "grey.50" }}>
                    <Typography variant="overline" color="text.secondary">לפני המרה (הקונטיינר)</Typography>
                    <Stack spacing={0.3} sx={{ mt: 0.5 }}>
                      <Typography variant="body2"><b>מחיר מבצע:</b> {fmtCurr(p.price ?? 0)}</Typography>
                      <Typography variant="body2"><b>עלות איסוף:</b> {fmtCurr(p.pickup_cost ?? 0)}</Typography>
                    </Stack>
                  </Paper>
                  <Paper variant="outlined" sx={{ p: 1.5, flex: 1, bgcolor: "success.50" }}>
                    <Typography variant="overline" color="success.main">אחרי המרה (סופר-פארם)</Typography>
                    <Stack spacing={0.3} sx={{ mt: 0.5 }}>
                      <Typography variant="body2"><b>{t.pilot.columns.currentPrice}:</b> {fmtCurr(round2((p.price ?? 0) + (p.pickup_cost ?? 0)))}</Typography>
                      <Typography variant="body2"><b>{t.pilot.columns.strikePrice}:</b> {fmtCurr(Math.round(((p.price ?? 0) + (p.pickup_cost ?? 0) + 39) * 1.15))}</Typography>
                      <Typography variant="body2"><b>{t.pilot.columns.shippingCost}:</b> ₪39</Typography>
                    </Stack>
                  </Paper>
                </Stack>
              </CardContent>
              <CardActions sx={{ px: 2, pb: 2, justifyContent: "space-between" }}>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    startIcon={<TransformIcon />}
                    variant="contained"
                    disabled={transformBusyId !== null || p.pilot_status !== "approved_for_pilot"}
                    onClick={() => runTransform(p.id)}
                  >
                    {transformBusyId === p.id ? "מעבד…" : t.pilot.actions.runTransform}
                  </Button>
                  <Tooltip title={t.pilot.actions.openInHaContainer}>
                    <span>
                      <IconButton size="small" component="a" href={p.hacontainer_url ?? "#"} target="_blank" disabled={!p.hacontainer_url}><ExtIcon fontSize="small" /></IconButton>
                    </span>
                  </Tooltip>
                </Stack>
                <Tooltip title={t.pilot.actions.removeFromPilot}>
                  <IconButton size="small" color="error" onClick={() => removeFromPilot(p.id)}><RemoveIcon fontSize="small" /></IconButton>
                </Tooltip>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    </PageFrame>
  );
}
