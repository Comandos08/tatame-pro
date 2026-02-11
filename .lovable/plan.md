
# A01 Fase 3 — Strict Real + Logger Upgrade Institucional

## Resumo Executivo

Ativar `strict: true` no `tsconfig.app.json`, eliminar todos os erros resultantes com duas intervenções cirúrgicas: (1) upgrade do logger estruturado para aceitar `unknown`, (2) correção dos 6 `catch (err: any)` explícitos restantes. Estimativa: ~8 arquivos modificados, zero alteracao funcional.

---

## Diagnostico Pre-Execucao

| Fonte de erro                  | Quantidade | Estrategia                           |
|-------------------------------|-----------|--------------------------------------|
| `catch (err: any)` explicito  | 6         | Trocar para `catch (err: unknown)` + narrowing |
| Logger structured aceita `Error` | 1 arquivo | Aceitar `unknown`, normalizar internamente |
| Flags redundantes no tsconfig | 2         | Remover (`strictNullChecks`, `noImplicitAny`) |
| Chamadas `logger.error(msg, err)` variadic | ~50 | Ja funcionam — variadic aceita `unknown[]` |

---

## Fase 1 — Logger Institucional (1 arquivo)

**Arquivo:** `src/lib/observability/logger.ts`

Alterar a interface `Logger` e a implementacao interna:

```text
ANTES:
  error: (message: string, context?: LogContext, error?: Error) => void;

DEPOIS:
  error: (message: string, context?: LogContext, error?: unknown) => void;
```

Dentro de `createLogger`, normalizar o parametro antes de logar:

```text
const normalizedError =
  error instanceof Error
    ? error
    : error !== undefined
    ? new Error(String(error))
    : undefined;
```

Impacto: centralizado. Todas as ~5 chamadas que usam o logger estruturado (authLogger, securityLogger, etc.) passam a aceitar `unknown` automaticamente.

---

## Fase 2 — Ativar strict: true (1 arquivo)

**Arquivo:** `tsconfig.app.json`

- Adicionar `"strict": true`
- Remover `"strictNullChecks": true` (redundante sob strict)
- Remover `"noImplicitAny": true` (redundante sob strict)
- Manter `"noImplicitReturns"`, `"noUnusedLocals"`, `"noUnusedParameters"`, `"noFallthroughCasesInSwitch"` (nao inclusos em strict)

**Arquivo:** `tsconfig.json` (root)

- Adicionar `"strict": true`
- Remover `"strictNullChecks": true` e `"noImplicitAny": true` (redundantes)

---

## Fase 3 — Correcao dos catch blocks (6 ocorrencias em 3 arquivos)

### 3.1 `src/contexts/IdentityContext.tsx` (4 ocorrencias)

Linhas ~293, ~420, ~516, ~608: trocar `catch (err: any)` por `catch (err: unknown)`.

Para acessos a `err?.name === "AbortError"`:
```text
ANTES: err?.name === "AbortError"
DEPOIS: err instanceof DOMException && err.name === "AbortError"
```

Ou alternativa equivalente com narrowing:
```text
err instanceof Error && err.name === "AbortError"
```

Chamadas `logger.error("[IdentityContext] ...", err)` ja funcionam (variadic logger aceita `unknown[]`).

### 3.2 `src/components/membership/AdultMembershipForm.tsx` (1 ocorrencia)

Linha ~347: trocar `catch (error: any)` por `catch (error: unknown)`.

```text
ANTES: const errorMessage = error?.message || t('membership.errorGeneric');
DEPOIS: const errorMessage = error instanceof Error ? error.message : t('membership.errorGeneric');
```

### 3.3 `src/components/membership/YouthMembershipForm.tsx` (1 ocorrencia)

Linha ~337: identico ao AdultMembershipForm.

---

## Fase 4 — Validacao

1. `tsc --noEmit` deve retornar 0 erros
2. Build Vite deve passar
3. Nenhum teste alterado

---

## Arquivos Modificados (total: ~6)

| Arquivo | Tipo de mudanca |
|---------|----------------|
| `tsconfig.json` | strict: true, remover flags redundantes |
| `tsconfig.app.json` | strict: true, remover flags redundantes |
| `src/lib/observability/logger.ts` | error param: `Error` -> `unknown` + normalizer |
| `src/contexts/IdentityContext.tsx` | 4x `catch (err: any)` -> `catch (err: unknown)` + narrowing |
| `src/components/membership/AdultMembershipForm.tsx` | 1x catch + narrowing |
| `src/components/membership/YouthMembershipForm.tsx` | 1x catch + narrowing |

---

## Invariantes Preservados

- Zero `as any` introduzido
- Zero `@ts-ignore`
- Zero alteracao de logica funcional
- Zero alteracao de contrato publico
- Zero alteracao de payload API
- Zero alteracao de Error Envelope (A07)
- Zero alteracao de PII Contract (A08)
- Zero alteracao de rotas
- Zero alteracao de RLS
- Testes nao alterados
