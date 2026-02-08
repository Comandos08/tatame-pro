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
AUDIT2.0 — SAFE GOLD v2.0
🔒 IMMUTABLE
🧪 CONTRACTUAL
🧠 EXPLICÁVEL
🚫 ZERO SIDE EFFECT
📜 COMPLIANCE-READY
```

---

## ⚠️ Notas de Implementação

1. **occurred_at é OBRIGATÓRIO** — Nunca use Date.now()
2. **Hash é verificável** — Mesmo input → mesmo hash
3. **Append-only** — Nenhum UPDATE/DELETE permitido
4. **Boundary único** — Somente `writeAuditLog` pode inserir

---

*FROZEN: Documento congelado. Alterações requerem revisão constitucional.*
