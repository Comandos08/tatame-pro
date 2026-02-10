

# PI U6 — ERROR CATALOG SINGLE SOURCE OF TRUTH (Execucao)

## Fase U6.E1 — Alinhar Taxonomia do Catalogo

**Arquivo**: `src/lib/errors/institutionalErrors.ts`

### Acoes

1. **Remover** `ErrorSeverity` e `ErrorContext` locais
2. **Importar** `Severity` e `ObservabilityDomain` de `src/lib/observability/types.ts`
3. **Atualizar** interface `InstitutionalError`:
   - `severity: ErrorSeverity` -> `severity: Severity`
   - `context: ErrorContext` -> `domain: ObservabilityDomain`
   - `retryable?: boolean` -> `retryable: boolean` (obrigatorio)
4. **Atualizar** todas as 18 entradas do catalogo:
   - `'WARNING'` -> `'WARN'` (3 entradas: AUTH-003, BILLING-001, SYS-002, DATA-003)
   - `context: 'ACCESS'` -> `domain: 'SECURITY'` (4 entradas)
   - `context: 'DATA'` -> `domain: 'SYSTEM'` (3 entradas)
   - `context: 'AUTH'` -> `domain: 'AUTH'` (4 entradas)
   - `context: 'BILLING'` -> `domain: 'BILLING'` (3 entradas)
   - `context: 'SYSTEM'` -> `domain: 'SYSTEM'` (4 entradas)
5. **Adicionar** header FROZEN CONTRACT com regras:

```text
/**
 * FROZEN CONTRACT (PI U6)
 *
 * REGRAS ABSOLUTAS:
 * - Nenhum erro pode existir fora deste catalogo
 * - ACCESS e DATA NAO existem mais como dominio
 *   - Autorizacao/permissao/policy -> ObservabilityDomain.SECURITY
 *   - Persistencia/consistencia -> ObservabilityDomain.SYSTEM
 * - Severity usa EXCLUSIVAMENTE Severity canonico (PI U5)
 * - Apos U6, este catalogo e fonte obrigatoria para:
 *   - SecurityBoundary
 *   - error-report.ts
 *   - Qualquer erro institucional exibido ao usuario
 * - Nenhum novo erro pode ser criado fora deste catalogo
 */
```

6. **Adicionar** validacao DEV-only para codigos duplicados e combinacao suspeita (`retryable: true` + `severity: 'CRITICAL'`)

---

## Fase U6.E2 — Eliminar `formatUserError`

**Arquivo**: `src/lib/observability/error-report.ts`

1. **Remover** a funcao `formatUserError` inteira (linhas 156-183) — strings hardcoded em portugues, zero consumidores
2. **Corrigir** docstring do exemplo na funcao `reportError` (`severity: 'high'` -> `severity: 'ERROR'`)

---

## Fase U6.E3 — Atualizar Barrel Exports

**Arquivo**: `src/lib/errors/index.ts`

1. **Remover** export de `ErrorSeverity` e `ErrorContext` (tipos eliminados)
2. **Re-exportar** `Severity` e `ObservabilityDomain` de `lib/observability/types` para conveniencia dos consumidores

---

## Fase U6.E4 — Atualizar Consumidores

### `src/lib/observability/types.ts`

1. **Remover** `import type { ErrorContext } from '@/lib/errors/institutionalErrors'` — importado mas nunca usado no arquivo

### `src/components/observability/InstitutionalErrorsCard.tsx`

1. **Substituir** `import type { ErrorSeverity }` por `import type { Severity }` de `@/lib/observability/types`
2. **Atualizar** todas as referencias:
   - `ErrorSeverity` -> `Severity`
   - `'WARNING'` -> `'WARN'` na funcao `deriveSeverity`
   - Atualizar `severityOrder` e maps de icones/cores para incluir `WARN` em vez de `WARNING`

---

## Resumo de Arquivos Afetados

| Arquivo | Acao |
|---|---|
| `src/lib/errors/institutionalErrors.ts` | Evoluir: remover tipos locais, importar canonicos, atualizar 18 entradas, FROZEN header, validacao DEV |
| `src/lib/errors/index.ts` | Atualizar exports: remover tipos mortos, re-exportar canonicos |
| `src/lib/observability/error-report.ts` | Remover `formatUserError`, corrigir docstring |
| `src/lib/observability/types.ts` | Remover import nao utilizado de `ErrorContext` |
| `src/components/observability/InstitutionalErrorsCard.tsx` | Migrar `ErrorSeverity` -> `Severity`, `WARNING` -> `WARN` |

---

## Risco

**Baixo**. Mitigado por:
- `formatUserError` tem zero consumidores (confirmado por busca)
- `InstitutionalErrorsCard` e unico consumidor externo de `ErrorSeverity` — migracao direta
- `ErrorContext` importado em `types.ts` nunca e usado — remocao segura
- Catalogo nao tem consumidores runtime alem da validacao DEV — mudancas taxonomicas sem impacto comportamental

