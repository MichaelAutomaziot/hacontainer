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
  themeColor: "#2563eb",
};

const sanitizeForScript = (s: string | undefined | null): string => {
  if (!s) return "";
  // Defend against breaking out of the inline <script> with </script> or
  // unicode separators. JSON.stringify will quote the value; we then patch
  // any '<' to '<' so a hostile env var still can't terminate the tag.
  return JSON.stringify(s).replace(/</g, "\\u003c");
};

const ConfigError = ({ missing }: { missing: string[] }) => (
  <html lang="he" dir="rtl">
    <body
      style={{
        fontFamily: "system-ui, sans-serif",
        background: "#fbfcf8",
        color: "#1b2422",
        padding: "32px",
        margin: 0,
        minHeight: "100vh",
      }}
    >
      <div style={{ maxWidth: 720, margin: "40px auto" }}>
        <h1 style={{ color: "#dc2626", margin: 0, fontSize: 28 }}>תצורה חסרה ב-Railway</h1>
        <p style={{ marginTop: 16, fontSize: 16 }}>
          המערכת אינה יכולה להתחיל כי משתני הסביבה הבאים לא מוגדרים על השירות ב-Railway:
        </p>
        <ul style={{ background: "#fff", padding: "16px 24px", borderRadius: 8, border: "1px solid #ddd" }}>
          {missing.map((k) => (
            <li key={k}>
              <code>{k}</code>
            </li>
          ))}
        </ul>
        <p style={{ marginTop: 16, fontSize: 14, color: "#61706a" }}>
          תיקון: Railway → Service → Variables → הוסף את המפתחות ולחץ Deploy.
          הערכים נמצאים ב-Supabase project settings → API. אחרי deploy חדש, התחברות תעבוד.
        </p>
        <p style={{ marginTop: 24, fontSize: 12, color: "#9aa6a1" }}>
          אבחון מלא: <code>/api/diagnose</code>
        </p>
      </div>
    </body>
  </html>
);

export default function RootLayout({ children }: { children: ReactNode }) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "").trim();

  const missing: string[] = [];
  if (!/^https?:\/\//.test(url)) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anon) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (missing.length > 0) {
    return <ConfigError missing={missing} />;
  }

  const configScript = `window.__SUPABASE_CONFIG__ = {url: ${sanitizeForScript(url)}, anonKey: ${sanitizeForScript(anon)}};`;

  return (
    <html lang="he" dir="ltr">
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
      <body dir="ltr">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
