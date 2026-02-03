# Security Baseline — TATAME PRO

---

## STATUS GERAL

| Fase | Status | Data |
|------|--------|------|
| P0.1 — digital_cards RLS | ✅ CONCLUÍDO | 2026-02-03 |
| P0.2 — memberships UPDATE WITH CHECK | ✅ CONCLUÍDO | 2026-02-03 |
| P3 — Documentação RLS vs Edge Functions | ✅ CONCLUÍDO | 2026-02-03 |

---

## P0.1 — RLS HOTFIX digital_cards

**STATUS**: ✅ CONCLUÍDO

**Problema identificado**: Policy `qual: true` permitia enumeração pública de todos os registros.

**Solução aplicada**: Verificação pública via Edge Function `verify-digital-card` com:
- Lookup unitário por ID
- Mascaramento de dados pessoais (LGPD)
- Validação de UUID antes da query

---

## P0.2 — RLS HOTFIX memberships

**STATUS**: ✅ CONCLUÍDO

**Problema identificado**: Policy UPDATE sem `WITH CHECK` permitia alteração de `tenant_id` ou `athlete_id` para valores fora do escopo autorizado.

**Solução aplicada**:
```sql
CREATE POLICY "Staff and admins can update memberships"
ON public.memberships
FOR UPDATE
USING (
  is_superadmin() 
  OR is_tenant_admin(tenant_id) 
  OR has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, tenant_id) 
  OR ((academy_id IS NOT NULL) AND is_head_coach_of_academy(academy_id))
)
WITH CHECK (
  is_superadmin() 
  OR is_tenant_admin(tenant_id) 
  OR has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, tenant_id) 
  OR ((academy_id IS NOT NULL) AND is_head_coach_of_academy(academy_id))
);
```

**Validação**: `has_with_check = true` confirmado via `pg_policies`.

---

## P3 — DOCUMENTAÇÃO RLS vs EDGE FUNCTIONS

**STATUS**: ✅ CONCLUÍDO

**Artefato criado**: `docs/security/rls-vs-edge-functions.md`

**Conteúdo**:
- Definições canônicas (RLS, Edge Function, PostgREST, Superadmin, Impersonation)
- Matriz de decisão (quando usar cada canal)
- Regras de ouro imutáveis
- Padrões aprovados e proibidos com exemplos
- Checklist de PR obrigatório
- Critérios de não-retorno (freeze)

**Hierarquia documental atualizada**:
```text
SSF-CONSTITUTION.md
    └── SECURITY-AUTH-CONTRACT.md
            └── security/rls-vs-edge-functions.md ← NOVO
                    └── HARDENING.md
```

---

## BASELINE DE SEGURANÇA ATUAL

| Área | Status |
|------|--------|
| digital_cards enumeração | ✅ PROTEGIDO |
| memberships cross-tenant UPDATE | ✅ PROTEGIDO |
| Contrato RLS vs Edge | ✅ DOCUMENTADO |
| Impersonation boundary | ✅ EDGE ONLY |
| Audit trail | ✅ EDGE FUNCTIONS |
| Rate limiting público | ✅ IMPLEMENTADO |

---

## NOTAS PARA PRÓXIMAS FASES

### Warnings do Linter (Não-Bloqueantes)

1. **Security Definer Views** — Views com SECURITY DEFINER podem ter implicações. Revisar em PI futuro.
2. **Leaked Password Protection** — Supabase recomenda ativar. Avaliar em PI futuro.

Estes warnings são pré-existentes e não foram introduzidos pelos hotfixes P0.1/P0.2.

---

## RESULTADO FINAL

```text
CICLO DE SEGURANÇA P0-P3
STATUS: ✅ CONCLUÍDO
BASELINE: CONGELADO
DÍVIDA TÉCNICA: ZERO (para escopo atual)
RISCO RESIDUAL: MITIGADO
DOCUMENTAÇÃO: COMPLETA
```
