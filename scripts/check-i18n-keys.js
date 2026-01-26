/**
 * i18n Key Consistency Checker (DEV-ONLY)
 * 
 * Compares translation keys across pt-BR, en, and es locale files.
 * Reports missing or extra keys.
 * 
 * Usage: node scripts/check-i18n-keys.js
 */

const fs = require('fs');
const path = require('path');

function extractKeys(content) {
  const keys = [];
  const regex = /['"]([^'"]+)['"]\s*:/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    keys.push(match[1]);
  }

  return keys;
}

function main() {
  const localesDir = path.join(__dirname, '..', 'src', 'locales');

  const ptBR = fs.readFileSync(path.join(localesDir, 'pt-BR.ts'), 'utf-8');
  const en = fs.readFileSync(path.join(localesDir, 'en.ts'), 'utf-8');
  const es = fs.readFileSync(path.join(localesDir, 'es.ts'), 'utf-8');

  const ptKeys = new Set(extractKeys(ptBR));
  const enKeys = new Set(extractKeys(en));
  const esKeys = new Set(extractKeys(es));

  console.log('\n📊 i18n Key Analysis');
  console.log('─'.repeat(50));
  console.log(`pt-BR: ${ptKeys.size} keys`);
  console.log(`en:    ${enKeys.size} keys`);
  console.log(`es:    ${esKeys.size} keys`);

  const missingEn = [...ptKeys].filter(k => !enKeys.has(k));
  const missingEs = [...ptKeys].filter(k => !esKeys.has(k));
  const extraEn = [...enKeys].filter(k => !ptKeys.has(k));
  const extraEs = [...esKeys].filter(k => !ptKeys.has(k));

  let hasErrors = false;

  if (missingEn.length) {
    hasErrors = true;
    console.log('\n❌ Missing in en.ts:');
    missingEn.forEach(k => console.log(' -', k));
  }

  if (missingEs.length) {
    hasErrors = true;
    console.log('\n❌ Missing in es.ts:');
    missingEs.forEach(k => console.log(' -', k));
  }

  if (extraEn.length) {
    console.log('\n⚠️ Extra in en.ts:');
    extraEn.forEach(k => console.log(' -', k));
  }

  if (extraEs.length) {
    console.log('\n⚠️ Extra in es.ts:');
    extraEs.forEach(k => console.log(' -', k));
  }

  if (!hasErrors) {
    console.log('\n✅ All locale files are consistent.');
  }

  console.log('\n' + '─'.repeat(50));

  process.exit(hasErrors ? 1 : 0);
}

main();
