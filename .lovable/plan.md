
# A02 — Backend Hardening: Institutional Envelope + Logger + Rate Limiting

## Status Geral

| Fase | Descricao | Status |
|------|-----------|--------|
| Bloco 1 | Helpers & Contracts (logger, correlation, envelope, rate-limit presets) | ✅ DONE |
| Bloco 2 | Tier 1 Bloco A — Impersonation + Admin (6 funções) | ⏳ NEXT |
| Bloco 3 | Tier 1 Bloco B — Events + Verify (6 funções) | 🔲 |
| Bloco 4 | Tier 1 Bloco C — Billing + Membership (10 funções) | 🔲 |
| Bloco 5 | Tier 2 — Operacional (21 funções) | 🔲 |
| Bloco 6 | Tier 3 + 4 — Cron + Infra (16 funções) | 🔲 |
| Bloco 7 | Contract Tests + CI Gates | 🔲 |
| Bloco 8 | Verificação Final (grep G1–G4) | 🔲 |

---

## Bloco 1 — Helpers (CONCLUIDO)

### Arquivos Criados

| Arquivo | Descricao |
|---------|-----------|
| `supabase/functions/_shared/backend-logger.ts` | Logger estruturado institucional. Unico arquivo com `console.*` direto. Exporta `createBackendLogger(fnName, correlationId)` retornando `BackendLogger` com metodos `debug/info/warn/error` + `setTenant/setUser/setStep`. Saida: 1 linha JSON por entry. |
| `supabase/functions/_shared/correlation.ts` | Extrator de correlationId. Usa `x-correlation-id` header ou `crypto.randomUUID()`. |

### Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/_shared/errors/envelope.ts` | Adicionado: `InstitutionalSuccessEnvelope<T>`, `buildSuccessEnvelope()`, `okResponse()`. Campo `correlationId?` adicionado a `InstitutionalErrorEnvelope` e propagado em `buildErrorEnvelope()`, `unauthorizedResponse()`, `forbiddenResponse()`, `rpcErrorResponse()`. |
| `supabase/functions/_shared/secure-rate-limiter.ts` | Adicionados 10 presets: `adminCreateUser`, `publishBracket`, `generateBracket`, `recordMatch`, `verifyDocument` (failClosed:false), `createSubscription`, `createTenantAdmin`, `billingControl`, `membershipCheckout`. Resposta 429 migrada para envelope A07 via `buildErrorEnvelope(RATE_LIMITED)` + `errorResponse()`. Assinatura de `tooManyRequestsResponse` recebe `correlationId?`. |

### Invariantes

- Zero alteracao de logica funcional
- Zero Edge Function alterada (somente _shared)
- `console.*` direto apenas em `backend-logger.ts`
- Contratos existentes preservados (assinaturas backwards-compatible via parametros opcionais)

---

## Proximos Passos

Bloco 2: Migrar 6 funcoes Tier 1 (start-impersonation, end-impersonation, validate-impersonation, admin-reset-password, admin-create-user, grant-roles) para usar backend-logger + correlationId + envelope A07 completo.
