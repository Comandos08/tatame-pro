

# PI-INSTITUTIONAL-ROLE-GOV-002D-R — Retroactive Normalization (SAFE GOLD — DETERMINISTIC)

## Estado Atual Confirmado

| Drift | Count | Acao |
|-------|-------|------|
| P0 ADMIN_ROLE_MISSING_AUDIT | 1 registro (profile b4a1b4b0, tenant 07ad68d9, user_roles 3ba49496) | Sera eliminado |
| P1 ADMIN_ROLE_WITHOUT_APPROVED_MEMBERSHIP | 1 registro (mesmo profile/tenant) | Sera preservado |
| Retroactive audits existentes | 0 | Clean slate |

## Migration (unica operacao)

Uma migration SQL contendo exclusivamente o INSERT SET-BASED com NOT EXISTS:

```sql
-- PI-002D-R: Retroactive Normalization (SAFE GOLD -- DETERMINISTIC)
INSERT INTO public.audit_logs (
  event_type, tenant_id, profile_id, category, metadata
)
SELECT
  'ADMIN_TENANT_ROLE_GRANTED',
  r.tenant_id,
  r.profile_id,
  'SECURITY',
  jsonb_build_object(
    'user_roles_id', r.user_roles_id,
    'retroactive_normalization', true,
    'origin', 'PRE_PI-002C',
    'pi_reference', 'PI-002D-R',
    'normalized_at', now(),
    'occurred_at', now()
  )
FROM public.role_governance_audit_v1 r
WHERE r.issue_code = 'ADMIN_ROLE_MISSING_AUDIT'
AND NOT EXISTS (
  SELECT 1
  FROM public.audit_logs al
  WHERE al.event_type = 'ADMIN_TENANT_ROLE_GRANTED'
    AND al.metadata->>'user_roles_id' = r.user_roles_id::text
    AND al.metadata->>'retroactive_normalization' = 'true'
);
```

## Propriedades

- Zero DDL
- Zero alteracao estrutural
- Zero alteracao de privilegios
- Zero alteracao de RLS
- Zero alteracao de Edge Functions
- Idempotencia explicita via NOT EXISTS
- Fonte de dados: role_governance_audit_v1
- Apenas issue_code = ADMIN_ROLE_MISSING_AUDIT
- SET-BASED (sem LOOP, sem DO $$, sem PL/pgSQL)
- Transacional (atomico)

## Resultado Esperado

| Severidade | Esperado apos apply |
|---|---|
| P0 | 0 linhas |
| P1 | 1 linha (legitimo -- bypass de membership na criacao do tenant) |

## Rollback

```sql
DELETE FROM public.audit_logs
WHERE metadata->>'pi_reference' = 'PI-002D-R';
```

