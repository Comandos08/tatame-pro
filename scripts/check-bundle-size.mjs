#!/usr/bin/env node
/**
 * check-bundle-size.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Post-build budget enforcement. Fails CI when production bundle exceeds the
 * documented thresholds. Catches accidental dependency bloat (large icon set,
 * full lodash, missed dynamic-import opportunity).
 *
 * Budget rationale:
 *   - initial JS  : ≤ 600 KiB gzipped — covers React + Router + entry chunk.
 *   - initial CSS : ≤ 120 KiB gzipped — Tailwind v4 + shadcn baseline.
 *   - any single chunk : ≤ 350 KiB gzipped — caps lazy-loaded routes.
 *
 * The numbers below are starting budgets. Tighten as the team optimizes.
 * If a budget needs to grow, increase it intentionally with a brief comment
 * explaining why (new feature, vendor lib, etc).
 *
 * Usage:
 *   node scripts/check-bundle-size.mjs
 *   (or via `npm run build:size` once added to package.json)
 *
 * Exit codes: 0 = within budget. 1 = at least one budget exceeded.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = "dist/assets";
const BUDGETS = {
  initialJsGzipKiB: 600,
  initialCssGzipKiB: 120,
  anyChunkGzipKiB: 350,
};

function gzipSizeKiB(buf) {
  return Math.round((gzipSync(buf).byteLength / 1024) * 10) / 10;
}

function readDistAssets() {
  let entries;
  try {
    entries = readdirSync(DIST);
  } catch (err) {
    console.error(`✗ ${DIST} not found. Run \`npm run build\` first.`);
    process.exit(1);
  }
  return entries
    .filter((f) => f.endsWith(".js") || f.endsWith(".css"))
    .map((name) => {
      const p = join(DIST, name);
      const buf = readFileSync(p);
      return {
        name,
        kind: name.endsWith(".css") ? "css" : "js",
        rawKiB: Math.round((statSync(p).size / 1024) * 10) / 10,
        gzipKiB: gzipSizeKiB(buf),
      };
    });
}

const assets = readDistAssets();

// Initial chunks: Vite emits the entry as `index-*.js` / `index-*.css`.
const initialJs = assets.filter((a) => a.kind === "js" && /^index-/.test(a.name));
const initialCss = assets.filter((a) => a.kind === "css" && /^index-/.test(a.name));
const initialJsKiB = initialJs.reduce((s, a) => s + a.gzipKiB, 0);
const initialCssKiB = initialCss.reduce((s, a) => s + a.gzipKiB, 0);

const violations = [];

if (initialJsKiB > BUDGETS.initialJsGzipKiB) {
  violations.push(
    `initial JS ${initialJsKiB} KiB gz exceeds budget ${BUDGETS.initialJsGzipKiB} KiB`,
  );
}
if (initialCssKiB > BUDGETS.initialCssGzipKiB) {
  violations.push(
    `initial CSS ${initialCssKiB} KiB gz exceeds budget ${BUDGETS.initialCssGzipKiB} KiB`,
  );
}
for (const a of assets) {
  if (a.gzipKiB > BUDGETS.anyChunkGzipKiB) {
    violations.push(
      `chunk ${a.name} ${a.gzipKiB} KiB gz exceeds per-chunk budget ${BUDGETS.anyChunkGzipKiB} KiB`,
    );
  }
}

console.log("─── Bundle size report ─────────────────────────────");
console.log(`Initial JS  : ${initialJsKiB} KiB gz  (budget ${BUDGETS.initialJsGzipKiB})`);
console.log(`Initial CSS : ${initialCssKiB} KiB gz  (budget ${BUDGETS.initialCssGzipKiB})`);
console.log(`Total assets: ${assets.length}`);
console.log("Top 10 chunks by gzipped size:");
assets
  .sort((a, b) => b.gzipKiB - a.gzipKiB)
  .slice(0, 10)
  .forEach((a) => console.log(`  ${a.gzipKiB.toString().padStart(7)} KiB gz · ${a.name}`));

if (violations.length > 0) {
  console.error("\n✗ Bundle size budget violations:");
  for (const v of violations) console.error(`  - ${v}`);
  console.error(
    "\nIf the increase is intentional, raise the budget in scripts/check-bundle-size.mjs and commit with a justification.",
  );
  process.exit(1);
}

console.log("\n✓ All budgets respected.");
