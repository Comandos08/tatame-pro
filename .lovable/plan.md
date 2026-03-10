

# Clean Slate Reset — Preservar apenas global@tatame.pro

## Estado Atual do Banco

| Tabela | Registros |
|--------|-----------|
| auth.users | 6 usuários |
| profiles | 5 |
| user_roles | 2 (1 SUPERADMIN_GLOBAL + 1 ADMIN_TENANT) |
| tenants | 1 |
| audit_logs | 81 |
| Demais tabelas | 0 registros |

**Usuário preservado:** `global@tatame.pro` (ID: `d26454f2-a66d-423f-ae5f-006f1cc90635`)

**Usuários a remover:**
- capanomarcelo2@gmail.com
- global@tierone.pro
- gleysonasilva@gmail.com
- cbsabrasil@aol.com
- admin@sambocbsa.com.br

## Plano de Execução

Uma migration SQL que executa na seguinte ordem:

1. **Desabilitar RLS temporariamente** nas tabelas afetadas (para permitir bulk delete)
2. **Deletar dados operacionais** (ordem FK-safe):
   - digital_cards, diplomas, athlete_gradings
   - event_registrations, event_results, event_categories, event_brackets, event_bracket_matches, events
   - documents, document_public_tokens
   - memberships, guardian_links, guardians, athletes
   - academy_coaches, coaches, academies
   - grading_levels, grading_schemes
   - tenant_invoices, tenant_billing
   - decision_logs, security_timeline
   - feature_access, federation_roles, federation_tenants, federations, council_members, councils
   - webhook_events, deleted_tenants
3. **Limpar user_roles** exceto SUPERADMIN_GLOBAL do global@tatame.pro
4. **Limpar audit_logs** (reset completo)
5. **Deletar profiles** de outros usuários
6. **Deletar tenants** (todos)
7. **Deletar auth.users** (exceto global@tatame.pro) — inclui auth.sessions, auth.mfa_factors, auth.identities
8. **Re-habilitar RLS**

## Arquivo Afetado

Nenhum arquivo de código é alterado. Apenas uma migration SQL de dados.

## Riscos

- Operação **irreversível** — todos os dados exceto o superadmin serão permanentemente removidos
- auth.users requer `CASCADE` nas tabelas auth (sessions, identities, mfa_factors)

