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

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

let _admin: SupabaseClient | null = null;

export const getServiceClient = (): SupabaseClient => {
  if (_admin) return _admin;
  if (!URL || !SR) {
    throw new Error(
      "getServiceClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
    );
  }
  _admin = createClient(URL, SR, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
};
