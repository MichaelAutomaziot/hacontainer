"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

const cookieAdapter = {
  get(name: string) {
    if (typeof document === "undefined") return undefined;
    const cookie = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${name}=`));
    return cookie ? decodeURIComponent(cookie.split("=")[1]) : undefined;
  },
  set(name: string, value: string, options: any) {
    if (typeof document === "undefined") return;
    const expires = options?.maxAge
      ? new Date(Date.now() + options.maxAge * 1000).toUTCString()
      : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; ${
      expires ? `expires=${expires};` : ""
    } SameSite=Lax`;
  },
  remove(name: string, _options: any) {
    if (typeof document === "undefined") return;
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  },
};

export const supabaseClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  cookies: cookieAdapter,
});

export const supabaseAuthClient = supabaseClient;
export const supabaseDataClient = supabaseClient;

export async function syncSession() {
  /* no-op: single client, cookies persisted automatically. Kept for back-compat. */
}
