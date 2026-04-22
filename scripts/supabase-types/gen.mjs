#!/usr/bin/env node
/**
 * Offline Supabase types generator.
 *
 * Lovable Cloud manages the real Supabase project, so there is no dashboard
 * token or live DB URL we can use with `supabase gen types typescript`. This
 * script reproduces the type-generation pipeline locally and deterministically:
 *
 *   1. Connect to a local Postgres (default: postgres://postgres:postgres@localhost:5432/tatame_gen).
 *   2. Apply scripts/supabase-types/bootstrap.sql to stub Supabase's
 *      auth/storage/cron/realtime surfaces.
 *   3. Apply every file in supabase/migrations in ascending order, patching
 *      on the fly to strip CREATE EXTENSION pg_cron (which requires
 *      shared_preload_libraries) and retry function redefinitions that
 *      conflict with existing DEFAULTs.
 *   4. Introspect the public schema with @supabase/postgres-meta (the exact
 *      same template the Supabase CLI uses internally) and write the output
 *      to src/integrations/supabase/types.ts.
 *
 * Usage:
 *   node scripts/supabase-types/gen.mjs                 # write to types.ts
 *   node scripts/supabase-types/gen.mjs --check         # diff-only; exit 1 on mismatch
 *   node scripts/supabase-types/gen.mjs --stdout        # print to stdout
 *
 * Environment:
 *   DATABASE_URL   Postgres connection string. Defaults to local.
 *   TYPES_PATH     Output path. Defaults to src/integrations/supabase/types.ts.
 */

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const bootstrapPath = join(__dirname, 'bootstrap.sql');
const migrationsDir = join(repoRoot, 'supabase', 'migrations');

const DATABASE_URL = process.env.DATABASE_URL
  ?? 'postgres://postgres:postgres@localhost:5432/tatame_gen';
const TYPES_PATH = process.env.TYPES_PATH
  ?? join(repoRoot, 'src', 'integrations', 'supabase', 'types.ts');

const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has('--check');
const TO_STDOUT = args.has('--stdout');

// -------------------------------------------------------------------------
// Migration preprocessing
// -------------------------------------------------------------------------

// Strip CREATE EXTENSION for extensions we've stubbed. The real Supabase DB
// has pg_cron/pg_net loaded via shared_preload_libraries; a throwaway local
// Postgres can't mimic that, so we substitute the stubs in bootstrap.sql.
const STRIP_EXTENSIONS = /^(\s*)CREATE EXTENSION (IF NOT EXISTS )?("?pg_cron"?|"?pg_net"?)/gim;

function preprocessMigration(sql, filename) {
  let out = sql.replace(STRIP_EXTENSIONS, '-- [STRIPPED by gen.mjs] $1CREATE EXTENSION $2$3');

  // Targeted patch: 20260209215053 alters user_roles.role TYPE while policies
  // still reference the column. In live Supabase this works because prior
  // migrations dropped those policies through Supabase-side state we can't
  // replicate. Locally we just skip the recreate — the enum narrowing is a
  // historical rename, not a schema surface that types depend on.
  if (filename.startsWith('20260209215053_')) {
    out = out
      .replace(
        /^ALTER TABLE public\.user_roles ALTER COLUMN role TYPE text;\s*$/m,
        '-- [PATCHED by gen.mjs] ALTER TABLE public.user_roles ALTER COLUMN role TYPE text;'
      )
      .replace(
        /^DROP TYPE IF EXISTS public\.app_role;\s*$/m,
        '-- [PATCHED by gen.mjs] DROP TYPE IF EXISTS public.app_role;'
      )
      .replace(
        /^CREATE TYPE public\.app_role AS ENUM[^;]+;\s*$/m,
        '-- [PATCHED by gen.mjs] CREATE TYPE public.app_role AS ENUM;'
      )
      .replace(
        /^ALTER TABLE public\.user_roles ALTER COLUMN role TYPE public\.app_role USING role::public\.app_role;\s*$/m,
        '-- [PATCHED by gen.mjs] ALTER TABLE public.user_roles ALTER COLUMN role TYPE public.app_role;'
      );
  }

  return out;
}

// Some CREATE OR REPLACE FUNCTION calls in later migrations drop a parameter
// default that was present in a prior version. Postgres refuses that and
// demands a DROP FUNCTION first. We retry those migrations after dropping the
// offending function.
const FUNCTION_REDEFINITION_RETRIES = {
  '20260317000003_fix_lifecycle_rpc_active_onboarding_incomplete.sql':
    'DROP FUNCTION IF EXISTS public.change_tenant_lifecycle_state(uuid, text, text) CASCADE;',
};

// -------------------------------------------------------------------------
// Runner
// -------------------------------------------------------------------------

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...opts });
}

function psql(sql, { allowFailure = false } = {}) {
  try {
    return run(`psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -c "${sql.replace(/"/g, '\\"')}"`);
  } catch (err) {
    if (allowFailure) return null;
    throw err;
  }
}

function psqlFile(path, { allowFailure = false } = {}) {
  try {
    return run(`psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${path}"`);
  } catch (err) {
    if (allowFailure) return null;
    throw err;
  }
}

function psqlPipe(sql) {
  return run(`psql "${DATABASE_URL}" -v ON_ERROR_STOP=1`, { input: sql });
}

function log(msg) {
  process.stderr.write(`[gen-types] ${msg}\n`);
}

// -------------------------------------------------------------------------
// Pipeline
// -------------------------------------------------------------------------

async function main() {
  log(`DATABASE_URL=${DATABASE_URL}`);

  // 1. Fresh DB: drop + recreate for deterministic runs.
  const url = new URL(DATABASE_URL);
  const dbName = url.pathname.replace(/^\//, '');
  const adminUrl = new URL(DATABASE_URL);
  adminUrl.pathname = '/postgres';
  log(`Resetting database "${dbName}"...`);
  try {
    run(`psql "${adminUrl.toString()}" -c "DROP DATABASE IF EXISTS ${dbName};"`);
    run(`psql "${adminUrl.toString()}" -c "CREATE DATABASE ${dbName};"`);
  } catch (err) {
    console.error('Failed to reset database:', err.message);
    console.error('Make sure Postgres is running and the admin user has permission.');
    process.exit(1);
  }

  // 2. Bootstrap stubs.
  log('Applying bootstrap stubs...');
  psqlFile(bootstrapPath);

  // 3. Apply migrations in order.
  const migrations = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  log(`Applying ${migrations.length} migrations...`);

  for (const filename of migrations) {
    const raw = readFileSync(join(migrationsDir, filename), 'utf8');
    const sql = preprocessMigration(raw, filename);
    try {
      psqlPipe(sql);
    } catch (err) {
      const retry = FUNCTION_REDEFINITION_RETRIES[filename];
      if (retry) {
        log(`  ${filename} failed; applying retry hook: ${retry}`);
        psqlPipe(retry);
        psqlPipe(sql);
      } else {
        console.error(`\nMigration failed: ${filename}`);
        console.error(err.stderr?.toString() ?? err.message);
        process.exit(1);
      }
    }
  }

  // Seed a profile row for the global admin so post-migration checks pass.
  psql(
    `INSERT INTO public.profiles (id, email) VALUES ('00000000-0000-0000-0000-000000000001', 'global@tatame.pro') ON CONFLICT DO NOTHING;`,
    { allowFailure: true }
  );

  // 4. Ensure @supabase/postgres-meta is available. We don't keep it as a
  //    direct devDependency because its transitive fastify pins trip
  //    `npm audit --audit-level=high` in the main CI job. We only need the
  //    typescript template and generator metadata functions (no HTTP server),
  //    so we install it on demand into a throwaway cache dir.
  const pgMetaVersion = '0.96.4';
  const cacheDir = join(repoRoot, 'node_modules', '.cache', 'supabase-types-gen');
  const pgMetaRoot = join(cacheDir, 'node_modules', '@supabase', 'postgres-meta');
  if (!existsSync(pgMetaRoot)) {
    log(`Installing @supabase/postgres-meta@${pgMetaVersion} into ${cacheDir}...`);
    run(`mkdir -p "${cacheDir}"`);
    writeFileSync(
      join(cacheDir, 'package.json'),
      JSON.stringify({ name: 'supabase-types-gen', private: true }, null, 2),
    );
    run(
      `npm install --prefix "${cacheDir}" --no-audit --no-fund --silent @supabase/postgres-meta@${pgMetaVersion}`,
      { stdio: 'inherit' },
    );
  }

  log('Introspecting schema and generating TypeScript...');
  const { PostgresMeta } = await import(join(pgMetaRoot, 'dist', 'lib', 'index.js'));
  const templateModule = await import(
    join(pgMetaRoot, 'dist', 'server', 'templates', 'typescript.js')
  );
  const generatorsModule = await import(
    join(pgMetaRoot, 'dist', 'lib', 'generators.js')
  );

  const pgMeta = new PostgresMeta({ connectionString: DATABASE_URL, max: 1 });
  const { data: meta, error } = await generatorsModule.getGeneratorMetadata(pgMeta, {
    includedSchemas: ['public'],
    excludedSchemas: [],
  });
  if (error) {
    console.error('postgres-meta error:', error);
    process.exit(1);
  }

  const output = await templateModule.apply({
    ...meta,
    detectOneToOneRelationships: true,
    postgrestVersion: '14.1',
  });

  await pgMeta.end();

  // 5. Write or compare.
  if (TO_STDOUT) {
    process.stdout.write(output);
    return;
  }

  if (CHECK_ONLY) {
    if (!existsSync(TYPES_PATH)) {
      console.error(`Committed types file missing: ${TYPES_PATH}`);
      process.exit(1);
    }
    const committed = readFileSync(TYPES_PATH, 'utf8');
    if (output === committed) {
      log('✓ Generated types match committed types.ts.');
      return;
    }
    console.error('Generated Supabase types differ from committed types.ts.');
    console.error('Run `npm run db:gen-types` locally, review the diff, and commit the result.');
    console.error('If the diff is unexpected, audit recent migrations for drift.');
    process.exit(1);
  }

  writeFileSync(TYPES_PATH, output);
  log(`✓ Wrote ${TYPES_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
