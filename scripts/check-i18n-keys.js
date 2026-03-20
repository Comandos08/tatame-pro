/**
 * i18n Key Validator
 *
 * Two-pass validation:
 *   Pass 1 — Consistency: all keys in pt-BR must exist in en and es (and vice-versa).
 *   Pass 2 — Coverage:    all keys referenced in src/ must exist in pt-BR.
 *
 * Detected call patterns:
 *   t('key')  t("key")
 *   titleKey="key"  descriptionKey="key"  labelKey="key"  featureKey="key"
 *   i18nKey="key"  translationKey="key"  messageKey="key"  placeholderKey="key"
 *
 * Usage: node scripts/check-i18n-keys.js
 * Exit code 1 if any error is found.
 */

const fs   = require('fs');
const path = require('path');

// ─── helpers ─────────────────────────────────────────────────────────────────

function extractLocaleKeys(content) {
  const keys = [];
  const regex = /['"]([^'"]+)['"]\s*:/g;
  let match;
  while ((match = regex.exec(content)) !== null) keys.push(match[1]);
  return keys;
}

function walkSync(dir, exts, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
        walkSync(full, exts, results);
      }
    } else if (exts.some(e => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

function extractUsedKeys(srcDir) {
  const files = walkSync(srcDir, ['.ts', '.tsx']);
  const used = new Set();

  // t('key') and t("key") — static string only (skip template literals)
  const tCall = /\bt\(\s*['"]([^'"]+)['"]/g;

  // *Key="value" or *Key={'value'} prop patterns
  const keyProp = /(?:titleKey|descriptionKey|labelKey|featureKey|i18nKey|translationKey|messageKey|placeholderKey|actionKey|hintKey)\s*=\s*['"{](['"]?)([^'"}\s]+)\1/g;

  for (const file of files) {
    // skip locale files themselves
    if (file.includes('/locales/')) continue;

    const content = fs.readFileSync(file, 'utf-8');

    let m;
    while ((m = tCall.exec(content)) !== null)   used.add(m[1]);
    while ((m = keyProp.exec(content)) !== null)  used.add(m[2]);
  }

  return used;
}

// ─── main ────────────────────────────────────────────────────────────────────

function main() {
  const root       = path.join(__dirname, '..');
  const localesDir = path.join(root, 'src', 'locales');
  const srcDir     = path.join(root, 'src');

  const ptBR = fs.readFileSync(path.join(localesDir, 'pt-BR.ts'), 'utf-8');
  const en   = fs.readFileSync(path.join(localesDir, 'en.ts'),    'utf-8');
  const es   = fs.readFileSync(path.join(localesDir, 'es.ts'),    'utf-8');

  const ptKeys = new Set(extractLocaleKeys(ptBR));
  const enKeys = new Set(extractLocaleKeys(en));
  const esKeys = new Set(extractLocaleKeys(es));

  console.log('\n📊 i18n Key Analysis');
  console.log('─'.repeat(60));
  console.log(`pt-BR: ${ptKeys.size} keys`);
  console.log(`en:    ${enKeys.size} keys`);
  console.log(`es:    ${esKeys.size} keys`);

  let hasErrors = false;

  // ── Pass 1: cross-locale consistency ──────────────────────────────────────
  console.log('\n── Pass 1: Cross-locale consistency ──');

  const missingEn = [...ptKeys].filter(k => !enKeys.has(k));
  const missingEs = [...ptKeys].filter(k => !esKeys.has(k));
  const extraEn   = [...enKeys].filter(k => !ptKeys.has(k));
  const extraEs   = [...esKeys].filter(k => !ptKeys.has(k));

  if (missingEn.length) {
    hasErrors = true;
    console.log(`\n❌ Missing in en.ts (${missingEn.length}):`);
    missingEn.forEach(k => console.log('  -', k));
  }
  if (missingEs.length) {
    hasErrors = true;
    console.log(`\n❌ Missing in es.ts (${missingEs.length}):`);
    missingEs.forEach(k => console.log('  -', k));
  }
  if (extraEn.length) {
    console.log(`\n⚠️  Extra in en.ts (not in pt-BR) (${extraEn.length}):`);
    extraEn.forEach(k => console.log('  -', k));
  }
  if (extraEs.length) {
    console.log(`\n⚠️  Extra in es.ts (not in pt-BR) (${extraEs.length}):`);
    extraEs.forEach(k => console.log('  -', k));
  }
  if (!missingEn.length && !missingEs.length) {
    console.log('  ✅ All locales are consistent with pt-BR.');
  }

  // ── Pass 2: coverage — keys used in src but missing from pt-BR ────────────
  console.log('\n── Pass 2: Source coverage ──');

  const usedKeys = extractUsedKeys(srcDir);
  const undefined_ = [...usedKeys].filter(k => !ptKeys.has(k));

  if (undefined_.length) {
    hasErrors = true;
    console.log(`\n❌ Keys used in code but NOT defined in any locale (${undefined_.length}):`);
    undefined_.forEach(k => console.log('  -', k));
  } else {
    console.log(`  ✅ All ${usedKeys.size} referenced keys are defined in pt-BR.ts.`);
  }

  console.log('\n' + '─'.repeat(60));

  if (hasErrors) {
    console.log('❌ i18n validation FAILED — see errors above.\n');
    process.exit(1);
  } else {
    console.log('✅ i18n validation PASSED.\n');
    process.exit(0);
  }
}

main();
