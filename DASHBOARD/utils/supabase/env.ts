export const RUNTIME_SUPABASE_URL_TOKEN = "https://runtime-supabase-url.invalid";
export const RUNTIME_SUPABASE_ANON_KEY_TOKEN = "runtime-supabase-anon-key";

function supabaseEnvOrRuntimeToken(value: string | undefined, token: string): string {
  const trimmed = value?.trim();
  return trimmed || token;
}

export const SUPABASE_URL = supabaseEnvOrRuntimeToken(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  RUNTIME_SUPABASE_URL_TOKEN
);

export const SUPABASE_ANON_KEY = supabaseEnvOrRuntimeToken(
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  RUNTIME_SUPABASE_ANON_KEY_TOKEN
);
