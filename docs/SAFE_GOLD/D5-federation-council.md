# PI-D5-FEDERATION1.0 & PI-D5-COUNCIL1.0 — SAFE GOLD

**Status:** 🟢 IMPLEMENTADO  
**Modo:** SAFE GOLD  
**Versão:** 1.0  
**Data:** 2026-02-08

---

## 🎯 Objetivo

Criar camada federativa acima dos tenants, introduzir Conselhos como instância de governança, manter tenants autônomos e garantir auditabilidade.

## 🔑 Princípios (não negociáveis)

- Federação não executa operações de tenant
- Conselho não emite documentos
- Tudo é opt-in, nunca implícito
- Permissões explícitas, sem herança mágica
- Auditoria cobre todas as ações federativas

---

## 🧱 PI-D5-FEDERATION1.0 — Camada Federativa

### Entidades

| Tabela | Descrição |
|--------|-----------|
| `federations` | Federações (nome, slug, país, status) |
| `federation_tenants` | Vínculo tenant ↔ federação |
| `federation_roles` | Papéis federativos por usuário |

### Papéis Federativos (Fechados)

| Role | Permissões |
|------|------------|
| `FED_ADMIN` | Gerenciar federação, vincular tenants, gerenciar papéis |
| `COUNCIL_MEMBER` | Votar/deliberar em conselhos |
| `OBSERVER` | Leitura apenas |

### RLS Policies

- Superadmins: acesso total
- FED_ADMIN: gerenciar sua federação
- COUNCIL_MEMBER: visualizar tenants vinculados
- Usuários: ver seus próprios papéis

---

## 🧱 PI-D5-COUNCIL1.0 — Conselho Institucional

### Entidades

| Tabela | Descrição |
|--------|-----------|
| `councils` | Conselhos vinculados a federações |
| `council_members` | Membros (CHAIR ou MEMBER) |
| `council_decisions` | Deliberações (OPEN → APPROVED/REJECTED) |

### Tipos de Decisão (Fechados)

| Tipo | Descrição |
|------|-----------|
| `TENANT_ADMISSION` | Admissão de tenant na federação |
| `TENANT_SUSPENSION` | Suspensão de tenant |
| `POLICY_APPROVAL` | Aprovação de política |

### Regras

- Conselho delibera, não executa
- Execução depende de ação administrativa explícita
- Tudo auditado

---

## 🧱 PI-D5-MULTITENANT2.0 — Multi-Tenant Avançado

### Funções de Visibilidade

```sql
-- Pode ver tenant?
can_view_tenant(user_id, tenant_id)
-- Superadmin OU membro do tenant OU papel federativo

-- Pode ver federação?
can_view_federation(user_id, federation_id)
-- Superadmin OU papel na federação

-- Pode agir como federação?
can_act_as_federation(user_id, federation_id)
-- Superadmin OU FED_ADMIN
```

### Dashboard Federativo

**Rota:** `/federation/:slug/dashboard`

**Conteúdo (READ-ONLY):**
- Nº de tenants vinculados
- Documentos emitidos (agregado)
- Documentos revogados
- Últimas decisões
- Eventos de auditoria federativos

❌ **Nenhuma ação destrutiva**

---

## 🧪 Auditoria Federativa

### Novos Eventos

| Evento | Descrição |
|--------|-----------|
| `FEDERATION_CREATED` | Federação criada |
| `FEDERATION_STATUS_CHANGED` | Status alterado |
| `TENANT_JOINED_FEDERATION` | Tenant vinculado |
| `TENANT_LEFT_FEDERATION` | Tenant desvinculado |
| `FEDERATION_ROLE_ASSIGNED` | Papel atribuído |
| `FEDERATION_ROLE_REVOKED` | Papel revogado |
| `COUNCIL_CREATED` | Conselho criado |
| `COUNCIL_MEMBER_ADDED` | Membro adicionado |
| `COUNCIL_MEMBER_REMOVED` | Membro removido |
| `COUNCIL_DECISION_CREATED` | Deliberação criada |
| `COUNCIL_DECISION_APPROVED` | Deliberação aprovada |
| `COUNCIL_DECISION_REJECTED` | Deliberação rejeitada |

### Categorias

- `FEDERATION` - Eventos de federação
- `COUNCIL` - Eventos de conselho

---

## 📦 Entregáveis

- [x] Entidades de Federação e Conselho
- [x] Enums: `federation_status`, `federation_role`, `council_role`, `council_decision_type`, `council_decision_status`
- [x] Funções helper: `has_federation_role`, `is_federation_admin`, `can_view_tenant`, `can_view_federation`, `can_act_as_federation`
- [x] Papéis federativos isolados com RLS
- [x] Dashboard federativo read-only (`/federation/:slug/dashboard`)
- [x] Auditoria federativa ativa (eventos + categorias)

---

## 🧪 Validação

| Cenário | Esperado | ✓ |
|---------|----------|---|
| Tenant fora da federação | Não aparece no dashboard | ✅ |
| Council member sem papel fed | Não vê dashboard de tenant | ✅ |
| Federação tenta alterar documento | Bloqueado (não há UI) | ✅ |
| Toda ação federativa | Gera auditoria | ✅ |
| Superadmin | Vê tudo, ação explícita | ✅ |

---

## 🏦 Certificação

```
PI-D5-FEDERATION1.0 + PI-D5-COUNCIL1.0 + PI-D5-MULTITENANT2.0
🏛️ CAMADA FEDERATIVA ATIVA
👁️ READ-ONLY DASHBOARD
🔐 PAPÉIS ISOLADOS
📜 AUDITORIA COMPLETA
🌍 PRONTO PARA ESCALA INTERNACIONAL
```

---

*SAFE GOLD: Documento congelado. Alterações requerem revisão constitucional.*
