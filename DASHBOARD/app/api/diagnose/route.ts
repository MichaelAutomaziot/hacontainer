import { NextResponse } from "next/server";

/**
 * GET /api/diagnose — runtime config inspector. Reports which env vars are
 * present (without echoing secret values) so a deployment can be diagnosed
 * from the browser.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const present = (name: string) => {
  const v = process.env[name];
  return Boolean(v && v.trim());
};

const masked = (name: string) => {
  const v = process.env[name];
  if (!v) return null;
  const t = v.trim();
  if (t.length === 0) return null;
  if (t.length <= 8) return "***";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
};

export function GET() {
  const urlPresent = present("NEXT_PUBLIC_SUPABASE_URL");
  const anonPresent = present("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const servicePresent = present("SUPABASE_SERVICE_ROLE_KEY");
  const miraklPresent = present("MIRAKL_API_KEY");

  return NextResponse.json({
    ok: urlPresent && anonPresent,
    runtime: {
      node: process.version,
      port: process.env.PORT ?? null,
      hostname: process.env.HOSTNAME ?? null,
    },
    env: {
      NEXT_PUBLIC_SUPABASE_URL: urlPresent ? masked("NEXT_PUBLIC_SUPABASE_URL") : null,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonPresent ? masked("NEXT_PUBLIC_SUPABASE_ANON_KEY") : null,
      SUPABASE_SERVICE_ROLE_KEY: servicePresent ? masked("SUPABASE_SERVICE_ROLE_KEY") : null,
      MIRAKL_BASE_URL: process.env.MIRAKL_BASE_URL ?? null,
      MIRAKL_API_KEY: miraklPresent ? masked("MIRAKL_API_KEY") : null,
    },
    missing: [
      ...(urlPresent ? [] : ["NEXT_PUBLIC_SUPABASE_URL"]),
      ...(anonPresent ? [] : ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]),
    ],
  });
}
