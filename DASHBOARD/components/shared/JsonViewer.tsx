"use client";

import { Box, Typography } from "@mui/material";

export interface JsonViewerProps {
  value: unknown;
  maxHeight?: number;
}

export const JsonViewer = ({ value, maxHeight = 400 }: JsonViewerProps) => {
  const text = (() => {
    try {
      return typeof value === "string" ? value : JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  })();

  return (
    <Box
      component="pre"
      sx={{
        direction: "ltr",
        textAlign: "left",
        m: 0,
        p: 2,
        bgcolor: "#17211f",
        color: "#e7eee9",
        borderRadius: 2,
        border: "1px solid rgba(255,255,255,.08)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 12,
        lineHeight: 1.5,
        maxHeight,
        overflow: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      <Typography component="span" sx={{ color: "inherit", fontFamily: "inherit", fontSize: "inherit" }}>
        {text}
      </Typography>
    </Box>
  );
};
