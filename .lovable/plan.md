

## i18n FINALIZATION (OPTION B) — Implementation Plan

### Current State Analysis

| File | Current State | Required Change |
|------|--------------|-----------------|
| `src/locales/en.ts` | Line 1: `import { TranslationKey } from './pt-BR';`<br>Line 3: `Record<TranslationKey, string>` | Remove import, change to `Record<string, string>` |
| `src/locales/es.ts` | Line 1: `import { TranslationKey } from './pt-BR';`<br>Line 3: `Record<TranslationKey, string>` | Remove import, change to `Record<string, string>` |
| `src/locales/pt-BR.ts` | Exports `TranslationKey` type | No changes |
| `scripts/` directory | Does not exist | Create with `check-i18n-keys.js` |
| `package.json` | No `i18n:check` script | Add script entry |

---

### Implementation Tasks

#### Task 1: Update `src/locales/en.ts`

**Before (Lines 1-3):**
```typescript
import { TranslationKey } from './pt-BR';

export const en: Record<TranslationKey, string> = {
```

**After:**
```typescript
export const en: Record<string, string> = {
```

- Remove line 1 entirely (import statement)
- Change line 3 type annotation
- All 1,287 lines of translation content remain untouched

---

#### Task 2: Update `src/locales/es.ts`

**Before (Lines 1-3):**
```typescript
import { TranslationKey } from './pt-BR';

export const es: Record<TranslationKey, string> = {
```

**After:**
```typescript
export const es: Record<string, string> = {
```

- Remove line 1 entirely (import statement)
- Change line 3 type annotation
- All 1,287 lines of translation content remain untouched

---

#### Task 3: Create `scripts/check-i18n-keys.js`

Create new file with the exact script provided in the prompt. This dev-only utility:
- Reads all three locale files
- Extracts keys using regex pattern `/['"]([^'"]+)['"]\s*:/g`
- Compares pt-BR keys against en and es
- Reports missing and extra keys
- Exits with code 1 if missing keys found (for CI integration)

---

#### Task 4: Update `package.json`

Add to scripts section:
```json
"i18n:check": "node scripts/check-i18n-keys.js"
```

---

### Technical Details

#### Files Modified

| File | Action | Lines Changed |
|------|--------|---------------|
| `src/locales/en.ts` | Edit | 2 lines (remove import, change type) |
| `src/locales/es.ts` | Edit | 2 lines (remove import, change type) |
| `scripts/check-i18n-keys.js` | Create | New file (~60 lines) |
| `package.json` | Edit | 1 line (add script) |

#### Files NOT Modified

- `src/locales/pt-BR.ts` — Unchanged
- `src/contexts/I18nContext.tsx` — Unchanged
- Any component files — Unchanged
- Any styling files — Unchanged

---

### Validation Checklist

After implementation:

1. **TypeScript Build**: `npm run build` must pass without errors
2. **i18n Check Script**: `npm run i18n:check` must run and report key status
3. **Runtime Verification**: App loads, translations work, fallback works

---

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Type errors after removing strict typing | `Record<string, string>` is compatible with `I18nContext.tsx` which already uses this type |
| Translation keys broken | No keys are modified, only type annotations |
| Build failure | Changes are purely type-level, no runtime impact |

---

### Expected Outcome

```text
i18n FINALIZATION COMPLETED
├── en.ts: Record<string, string> ✓
├── es.ts: Record<string, string> ✓
├── pt-BR.ts: Unchanged ✓
├── I18nContext.tsx: Unchanged ✓
├── scripts/check-i18n-keys.js: Created ✓
├── package.json: i18n:check script added ✓
└── SAFE MODE: Zero regressions ✓
```
