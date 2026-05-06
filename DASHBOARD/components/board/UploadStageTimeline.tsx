"use client";

import {
  Box,
  Stack,
  Typography,
  CircularProgress,
  alpha,
} from "@mui/material";
import {
  CheckCircle as DoneIcon,
  Error as FailIcon,
  RadioButtonUnchecked as PendingIcon,
} from "@mui/icons-material";
import type { ReactNode } from "react";

export type StageStatus = "pending" | "running" | "done" | "failed";

export interface UploadStage {
  key: string;
  label: string;
  description?: ReactNode;
  status: StageStatus;
  meta?: ReactNode;
}

export interface UploadStageTimelineProps {
  stages: UploadStage[];
}

const StageIcon = ({ status }: { status: StageStatus }) => {
  if (status === "done") return <DoneIcon fontSize="small" />;
  if (status === "failed") return <FailIcon fontSize="small" />;
  if (status === "running") return <CircularProgress size={18} thickness={5} />;
  return <PendingIcon fontSize="small" />;
};

const stageColor = (status: StageStatus): "success" | "error" | "primary" | "info" => {
  if (status === "done") return "success";
  if (status === "failed") return "error";
  if (status === "running") return "primary";
  return "info";
};

export function UploadStageTimeline({ stages }: UploadStageTimelineProps) {
  return (
    <Stack spacing={0}>
      {stages.map((stage, idx) => {
        const isLast = idx === stages.length - 1;
        const tone = stageColor(stage.status);
        return (
          <Stack
            key={stage.key}
            direction="row"
            spacing={1.6}
            alignItems="flex-start"
            sx={{ position: "relative", pb: isLast ? 0 : 2.2 }}
          >
            <Box
              sx={(theme) => ({
                position: "relative",
                width: 32,
                flex: "0 0 auto",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              })}
            >
              <Box
                sx={(theme) => ({
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  bgcolor:
                    stage.status === "pending"
                      ? alpha(theme.palette.text.primary, 0.06)
                      : alpha(theme.palette[tone].main, 0.14),
                  color:
                    stage.status === "pending"
                      ? alpha(theme.palette.text.primary, 0.4)
                      : theme.palette[tone].main,
                  border: `2px solid ${
                    stage.status === "pending"
                      ? alpha(theme.palette.text.primary, 0.12)
                      : theme.palette[tone].main
                  }`,
                  zIndex: 1,
                  transition: "background-color 220ms ease, color 220ms ease, border-color 220ms ease",
                })}
              >
                <StageIcon status={stage.status} />
              </Box>
              {!isLast && (
                <Box
                  sx={(theme) => ({
                    position: "absolute",
                    top: 30,
                    bottom: -2,
                    width: 2,
                    bgcolor: alpha(theme.palette.text.primary, 0.1),
                  })}
                />
              )}
            </Box>
            <Stack spacing={0.3} sx={{ flex: 1, minWidth: 0, pt: 0.3 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography
                  variant="subtitle2"
                  sx={{
                    lineHeight: 1.15,
                    color: stage.status === "pending" ? "text.secondary" : "text.primary",
                  }}
                >
                  {stage.label}
                </Typography>
                {stage.meta}
              </Stack>
              {stage.description && (
                <Typography variant="caption" color="text.secondary">
                  {stage.description}
                </Typography>
              )}
            </Stack>
          </Stack>
        );
      })}
    </Stack>
  );
}
