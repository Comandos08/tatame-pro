

# PI A2 — Separacao Identidade x Reconhecimento (Infraestrutura de Badges)

## Resumo

Criar a infraestrutura passiva para badges de reconhecimento simbolico: duas tabelas com RLS read-only, types TypeScript, e documentacao do contrato. Zero funcionalidade ativa.

---

## Fase 1 — Migration SQL

Uma unica migration criando:

### Tabela `badges`
- `id`, `tenant_id` (FK tenants), `code`, `name`, `description`, `scope` (default 'TENANT'), `is_active`, timestamps
- UNIQUE(tenant_id, code)
- RLS enabled, fail-closed

### Tabela `athlete_badges`
- `id`, `tenant_id` (FK tenants), `athlete_id` (FK athletes), `badge_id` (FK badges), `granted_by` (FK profiles), `granted_at`, `revoked_at`
- UNIQUE(athlete_id, badge_id)
- RLS enabled, fail-closed

### RLS (somente SELECT)

**badges:**
```sql
CREATE POLICY "Read badges" ON badges FOR SELECT
USING (
  is_tenant_admin(tenant_id)
  OR EXISTS (
    SELECT 1 FROM athletes a
    WHERE a.profile_id = auth.uid()
      AND a.tenant_id = badges.tenant_id
  )
);
```

**athlete_badges:**
```sql
CREATE POLICY "Read athlete badges" ON athlete_badges FOR SELECT
USING (
  auth.uid() = (
    SELECT profile_id FROM athletes a
    WHERE a.id = athlete_badges.athlete_id
  )
  OR is_tenant_admin(tenant_id)
);
```

Superadmin access via `is_superadmin()` adicionado em ambas as policies.

Nenhuma policy de INSERT/UPDATE/DELETE. Escrita somente via service_role.

Trigger `update_updated_at_column` em ambas as tabelas.

---

## Fase 2 — Types TypeScript

Criar `src/types/badge.ts` com:

- `Badge` interface (campos mapeados de snake_case para camelCase)
- `AthleteBadge` interface
- `BadgeCode` como `string` (sem enum fechado, conforme spec)

---

## Fase 3 — Documentacao

Criar `docs/BADGE-CONTRACT.md` formalizando:

- Badge != Role, != Permissao, != Autorizacao
- Proibicoes: uso em RLS de escrita, guards, Edge Functions de autorizacao
- Separacao explicita: `app_role` = identidade, `badge` = reconhecimento
- Referencia cruzada proibida entre `user_roles` e `badges`/`athlete_badges`
- Condicoes de freeze

---

## Arquivos

| Arquivo | Acao |
|---------|------|
| Migration SQL | Nova migration (2 tabelas + RLS + triggers) |
| `src/types/badge.ts` | Novo |
| `docs/BADGE-CONTRACT.md` | Novo |

Total: 2 arquivos novos + 1 migration. Zero alteracoes em codigo existente.

