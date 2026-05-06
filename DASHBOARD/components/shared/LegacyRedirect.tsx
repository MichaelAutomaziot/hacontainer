"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Box, CircularProgress, Stack, Typography } from "@mui/material";

export interface LegacyRedirectProps {
  /** Target path. May contain a fixed query (?tab=...). Search params from the original URL are appended. */
  to: string;
}

/**
 * Soft client-side redirect for legacy routes that have been folded into the
 * 4-board layout. Bookmarks and Slack pins keep working; users land on the
 * correct board+tab without a 404.
 */
export function LegacyRedirect({ to }: LegacyRedirectProps) {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const incoming = params.toString();
    let target = to;
    if (incoming) {
      target += target.includes("?") ? `&${incoming}` : `?${incoming}`;
    }
    router.replace(target);
  }, [params, router, to]);

  return (
    <Box dir="rtl" sx={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
      <Stack spacing={1.5} alignItems="center">
        <CircularProgress size={28} />
        <Typography variant="body2" color="text.secondary">
          מעביר אותך לבורד החדש…
        </Typography>
      </Stack>
    </Box>
  );
}
