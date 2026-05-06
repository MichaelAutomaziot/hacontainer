// Resolves Supabase URL + anon key for browser and server contexts.
//
//   - On the server: read process.env directly. Always real values (when set
//     on the Railway service).
//   - In the browser: read from window.__SUPABASE_CONFIG__ — this is injected
//     by the root layout from process.env at request time. Falls back to
//     NEXT_PUBLIC_* if Next baked them in at build time. Final fallback is the
//     placeholder token, kept only so legacy/cached chunks don't crash.

export const RUNTIME_SUPABASE_URL_TOKEN = "https://runtime-supabase-url.invalid";
export const RUNTIME_SUPABASE_ANON_KEY_TOKEN = "runtime-supabase-anon-key";

declare global {
  interface Window {
    __SUPABASE_CONFIG__?: {
      url?: string;
      anonKey?: string;
    };
  }
}

const trim = (v: string | undefined | null): string => (v ?? "").trim();

const fromBrowser = (): { url: string; anonKey: string } => {
  if (typeof window === "undefined") return { url: "", anonKey: "" };
  const cfg = window.__SUPABASE_CONFIG__;
  return { url: trim(cfg?.url), anonKey: trim(cfg?.anonKey) };
};

const fromBuild = (): { url: string; anonKey: string } => ({
  url: trim(process.env.NEXT_PUBLIC_SUPABASE_URL),
  anonKey: trim(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
});

const resolve = (): { url: string; anonKey: string } => {
  if (typeof window !== "undefined") {
    // Browser: prefer runtime injection, fall back to baked-in build value.
    const w = fromBrowser();
    if (w.url && w.anonKey) return w;
    const b = fromBuild();
    return {
      url: w.url || b.url,
      anonKey: w.anonKey || b.anonKey,
    };
  }
  // Server (or build phase): plain process.env.
  return fromBuild();
};

const config = resolve();

export const SUPABASE_URL = config.url || RUNTIME_SUPABASE_URL_TOKEN;
export const SUPABASE_ANON_KEY = config.anonKey || RUNTIME_SUPABASE_ANON_KEY_TOKEN;
