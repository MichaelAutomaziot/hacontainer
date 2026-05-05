"use client";

import { Button, CircularProgress, type ButtonProps } from "@mui/material";
import { Sync as SyncIcon, CheckCircle as DoneIcon, Error as ErrorIcon } from "@mui/icons-material";
import { useState } from "react";
import { useNotification } from "@refinedev/core";

export type SyncSource = "konimbo" | "superpharm";

export interface SyncTriggerButtonProps {
  source: SyncSource;
  label: string;
  variant?: ButtonProps["variant"];
  color?: ButtonProps["color"];
  size?: ButtonProps["size"];
  onCompleted?: (result: unknown) => void;
}

type Status = "idle" | "running" | "done" | "error";

export const SyncTriggerButton = ({
  source,
  label,
  variant = "contained",
  color = "primary",
  size = "medium",
  onCompleted,
}: SyncTriggerButtonProps) => {
  const [status, setStatus] = useState<Status>("idle");
  const { open } = useNotification();

  const fire = async () => {
    setStatus("running");
    try {
      const res = await fetch(`/api/sync/${source}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok === false) {
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      setStatus("done");
      open?.({ type: "success", message: `סנכרון ${source === "konimbo" ? "קונימבו" : "סופר-פארם"} הושלם`, description: JSON.stringify(body).slice(0, 180) });
      onCompleted?.(body);
      setTimeout(() => setStatus("idle"), 3000);
    } catch (e) {
      const msg = (e as Error).message;
      setStatus("error");
      open?.({ type: "error", message: "סנכרון נכשל", description: msg });
      setTimeout(() => setStatus("idle"), 4000);
    }
  };

  const icon =
    status === "running" ? <CircularProgress size={16} color="inherit" /> :
    status === "done"    ? <DoneIcon fontSize="small" /> :
    status === "error"   ? <ErrorIcon fontSize="small" /> :
    <SyncIcon fontSize="small" />;

  return (
    <Button
      variant={variant}
      color={status === "error" ? "error" : status === "done" ? "success" : color}
      size={size}
      onClick={fire}
      disabled={status === "running"}
      startIcon={icon}
    >
      {label}
    </Button>
  );
};
