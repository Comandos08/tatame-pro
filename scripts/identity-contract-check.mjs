/**
 * 🔒 IDENTITY CONTRACT CHECK — CI Enforcement
 *
 * P3: Bloqueia regressões humanas que reintroduzam decisão distribuída.
 * Falha com exit code 1 se violação for encontrada.
 *
 * RUN: npm run identity:check
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

// Arquivos onde padrões são PERMITIDOS
const ALLOWED_FILES = new Set([
  path.join(SRC, 'components/identity/IdentityGate.tsx'),
  path.join(SRC, 'pages/IdentityWizard.tsx'),
]);

// Diretórios onde padrões são PERMITIDOS
const ALLOWED_DIR_PREFIXES = [
  path.join(SRC, 'lib/identity') + path.sep,
];

// Padrões PROIBIDOS fora dos arquivos/diretórios permitidos
const FORBIDDEN_PATTERNS = [
  {
    name: 'IdentityGuard resurrection',
    re: /\bIdentityGuard\b/,
  },
  {
    name: 'Direct wizard navigation (navigate)',
    re: /navigate\(\s*['"]\/identity\/wizard['"]/,
  },
  {
    name: 'Direct wizard Navigate component',
    re: /<Navigate[^>]*to=['"]\/identity\/wizard['"]/,
  },
  {
    name: 'wizardCompleted heuristic outside wizard UI',
    re: /\bwizardCompleted\b/,
  },
];

function listTsFiles(dir) {
  const out = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        out.push(...listTsFiles(full));
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        out.push(full);
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return out;
}

function isAllowed(file) {
  if (ALLOWED_FILES.has(file)) return true;
  return ALLOWED_DIR_PREFIXES.some((prefix) => file.startsWith(prefix));
}

const files = listTsFiles(SRC);
const violations = [];

for (const file of files) {
  if (isAllowed(file)) continue;

  const content = fs.readFileSync(file, 'utf8');

  for (const p of FORBIDDEN_PATTERNS) {
    if (p.re.test(content)) {
      violations.push({ file: path.relative(ROOT, file), pattern: p.name });
    }
  }
}

if (violations.length) {
  console.error('❌ IDENTITY CONTRACT VIOLATIONS FOUND:\n');
  for (const v of violations) {
    console.error(`  - ${v.pattern}`);
    console.error(`    in ${v.file}\n`);
  }
  console.error('See docs/IDENTITY-CONTRACT.md for allowed patterns.');
  process.exit(1);
}

console.log('✅ Identity contract check passed.');
