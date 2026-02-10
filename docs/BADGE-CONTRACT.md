# 🏅 BADGE CONTRACT — Separação Identidade × Reconhecimento

> **Status**: CONGELADO
> **Versão**: 1.0.0
> **Data**: 2026-02-09
> **PI**: A2
> **Classificação**: DOCUMENTO CONSTITUCIONAL

---

## 1. Definições

| Conceito | Significado | Exemplo |
|----------|-------------|---------|
| **Identidade (Role)** | Define o que o usuário **pode fazer** no sistema | `SUPERADMIN_GLOBAL`, `ADMIN_TENANT`, `ATLETA` |
| **Reconhecimento (Badge)** | Define o que o usuário **é ou representa** simbolicamente | `HEAD_COACH`, `INSTRUCTOR`, `REFEREE` |

---

## 2. Regra Fundamental

```
IDENTIDADE ≠ RECONHECIMENTO
app_role  ≠ badge
```

- `app_role` → autorização, RLS, guards, permissões
- `badge` → semântica simbólica, exibição, reconhecimento

---

## 3. Proibições Absolutas

| Regra | Descrição |
|-------|-----------|
| ❌ Badge em RLS de escrita | Badge NUNCA pode ser usado em policies de INSERT/UPDATE/DELETE |
| ❌ Badge em guards | Badge NUNCA pode ser verificado em guards de acesso |
| ❌ Badge em Edge Functions de autorização | Badge NUNCA pode conceder ou negar acesso |
| ❌ Badge como role | Badge NUNCA substitui `app_role` |
| ❌ Referência cruzada | `user_roles` NUNCA referencia `badges` ou `athlete_badges` e vice-versa |
| ❌ Badge em `has_role()` | Funções de autorização NUNCA consultam badges |

---

## 4. Permissões Aprovadas

| Ação | Permitido |
|------|-----------|
| Leitura de badges via RLS SELECT | ✅ |
| Exibição de badges em UI | ✅ (futuro PI) |
| Escrita via `service_role` | ✅ |
| Escrita via client (PostgREST) | ❌ |

---

## 5. Modelo de Dados

### Tabela `badges`
- Catálogo de badges disponíveis por tenant
- `UNIQUE(tenant_id, code)`
- RLS: SELECT only (tenant admin + atletas do tenant + superadmin)

### Tabela `athlete_badges`
- Associação atleta ↔ badge
- `UNIQUE(athlete_id, badge_id)`
- RLS: SELECT only (próprio atleta + tenant admin + superadmin)
- `revoked_at IS NULL` = badge ativo

---

## 6. Separação Explícita

```
┌─────────────────────────┐    ┌─────────────────────────┐
│     IDENTIDADE          │    │     RECONHECIMENTO      │
│                         │    │                         │
│  user_roles             │    │  badges                 │
│  app_role enum          │    │  athlete_badges         │
│  has_role()             │    │  BadgeCode type         │
│  is_tenant_admin()      │    │                         │
│  is_superadmin()        │    │  Sem funções de acesso  │
│                         │    │  Sem policies de escrita│
│  → Autorização          │    │  → Semântica            │
└─────────────────────────┘    └─────────────────────────┘
        ❌ NENHUMA REFERÊNCIA CRUZADA ❌

---

## 5. Authorized Display Surfaces (D2)

> **PI D2 — Pontos Únicos de Exibição de Badge**

Badge só pode ser renderizado nas superfícies listadas abaixo.
Qualquer outro ponto é **implicitamente proibido**.

### 5.1 Superfícies Permitidas (Whitelist)

| Superfície | Componente | Contexto | Observação |
|------------|------------|----------|------------|
| Perfil do Atleta | `AthleteBadgesList` | Trajetória | Lista completa, visual |
| Card do Atleta (Admin) | `AdminBadgeManager` | Administração | Preview + assign/revoke |
| Timeline Pública | `BadgeTimeline` | Histórico | Read-only, auditável |
| Chip Contextual | `BadgeChip` | Contextual | Uso pontual, documentado |

### 5.2 Superfícies Proibidas (Hard Rules)

Badges **NUNCA** podem aparecer em:

- ❌ Header / AppShell
- ❌ Sidebar / Navigation
- ❌ Botões / CTAs
- ❌ Gates de acesso
- ❌ Feature toggles
- ❌ Empty states
- ❌ Estados de erro / loading
- ❌ Banners de status
- ❌ Indicadores de permissão
- ❌ Componentes de decisão (if, guard, resolver)

### 5.3 Regra de Ouro

> Se a remoção do badge altera o comportamento do sistema, ele está sendo usado errado.

### 5.4 Enforcement Técnico

Todos os componentes de exibição de badge:

- **DEVEM** declarar `surface: BadgeSurface`
- **NÃO** podem renderizar sem `surface` explícita
- Em DEV, um `console.warn` é emitido para superfícies não-autorizadas

```typescript
// src/types/badge.ts
export type BadgeSurface =
  | 'ATHLETE_PROFILE'
  | 'ATHLETE_CARD'
  | 'BADGE_TIMELINE'
  | 'BADGE_MODAL'
  | 'BADGE_CHIP';
```
```

---

## 7. Relação com AcademyCoachRole

`AcademyCoachRole` (`HEAD_COACH`, `ASSISTANT_COACH`, `INSTRUCTOR`) é um atributo posicional existente em `academy_coaches`. Badges com códigos similares são **independentes** e **não substituem** `AcademyCoachRole`. A migração eventual será tratada em PI separado.

---

## 8. Condições de Freeze

Este contrato **NÃO será alterado**, exceto se:

1. Decisão formal de arquitetura (ADR documentado)
2. Exigência legal/regulatória
3. Mudança fundamental na stack

---

*Aprovado e congelado em 2026-02-09.*
