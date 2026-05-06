// Minimal launcher for the Next.js standalone bundle on Railway.
//
// Supabase URL/anon key are no longer baked into the build. They are now
// injected into the HTML at request time by app/layout.tsx (server
// component) which reads process.env. So this script just sets cwd and
// spawns server.js with the inherited environment.
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const standaloneRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(standaloneRoot);

console.log(
  `[start-standalone] cwd=${process.cwd()} node=${process.version} ` +
    `PORT=${process.env.PORT ?? "(unset)"} HOSTNAME=${process.env.HOSTNAME ?? "(unset)"}`,
);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
if (!/^https?:\/\//.test(supabaseUrl)) {
  console.warn(
    "[start-standalone] WARNING: NEXT_PUBLIC_SUPABASE_URL is not set on the Railway service. " +
      "Server will start, but Supabase-backed routes (login, catalog, sync) will fail until set.",
  );
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
  process.on(signal, () => server.kill(signal));
}

server.on("exit", (code, signal) => {
  console.log(`[start-standalone] server exited code=${code} signal=${signal}`);
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
