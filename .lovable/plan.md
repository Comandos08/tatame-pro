
# P0 — RESET CONTROLADO DE AMBIENTE

## Database Clean Slate · TATAME PRO

---

## PRÉ-CHECK EXECUTADO ✅

### 1. Superadmin Confirmado

| Campo | Valor |
|-------|-------|
| Email | `global@tatame.pro` |
| User ID | `d26454f2-a66d-423f-ae5f-006f1cc90635` |
| Role | `SUPERADMIN_GLOBAL` |
| Tenant ID | `NULL` ✅ |

**Nota**: Este usuário também possui role `ADMIN_TENANT` em um tenant. Será removida durante o reset (apenas `SUPERADMIN_GLOBAL` permanece).

### 2. Estado Atual do Banco

| Tabela | Contagem |
|--------|----------|
| tenants | 3 |
| academies | 2 |
| athletes | 1 |
| coaches | 4 |
| memberships | 1 |
| digital_cards | 1 |
| diplomas | 1 |
| events | 2 |
| event_categories | 1 |
| grading_schemes | 2 |
| grading_levels | 10 |
| athlete_gradings | 1 |
| academy_coaches | 3 |
| tenant_billing | 3 |
| audit_logs | 31 |
| decision_logs | 5 |
| superadmin_impersonations | 10 |
| profiles | 5 |

### 3. Usuários no auth.users

| Email | Profile Tenant |
|-------|---------------|
| global@tatame.pro | 2d641c56... |
| luizfelipevillar@gmail.com | 2d641c56... |
| cbsa@sambocbsa.com.br | 31a7f2a8... |
| global@tierone.pro | 14a99bd5... |
| fernandojujitsu@hotmail.com | NULL |

---

## DECISÃO CRÍTICA

### Usuários auth.users

O escopo original indica **preservar apenas `global@tatame.pro`**. Porém, deletar usuários do `auth.users` requer cuidado especial:

**Opção A** (Conservadora): Manter todos os usuários em `auth.users`, apenas limpar dados funcionais e roles não-superadmin.

**Opção B** (Radical): Deletar outros usuários de `auth.users` via SQL direto.

**Recomendação**: Opção A. Manter os 5 usuários em `auth.users`, mas:
- Limpar profile.tenant_id para todos exceto superadmin
- Remover todas as roles exceto SUPERADMIN_GLOBAL
- Resetar wizard_completed para false (exceto superadmin)

Isso preserva a integridade do auth e permite que esses usuários façam novo onboarding.

---

## PLANO DE EXECUÇÃO

### FASE 0 — Backup Mental

Nenhuma estrutura será alterada. Apenas dados.

### FASE 1 — Limpeza de Logs e Eventos

```sql
DELETE FROM webhook_events;
DELETE FROM security_events;
DELETE FROM decision_logs;
DELETE FROM audit_logs;
DELETE FROM superadmin_impersonations;
DELETE FROM password_resets;
```

### FASE 2 — Limpeza de Eventos Esportivos

```sql
DELETE FROM event_results;
DELETE FROM event_registrations;
DELETE FROM event_bracket_matches;
DELETE FROM event_brackets;
DELETE FROM event_categories;
DELETE FROM events;
```

### FASE 3 — Limpeza de Graduação e Diplomas

```sql
DELETE FROM diplomas;
DELETE FROM athlete_gradings;
DELETE FROM grading_levels;
DELETE FROM grading_schemes;
```

### FASE 4 — Limpeza de Memberships e Pessoas

```sql
DELETE FROM digital_cards;
DELETE FROM documents;
DELETE FROM memberships;
DELETE FROM guardian_links;
DELETE FROM guardians;
DELETE FROM athletes;
DELETE FROM coaches;
```

### FASE 5 — Limpeza de Academias e Tenants

```sql
DELETE FROM academy_coaches;
DELETE FROM academies;
DELETE FROM tenant_invoices;
DELETE FROM tenant_billing;
DELETE FROM deleted_tenants;
DELETE FROM tenants;
```

### FASE 6 — Limpeza de Roles (Preservar Superadmin)

```sql
DELETE FROM public.user_roles
WHERE NOT (
  role = 'SUPERADMIN_GLOBAL' 
  AND user_id = 'd26454f2-a66d-423f-ae5f-006f1cc90635'
);
```

### FASE 7 — Reset de Profiles

```sql
-- Superadmin: limpar tenant_id, manter wizard_completed
UPDATE public.profiles
SET tenant_id = NULL
WHERE id = 'd26454f2-a66d-423f-ae5f-006f1cc90635';

-- Outros usuários: limpar tenant_id e resetar wizard
UPDATE public.profiles
SET tenant_id = NULL, wizard_completed = false
WHERE id != 'd26454f2-a66d-423f-ae5f-006f1cc90635';
```

### FASE 8 — Preservar Configuração de Plataforma

```sql
-- Manter platform_landing_config (1 registro)
-- Manter platform_partners (0 registros)
-- Estes são dados de plataforma, não de tenant
```

---

## VALIDAÇÃO PÓS-RESET

### 1. Banco Vazio

```sql
SELECT
  (SELECT COUNT(*) FROM tenants) AS tenants,
  (SELECT COUNT(*) FROM memberships) AS memberships,
  (SELECT COUNT(*) FROM athletes) AS athletes,
  (SELECT COUNT(*) FROM digital_cards) AS cards;
```

**Esperado**: Todos = 0

### 2. Superadmin Único

```sql
SELECT role, user_id FROM public.user_roles;
```

**Esperado**: 1 linha, `SUPERADMIN_GLOBAL`, user_id do global@tatame.pro

### 3. Profiles Limpos

```sql
SELECT email, tenant_id, wizard_completed 
FROM profiles p
JOIN auth.users u ON u.id = p.id;
```

**Esperado**: 
- global@tatame.pro: tenant_id NULL, wizard_completed true
- Outros: tenant_id NULL, wizard_completed false

---

## CRITÉRIOS DE PARADA

| Condição | Ação |
|----------|------|
| FK violation | PARAR |
| Erro em DELETE | PARAR |
| Superadmin afetado | PARAR |
| Policy/função alterada | PARAR |

---

## GARANTIAS DE SEGURANÇA

| Item | Estado |
|------|--------|
| Schema preservado | ✅ |
| Funções SQL preservadas | ✅ |
| Policies RLS preservadas | ✅ |
| Edge Functions preservadas | ✅ |
| auth.users preservado | ✅ |
| Superadmin preservado | ✅ |
| platform_landing_config preservado | ✅ |

---

## RESULTADO ESPERADO

```text
DATABASE STATE: CLEAN SLATE
USERS: 5 (auth.users preservados)
PROFILES: 5 (tenant_id = NULL para todos)
ROLES: 1 (SUPERADMIN_GLOBAL apenas)
TENANTS: 0
RLS: ATIVO
EDGE FUNCTIONS: ATIVAS
BASELINE: PRESERVADO
```

---

## PRÓXIMOS PASSOS (APÓS RESET)

1. ✅ Login com global@tatame.pro
2. ✅ Criar tenant de teste
3. ✅ Criar academy
4. ✅ Criar atleta
5. ✅ Criar membership
6. ✅ Emitir digital_card
7. ✅ Testar verificação QR
8. ✅ Testar impersonation
9. ✅ Testar RLS (tentativas proibidas)
10. ✅ Testar Edge Functions

---

## EXECUÇÃO

A execução será feita via múltiplas chamadas SQL, na ordem especificada, com validação entre cada fase.

**STATUS**: PRONTO PARA EXECUÇÃO
