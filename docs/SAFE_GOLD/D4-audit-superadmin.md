# PI-D4-AUDIT1.0 & PI-D4-SUPERADMIN1.0 — SAFE GOLD

**Status:** 🟢 IMPLEMENTADO  
**Modo:** SAFE GOLD  
**Versão:** 1.0  
**Data:** 2026-02-08

---

## 🎯 Objetivo

Criar trilha mínima de auditoria para eventos críticos e habilitar Modo Superadmin claro e seguro.

## 🔑 Princípios (não negociáveis)

- Auditoria não é log verboso
- Superadmin não opera dados de tenant
- Tudo é read-first, fail-closed
- Ação superadmin = explicitamente registrada

---

## 🧱 PI-D4-AUDIT1.0 — Auditoria Mínima

### Eventos Obrigatórios (Lista Fechada)

| Evento | Descrição |
|--------|-----------|
| `TENANT_CREATED` | Criação de tenant |
| `TENANT_STATUS_CHANGED` | Mudança de status do tenant |
| `BILLING_STATUS_CHANGED` | Mudança de billing |
| `DOCUMENT_ISSUED` | Emissão de documento (card/diploma) |
| `DOCUMENT_REVOKED` | Revogação de documento |
| `DOCUMENT_VERIFIED_PUBLIC` | Verificação pública via QR |
| `IMPERSONATION_STARTED` | Início de impersonação |
| `IMPERSONATION_ENDED` | Fim de impersonação |
| `SUPERADMIN_ACTION` | Ação administrativa crítica |

### Estrutura de Dados

Utiliza tabela existente `audit_logs`:

```sql
-- audit_logs já existente
id UUID PRIMARY KEY
event_type TEXT NOT NULL
tenant_id UUID
profile_id UUID
metadata JSONB
created_at TIMESTAMPTZ
category TEXT
```

### Regras

- `metadata` = payload mínimo (sem PII)
- Nunca atualizar ou deletar eventos
- Apenas INSERT
- Categoria auto-detectada pelo prefixo do evento

### Instrumentação

Eventos são registrados via `createAuditLog()` em:

- `generate-digital-card` → `DOCUMENT_ISSUED`
- `verify-document` → `DOCUMENT_VERIFIED_PUBLIC`
- `start-impersonation` → `IMPERSONATION_STARTED`
- `end-impersonation` → `IMPERSONATION_ENDED`

---

## 🧱 PI-D4-SUPERADMIN1.0 — Modo Superadmin

### Visão Superadmin (read-only)

Página `/admin/audit` com:

**Filtros:**
- Tipo de evento
- Tenant
- Período
- Categoria

**Lista:**
- Data/hora
- Evento
- Tenant (nome)
- Alvo (tipo)
- Ator (role)

👉 **Read-only. Nenhuma ação na página de auditoria.**

### Ações Permitidas (Lista Fechada)

| Ação | Permitido | Evento Gerado |
|------|-----------|---------------|
| Iniciar/encerrar impersonation | ✅ | `IMPERSONATION_*` |
| Bloquear/desbloquear tenant | ✅ | `TENANT_STATUS_CHANGED` |
| Revogar documento | ✅ | `DOCUMENT_REVOKED` |
| Editar dados internos de tenant | ❌ | — |
| Emitir documento | ❌ | — |
| Alterar billing manualmente | ❌ | — |

### Regras de Ouro do Superadmin

1. Toda ação gera `SUPERADMIN_ACTION` ou evento específico
2. Ação sensível exige confirmação explícita
3. Impersonation sempre visível no header
4. Rate limiting em operações críticas

---

## 🧪 Validação

| Ação | Evento Esperado | ✓ |
|------|-----------------|---|
| Emitir documento | `DOCUMENT_ISSUED` | ✅ |
| Verificar via QR | `DOCUMENT_VERIFIED_PUBLIC` | ✅ |
| Revogar | `DOCUMENT_REVOKED` | ✅ |
| Entrar em impersonation | `IMPERSONATION_STARTED` | ✅ |
| Sair | `IMPERSONATION_ENDED` | ✅ |
| Bloquear tenant | `TENANT_STATUS_CHANGED` | ✅ |

---

## 📦 Entregáveis

- [x] Eventos adicionados ao `audit-logger.ts`
- [x] Helper de logging unificado (`createAuditLog`)
- [x] Instrumentação em edge functions críticas
- [x] Página `/admin/audit` read-only
- [x] Link no Admin Dashboard

---

## 🏦 Certificação

```
PI-D4-AUDIT1.0 + PI-D4-SUPERADMIN1.0
🔒 APPEND-ONLY
👁️ READ-FIRST
🚫 NO TENANT DATA MUTATION
📜 FULL AUDIT TRAIL
```

---

*SAFE GOLD: Documento congelado. Alterações requerem revisão constitucional.*
