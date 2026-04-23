#!/usr/bin/env node
/**
 * verify-build-env.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Post-build smoke check. Confirms the Vite output actually has the expected
 * environment variables baked into it. Catches the failure mode where the
 * build runs without VITE_SUPABASE_* present and Vite silently substitutes
 * `undefined` literals into the bundle — which then ships to production and
 * blows up in users' browsers (the red "Configuração de ambiente ausente"
 * screen we added in src/integrations/supabase/client.ts).
 *
 * Three checks (all must pass; any failure = exit 1):
 *
 *   1. dist/assets/*.js contains the literal Supabase project URL host.
 *      Proves `import.meta.env.VITE_SUPABASE_URL` was substituted, not
 *      replaced with `undefined`.
 *
 *   2. dist/index.html has no leftover `%VITE_*%` placeholders. Vite's
 *      HTML transform replaces these only when the matching env var is
 *      defined; surviving placeholders are a tell that env vars were
 *      missing at build time.
 *
 *   3. Logs the names of all VITE_* env vars present in process.env at
 *      build-verify time. Names only — never values, never hashes,
 *      never anything that could leak the JWT anon key into a public
 *      build log.
 *
 * Usage:
 *   node scripts/verify-build-env.mjs
 *   (or via `npm run build:verify` which does build + verify in one shot)
 *
 * Exit codes: 0 = all checks passed. 1 = at least one check failed.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ─── Configuration ───────────────────────────────────────────────────────────

// The Supabase project ref this build is expected to point at. Must match
// the `ref` segment of VITE_SUPABASE_URL. Hard-coded intentionally — this is
// a published, public identifier (the host appears in every API call), and
// hard-coding lets the verifier fail loud if the build accidentally targets
// a different project.
const EXPECTED_SUPABASE_HOST = "kotxhtveuegrywzyvdnl.supabase.co";

const DIST_DIR = "dist";
const ASSETS_DIR = join(DIST_DIR, "assets");
const INDEX_HTML = join(DIST_DIR, "index.html");

// ─── Tiny logging helpers ────────────────────────────────────────────────────

const PREFIX = "[env-check]";
const log = (msg) => console.log(`${PREFIX} ${msg}`);
const fail = (msg) => console.error(`${PREFIX} ✗ ${msg}`);
const ok = (msg) => console.log(`${PREFIX} ✓ ${msg}`);

let failed = false;
const markFailed = () => {
  failed = true;
};

// ─── Pre-flight: dist/ must exist ────────────────────────────────────────────

if (!existsSync(DIST_DIR) || !existsSync(ASSETS_DIR) || !existsSync(INDEX_HTML)) {
  fail(
    `Build output not found. Expected ${DIST_DIR}/, ${ASSETS_DIR}/, and ${INDEX_HTML}. ` +
      `Run \`npm run build\` first, or use \`npm run build:verify\`.`,
  );
  process.exit(1);
}

// ─── Check 3 (run first so the inventory shows even if checks 1/2 fail) ──────
// List which VITE_* keys are visible to this process. Names only.

const presentViteKeys = Object.keys(process.env)
  .filter((k) => k.startsWith("VITE_"))
  .sort();

if (presentViteKeys.length === 0) {
  log("VITE_* keys present in process.env: (none)");
} else {
  log(`VITE_* keys present in process.env: ${presentViteKeys.join(", ")}`);
}

// Expected VITE_* keys for this app. We surface missing ones up front so the
// operator knows what to fix even before checks 1/2 explain the symptom.
const EXPECTED_VITE_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
];
const missingExpected = EXPECTED_VITE_KEYS.filter((k) => !process.env[k]);
if (missingExpected.length > 0) {
  log(`VITE_* keys missing (from expected): ${missingExpected.join(", ")}`);
} else {
  log("VITE_* keys missing (from expected): (none)");
}

// ─── Check 1: Supabase URL must be present in at least one JS chunk ──────────

const jsFiles = readdirSync(ASSETS_DIR).filter((f) => f.endsWith(".js"));
if (jsFiles.length === 0) {
  fail(`No .js files found under ${ASSETS_DIR}/. Did the build complete?`);
  markFailed();
}

let foundSupabaseHost = false;
let suspiciousUndefined = false;
for (const file of jsFiles) {
  const content = readFileSync(join(ASSETS_DIR, file), "utf8");
  if (content.includes(EXPECTED_SUPABASE_HOST)) {
    foundSupabaseHost = true;
  }
  // The exact pattern Vite produces when VITE_SUPABASE_URL is undefined and
  // some code does `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/...` —
  // the URL becomes `undefined/rest/v1/...`. We can't catch every shape,
  // but we can catch the most common one defensively.
  if (content.includes("supabase.co/undefined") || content.includes("undefined.supabase.co")) {
    suspiciousUndefined = true;
  }
}

if (foundSupabaseHost) {
  ok(`Supabase host "${EXPECTED_SUPABASE_HOST}" found in dist/assets/*.js`);
} else {
  fail(
    `Supabase host "${EXPECTED_SUPABASE_HOST}" NOT found in any dist/assets/*.js file. ` +
      `This means VITE_SUPABASE_URL was unset at build time and Vite substituted ` +
      `\`undefined\` into the bundle. Set VITE_SUPABASE_URL in your build environment ` +
      `(Lovable Cloud → Project Settings → Environment Variables, or .env locally) ` +
      `and rebuild.`,
  );
  markFailed();
}

if (suspiciousUndefined) {
  fail(
    `Found "supabase.co/undefined" or "undefined.supabase.co" in a bundle — ` +
      `confirms an env var was undefined when the bundle was emitted.`,
  );
  markFailed();
}

// ─── Check 2: index.html must have no surviving %VITE_*% placeholders ────────

const indexHtml = readFileSync(INDEX_HTML, "utf8");
// Vite's HTML transform replaces %VAR% only when env.VAR is defined.
// Any leftover %VITE_xxx% means the corresponding var was missing.
const placeholderMatches = [...indexHtml.matchAll(/%VITE_[A-Z0-9_]+%/g)];
const uniquePlaceholders = [...new Set(placeholderMatches.map((m) => m[0]))];

if (uniquePlaceholders.length === 0) {
  ok(`No surviving %VITE_*% placeholders in ${INDEX_HTML}`);
} else {
  fail(
    `Found unsubstituted placeholders in ${INDEX_HTML}: ${uniquePlaceholders.join(", ")}. ` +
      `Vite leaves %VAR% intact when the env var is missing — define them and rebuild.`,
  );
  markFailed();
}

// ─── Verdict ─────────────────────────────────────────────────────────────────

if (failed) {
  console.error("");
  fail("Build verification FAILED. Bundle is not safe to publish.");
  process.exit(1);
}

console.log("");
ok("Build verification passed. Bundle has expected env vars baked in.");
process.exit(0);
