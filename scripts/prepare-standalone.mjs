import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = process.cwd();
const standalone = resolve(root, ".next", "standalone");

function copyDir(from, to) {
  const src = resolve(root, from);
  const dst = resolve(root, to);
  if (!existsSync(src)) return;
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dirname(dst), { recursive: true });
  copyTree(src, dst);
}

function copyTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const entrySrc = join(src, entry);
    const entryDst = join(dst, entry);
    if (statSync(entrySrc).isDirectory()) {
      copyTree(entrySrc, entryDst);
    } else {
      copyFileSync(entrySrc, entryDst);
    }
  }
}

copyDir("public", ".next/standalone/public");
copyDir(".next/static", ".next/standalone/.next/static");

if (!existsSync(resolve(standalone, "server.js"))) {
  throw new Error("Standalone server was not generated. Check next.config.js output setting.");
}
