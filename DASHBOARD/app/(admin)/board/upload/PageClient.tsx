"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Pagination,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
  OpenInNew as OpenInNewIcon,
  Search as SearchIcon,
} from "@mui/icons-material";
import { useNotification, useUpdate } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import {
  BoardShell,
  JobStatusTimeline,
  ValidationChecklist,
  type ChannelKey,
  type JobSummary,
  type ValidationItem,
} from "@/components/board";
import { DataPanel, ImageThumb, StatChip } from "@/components/shared";
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
  pending_catalog: "בתהליך · נוצר בסופר-פארם",
  catalog_synced: "בתהליך · מחכה לפרסום",
  uploading: "בתהליך · נשלח לסופר-פארם",
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
  rejected_count?: number;
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

interface ReadyOffersResponse {
  ok?: boolean;
  count?: number;
  ids?: number[];
  catalog_ready_count?: number;
  blocked_by_price?: number;
  error?: string;
}

const PAGE_SIZE = 60;

const formatMoney = (value: number | null) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? `₪${fmt.format(value)}` : "חסר מחיר";

const formatRelativeHe = (date: Date) => {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 30) return "עכשיו";
  if (seconds < 60) return `לפני ${seconds} שנ׳`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `לפני ${minutes} דק׳`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  return date.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
};

type UploadProductsTableProps = {
  rows: UploadRow[];
  loading: boolean;
  selection: Set<number>;
  onToggle: (id: number) => void;
  onOpenReadiness: (id: number) => void;
  onRemove: (id: number) => void;
};

function UploadProductsTable({
  rows,
  loading,
  selection,
  onToggle,
  onOpenReadiness,
  onRemove,
}: UploadProductsTableProps) {
  const cols = useMemo<GridColDef<UploadRow>[]>(
    () => [
      {
        field: "_select",
        headerName: "",
        width: 52,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        align: "center",
        headerAlign: "center",
        renderCell: (p) => {
          const status = p.row.pilot_status ?? p.row.bucket;
          const isDone = p.row.bucket === "done" || status === "uploaded";
          return isDone ? (
            <DoneIcon color="success" fontSize="small" />
          ) : (
            <Checkbox
              size="small"
              checked={selection.has(p.row.id)}
              onChange={() => onToggle(p.row.id)}
              inputProps={{ "aria-label": `בחר מוצר ${p.row.name_he ?? p.row.ean ?? p.row.id}` }}
            />
          );
        },
      },
      {
        field: "image",
        headerName: "",
        width: 60,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        align: "center",
        headerAlign: "center",
        renderCell: (p) => <ImageThumb src={p.row.image} size={44} />,
      },
      {
        field: "name_he",
        headerName: "מוצר",
        flex: 1.6,
        minWidth: 240,
        sortable: false,
        align: "right",
        headerAlign: "right",
        renderCell: (p) => (
          <Stack spacing={0.2} sx={{ width: "100%", minWidth: 0, py: 0.75, textAlign: "right" }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                lineHeight: 1.3,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {p.row.name_he ?? "מוצר ללא שם"}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {[p.row.brand, p.row.category, p.row.ean && `EAN ${p.row.ean}`].filter(Boolean).join(" · ") || "אין פרטים נוספים"}
            </Typography>
          </Stack>
        ),
      },
      {
        field: "pilot_status",
        headerName: "סטטוס",
        width: 170,
        sortable: false,
        align: "right",
        headerAlign: "right",
        renderCell: (p) => {
          const status = p.row.pilot_status ?? p.row.bucket;
          return (
            <Chip
              size="small"
              color={STATUS_COLOR[status] ?? "default"}
              variant={status === "missing" ? "outlined" : "filled"}
              label={STATUS_LABEL[status] ?? status}
              sx={{ fontWeight: 600, maxWidth: "100%" }}
            />
          );
        },
      },
      {
        field: "price",
        headerName: "מחיר",
        width: 130,
        sortable: false,
        align: "right",
        headerAlign: "right",
        renderCell: (p) => (
          <Stack spacing={0} sx={{ width: "100%", py: 0.75, textAlign: "right" }}>
            <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {formatMoney(p.row.price)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
              איסוף: {formatMoney(p.row.pickup_cost)}
            </Typography>
          </Stack>
        ),
      },
      {
        field: "_actions",
        headerName: "פעולות",
        width: 140,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        align: "left",
        headerAlign: "left",
        renderCell: (p) => (
          <Stack direction="row" spacing={0.25} alignItems="center">
            <Tooltip title="בדוק / השלם נתונים" arrow>
              <IconButton size="small" onClick={() => onOpenReadiness(p.row.id)} aria-label="בדוק והשלם נתונים">
                <TechIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {p.row.hacontainer_url && (
              <Tooltip title="פתח בהקונטיינר" arrow>
                <IconButton
                  size="small"
                  component="a"
                  href={p.row.hacontainer_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="פתח בהקונטיינר"
                  onClick={(e) => e.stopPropagation()}
                >
                  <OpenInNewIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="הסר מהרשימה" arrow>
              <IconButton size="small" onClick={() => onRemove(p.row.id)} aria-label="הסר מוצר">
                <RemoveIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        ),
      },
    ],
    [selection, onToggle, onOpenReadiness, onRemove],
  );

  return (
    <DataPanel>
      <DataGrid
        rows={rows}
        columns={cols}
        getRowId={(r) => r.id}
        autoHeight
        loading={loading}
        disableColumnMenu
        disableRowSelectionOnClick
        hideFooter
        rowHeight={72}
        getRowClassName={(p) => (selection.has(Number(p.id)) ? "upload-row-selected" : "")}
        sx={(theme) => ({
          border: "none",
          "& .upload-row-selected, & .upload-row-selected:hover": {
            backgroundColor: `${alpha(theme.palette.primary.main, 0.07)} !important`,
          },
        })}
      />
    </DataPanel>
  );
}

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
  /** "מעקב סטטוס" panel — collapsed by default; the operator opens it when they
   *  actually want to watch a running upload. */
  const [statusOpen, setStatusOpen] = useState(false);

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

  const {
    data: readyOffersData,
    isLoading: readyOffersLoading,
    refetch: refetchReadyOffers,
  } = useQuery<ReadyOffersResponse>({
    queryKey: ["board-upload-ready-offers"],
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch("/api/sync/superpharm/ready-offers");
      const json: ReadyOffersResponse = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "טעינת מוצרים מוכנים לשלב 2 נכשלה");
      }
      return json;
    },
  });

  const refetch = () => {
    refetchMissing();
    refetchPipeline();
    refetchReadyOffers();
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

  const [removeConfirm, setRemoveConfirm] = useState<{ id: number; name: string } | null>(null);

  const requestRemoveFromQueue = (id: number) => {
    const row = allRows.find((r) => r.id === id);
    setRemoveConfirm({ id, name: row?.name_he ?? `inv ${id}` });
  };

  const confirmRemoveFromQueue = () => {
    if (!removeConfirm) return;
    const id = removeConfirm.id;
    setRemoveConfirm(null);
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
  };

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
          hint: "המערכת תיצור אותם בקטלוג ותפרסם את ההצעה אוטומטית אחרי הסיום.",
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
          hint: "המוצרים האלה כבר קיימים, לא יועלו כדי לא ליצור כפילות.",
        });
      if ((preview.blocked_by_catalog ?? 0) > 0)
        items.push({
          kind: "info",
          message: `${fmt.format(preview.blocked_by_catalog ?? 0)} ייווצרו תחילה בסופר-פארם`,
          hint: "התהליך אוטומטי. ההצעה תפורסם אחרי שהמוצר ייווצר.",
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
  const [stage2Busy, setStage2Busy] = useState(false);
  const [stage2Notice, setStage2Notice] = useState<{
    severity: "info" | "success" | "warning" | "error";
    message: string;
  } | null>(null);
  const stage2CheckHandledRef = useRef<string | null>(null);

  const catalogSyncedIds = useMemo(
    () => allRows.filter((row) => row.pilot_status === "catalog_synced").map((row) => row.id),
    [allRows],
  );

  const stage2ReadyIds = useMemo(() => {
    const ids = new Set<number>(readyOffersData?.ids ?? catalogSyncedIds);
    for (const id of catalogSyncedIds) ids.add(id);
    for (const job of activeJobs) {
      for (const id of job.ready_for_offer_inv_ids ?? []) ids.add(id);
    }
    return Array.from(ids);
  }, [activeJobs, catalogSyncedIds, readyOffersData?.ids]);

  const overallStatus = useMemo<{
    label: string;
    color: "success" | "error" | "info" | "default";
  }>(() => {
    if (pollBusy) return { label: "מתעדכן…", color: "info" };
    if (activeJobs.length === 0) return { label: "אין פעילות", color: "default" };
    let anyRunning = false;
    let anyFailed = false;
    let allComplete = true;
    for (const j of activeJobs) {
      const sync = j.sync_status?.toLowerCase() ?? "";
      const mirakl = j.mirakl_status ?? "";
      if (sync === "failed" || mirakl === "FAILED" || (j.errors ?? 0) > 0) anyFailed = true;
      if (sync === "running" || sync === "pending_mirakl") anyRunning = true;
      if (sync !== "completed" && mirakl !== "COMPLETE") allComplete = false;
    }
    if (anyFailed) return { label: "יש שגיאות", color: "error" };
    if (anyRunning) return { label: "פועל", color: "info" };
    if (allComplete) return { label: "הושלם", color: "success" };
    return { label: "ממתין", color: "default" };
  }, [activeJobs, pollBusy]);

  const { data: recentStatusData, refetch: refetchRecentStatus } = useQuery<CheckResponse>({
    queryKey: ["board-upload-recent-status"],
    staleTime: 15_000,
    queryFn: async () => {
      const res = await fetch("/api/sync/superpharm/check");
      const json: CheckResponse = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "טעינת סטטוס אחרון נכשלה");
      }
      return json;
    },
  });

  useEffect(() => {
    const summary = recentStatusData?.summary ?? [];
    if (summary.length === 0 || activeJobs.length > 0) return;
    setActiveJobs(summary);
  }, [activeJobs.length, recentStatusData?.summary]);

  const rememberSubmittedOfferJob = (json: PushResponse, submitted: number) => {
    if (!json.import_id && !json.sync_job_id) return;
    const jobId = json.sync_job_id ?? `stage2-${json.import_id ?? Date.now()}`;
    const job: JobSummary = {
      job_id: jobId,
      job_type: "superpharm_of01",
      import_id: json.import_id ?? null,
      mirakl_status: "RUNNING",
      sync_status: "running",
      submitted,
      success: 0,
      errors: 0,
      promoted_inv: 0,
      rolled_back_inv: 0,
    };
    setActiveJobs((prev) => [job, ...prev.filter((item) => item.job_id !== jobId)].slice(0, 6));
    setLastChecked(new Date());
  };

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
        if (summary.length > 0) setActiveJobs(summary);
        setLastChecked(new Date());
        const promoted = summary.reduce((a, s) => a + (s.promoted_inv ?? 0), 0);
        const rolled = summary.reduce((a, s) => a + (s.rolled_back_inv ?? 0), 0);
        const checked = json.checked ?? 0;
        const parts = [`נבדקו ${checked} משימות`];
        if (promoted) parts.push(`${promoted} קודמו`);
        if (rolled) parts.push(`${rolled} הוחזרו`);
        const failedOffers = summary.filter(
          (job) => job.job_type === "superpharm_of01" && job.sync_status === "failed",
        );
        const completedOffers = summary.filter(
          (job) => job.job_type === "superpharm_of01" && job.sync_status === "completed",
        );
        if (failedOffers.length > 0) {
          const failedJob = failedOffers[0];
          const failed = failedJob.errors ?? 0;
          const sent = failedJob.submitted ?? 0;
          setStage2Notice({
            severity: "error",
            message: `שלב 2 חזר עם שגיאות: ${fmt.format(failed)} מתוך ${fmt.format(sent || failed)} הצעות נדחו. פירוט מופיע במעקב למטה.`,
          });
        } else if (completedOffers.length > 0) {
          const okCount = completedOffers.reduce((a, job) => a + (job.success ?? 0), 0);
          setStage2Notice({
            severity: "success",
            message: `${fmt.format(okCount)} הצעות פורסמו בהצלחה בסופר-פארם.`,
          });
        } else if (checked === 0 && summary.length === 0) {
          setStage2Notice({
            severity: "info",
            message: "אין כרגע משימת העלאה פעילה. אם שלחת עכשיו, כדאי לבדוק שוב בעוד רגע.",
          });
        }
        open?.({ type: "success", message: parts.join(" · ") });
        refetch();
        refetchRecentStatus();
      } else {
        open?.({ type: "error", message: json.error ?? "בדיקה נכשלה" });
      }
    } catch (e) {
      open?.({ type: "error", message: `שגיאת רשת: ${(e as Error).message}` });
    } finally {
      setPollBusy(false);
    }
  };

  const runStage2 = async () => {
    if (stage2Busy) return;
    let idsForStage2 = stage2ReadyIds;
    if (idsForStage2.length === 0) {
      const refreshed = await refetchReadyOffers();
      idsForStage2 = refreshed.data?.ids ?? [];
    }
    if (idsForStage2.length === 0) {
      open?.({
        type: "error",
        message: "אין כרגע מוצרים שהוקמו בקטלוג ומוכנים לשלב 2",
      });
      return;
    }
    setStage2Busy(true);
    try {
      const res = await fetch("/api/sync/superpharm/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "by_ids",
          ids: idsForStage2,
          importType: "official",
          chained: true,
        }),
      });
      const json: PushResponse = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        open?.({ type: "error", message: `שלב 2 נכשל: ${json.error ?? res.statusText}` });
        return;
      }
      const sent = json.sku_count ?? 0;
      const rejectedBeforeSend = json.rejected_count ?? Math.max(0, idsForStage2.length - sent);
      open?.({
        type: sent > 0 ? "success" : "error",
        message:
          sent > 0
            ? `${fmt.format(sent)} הצעות מלאות נשלחו לסופר-פארם`
            : "לא נמצאו מוצרים מוכנים לשליחת הצעה מלאה",
      });
      setActiveImportId(json.import_id ?? null);
      if (sent > 0) {
        rememberSubmittedOfferJob(json, sent);
        setStage2Notice({
          severity: "info",
          message:
            rejectedBeforeSend > 0
              ? `${fmt.format(sent)} הצעות נשלחו לבדיקה. ${fmt.format(rejectedBeforeSend)} מוצרים לא נשלחו כי חסר להם מחיר/נתון מתאים.`
              : `${fmt.format(sent)} הצעות נשלחו לבדיקה. הסטטוס יתעדכן כאן אחרי שמירקל יסיים לעבד את הקובץ.`,
        });
        window.setTimeout(() => {
          void checkStatus();
        }, 2500);
      } else {
        setStage2Notice({
          severity: "warning",
          message: "לא נשלחו הצעות בשלב 2. בדקו אם יש מוצרים שהוקמו בקטלוג ומחיר תקין.",
        });
      }
      refetch();
      refetchReadyOffers();
    } catch (e) {
      open?.({ type: "error", message: `שגיאת רשת בשלב 2: ${(e as Error).message}` });
    } finally {
      setStage2Busy(false);
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
  const stage2CheckValue = params.get("stage2check");

  useEffect(() => {
    if (!stage2CheckValue || stage2CheckHandledRef.current === stage2CheckValue) return;
    stage2CheckHandledRef.current = stage2CheckValue;
    const handle = window.setTimeout(() => {
      void checkStatus();
    }, 500);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage2CheckValue]);

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
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
        <Typography variant="overline" color="text.secondary" sx={{ mr: 1, fontWeight: 600, letterSpacing: 0.4 }}>
          סינון
        </Typography>
        <Chip
          size="small"
          label={`הכל · ${fmt.format(counts.total)}`}
          onClick={() => setFilter("all")}
          color={filter === "all" ? "primary" : "default"}
          variant={filter === "all" ? "filled" : "outlined"}
        />
        <Chip
          size="small"
          label={`מוכנים · ${fmt.format(counts.ready)}`}
          onClick={() => setFilter("ready")}
          color={filter === "ready" ? "primary" : "default"}
          variant={filter === "ready" ? "filled" : "outlined"}
        />
        <Chip
          size="small"
          label={`בתהליך · ${fmt.format(counts.inProgress)}`}
          onClick={() => setFilter("in_progress")}
          color={filter === "in_progress" ? "info" : "default"}
          variant={filter === "in_progress" ? "filled" : "outlined"}
        />
        <Chip
          size="small"
          label={`הועלו · ${fmt.format(counts.done)}`}
          onClick={() => setFilter("done")}
          color={filter === "done" ? "success" : "default"}
          variant={filter === "done" ? "filled" : "outlined"}
        />
        {(lastFailedIds?.size ?? 0) > 0 && (
          <Tooltip title="המוצרים מהבאצ' האחרון שנדחו ע״י סופר-פארם (חסר נתון חובה וכד'). העלה מחדש אחרי תיקון." arrow>
            <Chip
              size="small"
              label={`כשלון אחרון · ${fmt.format(lastFailedIds!.size)}`}
              onClick={() => setFilter("last_failed")}
              color={filter === "last_failed" ? "error" : "default"}
              variant={filter === "last_failed" ? "filled" : "outlined"}
            />
          </Tooltip>
        )}
      </Stack>

      {/* Action card. Validation expands only when selection has issues; channel
       *  selector hidden while superpharm is the sole active channel. */}
      <Card variant="outlined" sx={{ backgroundImage: "none" }}>
        <CardContent sx={{ p: { xs: 2, md: 2.4 } }}>
          <Stack spacing={2}>
            <Stack
              direction={{ xs: "column", md: "row" }}
              alignItems={{ xs: "stretch", md: "center" }}
              justifyContent="space-between"
              spacing={2}
            >
              <Stack direction="row" spacing={1.2} flexWrap="wrap" useFlexGap alignItems="center">
                <StatChip label="נבחרו" value={selection.size} tone="primary" />
                <StatChip label="עוברים בדיקה" value={eligible} tone="success" />
                {blocked > 0 && <StatChip label="חסומים" value={blocked} tone="warning" />}
                <Chip
                  label="ערוץ: סופר-פארם"
                  size="small"
                  variant="outlined"
                  sx={{ height: 28, fontWeight: 600 }}
                />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} alignItems="center" spacing={1.5}>
                {selection.size > 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: { xs: "right", sm: "left" } }}>
                    יישלחו {fmt.format(dispatchableTotal || selection.size)} מוצרים
                  </Typography>
                ) : null}
                <Button
                  size="large"
                  variant="contained"
                  color="primary"
                  startIcon={<UploadIcon />}
                  disabled={selection.size === 0 || pushBusy || channel !== "superpharm" || (preview != null && dispatchableTotal === 0)}
                  onClick={() => setPushDialog(true)}
                  sx={{ minHeight: 48, px: 3, fontSize: 16, fontWeight: 700, alignSelf: { xs: "stretch", sm: "auto" } }}
                >
                  העלה מוצרים
                </Button>
              </Stack>
            </Stack>

            {previewLoading ? (
              <Skeleton variant="rounded" height={64} />
            ) : selection.size > 0 && validationItems.length > 0 ? (
              <ValidationChecklist items={validationItems} />
            ) : null}
          </Stack>
        </CardContent>
      </Card>

      {/* Status tracking */}
      <Card variant="outlined" sx={{ backgroundImage: "none" }}>
        <CardContent>
          <Stack spacing={2}>
            <Stack
              direction={{ xs: "column", md: "row" }}
              alignItems={{ xs: "stretch", md: "center" }}
              justifyContent="space-between"
              spacing={1.5}
            >
              <Stack direction="row" spacing={1.2} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="h6" component="h2" sx={{ lineHeight: 1.18, m: 0 }}>
                  מעקב סטטוס
                </Typography>
                <Chip
                  label={overallStatus.label}
                  size="small"
                  color={overallStatus.color === "default" ? undefined : overallStatus.color}
                  variant={overallStatus.color === "default" ? "outlined" : "filled"}
                  sx={{ fontWeight: 700 }}
                />
                {activeImportId && (
                  <Tooltip title="העתק מזהה משלוח" arrow>
                    <Chip
                      label={`#${activeImportId}`}
                      size="small"
                      variant="outlined"
                      onClick={() => void navigator.clipboard?.writeText(String(activeImportId))}
                      sx={{ direction: "ltr", fontFamily: "monospace", cursor: "pointer" }}
                    />
                  </Tooltip>
                )}
                {lastChecked && (
                  <Typography variant="caption" color="text.secondary">
                    עודכן {formatRelativeHe(lastChecked)}
                  </Typography>
                )}
              </Stack>

              <Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: "flex-end", md: "flex-end" }}>
                {stage2ReadyIds.length > 0 && (
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={runStage2}
                    disabled={stage2Busy || readyOffersLoading}
                    startIcon={stage2Busy || readyOffersLoading ? <CircularProgress size={14} color="inherit" /> : <UploadIcon />}
                  >
                    {stage2Busy ? "שולח…" : readyOffersLoading ? "בודק…" : `פרסם ${fmt.format(stage2ReadyIds.length)} הצעות`}
                  </Button>
                )}
                <Tooltip title={pollBusy ? "בודק…" : "בדוק סטטוס עכשיו"} arrow>
                  <span>
                    <IconButton onClick={checkStatus} disabled={pollBusy} aria-label="בדוק סטטוס">
                      {pollBusy ? <CircularProgress size={18} /> : <RefreshIcon />}
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={statusOpen ? "הסתר מעקב" : "הצג מעקב"} arrow>
                  <IconButton
                    onClick={() => setStatusOpen((v) => !v)}
                    aria-label={statusOpen ? "הסתר מעקב סטטוס" : "הצג מעקב סטטוס"}
                    sx={{ transform: statusOpen ? "rotate(180deg)" : "none", transition: "transform 160ms ease" }}
                  >
                    <ExpandMoreIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>

            {stage2Notice && (
              <Alert severity={stage2Notice.severity}>{stage2Notice.message}</Alert>
            )}

            <Collapse in={statusOpen} unmountOnExit>
              {activeJobs.length > 0 ? (
                <JobStatusTimeline jobs={activeJobs} />
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 1.5 }}>
                  אין משימות פעילות. אחרי העלאה הסטטוס יופיע כאן.
                </Typography>
              )}
            </Collapse>
          </Stack>
        </CardContent>
      </Card>

      {/* Product list toolbar: title + count, search, selection actions on one row */}
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        alignItems={{ xs: "stretch", md: "center" }}
        justifyContent="space-between"
        sx={{ mt: 0.5 }}
      >
        <Stack spacing={0.2} sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h2" sx={{ lineHeight: 1.2, m: 0 }}>
            רשימת מוצרים
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {fmt.format(filteredRows.length)} תוצאות
            {selection.size > 0 && ` · ${fmt.format(selection.size)} נבחרו`}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: { md: 1 }, justifyContent: { md: "flex-end" } }}>
          <TextField
            size="small"
            placeholder="חיפוש שם, מותג, ברקוד…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ flex: { xs: 1, md: "0 1 320px" }, minWidth: 200 }}
          />
          <Tooltip title="בחר הכל המתאימים לפילטר" arrow>
            <span>
              <IconButton onClick={selectAllVisible} disabled={filteredRows.length === 0} aria-label="בחר הכל">
                <SelectAllIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="נקה בחירה" arrow>
            <span>
              <IconButton onClick={clearSelection} disabled={selection.size === 0} aria-label="נקה בחירה">
                <ClearAllIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {filteredRows.length === 0 && !isLoadingList && (
        <Alert severity="info" variant="outlined">
          {filter === "ready"
            ? "אין מוצרים מוכנים להעלאה. בדקו את לוח הקטלוג כדי לסמן מוצרים חסרים."
            : filter === "in_progress"
              ? "אין מוצרים בתהליך כרגע. אחרי לחיצה על 'העלה מוצרים' הם יופיעו כאן."
              : filter === "done"
                ? "אין עדיין מוצרים שהועלו או נכשלו."
                : filter === "last_failed"
                  ? "אין כשלים מהבאצ' האחרון."
                  : "אין מוצרים תואמים לחיפוש."}
        </Alert>
      )}

      <UploadProductsTable
        rows={pagedRows}
        loading={isLoadingList && filteredRows.length === 0}
        selection={selection}
        onToggle={toggleSelect}
        onOpenReadiness={openReadiness}
        onRemove={requestRemoveFromQueue}
      />

      {totalPages > 1 && (
        <Stack direction="row" justifyContent="center" sx={{ mt: 1 }}>
          <Pagination
            count={totalPages}
            page={page + 1}
            onChange={(_, p) => setPage(p - 1)}
            color="primary"
            shape="rounded"
            siblingCount={1}
            boundaryCount={1}
          />
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
                  <strong>יצירה בקטלוג סופר-פארם (PM01):</strong> מוצר חדש שלא קיים שם נוצר אוטומטית.
                </Typography>
              </li>
              <li>
                <Typography variant="body2">
                  <strong>פרסום הצעה (OF01):</strong> מחיר, מלאי, משלוח. רץ אוטומטית אחרי שהמוצר נוצר.
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
                {fmt.format(needsPm01)} מוצרים ייווצרו תחילה בקטלוג סופר-פארם, ואז ההצעה תפורסם אוטומטית.
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

      <Dialog
        open={removeConfirm !== null}
        onClose={() => setRemoveConfirm(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>הסר מתור ההעלאה?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            המוצר <strong>{removeConfirm?.name}</strong> יסומן כ&quot;להתעלם&quot; ולא יעלה לסופר-פארם.
            ניתן להחזיר ידנית מהבורד &quot;רשימת מוצרים&quot;.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveConfirm(null)}>ביטול</Button>
          <Button onClick={confirmRemoveFromQueue} variant="contained" color="warning">
            הסר
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
