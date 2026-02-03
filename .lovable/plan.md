

# P0.2 — RLS HOTFIX memberships · PRONTO PARA EXECUÇÃO

---

## STATUS

| Item | Estado |
|------|--------|
| Pré-check executado | ✅ `with_check = false` confirmado |
| SQL validado | ✅ Pronto |
| Aprovação recebida | ✅ APROVADO SEM RESSALVAS |
| Modo atual | ⚠️ READ-ONLY (Plan Mode) |

---

## AÇÃO NECESSÁRIA

**Após aprovação deste plano**, o sistema entrará em modo de implementação e executará:

### Migration SQL

```sql
-- P0.2: Add WITH CHECK to memberships UPDATE policy

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

## VALIDAÇÃO PÓS-EXECUÇÃO

```sql
SELECT policyname, cmd, 
       qual IS NOT NULL as has_qual, 
       with_check IS NOT NULL as has_with_check
FROM pg_policies
WHERE tablename = 'memberships'
  AND policyname = 'Staff and admins can update memberships';
```

**Esperado**: `has_with_check = true`

---

## DOCUMENTAÇÃO

Atualizar `.lovable/plan.md` com:

```text
## P0.2 — RLS HOTFIX memberships
STATUS: ✅ CONCLUÍDO
DATA: 2026-02-03
RESULTADO: WITH CHECK adicionado à policy de UPDATE
```

---

## CRITÉRIOS DE ACEITE

| Critério | Verificação |
|----------|-------------|
| WITH CHECK adicionado | Query de validação |
| USING preservado | Mesma lógica |
| Nenhuma tabela alterada | Apenas memberships |
| Superadmin preservado | is_superadmin() em ambos |

---

## RESULTADO ESPERADO

```text
P0.2 — RLS HOTFIX memberships
STATUS: ✅ CONCLUÍDO
ALTERAÇÃO: UPDATE policy hardened
RISCO: ELIMINADO
BASELINE: ATUALIZADO
```

