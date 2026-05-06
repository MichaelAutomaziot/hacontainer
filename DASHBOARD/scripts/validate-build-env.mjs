import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const localEnvFiles = [".env.local", ".env"];

for (const file of localEnvFiles) {
  const path = resolve(file);
  if (!existsSync(path)) continue;

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");

    if (key && !process.env[key]) process.env[key] = value;
  }
}

const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const invalid = new Set(["https://placeholder.supabase.co", "placeholder-key"]);
const missing = required.filter((name) => {
  const value = process.env[name]?.trim();
  return !value || invalid.has(value);
});

if (missing.length > 0) {
  console.error(`Missing required build environment variables: ${missing.join(", ")}`);
  console.error(
    "Set the real Supabase public URL and anon key before running next build. NEXT_PUBLIC_* values are embedded into the browser bundle at build time."
  );
  process.exit(1);
}
