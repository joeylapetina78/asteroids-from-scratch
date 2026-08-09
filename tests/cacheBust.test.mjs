import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

// The browser serves modules over plain HTTP with no build step. `bump-cache.js`
// busts the cache by rewriting every `?v=` query string in `src/`. A relative
// import that has NO `?v=` cannot be rewritten, so once that module is edited the
// browser keeps serving the stale copy — the tests stay green while the game is
// dead at boot. This guard makes that failure mode impossible to reintroduce.

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
// Matches `from "<spec>"` and `import("<spec>")` re-exports/imports alike.
const IMPORT_RE = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".js")) out.push(full);
  }
  return out;
}

test("every relative src import carries a ?v= cache-bust tag", () => {
  const offenders = [];
  for (const file of walk(SRC_DIR)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT_RE)) {
      const spec = match[1];
      if (!spec.startsWith("./") && !spec.startsWith("../")) continue; // bare/npm/node: specifiers
      const [path] = spec.split("?");
      if (!path.endsWith(".js")) continue;
      if (!spec.includes("?v=")) offenders.push(`${relative(SRC_DIR, file)} → ${spec}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Relative src imports missing a ?v= tag (bump-cache cannot bust these — game will boot stale):\n  ${offenders.join("\n  ")}`,
  );
});
