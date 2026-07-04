#!/usr/bin/env node
// bump-cache.js
// Run after browser-facing JS/CSS/HTML edits: npm run bump:cache
// Replaces every ?v= query string in JS imports, CSS links, and HTML script tags
// with a single fresh version tag derived from the current git hash + timestamp.
//
// Then reload the browser — every module URL is new, so nothing is served from cache.

import { execSync } from "child_process";
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// --- build fresh version tag ---
const gitHash = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "local";
  }
})();

const now = new Date();
const stamp = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
  "-",
  String(now.getHours()).padStart(2, "0"),
  String(now.getMinutes()).padStart(2, "0"),
].join("");

const newVersion = `fresh-${stamp}-${gitHash}`;

// --- helpers ---
const VERSION_RE = /(\?v=)[A-Za-z0-9_-]+/g;

function countMatches(str) {
  return (str.match(VERSION_RE) ?? []).length;
}

function bumpFile(filePath) {
  const original = readFileSync(filePath, "utf8");
  const updated = original.replace(VERSION_RE, `$1${newVersion}`);
  if (updated === original) return 0;
  writeFileSync(filePath, updated, "utf8");
  return countMatches(original);
}

function walkJs(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkJs(full, out);
    } else if (extname(full) === ".js") {
      out.push(full);
    }
  }
  return out;
}

// --- run ---
console.log(`\nBumping cache to: ${newVersion}\n`);

let total = 0;

for (const file of walkJs("src")) {
  const n = bumpFile(file);
  if (n > 0) {
    console.log(`  ${file.replace(/\\/g, "/")}  (${n})`);
    total += n;
  }
}

const htmlN = bumpFile("index.html");
if (htmlN > 0) {
  console.log(`  index.html  (${htmlN})`);
  total += htmlN;
}

console.log(`\n${total} version string${total !== 1 ? "s" : ""} replaced.`);
console.log(`Hard-reload the browser and every module will be fresh.\n`);
