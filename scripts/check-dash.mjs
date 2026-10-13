// House style: the em dash character is never used in this repository.
// Prints every place it appears and exits with an error if there is one.
// AGENTS.md is skipped because Next.js writes that file.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DASH = String.fromCharCode(0x2014);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "coverage", "out", "build"]);
const SKIP_FILES = new Set(["AGENTS.md", "LICENSE", "package-lock.json"]);
const TEXT = /\.(md|mdx|ts|tsx|mts|mjs|js|json|sql|css|sh|yml|yaml|svg|txt|example)$/;

const found = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (!SKIP_FILES.has(name) && TEXT.test(name)) {
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (line.includes(DASH)) found.push(`${path}:${i + 1}: ${line.trim().slice(0, 100)}`);
        });
    }
  }
}
walk(".");

if (found.length > 0) {
  console.error(`Em dash found in ${found.length} place(s). Use a full stop, comma, colon or brackets instead.\n`);
  console.error(found.join("\n"));
  process.exit(1);
}
