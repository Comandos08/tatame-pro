# P0.2 — RLS HOTFIX memberships

## STATUS: ✅ CONCLUÍDO
**DATA:** 2026-02-03  
**RESULTADO:** WITH CHECK adicionado à policy de UPDATE

---

## RESUMO DA EXECUÇÃO

| Item | Estado |
|------|--------|
| Pré-check executado | ✅ `with_check = false` confirmado |
| SQL executado | ✅ Concluído |
| Validação pós-execução | ✅ `has_with_check = true` |
| Baseline atualizado | ✅ |

---

## ALTERAÇÃO APLICADA

```sql
DROP POLICY IF EXISTS "Staff and admins can update memberships"
ON public.memberships;

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

---

## CRITÉRIOS DE ACEITE

| Critério | Verificação |
|----------|-------------|
| WITH CHECK adicionado | ✅ Confirmado |
| USING preservado | ✅ Mesma lógica |
| Nenhuma tabela alterada | ✅ Apenas memberships |
| Superadmin preservado | ✅ is_superadmin() em ambos |

---

## GARANTIAS DE SEGURANÇA

| Garantia | Estado |
|----------|--------|
| Nenhuma alteração de dados | ✅ |
| Escopo restrito a memberships | ✅ |
| Superadmin preservado | ✅ |
| Tenant isolation reforçado | ✅ |
| RLS consistente (USING = WITH CHECK) | ✅ |

---

## RESULTADO FINAL

```
P0.2 — RLS HOTFIX memberships
STATUS: ✅ CONCLUÍDO
ALTERAÇÃO: UPDATE policy hardened
RISCO: ELIMINADO
BASELINE: ATUALIZADO
```

---

## WARNINGS PRÉ-EXISTENTES (NÃO RELACIONADOS)

Os seguintes warnings foram detectados pelo linter, mas **NÃO são relacionados a esta migração** e já existiam anteriormente:

1. **Security Definer Views** (2x) - Views com SECURITY DEFINER
2. **Leaked Password Protection Disabled** - Proteção de senhas vazadas desabilitada

Estes itens devem ser tratados em PIs separados.
