// Server component — must NOT carry 'use client' so it can read
// process.env at request time. Injects the Supabase URL/key into the
// HTML so the browser bundle reads them from window.__SUPABASE_CONFIG__
// instead of relying on build-time inlining (which breaks when the
// Docker image is built without real Railway env vars present).

import type { ReactNode } from "react";
import { Providers } from "@/components/providers/Providers";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "הקונטיינר | מערכת ניהול",
  description: "מערכת הניהול של הקונטיינר לסנכרון קטלוג, פיילוט ותפעול.",
  themeColor: "#c12026",
};

const sanitizeForScript = (s: string | undefined | null): string => {
  if (!s) return "";
  // Defend against breaking out of the inline <script> with </script> or
  // unicode separators. JSON.stringify will quote the value; we then patch
  // any '<' to '<' so a hostile env var still can't terminate the tag.
  return JSON.stringify(s).replace(/</g, "\\u003c");
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "").trim();

  const configScript = `window.__SUPABASE_CONFIG__ = {url: ${sanitizeForScript(url)}, anonKey: ${sanitizeForScript(anon)}};`;

  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700;800&family=Rubik:wght@500;600;700&display=swap"
        />
        {/* Inject Supabase URL/anon key from runtime env. Read by the
            browser bundle via utils/supabase/env.ts → window.__SUPABASE_CONFIG__. */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: configScript }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
