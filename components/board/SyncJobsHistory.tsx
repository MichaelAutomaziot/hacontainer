"use client";

import { Chip, Tooltip, Typography } from "@mui/material";
import {
  CheckCircle as DoneIcon,
  Error as ErrorIcon,
  Sync as RunningIcon,
} from "@mui/icons-material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useList } from "@refinedev/core";
import { DataPanel } from "@/components/shared";

interface SyncJobRow {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown> | null;
  last_error: string | null;
  created_at: string;
  completed_at: string | null;
}

const fmtTs = (s?: string | null) => {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return s;
  }
};

const StatusChip = ({ status }: { status: string }) => {
  if (status === "completed")
    return <Chip size="small" color="success" icon={<DoneIcon />} label="הושלם" />;
  if (status === "failed")
    return <Chip size="small" color="error" icon={<ErrorIcon />} label="נכשל" />;
  if (status === "running")
    return <Chip size="small" color="info" icon={<RunningIcon />} label="רץ" />;
  return <Chip size="small" label={status} />;
};

const TYPE_LABELS: Record<string, string> = {
  "sync-konimbo-orphans": "ניקוי יתומים — הקונטיינר",
  "sync-superpharm-full": "משיכה מלאה — סופר-פארם",
  "sync-superpharm-orphans": "ניקוי יתומים — סופר-פארם",
  "match-catalog": "השוואת קטלוגים",
  superpharm_of01: "העלאה ל-Mirakl OF01",
  superpharm_pm01: "יצירה בקטלוג ל-Mirakl PM01",
};

export interface SyncJobsHistoryProps {
  pageSize?: number;
  refetchIntervalMs?: number;
}

export function SyncJobsHistory({ pageSize = 50, refetchIntervalMs = 8_000 }: SyncJobsHistoryProps) {
  const { data, isFetching } = useList<SyncJobRow>({
    resource: "sync_jobs",
    pagination: { pageSize },
    sorters: [{ field: "created_at", order: "desc" }],
    queryOptions: { refetchInterval: refetchIntervalMs },
  });

  const rows = (data?.data ?? []) as SyncJobRow[];

  const cols: GridColDef[] = [
    {
      field: "type",
      headerName: "סוג",
      width: 240,
      renderCell: (p) => <span dir="rtl">{TYPE_LABELS[p.value as string] ?? p.value}</span>,
    },
    { field: "status", headerName: "סטטוס", width: 120, renderCell: (p) => <StatusChip status={p.value as string} /> },
    { field: "created_at", headerName: "התחיל", width: 160, renderCell: (p) => fmtTs(p.value as string) },
    { field: "completed_at", headerName: "הסתיים", width: 160, renderCell: (p) => fmtTs(p.value as string | null) },
    {
      field: "elapsed",
      headerName: "משך (שנ׳)",
      width: 110,
      sortable: false,
      renderCell: (p) => {
        const v = (p.row.payload as Record<string, unknown> | null)?.["elapsed_s"];
        return typeof v === "number" ? v : "—";
      },
    },
    {
      field: "summary",
      headerName: "סיכום",
      flex: 1,
      sortable: false,
      renderCell: (p) => {
        const pl = p.row.payload as Record<string, unknown> | null;
        if (!pl) return "—";
        const parts: string[] = [];
        if (typeof pl.sku_count === "number") parts.push(`SKUs: ${pl.sku_count}`);
        if (typeof pl.rejected_count === "number" && pl.rejected_count > 0)
          parts.push(`נדחו: ${pl.rejected_count}`);
        if (typeof pl.keep_count === "number") parts.push(`נשמרו: ${pl.keep_count}`);
        if (typeof pl.deleted === "number") parts.push(`נמחקו: ${pl.deleted}`);
        if (typeof pl.lines_in_success === "number")
          parts.push(`הצליחו: ${pl.lines_in_success}`);
        if (typeof pl.lines_in_error === "number" && pl.lines_in_error > 0)
          parts.push(`שגיאות: ${pl.lines_in_error}`);
        return <Typography variant="body2">{parts.join(" · ") || "—"}</Typography>;
      },
    },
    {
      field: "last_error",
      headerName: "שגיאה",
      width: 70,
      sortable: false,
      renderCell: (p) =>
        p.value ? (
          <Tooltip title={String(p.value).slice(0, 400)}>
            <ErrorIcon color="error" fontSize="small" />
          </Tooltip>
        ) : null,
    },
  ];

  return (
    <DataPanel>
      <DataGrid
        autoHeight
        rows={rows}
        columns={cols}
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        loading={isFetching && rows.length === 0}
        disableRowSelectionOnClick
        getRowId={(r) => r.id}
        sx={{ border: 0 }}
      />
    </DataPanel>
  );
}
