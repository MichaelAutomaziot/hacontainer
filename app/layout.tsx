'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RTLThemeProvider } from '@/providers/theme-provider';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
      })
  );

  return (
    <html lang="he" dir="rtl">
      <head>
        <title>הקונטיינר | מערכת ניהול</title>
        <meta
          name="description"
          content="מערכת הניהול של הקונטיינר לסנכרון קטלוג, פיילוט ותפעול."
        />
        <meta name="theme-color" content="#c12026" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        {/* Hebrew-optimized fonts */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700;800&family=Rubik:wght@500;600;700&display=swap"
        />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <RTLThemeProvider>{children}</RTLThemeProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
