const PLACEHOLDER_SUPABASE_URL = "https://placeholder.supabase.co";
const PLACEHOLDER_SUPABASE_KEY = "placeholder-key";

function requireSupabaseEnv(name: string, value: string | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed || trimmed === PLACEHOLDER_SUPABASE_URL || trimmed === PLACEHOLDER_SUPABASE_KEY) {
    throw new Error(
      `${name} is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before building or starting the dashboard.`
    );
  }

  return trimmed;
}

export const SUPABASE_URL = requireSupabaseEnv(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL
);

export const SUPABASE_ANON_KEY = requireSupabaseEnv(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
