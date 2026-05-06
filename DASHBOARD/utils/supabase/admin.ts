/**
 * Service-role Supabase client.
 *
 * SERVER-ONLY. Never import this from a `'use client'` component or anything
 * that ends up in a client bundle. The lint rule (eslint config) restricts
 * this file to be imported only from `app/api/**` and `lib/server/**` paths.
 *
 * Use cases:
 *   - Calling Postgres RPCs that require service_role (e.g. sync_konimbo_orphans,
 *     sync_superpharm_orphans, dashboard_summary).
 *   - Inserting into sync_jobs from API routes.
 *   - Triggering Supabase Edge Functions with the service-role JWT in the
 *     Authorization header (verify_jwt=true requirement).
 *
 * Never exposed to the browser — Next.js will throw a build error if a
 * 'use client' module imports something that imports this.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

const trim = (v: string | undefined | null): string => (v ?? "").trim();

/** Resolve URL + service-role key from env, accepting either naming convention.
 *  Read at call time (not module-load) so a fresh process picks up updated env. */
const readEnv = (): { url: string; serviceKey: string; missing: string[] } => {
  const url = trim(process.env.NEXT_PUBLIC_SUPABASE_URL) || trim(process.env.SUPABASE_URL);
  const serviceKey =
    trim(process.env.SUPABASE_SERVICE_ROLE_KEY) || trim(process.env.SUPABASE_SERVICE_KEY);
  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
  if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)");
  return { url, serviceKey, missing };
};

export const getServiceClient = (): SupabaseClient => {
  if (_admin) return _admin;
  const { url, serviceKey, missing } = readEnv();
  if (missing.length > 0) {
    throw new Error(`getServiceClient: missing env var(s): ${missing.join(", ")}`);
  }
  _admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
};
