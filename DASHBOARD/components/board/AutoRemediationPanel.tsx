"use client";

/**
 * Self-contained dashboard panel for the SP merchandiser-rejection
 * auto-remediation pipeline.
 *
 *   1. Upload XLSX (Error Details sheet) → ingest into remediation_queue
 *   2. Press "תקן הכל ושלח מחדש" → orchestrator runs per inv_id, fans out
 *      to the image / text / category / attribute fixers, retriggers PM01
 *   3. Live counts (poll every 5 s while a run is in flight) so the user
 *      sees progress without refreshing.
 */
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import {
  AutoFixHigh as RemediateIcon,
  CloudUpload as UploadIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { CountChip, KpiCard, SectionPanel } from "@/components/shared";

type Counts = Record<string, number>;
const fmt = new Intl.NumberFormat("he-IL");

interface RemediateResponse {
  ok: boolean;
  processed?: number;
  fixed?: number;
  manual_required?: number;
  failed?: number;
  pm01?: { sku_count?: number; sync_job_id?: string | null; error?: string } | null;
  error?: string;
  elapsed_s?: number;
  note?: string;
}

interface IngestResponse {
  ok: boolean;
  upserted?: number;
  valid?: number;
  skipped_no_sku?: number;
  skipped_unknown_inv_id?: number;
  distinct_inv_ids?: number;
  error?: string;
}

const total = (c: Counts): number =>
  Object.values(c).reduce((a, b) => a + b, 0);

export const AutoRemediationPanel = () => {
  const [counts, setCounts] = useState<Counts>({});
  const [busy, setBusy] = useState<"ingest" | "remediate" | null>(null);
  const [lastRun, setLastRun] = useState<RemediateResponse | null>(null);
  const [lastIngest, setLastIngest] = useState<IngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    try {
      const r = await fetch("/api/sync/superpharm/remediate", { method: "GET" });
      const j = (await r.json()) as { ok?: boolean; counts?: Counts; error?: string };
      if (j.ok && j.counts) setCounts(j.counts);
    } catch {
      /* silent — periodic refresh */
    }
  };

  useEffect(() => {
    refresh();
    const id = window.setInterval(() => {
      if (busy) refresh();
    }, 5000);
    return () => window.clearInterval(id);
  }, [busy]);

  const handleIngest = async (file: File) => {
    setBusy("ingest");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/sync/superpharm/remediate/ingest", {
        method: "POST",
        body: fd,
      });
      const j = (await res.json()) as IngestResponse;
      setLastIngest(j);
      if (!j.ok) setError(j.error ?? "ingest failed");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemediate = async () => {
    setBusy("remediate");
    setError(null);
    try {
      const res = await fetch("/api/sync/superpharm/remediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger_pm01: true, limit: 200 }),
      });
      const j = (await res.json()) as RemediateResponse;
      setLastRun(j);
      if (!j.ok) setError(j.error ?? "remediation failed");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const pending = counts.pending ?? 0;
  const fixing = counts.fixing ?? 0;
  const fixed = counts.fixed ?? 0;
  const manual = counts.manual_required ?? 0;
  const failed = counts.failed ?? 0;
  const queueTotal = total(counts);

  return (
    <SectionPanel
      title="תיקון אוטומטי לכל הכושלים"
      subtitle="תיקון תמונות / תיאור / שם / קטגוריה / תכונות + שליחה מחדש בלחיצה אחת"
    >
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}

        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(5, 1fr)" },
          }}
        >
          <KpiCard label="ממתין" value={pending} color="primary" />
          <KpiCard label="בתיקון" value={fixing} color="info" />
          <KpiCard label="תוקן" value={fixed} color="success" />
          <KpiCard label="דורש ידנית" value={manual} color="warning" />
          <KpiCard label="נכשל" value={failed} color="error" />
        </Box>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems="center">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleIngest(f);
            }}
          />
          <Button
            variant="outlined"
            startIcon={busy === "ingest" ? <CircularProgress size={16} /> : <UploadIcon />}
            disabled={busy !== null}
            onClick={() => fileRef.current?.click()}
          >
            ייבא XLSX שגיאות
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={busy === "remediate" ? <CircularProgress size={16} color="inherit" /> : <RemediateIcon />}
            disabled={busy !== null || pending === 0}
            onClick={() => void handleRemediate()}
            sx={{ minHeight: 48, fontWeight: 700 }}
          >
            תקן הכל ושלח מחדש ({fmt.format(pending)})
          </Button>
          <Button
            variant="text"
            startIcon={<RefreshIcon />}
            disabled={busy !== null}
            onClick={() => void refresh()}
          >
            רענן
          </Button>
          {queueTotal > 0 && <CountChip label={`סה״כ בתור: ${fmt.format(queueTotal)}`} />}
        </Stack>

        {lastIngest && lastIngest.ok && (
          <Typography variant="body2" color="text.secondary">
            ייבוא אחרון: {fmt.format(lastIngest.upserted ?? 0)} שגיאות נטענו
            ({fmt.format(lastIngest.distinct_inv_ids ?? 0)} מוצרים מובחנים)
            {lastIngest.skipped_unknown_inv_id ? `, ${fmt.format(lastIngest.skipped_unknown_inv_id)} דולגו (inv_id לא מוכר)` : ""}
          </Typography>
        )}

        {lastRun && lastRun.ok && (
          <Alert severity={lastRun.failed ? "warning" : "success"}>
            ריצה אחרונה: {fmt.format(lastRun.processed ?? 0)} עובדו · תוקן {fmt.format(lastRun.fixed ?? 0)} · ידני {fmt.format(lastRun.manual_required ?? 0)} · נכשל {fmt.format(lastRun.failed ?? 0)}
            {lastRun.pm01?.sync_job_id ? ` · PM01 נשלח (${fmt.format(lastRun.pm01.sku_count ?? 0)} מוצרים)` : ""}
            {lastRun.pm01?.error ? ` · שגיאת PM01: ${lastRun.pm01.error}` : ""}
            {typeof lastRun.elapsed_s === "number" ? ` · ${lastRun.elapsed_s}s` : ""}
          </Alert>
        )}
      </Stack>
    </SectionPanel>
  );
};
