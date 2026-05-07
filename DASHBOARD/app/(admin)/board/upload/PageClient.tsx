"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import {
  Add as AddIcon,
  CloudUpload as UploadIcon,
  Refresh as RefreshIcon,
  RemoveCircle as RemoveIcon,
  ExpandMore as ExpandMoreIcon,
  Code as TechIcon,
  CheckCircle as DoneIcon,
  ErrorOutline as ErrorIcon,
  SelectAll as SelectAllIcon,
  ClearAll as ClearAllIcon,
} from "@mui/icons-material";
import { useNotification, useUpdate } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import {
  BoardShell,
  ChannelSelector,
  JobStatusTimeline,
  PricingPreview,
  ValidationChecklist,
  type ChannelKey,
  type JobSummary,
  type ValidationItem,
} from "@/components/board";
import { ImageThumb, SectionHeader, StatChip } from "@/components/shared";
import Pm01ReadinessDrawer, { type ValidationRow } from "@/components/board/Pm01ReadinessDrawer";
import { SingleProductUploadDialog } from "@/components/products/SingleProductUploadDialog";
import { supabaseDataClient } from "@/utils/supabase/client";

/* -----------------------  shared types  ----------------------- */

type UploadRow = {
  id: number; // inventory_id
  match_id?: number | null;
  name_he: string | null;
  brand: string | null;
  category: string | null;
  ean: string | null;
  hacontainer_url: string | null;
  image: string | null;
  price: number | null;
  pickup_cost: number | null;
  pilot_status: string | null;
  /** "missing" — never uploaded yet, "queue" — actively in pilot pipeline, "done" — already uploaded/rejected */
  bucket: "missing" | "queue" | "done";
};

type CompRow = {
  match_id: number;
  inventory_id: number;
  name_he: string | null;
  inv_brand: string | null;
  inv_category: string | null;
  inv_ean: string | null;
  inv_thumb: string | null;
  inv_price: number | null;
  inv_pickup_cost: number | null;
  pilot_status: string | null;
  hacontainer_url: string | null;
  verdict: string | null;
};

type InvRow = {
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

/* -----------------------  status mapping  ----------------------- */

const PIPELINE_STATUSES = [
  "approved_for_pilot",
  "transformed",
  "pending_catalog",
  "catalog_synced",
  "uploading",
  "uploaded",
] as const;

// Plain-language labels — no PM01/OF01/Mirakl jargon.
const STATUS_LABEL: Record<string, string> = {
  missing: "ממתין להעלאה",
  approved_for_pilot: "מוכן להעלאה",
  transformed: "מוכן להעלאה",
  pending_catalog: "בתהליך — נוצר בסופר-פארם",
  catalog_synced: "בתהליך — מחכה לפרסום",
  uploading: "בתהליך — נשלח לסופר-פארם",
  uploaded: "הועלה",
  rejected: "נכשל",
};

const STATUS_COLOR: Record<string, "default" | "primary" | "success" | "warning" | "error" | "info"> = {
  missing: "warning",
  approved_for_pilot: "primary",
  transformed: "primary",
  pending_catalog: "info",
  catalog_synced: "info",
  uploading: "info",
  uploaded: "success",
  rejected: "error",
};

interface PushDryResponse {
  ok?: boolean;
  eligible?: number;
  /** Rows that need PM01 (catalog create) before OF01 can run. PM01 is
   *  dispatched in the real (non-dry) push; on dry runs it is reported
   *  here so the UI can show "X will be created in catalog first" and
   *  enable the upload button accordingly. */
  needs_pm01_count?: number;
  blocked_by_priceFor?: number;
  blocked_by_duplicate?: number;
  blocked_by_catalog?: number;
  rejected?: { sku: string; errors: string[] }[];
  error?: string;
}

interface PushResponse {
  ok?: boolean;
  import_id?: string | number;
  sku_count?: number;
  rejected?: { sku: string; errors: string[] }[];
  error?: string;
  pm01_dispatched_count?: number;
  pm01_sync_job_id?: string | null;
  sync_job_id?: string | null;
}

interface CheckResponse {
  ok?: boolean;
  checked?: number;
  summary?: JobSummary[];
  error?: string;
}

const PAGE_SIZE = 60;

export default function BoardUpload() {
  const params = useSearchParams();
  const initialIds = useMemo(() => {
    const raw = params.get("ids");
    if (!raw) return [] as number[];
    return raw
      .split(",")
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0);
  }, [params]);

  const [filter, setFilter] = useState<"all" | "ready" | "in_progress" | "done" | "last_failed">("ready");

  /** PM01 readiness drawer — open per-row to fix missing fields. */
  const [readinessId, setReadinessId] = useState<number | null>(null);
  const [readinessRow, setReadinessRow] = useState<ValidationRow | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  const openReadiness = async (id: number) => {
    setReadinessId(id);
    setReadinessRow(null);
    setReadinessLoading(true);
    try {
      const res = await fetch("/api/sync/superpharm/pm01/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      const j = (await res.json().catch(() => ({}))) as { rows?: ValidationRow[] };
      setReadinessRow(j.rows?.[0] ?? null);
    } finally {
      setReadinessLoading(false);
    }
  };
  const closeReadiness = () => {
    setReadinessId(null);
    setReadinessRow(null);
  };
  const onReadinessSaved = () => {
    // Re-pull the lists so the row reflects the new values immediately.
    refetch();
  };
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [channel, setChannel] = useState<ChannelKey>("superpharm");
  const [selection, setSelection] = useState<Set<number>>(() => new Set(initialIds));
  const [singleDialogOpen, setSingleDialogOpen] = useState(false);

  /* --- 0) "last failed PM01" marker — set of inv ids the last big batch
         couldn't validate (e.g. missing required attributes). Used by the
         "כשלון בהעלאה האחרונה" filter so the operator can re-run only those. */
  const { data: lastFailedIds } = useQuery<Set<number>>({
    queryKey: ["board-upload-last-failed"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabaseDataClient
        .from("sync_jobs")
        .select("payload")
        .eq("type", "superpharm_pm01_failed_marker")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const arr =
        ((data?.payload as { failed_inv_ids?: number[] } | null)?.failed_inv_ids) ?? [];
      return new Set(arr);
    },
  });

  /* --- 1) ready bucket: catalog_matches.verdict='missing' (paginated past
         PostgREST 1000-row cap via .range loop) --- */
  const { data: missingData, isFetching: missingFetching, refetch: refetchMissing } = useQuery<CompRow[]>({
    queryKey: ["board-upload-missing"],
    staleTime: 30_000,
    queryFn: async () => {
      const all: CompRow[] = [];
      const CHUNK = 1000;
      for (let offset = 0; offset < 20_000; offset += CHUNK) {
        const { data, error } = await supabaseDataClient
          .from("v_comparison")
          .select(
            "match_id,inventory_id,name_he,inv_brand,inv_category,inv_ean,inv_thumb,inv_price,inv_pickup_cost,pilot_status,hacontainer_url,verdict",
          )
          .eq("verdict", "missing")
          .or("pilot_status.is.null,pilot_status.in.(imported,draft,ignored,exists_in_sp)")
          .order("match_id", { ascending: true })
          .range(offset, offset + CHUNK - 1);
        if (error) throw error;
        const rows = (data ?? []) as CompRow[];
        all.push(...rows);
        if (rows.length < CHUNK) break;
      }
      return all;
    },
  });

  /* --- 2) pipeline bucket: inventory.pilot_status IN active list (paginated) --- */
  const { data: pipelineData, isFetching: pipelineFetching, refetch: refetchPipeline } = useQuery<InvRow[]>({
    queryKey: ["board-upload-pipeline"],
    staleTime: 30_000,
    queryFn: async () => {
      const all: InvRow[] = [];
      const CHUNK = 1000;
      for (let offset = 0; offset < 20_000; offset += CHUNK) {
        const { data, error } = await supabaseDataClient
          .from("inventory")
          .select(
            "id,name_he,brand,category,ean,hacontainer_url,images,price,pickup_cost,pilot_status",
          )
          .in("pilot_status", PIPELINE_STATUSES as unknown as string[])
          .order("id", { ascending: false })
          .range(offset, offset + CHUNK - 1);
        if (error) throw error;
        const rows = (data ?? []) as InvRow[];
        all.push(...rows);
        if (rows.length < CHUNK) break;
      }
      return all;
    },
  });

  const refetch = () => {
    refetchMissing();
    refetchPipeline();
  };

  const allRows: UploadRow[] = useMemo(() => {
    const out: UploadRow[] = [];
    const seen = new Set<number>();

    for (const r of (pipelineData ?? []) as InvRow[]) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      const status = r.pilot_status ?? "";
      out.push({
        id: r.id,
        name_he: r.name_he,
        brand: r.brand,
        category: r.category,
        ean: r.ean,
        hacontainer_url: r.hacontainer_url,
        image: r.images?.[0] ?? null,
        price: r.price,
        pickup_cost: r.pickup_cost,
        pilot_status: status,
        bucket: status === "uploaded" || status === "rejected" ? "done" : "queue",
      });
    }

    for (const r of (missingData ?? []) as CompRow[]) {
      if (seen.has(r.inventory_id)) continue;
      seen.add(r.inventory_id);
      out.push({
        id: r.inventory_id,
        match_id: r.match_id,
        name_he: r.name_he,
        brand: r.inv_brand,
        category: r.inv_category,
        ean: r.inv_ean,
        hacontainer_url: r.hacontainer_url,
        image: r.inv_thumb,
        price: r.inv_price,
        pickup_cost: r.inv_pickup_cost,
        pilot_status: r.pilot_status ?? "missing",
        bucket: "missing",
      });
    }
    return out;
  }, [missingData, pipelineData]);

  const counts = useMemo(() => {
    let ready = 0;
    let inProgress = 0;
    let done = 0;
    for (const r of allRows) {
      if (r.bucket === "missing") ready++;
      else if (r.bucket === "queue") {
        if (r.pilot_status === "approved_for_pilot" || r.pilot_status === "transformed") ready++;
        else inProgress++;
      } else done++;
    }
    return { ready, inProgress, done, total: allRows.length };
  }, [allRows]);

  const filteredRows = useMemo(() => {
    let list = allRows;
    if (filter === "ready") {
      list = list.filter(
        (r) =>
          r.bucket === "missing" ||
          r.pilot_status === "approved_for_pilot" ||
          r.pilot_status === "transformed",
      );
    } else if (filter === "in_progress") {
      list = list.filter((r) => r.bucket === "queue" && r.pilot_status !== "approved_for_pilot" && r.pilot_status !== "transformed");
    } else if (filter === "done") {
      list = list.filter((r) => r.bucket === "done");
    } else if (filter === "last_failed") {
      const ids = lastFailedIds ?? new Set<number>();
      list = list.filter((r) => ids.has(r.id));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => {
        const hay = `${r.name_he ?? ""} ${r.brand ?? ""} ${r.ean ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [allRows, filter, search, lastFailedIds]);

  const pagedRows = useMemo(
    () => filteredRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [filteredRows, page],
  );

  // Reset page when filter / search changes.
  useEffect(() => {
    setPage(0);
  }, [filter, search]);

  // Cap selection to currently-loaded ids.
  useEffect(() => {
    if (allRows.length === 0) return;
    const valid = new Set(allRows.map((r) => r.id));
    setSelection((prev) => {
      const next = new Set<number>();
      for (const id of prev) if (valid.has(id)) next.add(id);
      return next;
    });
  }, [allRows]);

  // Apply incoming ?ids=… once the data is populated.
  const [appliedInitial, setAppliedInitial] = useState(false);
  useEffect(() => {
    if (appliedInitial || initialIds.length === 0 || allRows.length === 0) return;
    const valid = new Set(allRows.map((r) => r.id));
    const next = new Set<number>(initialIds.filter((id) => valid.has(id)));
    if (next.size > 0) setSelection(next);
    setAppliedInitial(true);
  }, [initialIds, allRows, appliedInitial]);

  const { mutate: updateInv } = useUpdate();
  const { open } = useNotification();

  const removeFromQueue = (id: number) =>
    updateInv(
      { resource: "inventory", id, values: { pilot_status: "ignored" } },
      {
        onSuccess: () => {
          open?.({ type: "success", message: "הוסר מתור ההעלאה" });
          refetch();
          setSelection((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
      },
    );

  const toggleSelect = (id: number) =>
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAllVisible = () => {
    setSelection((prev) => {
      const next = new Set(prev);
      for (const r of filteredRows) {
        if (r.bucket !== "done") next.add(r.id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelection(new Set());

  const selectedRows = useMemo(
    () => allRows.filter((r) => selection.has(r.id)),
    [allRows, selection],
  );

  /* -----------------------  validation preview  ----------------------- */

  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<PushDryResponse | null>(null);

  const validationItems: ValidationItem[] = useMemo(() => {
    const items: ValidationItem[] = [];
    if (selection.size === 0) {
      items.push({ kind: "info", message: "בחרו מוצר אחד או יותר כדי להמשיך" });
      return items;
    }
    if (channel !== "superpharm") {
      items.push({
        kind: "info",
        message: "ערוץ זה לא פעיל עדיין",
        hint: "כרגע פעיל סופר-פארם בלבד.",
      });
    }
    let missingEan = 0;
    let missingPrice = 0;
    let missingImage = 0;
    for (const r of selectedRows) {
      if (!r.ean) missingEan++;
      if (!r.price || r.price <= 0) missingPrice++;
      if (!r.image) missingImage++;
    }
    if (missingPrice > 0)
      items.push({ kind: "fail", message: `${missingPrice} מוצרים ללא מחיר תקין`, hint: "אי אפשר להעלות ללא מחיר חיובי." });
    if (missingEan > 0)
      items.push({
        kind: "warn",
        message: `${missingEan} מוצרים ללא ברקוד`,
        hint: "המערכת תייצר ברקוד פנימי, אך מומלץ להזין ברקוד אמיתי לפני העלאה.",
      });
    if (missingImage > 0)
      items.push({ kind: "warn", message: `${missingImage} מוצרים ללא תמונה`, hint: "מומלץ להוסיף לפחות תמונה אחת לפני העלאה." });

    if (preview) {
      if (preview.eligible)
        items.push({ kind: "pass", message: `${fmt.format(preview.eligible)} מוצרים עוברים את כל הבדיקות` });
      if ((preview.needs_pm01_count ?? 0) > 0)
        items.push({
          kind: "pass",
          message: `${fmt.format(preview.needs_pm01_count ?? 0)} מוצרים ייווצרו תחילה בקטלוג סופר-פארם`,
          hint: "המערכת תיצור אותם דרך PM01 ותפרסם את ההצעה אוטומטית אחרי שהקטלוג יסתיים.",
        });
      if ((preview.blocked_by_priceFor ?? 0) > 0)
        items.push({
          kind: "fail",
          message: `${fmt.format(preview.blocked_by_priceFor ?? 0)} מוצרים נכשלו בבדיקת תמחור`,
          hint: "בדקו מחיר, תיאור או קטגוריה לפני העלאה.",
        });
      if ((preview.blocked_by_duplicate ?? 0) > 0)
        items.push({
          kind: "warn",
          message: `${fmt.format(preview.blocked_by_duplicate ?? 0)} כפולים בסופר-פארם`,
          hint: "המוצרים האלה כבר קיימים — לא יועלו כדי לא ליצור כפילות.",
        });
      if ((preview.blocked_by_catalog ?? 0) > 0)
        items.push({
          kind: "info",
          message: `${fmt.format(preview.blocked_by_catalog ?? 0)} ייווצרו תחילה בסופר-פארם`,
          hint: "התהליך אוטומטי — ההצעה תפורסם אחרי שהמוצר ייווצר.",
        });
      if ((preview.rejected?.length ?? 0) > 0)
        items.push({
          kind: "fail",
          message: `${preview.rejected!.length} מוצרים נדחו`,
          hint: preview.rejected!.slice(0, 3).map((r) => `${r.sku}: ${r.errors.join(", ")}`).join(" · "),
        });
    }
    return items;
  }, [selection, selectedRows, preview, channel]);

  const runDryRun = async () => {
    if (selection.size === 0) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const ids = Array.from(selection);
      const res = await fetch("/api/sync/superpharm/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "by_ids", ids, dry: true }),
      });
      const json: PushDryResponse = await res.json().catch(() => ({}));
      setPreview(json);
    } catch (e) {
      open?.({ type: "error", message: `בדיקה נכשלה: ${(e as Error).message}` });
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Re-run dry-run on selection / channel change (debounced).
  useEffect(() => {
    if (selection.size === 0) {
      setPreview(null);
      return;
    }
    const handle = setTimeout(() => runDryRun(), 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, channel]);

  /* -----------------------  push  ----------------------- */

  const [pushBusy, setPushBusy] = useState(false);
  const [pushDialog, setPushDialog] = useState(false);
  const [activeImportId, setActiveImportId] = useState<string | number | null>(null);
  const [activeJobs, setActiveJobs] = useState<JobSummary[]>([]);
  const [pollBusy, setPollBusy] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const runPush = async () => {
    if (selection.size === 0) return;
    if (channel !== "superpharm") {
      open?.({ type: "error", message: "ערוץ זה לא זמין עדיין" });
      return;
    }
    setPushBusy(true);
    try {
      const ids = Array.from(selection);
      const res = await fetch("/api/sync/superpharm/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "by_ids", ids }),
      });
      const json: PushResponse = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        open?.({ type: "error", message: `העלאה נכשלה: ${json.error ?? res.statusText}` });
        return;
      }
      const ofCount = json.sku_count ?? 0;
      const pmCount = json.pm01_dispatched_count ?? 0;
      const parts: string[] = [];
      if (ofCount > 0) parts.push(`${ofCount} מוצרים נשלחו לסופר-פארם`);
      if (pmCount > 0) parts.push(`${pmCount} מוצרים ייווצרו תחילה בסופר-פארם`);
      if (parts.length === 0) parts.push("אין מוצרים זמינים להעלאה");
      open?.({ type: "success", message: parts.join(" · ") });
      setActiveImportId(json.import_id ?? null);
      setPushDialog(false);
      setSelection(new Set());
      refetch();
    } catch (e) {
      open?.({ type: "error", message: `שגיאת רשת: ${(e as Error).message}` });
    } finally {
      setPushBusy(false);
    }
  };

  const checkStatus = async () => {
    if (pollBusy) return;
    setPollBusy(true);
    try {
      const res = await fetch("/api/sync/superpharm/check", { method: "POST" });
      const json: CheckResponse = await res.json().catch(() => ({}));
      if (json.ok) {
        const summary = json.summary ?? [];
        setActiveJobs(summary);
        setLastChecked(new Date());
        const promoted = summary.reduce((a, s) => a + (s.promoted_inv ?? 0), 0);
        const rolled = summary.reduce((a, s) => a + (s.rolled_back_inv ?? 0), 0);
        const checked = json.checked ?? 0;
        const parts = [`נבדקו ${checked} משימות`];
        if (promoted) parts.push(`${promoted} קודמו`);
        if (rolled) parts.push(`${rolled} הוחזרו`);
        open?.({ type: "success", message: parts.join(" · ") });
        refetch();
      } else {
        open?.({ type: "error", message: json.error ?? "בדיקה נכשלה" });
      }
    } catch (e) {
      open?.({ type: "error", message: `שגיאת רשת: ${(e as Error).message}` });
    } finally {
      setPollBusy(false);
    }
  };

  const eligible = preview?.eligible ?? 0;
  const needsPm01 = preview?.needs_pm01_count ?? 0;
  /** Total rows the click will dispatch — OF01-eligible right now PLUS rows
   *  that will be created in catalog first. Used to enable/disable the button
   *  and show the count on the CTA. */
  const dispatchableTotal = eligible + needsPm01;
  const blocked = (preview?.blocked_by_priceFor ?? 0) + (preview?.blocked_by_duplicate ?? 0);

  const isLoadingList = missingFetching || pipelineFetching;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  return (
    <BoardShell
      eyebrow="העלאת מוצרים"
      title="בחרו מוצרים → לחצו 'העלה'"
      description="המערכת מטפלת ביצירה בסופר-פארם, בפרסום ההצעה ובמעקב אחר הסטטוס. אין צורך לעבור בין מסכים."
      actions={
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => setSingleDialogOpen(true)}
            sx={{ minHeight: 40, fontWeight: 600 }}
          >
            העלאת מוצר חדש
          </Button>
          <Tooltip title="רענן רשימה">
            <span>
              <IconButton onClick={refetch} disabled={isLoadingList}>
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      }
    >
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip
          label={`הכל (${fmt.format(counts.total)})`}
          onClick={() => setFilter("all")}
          color={filter === "all" ? "primary" : "default"}
          variant={filter === "all" ? "filled" : "outlined"}
          sx={{ height: 32 }}
        />
        <Chip
          label={`מוכנים להעלאה (${fmt.format(counts.ready)})`}
          onClick={() => setFilter("ready")}
          color={filter === "ready" ? "primary" : "default"}
          variant={filter === "ready" ? "filled" : "outlined"}
          sx={{ height: 32 }}
        />
        <Chip
          label={`בתהליך (${fmt.format(counts.inProgress)})`}
          onClick={() => setFilter("in_progress")}
          color={filter === "in_progress" ? "info" : "default"}
          variant={filter === "in_progress" ? "filled" : "outlined"}
          sx={{ height: 32 }}
        />
        <Chip
          label={`הועלו / נכשלו (${fmt.format(counts.done)})`}
          onClick={() => setFilter("done")}
          color={filter === "done" ? "success" : "default"}
          variant={filter === "done" ? "filled" : "outlined"}
          sx={{ height: 32 }}
        />
        {(lastFailedIds?.size ?? 0) > 0 && (
          <Tooltip title="המוצרים מהבאצ' האחרון שנדחו ע״י Mirakl (חסר attribute חובה וכד'). העלה מחדש אחרי תיקון.">
            <Chip
              label={`כשלון בהעלאה האחרונה (${fmt.format(lastFailedIds!.size)})`}
              onClick={() => setFilter("last_failed")}
              color={filter === "last_failed" ? "error" : "default"}
              variant={filter === "last_failed" ? "filled" : "outlined"}
              sx={{ height: 32 }}
            />
          </Tooltip>
        )}
      </Stack>

      {/* Action card */}
      <Card variant="outlined" sx={{ backgroundImage: "none" }}>
        <CardContent sx={{ p: { xs: 2, md: 2.4 } }}>
          <Stack spacing={2.5}>
            <SectionHeader
              title="תהליך ההעלאה"
              subtitle="בחרו ערוץ, סקרו את הבדיקה ולחצו 'העלה מוצרים'"
              actions={
                <Stack direction="row" spacing={1.2} flexWrap="wrap" useFlexGap>
                  <StatChip label="נבחרו" value={selection.size} tone="primary" />
                  <StatChip label="עוברים בדיקה" value={eligible} tone="success" />
                  <StatChip label="חסומים" value={blocked} tone="warning" />
                </Stack>
              }
            />

            <Grid container spacing={3}>
              <Grid item xs={12} md={5}>
                <ChannelSelector value={channel} onChange={setChannel} />
              </Grid>
              <Grid item xs={12} md={7}>
                <Stack spacing={1}>
                  <Typography variant="overline" color="text.secondary">
                    בדיקה לפני שליחה
                  </Typography>
                  {previewLoading ? (
                    <Skeleton variant="rounded" height={92} />
                  ) : (
                    <ValidationChecklist items={validationItems} emptyLabel="בחרו מוצרים כדי לראות את תוצאות הבדיקה" />
                  )}
                </Stack>
              </Grid>
            </Grid>

            <Stack
              direction={{ xs: "column", md: "row" }}
              alignItems={{ xs: "stretch", md: "center" }}
              justifyContent="space-between"
              spacing={2}
            >
              <Typography variant="body2" color="text.secondary">
                {selection.size > 0
                  ? `יישלחו ${fmt.format(dispatchableTotal || selection.size)} מוצרים. הבחירה מתעדכנת בזמן אמת.`
                  : "סמנו מוצרים מהרשימה למטה כדי להתחיל."}
              </Typography>
              <Button
                size="large"
                variant="contained"
                color="primary"
                startIcon={<UploadIcon />}
                disabled={selection.size === 0 || pushBusy || channel !== "superpharm" || (preview != null && dispatchableTotal === 0)}
                onClick={() => setPushDialog(true)}
                sx={{ minHeight: 52, px: 3, fontSize: 16, fontWeight: 800 }}
              >
                העלה מוצרים
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Status check + active jobs */}
      <Card variant="outlined" sx={{ backgroundImage: "none" }}>
        <CardContent>
          <SectionHeader
            title="מעקב סטטוס"
            subtitle={
              activeImportId
                ? `מזהה משלוח: ${activeImportId}`
                : lastChecked
                  ? `בדיקה אחרונה: ${lastChecked.toLocaleTimeString("he-IL")}`
                  : "לא מתבצע מעקב אוטומטי. לחצו 'בדוק סטטוס' אחרי העלאה."
            }
            actions={
              <Button
                variant="contained"
                color="secondary"
                onClick={checkStatus}
                disabled={pollBusy}
                startIcon={pollBusy ? <CircularProgress size={14} /> : <RefreshIcon />}
              >
                {pollBusy ? "בודק…" : "בדוק סטטוס"}
              </Button>
            }
          />
          <Box sx={{ mt: 2 }}>
            <JobStatusTimeline jobs={activeJobs} />
          </Box>
        </CardContent>
      </Card>

      {/* Product list */}
      <SectionHeader
        title={`רשימת מוצרים (${fmt.format(filteredRows.length)})`}
        subtitle={selection.size > 0 ? `${selection.size} נבחרו` : "סמנו את המוצרים שתרצו להעלות"}
        actions={
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button size="small" variant="outlined" startIcon={<SelectAllIcon />} onClick={selectAllVisible}>
              בחר הכל
            </Button>
            <Button size="small" variant="text" startIcon={<ClearAllIcon />} onClick={clearSelection} disabled={selection.size === 0}>
              נקה בחירה
            </Button>
          </Stack>
        }
      />

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems="center">
        <TextField
          size="small"
          placeholder="חפש לפי שם, מותג או ברקוד…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, minWidth: 240 }}
        />
        <TextField
          select
          size="small"
          label="עמוד"
          value={page}
          onChange={(e) => setPage(Number(e.target.value))}
          sx={{ minWidth: 130 }}
        >
          {Array.from({ length: totalPages }).map((_, i) => (
            <MenuItem key={i} value={i}>
              {i + 1} / {totalPages}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {filteredRows.length === 0 && !isLoadingList && (
        <Alert severity="info">
          {filter === "ready"
            ? "אין מוצרים מוכנים להעלאה. בדקו את לוח הקטלוג כדי לסמן מוצרים חסרים."
            : "אין מוצרים בסטטוס זה."}
        </Alert>
      )}

      <Grid container spacing={2}>
        {isLoadingList && filteredRows.length === 0 &&
          Array.from({ length: 6 }).map((_, i) => (
            <Grid item xs={12} md={6} xl={4} key={i}>
              <Skeleton variant="rounded" height={220} />
            </Grid>
          ))}
        {pagedRows.map((p) => {
          const checked = selection.has(p.id);
          const isDone = p.bucket === "done";
          const status = p.pilot_status ?? "missing";
          return (
            <Grid item xs={12} md={6} xl={4} key={p.id}>
              <Card
                variant="outlined"
                onClick={() => !isDone && toggleSelect(p.id)}
                sx={(theme) => ({
                  cursor: isDone ? "default" : "pointer",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  borderColor: checked ? theme.palette.primary.main : alpha(theme.palette.text.primary, 0.1),
                  bgcolor: checked ? alpha(theme.palette.primary.main, 0.04) : "transparent",
                  backgroundImage: "none",
                  transition: "border-color 160ms ease, background-color 160ms ease, transform 160ms ease",
                  "&:hover": isDone
                    ? undefined
                    : { transform: "translateY(-1px)", borderColor: alpha(theme.palette.primary.main, 0.6) },
                })}
              >
                <Box sx={{ p: 2, display: "flex", gap: 2 }}>
                  {!isDone && (
                    <Checkbox
                      checked={checked}
                      onChange={() => toggleSelect(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      sx={{ alignSelf: "flex-start", p: 0.5 }}
                    />
                  )}
                  <ImageThumb src={p.image} size={92} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 900, lineHeight: 1.2 }}>
                      {p.name_he ?? "—"}
                    </Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.6 }}>
                      {p.brand && <Chip size="small" label={p.brand} variant="outlined" />}
                      {p.category && <Chip size="small" label={p.category} />}
                      <Chip
                        size="small"
                        color={STATUS_COLOR[status] ?? "default"}
                        label={STATUS_LABEL[status] ?? status}
                      />
                    </Stack>
                    {p.ean && (
                      <Typography variant="caption" sx={{ direction: "ltr", display: "block", mt: 0.6 }}>
                        EAN: {p.ean}
                      </Typography>
                    )}
                  </Box>
                </Box>
                <CardContent sx={{ pt: 0, flex: 1 }}>
                  <PricingPreview product={{ base_price: p.price, pickup_cost: p.pickup_cost }} variant="strip" />
                </CardContent>
                <CardActions sx={{ px: 2, pb: 2, justifyContent: "flex-end", gap: 1 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={(e) => {
                      e.stopPropagation();
                      openReadiness(p.id);
                    }}
                  >
                    בדוק / השלם נתונים
                  </Button>
                  <Tooltip title="הסר מתור ההעלאה">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromQueue(p.id);
                      }}
                    >
                      <RemoveIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </CardActions>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {totalPages > 1 && (
        <Stack direction="row" justifyContent="center" spacing={1.5} alignItems="center" sx={{ mt: 2 }}>
          <Button size="small" variant="outlined" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            הקודם
          </Button>
          <Typography variant="caption" color="text.secondary">
            עמוד {page + 1} מתוך {totalPages}
          </Typography>
          <Button size="small" variant="outlined" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
            הבא
          </Button>
        </Stack>
      )}

      <Accordion variant="outlined" sx={{ backgroundImage: "none", "&:before": { display: "none" } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} alignItems="center">
            <TechIcon fontSize="small" />
            <Typography variant="subtitle2">פרטים טכניים</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1.4}>
            <Typography variant="body2" color="text.secondary">
              העלאה לסופר-פארם בנויה משני שלבים אוטומטיים מאחורי הקלעים:
            </Typography>
            <ul style={{ paddingInlineStart: 18, marginBlock: 0 }}>
              <li>
                <Typography variant="body2">
                  <strong>יצירה בקטלוג סופר-פארם (PM01)</strong> — מוצר חדש שלא קיים שם נוצר אוטומטית.
                </Typography>
              </li>
              <li>
                <Typography variant="body2">
                  <strong>פרסום הצעה (OF01)</strong> — מחיר, מלאי, משלוח. רץ אוטומטית אחרי שהמוצר נוצר.
                </Typography>
              </li>
            </ul>
            <Typography variant="caption" color="text.secondary">
              הסטטוס של המשימות לא מתעדכן אוטומטית. לחצו "בדוק סטטוס" כדי למשוך עדכונים מ-Mirakl.
            </Typography>
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Confirmation dialog */}
      <Dialog open={pushDialog} onClose={() => !pushBusy && setPushDialog(false)} dir="rtl" maxWidth="sm" fullWidth>
        <DialogTitle>אישור העלאה</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography>
              {selection.size > 0
                ? `יישלחו ${fmt.format(dispatchableTotal || selection.size)} מוצרים לסופר-פארם.`
                : "אין מוצרים נבחרים."}
            </Typography>
            {needsPm01 > 0 && (
              <Alert severity="info">
                {fmt.format(needsPm01)} מוצרים ייווצרו תחילה בקטלוג סופר-פארם (PM01), ואז ההצעה תפורסם אוטומטית.
              </Alert>
            )}
            {(preview?.blocked_by_duplicate ?? 0) + (preview?.blocked_by_priceFor ?? 0) > 0 && (
              <Alert severity="warning" icon={<ErrorIcon fontSize="small" />}>
                {fmt.format((preview?.blocked_by_duplicate ?? 0) + (preview?.blocked_by_priceFor ?? 0))} מוצרים לא ייכללו
                (כפולים / נכשלו בבדיקת תמחור).
              </Alert>
            )}
            <Typography variant="caption" color="text.secondary">
              אחרי שליחה, השתמשו בכפתור "בדוק סטטוס" למעקב.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPushDialog(false)} disabled={pushBusy}>
            ביטול
          </Button>
          <Button
            onClick={runPush}
            variant="contained"
            color="primary"
            disabled={pushBusy || selection.size === 0}
            startIcon={pushBusy ? <CircularProgress size={16} color="inherit" /> : <UploadIcon />}
          >
            {pushBusy ? "שולח…" : `העלה ${fmt.format(dispatchableTotal || selection.size)} מוצרים`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Per-product PM01 readiness drawer — opened from the card actions. */}
      <Pm01ReadinessDrawer
        open={readinessId !== null}
        invId={readinessId}
        validation={readinessRow}
        initial={(() => {
          const r = allRows.find((x) => x.id === readinessId);
          return {
            name_he: r?.name_he ?? null,
            brand: r?.brand ?? null,
            ean: r?.ean ?? null,
            images: r?.image ? [r.image] : null,
          };
        })()}
        onClose={closeReadiness}
        onSaved={onReadinessSaved}
      />
      {readinessLoading && readinessId !== null && (
        /* Tiny inline loader near the page so the operator sees that we're
         * fetching the validation for the row they just clicked. The drawer
         * itself appears as soon as readinessRow lands. */
        <Box sx={{ position: "fixed", top: 16, insetInlineEnd: 16, zIndex: 1500 }}>
          <CircularProgress size={20} />
        </Box>
      )}
      <SingleProductUploadDialog
        open={singleDialogOpen}
        onClose={() => setSingleDialogOpen(false)}
        onSuccess={() => {
          void refetch();
        }}
      />
    </BoardShell>
  );
}
