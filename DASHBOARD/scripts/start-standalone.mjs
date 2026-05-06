// Resilient launcher for Next.js standalone bundle.
//
// Behaviour:
//   1. Patch baked-in Supabase placeholder tokens with the real runtime values
//      from the Railway service environment.
//   2. NEVER exit on missing config or patch failure — log loudly and start
//      server.js anyway. We want the container alive so Railway's TCP probe
//      passes; auth-dependent routes will surface their own errors at runtime.
//   3. Forward signals so SIGINT/SIGTERM cleanly stop the child server.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SUPABASE_URL_TOKEN = "https://runtime-supabase-url.invalid";
const SUPABASE_ANON_KEY_TOKEN = "runtime-supabase-anon-key";

const TEXT_EXTENSIONS = new Set([".html", ".js", ".json", ".mjs", ".rsc", ".txt"]);

const standaloneRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(standaloneRoot);

console.log(`[start-standalone] cwd=${process.cwd()} node=${process.version}`);
console.log(`[start-standalone] PORT=${process.env.PORT ?? "(unset)"} HOSTNAME=${process.env.HOSTNAME ?? "(unset)"}`);

function readFirstEnv(names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

const supabaseUrl = readFirstEnv([
  "NEXT_PUBLIC_SUPABASE_URL",
  "CLIENT_SUPABASE_URL",
  "SUPABASE_URL",
]);

const supabaseAnonKey = readFirstEnv([
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "CLIENT_SUPABASE_ANON_KEY",
  "CLIENT_SUPABASE_KEY",
]);

const supabaseConfigured = /^https?:\/\//.test(supabaseUrl) && Boolean(supabaseAnonKey);

if (!supabaseConfigured) {
  console.warn(
    "[start-standalone] WARNING: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing. " +
      "Server will start but Supabase-backed routes will fail until env vars are set on the Railway service.",
  );
}

function replaceTokensInFile(filePath) {
  try {
    const ext = extname(filePath);
    if (ext && !TEXT_EXTENSIONS.has(ext)) return 0;

    const content = readFileSync(filePath, "utf8");
    if (!content.includes(SUPABASE_URL_TOKEN) && !content.includes(SUPABASE_ANON_KEY_TOKEN)) {
      return 0;
    }

    const patched = content
      .split(SUPABASE_URL_TOKEN)
      .join(supabaseUrl || SUPABASE_URL_TOKEN)
      .split(SUPABASE_ANON_KEY_TOKEN)
      .join(supabaseAnonKey || SUPABASE_ANON_KEY_TOKEN);

    if (patched === content) return 0;

    writeFileSync(filePath, patched);
    return 1;
  } catch (err) {
    console.warn(`[start-standalone] patch skip ${filePath}: ${err?.message ?? err}`);
    return 0;
  }
}

function replaceTokens(targetPath) {
  try {
    if (!existsSync(targetPath)) return 0;
    const stats = statSync(targetPath);
    if (stats.isFile()) return replaceTokensInFile(targetPath);
    if (!stats.isDirectory()) return 0;

    let changed = 0;
    for (const entry of readdirSync(targetPath)) {
      if (entry === "node_modules") continue;
      changed += replaceTokens(resolve(targetPath, entry));
    }
    return changed;
  } catch (err) {
    console.warn(`[start-standalone] traverse skip ${targetPath}: ${err?.message ?? err}`);
    return 0;
  }
}

if (supabaseConfigured) {
  try {
    const changedFiles = replaceTokens(resolve(".next")) + replaceTokens(resolve("server.js"));
    console.log(`[start-standalone] runtime Supabase config applied to ${changedFiles} built file(s).`);
  } catch (err) {
    console.warn(`[start-standalone] token replacement failed: ${err?.message ?? err}`);
  }
} else {
  console.warn("[start-standalone] skipping token patch — env not configured");
}

if (process.env.PATCH_RUNTIME_ENV_ONLY === "1") {
  process.exit(0);
}

console.log("[start-standalone] launching server.js…");

const server = spawn(process.execPath, ["server.js"], {
  stdio: "inherit",
  env: process.env,
});

server.on("error", (err) => {
  console.error(`[start-standalone] server spawn error: ${err?.message ?? err}`);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.kill(signal);
  });
}

server.on("exit", (code, signal) => {
  console.log(`[start-standalone] server exited code=${code} signal=${signal}`);
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
