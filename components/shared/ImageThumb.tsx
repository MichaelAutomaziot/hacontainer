"use client";

import { alpha, Avatar, Box } from "@mui/material";
import { BrokenImage as BrokenIcon } from "@mui/icons-material";
import { useState } from "react";

export interface ImageThumbProps {
  src?: string | null;
  alt?: string;
  size?: number;
  fallbackInitials?: string;
}

export const ImageThumb = ({ src, alt, size = 40, fallbackInitials }: ImageThumbProps) => {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <Avatar
        variant="rounded"
        sx={(theme) => ({
          width: size,
          height: size,
          fontSize: size * 0.35,
          bgcolor: alpha(theme.palette.text.primary, 0.06),
          color: "text.secondary",
          border: "1px solid",
          borderColor: "divider",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,.54)",
        })}
      >
        {fallbackInitials || <BrokenIcon fontSize="small" />}
      </Avatar>
    );
  }

  return (
    <Box
      component="img"
      src={src}
      alt={alt ?? ""}
      loading="lazy"
      onError={() => setError(true)}
      sx={{
        width: size,
        height: size,
        objectFit: "contain",
        borderRadius: 1,
        bgcolor: "white",
        border: "1px solid",
        borderColor: "divider",
        boxShadow: "0 6px 18px rgba(27, 36, 34, 0.08)",
        flex: "0 0 auto",
      }}
    />
  );
};
