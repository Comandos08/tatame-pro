

# PI-INSTITUTIONAL-ROLE-GOV-002D — Auditability & Drift Detection (SAFE GOLD)

## Resumo

Criar camada de deteccao (read-only) para auditoria cruzada entre `user_roles`, `audit_logs` e `memberships`, garantindo rastreabilidade total de concessoes ADMIN_TENANT. Continuacao direta do PI-002C.

## Escopo

- 1 VIEW: `role_governance_audit_v1`
- 1 funcao: `check_role_governance_v1()`
- Zero alteracoes em RLS, privileges ou Edge Functions
- Zero impacto em runtime

## Verificacoes Realizadas

| Item | Resultado |
|------|-----------|
| Coluna `user_id` em `user_roles` | Confirmada |
| Coluna `applicant_profile_id` em `memberships` | Confirmada |
| Coluna `metadata` (jsonb) em `audit_logs` | Confirmada |
| Funcao/view existente | Nenhuma (clean slate) |

## Migration SQL

Uma unica migration contendo:

### 1. View `role_governance_audit_v1`

Detecta 3 tipos de drift:

| Codigo | Severidade | Descricao |
|--------|-----------|-----------|
| `ADMIN_ROLE_MISSING_AUDIT` | P0 | ADMIN_TENANT em user_roles sem audit log correspondente |
| `AUDIT_POINTS_TO_MISSING_ROLE` | P0 | Audit log aponta para user_roles_id inexistente |
| `ADMIN_ROLE_WITHOUT_APPROVED_MEMBERSHIP` | P1 | ADMIN_TENANT sem membership APPROVED (pode ser bypass legitimo) |

A view usa 3 CTEs com LEFT JOIN para cruzar dados — zero mutacao.

### 2. Funcao `check_role_governance_v1()`

Wrapper `STABLE` que retorna os mesmos dados da view via `SELECT * FROM role_governance_audit_v1`. Permite chamada via RPC.

### 3. pg_cron

Sera ignorado — nao ha evidencia de pg_cron disponivel no ambiente. Nenhuma alternativa sera inventada.

## Detalhes Tecnicos da Migration

```sql
-- View de drift detection
CREATE OR REPLACE VIEW public.role_governance_audit_v1 AS
WITH admin_roles AS (
  SELECT ur.id AS user_roles_id, ur.user_id AS profile_id, ur.tenant_id, ur.role, ur.created_at
  FROM public.user_roles ur
  WHERE ur.role = 'ADMIN_TENANT'::public.app_role
),
admin_grants AS (
  SELECT al.id AS audit_id, al.tenant_id, al.profile_id,
    (al.metadata->>'user_roles_id')::uuid AS user_roles_id,
    al.created_at, al.metadata
  FROM public.audit_logs al
  WHERE al.event_type = 'ADMIN_TENANT_ROLE_GRANTED'
),
p0_missing_audit AS (
  SELECT 'P0' AS severity, 'ADMIN_ROLE_MISSING_AUDIT' AS issue_code,
    ar.tenant_id, ar.profile_id, ar.user_roles_id,
    jsonb_build_object('role','ADMIN_TENANT','user_roles_created_at',ar.created_at) AS details,
    now() AS detected_at
  FROM admin_roles ar
  LEFT JOIN admin_grants ag ON ag.user_roles_id = ar.user_roles_id
  WHERE ag.user_roles_id IS NULL
),
p0_orphan_audit AS (
  SELECT 'P0' AS severity, 'AUDIT_POINTS_TO_MISSING_ROLE' AS issue_code,
    ag.tenant_id, ag.profile_id, ag.user_roles_id,
    jsonb_build_object('audit_id',ag.audit_id,'audit_created_at',ag.created_at,'metadata',ag.metadata) AS details,
    now() AS detected_at
  FROM admin_grants ag
  LEFT JOIN public.user_roles ur ON ur.id = ag.user_roles_id
  WHERE ur.id IS NULL
),
p1_no_membership AS (
  SELECT 'P1' AS severity, 'ADMIN_ROLE_WITHOUT_APPROVED_MEMBERSHIP' AS issue_code,
    ar.tenant_id, ar.profile_id, ar.user_roles_id,
    jsonb_build_object('role','ADMIN_TENANT','note','Membership may have been bypassed') AS details,
    now() AS detected_at
  FROM admin_roles ar
  LEFT JOIN public.memberships m
    ON m.applicant_profile_id = ar.profile_id AND m.tenant_id = ar.tenant_id AND m.status = 'APPROVED'
  WHERE m.id IS NULL
)
SELECT * FROM p0_missing_audit
UNION ALL SELECT * FROM p0_orphan_audit
UNION ALL SELECT * FROM p1_no_membership;

-- Funcao de verificacao
CREATE OR REPLACE FUNCTION public.check_role_governance_v1()
RETURNS TABLE (
  severity text, issue_code text, tenant_id uuid,
  profile_id uuid, user_roles_id uuid, details jsonb, detected_at timestamptz
)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$ SELECT * FROM public.role_governance_audit_v1; $$;
```

## Rollback

```sql
DROP FUNCTION IF EXISTS public.check_role_governance_v1();
DROP VIEW IF EXISTS public.role_governance_audit_v1;
```

## Validacao Pos-Apply

| Teste | Esperado |
|-------|----------|
| `SELECT * FROM check_role_governance_v1()` em ambiente saudavel | 0 linhas |
| INSERT manual de ADMIN_TENANT via SQL editor (sem audit) | P0 ADMIN_ROLE_MISSING_AUDIT |
| INSERT manual de audit_log com user_roles_id inexistente | P0 AUDIT_POINTS_TO_MISSING_ROLE |
| ADMIN_TENANT sem membership APPROVED | P1 ADMIN_ROLE_WITHOUT_APPROVED_MEMBERSHIP |
| View e funcao retornam mesmos dados | Identico |

## Checklist SAFE GOLD

| Item | Status |
|------|--------|
| Zero alteracao em RLS | Sim |
| Zero alteracao em privileges | Sim |
| Zero alteracao em Edge Functions | Sim |
| Zero mutacao (read-only) | Sim |
| Zero impacto em runtime | Sim |
| Rollback fornecido | Sim |
| Continuacao direta do PI-002C | Sim |
