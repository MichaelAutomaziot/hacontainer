"use client";

import { Box, Chip, Stack, Typography, alpha } from "@mui/material";
import { UploadStageTimeline, type StageStatus } from "./UploadStageTimeline";

export interface JobSummary {
  job_id: string;
  job_type: "superpharm_pm01" | "superpharm_of01" | string;
  import_id?: number | string | null;
  mirakl_status?: string | null;
  sync_status?: string | null;
  promoted_inv?: number;
  rolled_back_inv?: number;
  chained_of01_job_id?: string | null;
  errors?: number;
  success?: number;
}

export interface JobStatusTimelineProps {
  jobs: JobSummary[];
}

const TERMINAL_OK = new Set(["completed", "COMPLETE", "DONE"]);
const TERMINAL_FAIL = new Set(["failed", "FAILED", "REFUSED"]);

const fmt = new Intl.NumberFormat("he-IL");

const stageStatusFromJob = (job: JobSummary): StageStatus => {
  const sync = job.sync_status?.toLowerCase() ?? "";
  if (sync === "completed") return "done";
  if (sync === "failed") return "failed";
  if (TERMINAL_OK.has(job.mirakl_status ?? "")) return "done";
  if (TERMINAL_FAIL.has(job.mirakl_status ?? "")) return "failed";
  if (sync === "running" || sync === "pending_mirakl") return "running";
  return "pending";
};

const friendlyJobLabel = (jobType: string) =>
  jobType === "superpharm_pm01"
    ? "יצירה בקטלוג סופר-פארם"
    : jobType === "superpharm_of01"
      ? "פרסום הצעה לסופר-פארם"
      : jobType;

const friendlyMiraklLabel = (s?: string | null) => {
  if (!s) return null;
  const map: Record<string, string> = {
    PENDING: "ממתין",
    QUEUED: "בתור",
    SENT: "נשלח",
    RUNNING: "רץ",
    COMPLETE: "הושלם",
    WAITING_HOST: "ממתין לעיבוד",
    FAILED: "נכשל",
  };
  return map[s] ?? s;
};

export function JobStatusTimeline({ jobs }: JobStatusTimelineProps) {
  if (jobs.length === 0) {
    return (
      <Box
        sx={(theme) => ({
          p: 2.2,
          borderRadius: 1.5,
          border: `1px dashed ${alpha(theme.palette.text.primary, 0.16)}`,
          textAlign: "center",
          color: theme.palette.text.secondary,
        })}
      >
        <Typography variant="body2">אין משימות העלאה פעילות.</Typography>
      </Box>
    );
  }

  return (
    <UploadStageTimeline
      stages={jobs.map((j) => {
        const status = stageStatusFromJob(j);
        const parts: string[] = [];
        if (j.success != null) parts.push(`${fmt.format(j.success)} הצליחו`);
        if (j.errors != null && j.errors > 0) parts.push(`${fmt.format(j.errors)} שגיאות`);
        if (j.promoted_inv != null && j.promoted_inv > 0) parts.push(`${fmt.format(j.promoted_inv)} קודמו`);
        if (j.rolled_back_inv != null && j.rolled_back_inv > 0) parts.push(`${fmt.format(j.rolled_back_inv)} הוחזרו`);
        const miraklLabel = friendlyMiraklLabel(j.mirakl_status);
        return {
          key: j.job_id,
          label: friendlyJobLabel(j.job_type),
          status,
          description:
            parts.length > 0 ? (
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {parts.map((p) => (
                  <Chip key={p} label={p} size="small" variant="outlined" />
                ))}
              </Stack>
            ) : miraklLabel ? (
              <span>סטטוס Mirakl: {miraklLabel}</span>
            ) : (
              <span>בהמתנה</span>
            ),
          meta: j.chained_of01_job_id ? (
            <Chip
              label="הופעל OF01 אוטומטית"
              size="small"
              color="success"
              variant="outlined"
            />
          ) : null,
        };
      })}
    />
  );
}
