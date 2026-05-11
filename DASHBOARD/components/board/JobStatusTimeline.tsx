"use client";

import { Box, Chip, CircularProgress, Stack, Tooltip, Typography, alpha } from "@mui/material";
import {
  CheckCircle as DoneIcon,
  Error as FailIcon,
  RadioButtonUnchecked as PendingIcon,
} from "@mui/icons-material";
import type { StageStatus } from "./UploadStageTimeline";

export interface JobSummary {
  job_id: string;
  job_type: "superpharm_pm01" | "superpharm_of01" | string;
  import_id?: number | string | null;
  mirakl_status?: string | null;
  sync_status?: string | null;
  submitted?: number;
  promoted_inv?: number;
  rolled_back_inv?: number;
  chained_of01_job_id?: string | null;
  errors?: number;
  success?: number;
  ready_for_offer_count?: number;
  ready_for_offer_inv_ids?: number[];
  error_samples?: Array<{ message: string; count: number }>;
  recent?: boolean;
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

const stageIcon = (status: StageStatus) => {
  if (status === "done") return <DoneIcon fontSize="small" />;
  if (status === "failed") return <FailIcon fontSize="small" />;
  if (status === "running") return <CircularProgress size={16} thickness={5} />;
  return <PendingIcon fontSize="small" />;
};

const stageColor = (status: StageStatus): "success" | "error" | "primary" | "info" => {
  if (status === "done") return "success";
  if (status === "failed") return "error";
  if (status === "running") return "primary";
  return "info";
};

const stageStatusLabel = (status: StageStatus): string => {
  if (status === "done") return "הושלם";
  if (status === "failed") return "נכשל";
  if (status === "running") return "בתהליך";
  return "ממתין";
};

export function JobStatusTimeline({ jobs }: JobStatusTimelineProps) {
  if (jobs.length === 0) return null;

  return (
    <Stack
      spacing={0}
      divider={<Box sx={(theme) => ({ height: 1, bgcolor: alpha(theme.palette.text.primary, 0.06) })} />}
      sx={(theme) => ({
        borderRadius: 1.25,
        border: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
        overflow: "hidden",
      })}
    >
      {jobs.map((j) => {
        const status = stageStatusFromJob(j);
        const tone = stageColor(status);
        const sync = j.sync_status?.toLowerCase() ?? "";
        const mirakl = j.mirakl_status ?? "";
        const isPm01 = j.job_type === "superpharm_pm01";
        const isFinal = sync === "completed" || sync === "failed" || mirakl === "COMPLETE" || mirakl === "FAILED";
        const summaryParts: string[] = [];
        if (j.success != null && j.success > 0) {
          summaryParts.push(
            isPm01 && !isFinal ? `${fmt.format(j.success)} עברו בדיקה` : `${fmt.format(j.success)} הצליחו`,
          );
        }
        if (j.errors != null && j.errors > 0) {
          summaryParts.push(`${fmt.format(j.errors)} שגיאות`);
        }
        if (j.ready_for_offer_count != null && j.ready_for_offer_count > 0) {
          summaryParts.push(`${fmt.format(j.ready_for_offer_count)} מוכנים לשלב 2`);
        }
        const summary = summaryParts.join(" · ") || friendlyMiraklLabel(j.mirakl_status) || stageStatusLabel(status);
        const sample = j.error_samples?.find((s) => s.message?.trim());

        return (
          <Stack
            key={j.job_id}
            direction="row"
            spacing={1.4}
            alignItems="center"
            sx={{ p: 1.4 }}
          >
            <Box
              sx={(theme) => ({
                width: 28,
                height: 28,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                color: theme.palette[tone].main,
                bgcolor: alpha(theme.palette[tone].main, 0.12),
                flex: "0 0 auto",
              })}
            >
              {stageIcon(status)}
            </Box>
            <Stack spacing={0.15} sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="subtitle2" sx={{ lineHeight: 1.25, fontWeight: 600 }}>
                  {friendlyJobLabel(j.job_type)}
                </Typography>
                {j.chained_of01_job_id && (
                  <Chip label="המשך אוטומטי" size="small" color="success" variant="outlined" sx={{ height: 20 }} />
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                {summary}
              </Typography>
              {sample && (
                <Typography variant="caption" color="error.main" sx={{ lineHeight: 1.3 }}>
                  {fmt.format(sample.count)}× {sample.message}
                </Typography>
              )}
            </Stack>
            {j.import_id != null && (
              <Tooltip title="העתק מזהה משלוח" arrow>
                <Chip
                  label={`#${j.import_id}`}
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    void navigator.clipboard?.writeText(String(j.import_id));
                  }}
                  sx={{
                    direction: "ltr",
                    cursor: "pointer",
                    fontFamily: "monospace",
                    flex: "0 0 auto",
                  }}
                />
              </Tooltip>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}
