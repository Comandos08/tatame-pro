# AUDIT2.0 — SAFE GOLD v2.0

**Status:** 🧊 FROZEN  
**Mode:** SAFE GOLD  
**Version:** 2.0  
**Last Updated:** 2026-02-08

---

## 🎯 Objetivo

Implementar auditoria determinística, imutável e explicável para eventos críticos do sistema.

## 🔒 Princípios SAFE GOLD

### Proibições Absolutas ❌

- `Date.now()` ou `new Date()` dinâmico
- `console.log` em produção
- UUID randômico (`crypto.randomUUID()`)
- Jobs assíncronos durante leitura
- Escrita fora do boundary de auditoria
- UPDATE em audit_logs
- DELETE em audit_logs

### Garantias ✅

- `occurred_at` externo e explícito
- Enums fechados (SAFE GOLD)
- Escrita append-only
- Leitura read-only
- Total reprodutibilidade
- Hash determinístico

---

## 📐 Arquitetura

```
src/types/audit-state.ts         → Enums e tipos
src/domain/audit/normalize.ts    → Normalização pura
src/domain/audit/write.ts        → Boundary de escrita
src/domain/audit/read.ts         → API de leitura
src/domain/audit/index.ts        → Barrel export
```

---

## 🧱 Contratos

### Actions (SAFE_AUDIT_ACTIONS)

| Action | Descrição |
|--------|-----------|
| CREATE | Criação de entidade |
| UPDATE | Atualização de entidade |
| DELETE | Exclusão de entidade |
| LOGIN | Autenticação |
| LOGOUT | Fim de sessão |
| IMPERSONATE | Impersonação de usuário |
| EXPORT | Exportação de dados |
| IMPORT | Importação de dados |
| BILLING_CHANGE | Mudança de billing |
| ROLE_ASSIGN | Atribuição de role |
| ROLE_REVOKE | Revogação de role |
| APPROVE | Aprovação |
| REJECT | Rejeição |
| CANCEL | Cancelamento |
| EXPIRE | Expiração |
| RENEW | Renovação |

### Entities (SAFE_AUDIT_ENTITIES)

| Entity | Descrição |
|--------|-----------|
| USER | Usuário |
| TENANT | Tenant/Organização |
| MEMBERSHIP | Filiação |
| EVENT | Evento |
| BILLING | Cobrança |
| EXPORT | Exportação |
| ANALYTICS | Analytics |
| SYSTEM | Sistema |
| ATHLETE | Atleta |
| COACH | Coach |
| ACADEMY | Academia |
| DIPLOMA | Diploma |
| GRADING | Graduação |
| ROLE | Role/Permissão |

### Levels (SAFE_AUDIT_LEVELS)

| Level | Uso |
|-------|-----|
| INFO | Operações normais |
| WARNING | Atenção requerida |
| CRITICAL | Ação imediata necessária |

---

## 🔐 Hash Determinístico

```typescript
// Entrada normalizada
const normalized = normalizeAuditEntry(input);

// Hash SHA-256
const hash = await computeAuditHash(normalized);

// Mesmo input → mesmo hash
```

### Normalização

1. Ordenar chaves do metadata alfabeticamente
2. Serializar como JSON
3. Aplicar SHA-256
4. Retornar hex string

---

## 📊 Tabelas Protegidas

Durante operações de auditoria, as seguintes tabelas são READ-ONLY:

- tenants
- profiles
- user_roles
- athletes
- memberships
- events
- event_brackets
- tenant_billing
- diplomas
- coaches
- academies

---

## 🧪 Testes

### Contract Tests (AUD.C.*)

| ID | Descrição | Status |
|----|-----------|--------|
| AUD.C.1 | Render determinístico | ✅ |
| AUD.C.2 | Hash idêntico para mesma entrada | ✅ |
| AUD.C.3 | UPDATE/DELETE proibidos | ✅ |
| AUD.C.4 | Enum compliance | ✅ |
| AUD.C.5 | Ordenação estável | ✅ |
| AUD.C.6 | Estabilidade de rota (10s) | ✅ |

### Resilience Tests (AUD.R.*)

| ID | Descrição | Status |
|----|-----------|--------|
| AUD.R.1 | 403 → UI viva | ✅ |
| AUD.R.2 | 500 → UI viva | ✅ |
| AUD.R.3 | Timeout → UI viva | ✅ |
| AUD.R.4 | JSON inválido → UI viva | ✅ |
| AUD.R.5 | Loop detection | ✅ |
| AUD.R.6 | Recovery pós-falha | ✅ |
| AUD.R.7 | Empty data handling | ✅ |

---

## 📚 Uso

### Escrita

```typescript
import { writeAuditLog, createAuditEntry } from '@/domain/audit';

const entry = createAuditEntry({
  tenant_id: 'uuid',
  actor_id: 'uuid',
  action: 'CREATE',
  entity: 'MEMBERSHIP',
  entity_id: 'uuid',
  level: 'INFO',
  occurred_at: '2026-02-08T12:00:00.000Z', // OBRIGATÓRIO
  metadata: { custom: 'data' },
});

const result = await writeAuditLog(entry);
```

### Leitura

```typescript
import { fetchAuditLogs } from '@/domain/audit';

const { data, viewState, total } = await fetchAuditLogs({
  tenant_id: 'uuid',
  limit: 50,
  offset: 0,
});
```

---

## 🧊 Status

```
AUDIT2.0.1 — SAFE GOLD PLUS v2.0.1
🔒 IMMUTABLE
🧪 CONTRACTUAL
🧠 EXPLICÁVEL
🚫 ZERO SIDE EFFECT
📜 COMPLIANCE-READY
♻️ IDEMPOTENT
🔐 SHA-256 ONLY
```

---

## ⚠️ Notas de Implementação

1. **occurred_at é OBRIGATÓRIO** — Nunca use Date.now()
2. **Hash é verificável** — Mesmo input → mesmo hash
3. **Append-only** — Nenhum UPDATE/DELETE permitido
4. **Boundary único** — Somente `writeAuditLog` pode inserir

---

## 🔐 AUDIT2.0.1 — SAFE GOLD PLUS

**Versão:** 2.0.1  
**Elevação:** SAFE GOLD → SAFE GOLD PLUS  
**Data:** 2026-02-08

### Mudanças Críticas

| Item | Antes (2.0) | Depois (2.0.1) |
|------|-------------|----------------|
| Hash sync | `computeAuditHashSync` disponível | ❌ REMOVIDO |
| Hash | SHA-256 + fallback | SHA-256 EXCLUSIVO |
| Idempotência | Não garantida | ✅ GARANTIDA por hash |
| Date.now() em testes | Permitido | ❌ PROIBIDO |
| Duplicação | Possível | ❌ IMPOSSÍVEL |

### Garantias SAFE GOLD PLUS

- **Criptograficamente consistente** — Apenas SHA-256 via `crypto.subtle`
- **Idempotente** — Mesmo input nunca cria duplicatas
- **Determinístico** — Zero dependência temporal
- **Testável** — Testes 100% reprodutíveis
- **Compliance-ready** — Pronto para auditoria externa

### Fluxo de Idempotência

```
1. Normalizar entrada (sort keys)
2. Computar SHA-256 hash
3. Verificar se hash já existe:
   - SE existe → retornar { success: true, duplicate: true }
   - SE não existe → INSERT e retornar { success: true, duplicate: false }
```

### Testes Obrigatórios (AUD.C.7)

```typescript
// Idempotência comprovada
const r1 = await writeAuditLog(entry);
const r2 = await writeAuditLog(entry);

expect(r1.hash).toBe(r2.hash);
expect(r2.duplicate).toBe(true);
```

### Proibições Absolutas

❌ `computeAuditHashSync` (removido)  
❌ `Date.now()` em qualquer teste AUDIT  
❌ Hash não-criptográfico  
❌ Dependência de timezone  
❌ UPDATE em audit_logs  
❌ DELETE em audit_logs

---

## 🏦 Certificação

```
AUDIT2.0.1 — SAFE GOLD PLUS
🔒 CRIPTOGRAFICAMENTE CONSISTENTE
♻️ IDEMPOTENTE
🧪 TESTÁVEL
🏦 PRONTO PARA AUDITORIA EXTERNA
💎 NÍVEL "PRODUTO DE LUXO"
```

---

*FROZEN: Documento congelado. Alterações requerem revisão constitucional.*
