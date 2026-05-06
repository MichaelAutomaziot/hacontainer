"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { RTLThemeProvider } from "@/providers/theme-provider";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 60_000,
            cacheTime: 300_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RTLThemeProvider>{children}</RTLThemeProvider>
    </QueryClientProvider>
  );
}
