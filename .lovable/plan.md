# P0.1 — ENCERRAMENTO FORMAL
## STATUS: ⏸️ PAUSADO (CRITÉRIO DE PARADA TÉCNICO)

---

## DECLARAÇÃO DE ENCERRAMENTO

| Item | Status |
|------|--------|
| PRÉ-CHECK executado | ✅ Completo |
| Impedimento técnico validado | ✅ RLS não suporta "lookup-only" sem discriminador |
| SQL aplicado | ❌ ZERO (conforme esperado) |
| Policies alteradas | ❌ ZERO |
| Escopo respeitado | ✅ Somente digital_cards analisado |

### Motivo Técnico do Impedimento

PostgreSQL RLS avalia policies **linha-a-linha**, não **query-a-query**. Não há como:
- Permitir `SELECT ... WHERE id = 'X'` (1 resultado)
- Bloquear `SELECT *` (todos os resultados)

...usando apenas `USING(...)` sem um discriminador adicional.

---

# P1 — VERIFICAÇÃO PÚBLICA SEGURA
## STATUS: ✅ CONCLUÍDO (2026-02-03)

---

## RESULTADO

| Item | Status |
|------|--------|
| Edge Function `verify-digital-card` criada | ✅ |
| Frontend `VerifyCard.tsx` atualizado | ✅ |
| Policy `Public can verify digital cards` removida | ✅ |
| Verificação E2E funcionando | ✅ |

---

## ANTES (VULNERÁVEL)

```sql
-- Policy com qual: true expunha TODOS os cards
CREATE POLICY "Public can verify digital cards"
ON public.digital_cards FOR SELECT
USING (true);  -- ⚠️ Qualquer um podia listar todos
```

---

## DEPOIS (SEGURO)

### Policies Atuais em `digital_cards`

| Policy | CMD | Descrição |
|--------|-----|-----------|
| `Athletes can view own digital cards` | SELECT | Atleta vê próprio card via profile_id |
| `Superadmin full access to digital_cards` | ALL | Superadmin com is_superadmin() |
| `Tenant admin can manage digital_cards` | ALL | Admin com is_tenant_admin(tenant_id) |

### Verificação Pública

- Movida para Edge Function `verify-digital-card`
- Usa `service_role` para lookup interno
- UUID validado via regex
- Nome do atleta mascarado (LGPD)
- Sem exposição de enumeração

---

## ARQUIVOS MODIFICADOS

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/verify-digital-card/index.ts` | CRIADO - Edge Function segura |
| `src/pages/VerifyCard.tsx` | ATUALIZADO - Usa Edge Function |

---

## GARANTIAS DE SEGURANÇA

| Garantia | Implementação |
|----------|--------------|
| Sem enumeração | Edge Function aceita apenas 1 cardId por request |
| UUID validado | Regex antes de query |
| Dados mascarados | Nome do atleta truncado (LGPD) |
| Tenant validado | tenantSlug verificado contra tenant.slug |
| Policy pública removida | `qual: true` não existe mais |

---

## PRÓXIMOS PIs (BACKLOG)

| PI | Escopo | Status |
|----|--------|--------|
| P0.2 | Adicionar `with_check` em `memberships` UPDATE | 🔜 Pendente |
| P2 | Rate limiting na Edge Function | 🔜 Opcional |
| P3 | Documentar modelo RLS vs Edge Functions | 🔜 Opcional |

---

```
P1 — VERIFICAÇÃO PÚBLICA SEGURA
STATUS: ✅ CONCLUÍDO
DATA: 2026-02-03
RESULTADO: 
  - Policy pública `qual: true` REMOVIDA
  - Edge Function implementada e deployed
  - Zero exposição de dados
  - Verificação pública preservada
```
