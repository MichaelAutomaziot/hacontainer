import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SUPABASE_URL_TOKEN = "https://runtime-supabase-url.invalid";
const SUPABASE_ANON_KEY_TOKEN = "runtime-supabase-anon-key";

const TEXT_EXTENSIONS = new Set([
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".rsc",
  ".txt",
]);

const standaloneRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(standaloneRoot);

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

if (!/^https?:\/\//.test(supabaseUrl) || !supabaseAnonKey) {
  console.error(
    "Missing Supabase runtime config. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on the Railway service."
  );
  process.exit(1);
}

function replaceTokensInFile(filePath) {
  const ext = extname(filePath);
  if (ext && !TEXT_EXTENSIONS.has(ext)) return 0;

  let content = readFileSync(filePath, "utf8");
  if (!content.includes(SUPABASE_URL_TOKEN) && !content.includes(SUPABASE_ANON_KEY_TOKEN)) {
    return 0;
  }

  content = content
    .split(SUPABASE_URL_TOKEN)
    .join(supabaseUrl)
    .split(SUPABASE_ANON_KEY_TOKEN)
    .join(supabaseAnonKey);

  writeFileSync(filePath, content);
  return 1;
}

function replaceTokens(targetPath) {
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
}

const changedFiles = replaceTokens(resolve(".next")) + replaceTokens(resolve("server.js"));
console.log(`Runtime Supabase config applied to ${changedFiles} built file(s).`);

if (process.env.PATCH_RUNTIME_ENV_ONLY === "1") {
  process.exit(0);
}

const server = spawn(process.execPath, ["server.js"], {
  stdio: "inherit",
  env: process.env,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.kill(signal);
  });
}

server.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
