

# P0 — AUDITORIA COMPLETA DE RLS
## TATAME PRO · RELATÓRIO CONSOLIDADO

---

## SUMÁRIO EXECUTIVO

| Métrica | Valor |
|---------|-------|
| **Total de Tabelas com RLS Habilitado** | 33 |
| **Total de Policies RLS** | 119 |
| **Tabelas com tenant_id** | 30 |
| **Views Públicas (sem RLS)** | 4 |
| **Policies usando is_superadmin()** | 31 |
| **Policies usando x-impersonation-id** | **0** ⚠️ |

---

## 🚨 ACHADO CRÍTICO #1: ZERO IMPERSONATION NO RLS

**Nenhuma policy RLS usa `x-impersonation-id`.**

Isso significa que:
- O header `x-impersonation-id` enviado pelo frontend **NÃO É CONSIDERADO** nas queries PostgREST
- Superadmins usando impersonation **dependem exclusivamente** da função `is_superadmin()` que verifica apenas `auth.uid()`
- O sistema de impersonation funciona **apenas em Edge Functions** (onde o header é verificado manualmente)
- Operações via PostgREST direto (queries, updates, etc.) **NÃO respeitam impersonation**

### Impacto:
- Superadmin consegue acessar dados de QUALQUER tenant via `is_superadmin()` mesmo SEM impersonation ativa
- Audit trail fica incompleto — não há como rastrear qual tenant estava sendo "impersonado" em operações PostgREST
- Modelo de responsabilidade fica comprometido

---

## 🚨 ACHADO CRÍTICO #2: POLICIES PÚBLICAS (TIPO D)

| Tabela | Policy | Risco |
|--------|--------|-------|
| `digital_cards` | `Public can verify digital cards` → `qual: true` | ⚠️ **LEITURA TOTAL** |
| `platform_landing_config` | `Public read platform_landing_config` → `qual: true` | 🔶 Baixo (config pública) |

**Policy `Public can verify digital cards` com `qual: true`** significa que QUALQUER pessoa (autenticada ou não) pode ler TODOS os digital_cards. Isso é intencional para verificação pública, mas expõe dados sensíveis.

---

## 📊 INVENTÁRIO COMPLETO DE POLICIES

### Classificação por Tipo

| Tipo | Definição | Quantidade |
|------|-----------|------------|
| **A** | Usa impersonation corretamente | **0** |
| **B** | Usa apenas `is_superadmin()` | 31 |
| **C** | Usa `auth.uid()` + `tenant_id` | ~70 |
| **D** | Pública, genérica ou perigosa | 18 |

---

## DETALHAMENTO POR TABELA

### 1. TABELAS CRÍTICAS — SUPERADMIN-ONLY

| Tabela | Policies | Risco Identificado |
|--------|----------|-------------------|
| `superadmin_impersonations` | 2 | ✅ OK - service_role + superadmin próprio |
| `deleted_tenants` | 1 | ✅ OK - somente superadmin |
| `webhook_events` | 1 | ✅ OK - somente superadmin |
| `platform_landing_config` | 2 | 🔶 `qual: true` para SELECT público |
| `platform_partners` | 2 | ✅ OK - público apenas is_active |

### 2. TABELAS TENANT-SCOPED — ALTO RISCO

| Tabela | Policies | SELECT | INSERT | UPDATE | DELETE | Riscos |
|--------|----------|--------|--------|--------|--------|--------|
| **memberships** | 8 | 4 | 1 | 1 | 0 | ⚠️ UPDATE sem with_check |
| **athletes** | 8 | 4 | 1 | 1 | 0 | ✅ OK |
| **profiles** | 5 | 3 | 1 | 1 | 0 | ✅ OK |
| **user_roles** | 4 | 2 | 0 | 0 | 0 | ⚠️ Não bloqueia SUPERADMIN_GLOBAL |
| **tenant_billing** | 3 | 2 | 0 | 0 | 0 | ⚠️ Sem policy de escrita para tenant admin |
| **audit_logs** | 7 | 2 | 2 | 1 | 1 | ✅ OK - imutável |
| **decision_logs** | 4 | 1 | 1 | 1 | 1 | ✅ OK - imutável |
| **security_events** | 4 | 2 | 0 | 1 | 1 | ⚠️ Sem INSERT para tenant |

### 3. TABELAS DE EVENTOS — RISCO MÉDIO

| Tabela | Policies | Risco |
|--------|----------|-------|
| **events** | 2 | ✅ OK - público filtra is_public |
| **event_brackets** | 2 | ✅ OK - público filtra PUBLISHED |
| **event_bracket_matches** | 2 | ✅ OK - público filtra bracket PUBLISHED |
| **event_categories** | 2 | ✅ OK - público filtra evento publicado |
| **event_registrations** | 4 | ✅ OK - athlete + admin |
| **event_results** | 3 | ✅ OK - imutável via trigger |

### 4. TABELAS DE GRADUAÇÃO — RISCO BAIXO

| Tabela | Policies | Risco |
|--------|----------|-------|
| **grading_schemes** | 4 | ✅ OK - público is_active |
| **grading_levels** | 4 | ✅ OK - público is_active |
| **athlete_gradings** | 5 | ✅ OK |
| **diplomas** | 6 | 🔶 Público vê ISSUED sem auth |

### 5. TABELAS AUXILIARES

| Tabela | Policies | Risco |
|--------|----------|-------|
| **academies** | 4 | ✅ OK - público is_active |
| **academy_coaches** | 4 | ✅ OK |
| **coaches** | 6 | ✅ OK |
| **documents** | 4 | ✅ OK |
| **guardians** | 4 | ✅ OK |
| **guardian_links** | 4 | ✅ OK |
| **digital_cards** | 4 | ⚠️ `qual: true` para SELECT |

---

## VIEWS PÚBLICAS (SEM RLS)

| View | Propósito | Risco |
|------|-----------|-------|
| `athlete_current_grading` | Graduação atual do atleta | 🔶 Verifica via função? |
| `athletes_public_verification` | Verificação pública | ✅ Intencional |
| `membership_verification` | Verificação de filiação | ✅ Intencional |
| `security_timeline` | Timeline de segurança | ⚠️ Deveria ter RLS? |

---

## ANÁLISE DE PADRÕES

### Padrão Positivo ✅
- Todas as tabelas tenant-scoped usam `is_tenant_admin(tenant_id)` ou `has_role(..., tenant_id)`
- Tabelas imutáveis (audit_logs, decision_logs) têm policies `qual: false` para UPDATE/DELETE
- Superadmin tem acesso via `is_superadmin()` em todas as tabelas críticas

### Padrão Problemático ⚠️
1. **Superadmin SEM Impersonation Context**
   - `is_superadmin()` verifica apenas se usuário tem role SUPERADMIN_GLOBAL
   - NÃO verifica se há impersonation ativa
   - NÃO limita acesso ao tenant impersonado
   
2. **with_check Ausente**
   - `Staff and admins can update memberships` - UPDATE sem with_check
   - Permite atualizar campos arbitrariamente

3. **Policies Públicas Amplas**
   - `digital_cards`: SELECT com `qual: true` expõe dados de todos os cards

---

## 🎯 CANDIDATOS A CORREÇÃO (PRÓXIMO PI)

### P0.1 — Correções Cirúrgicas Imediatas

| # | Tabela | Policy | Problema | Correção Sugerida |
|---|--------|--------|----------|-------------------|
| 1 | `digital_cards` | `Public can verify digital cards` | `qual: true` | Adicionar filtro por id específico |
| 2 | `memberships` | `Staff and admins can update memberships` | `with_check: null` | Adicionar with_check = qual |
| 3 | Todas com `is_superadmin()` | 31 policies | Não considera impersonation | Avaliar se impersonation é necessário em RLS |

### P1 — Padronização Backend

| # | Escopo | Descrição |
|---|--------|-----------|
| 1 | **Impersonation-Aware RLS** | Criar função `is_superadmin_in_tenant(tenant_id)` que valida impersonation |
| 2 | **Audit Trail** | Garantir que operações via impersonation loguem corretamente |
| 3 | **Views Seguras** | Avaliar se `security_timeline` precisa de RLS adicional |

---

## ANÁLISE DA FUNÇÃO `is_superadmin()`

```sql
CREATE OR REPLACE FUNCTION public.is_superadmin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'SUPERADMIN_GLOBAL'
      AND tenant_id IS NULL
  )
$$;
```

**Problema**: Esta função retorna `true` para QUALQUER superadmin, independente de:
- Haver impersonation ativa
- Qual tenant está sendo acessado
- Header `x-impersonation-id` estar presente

**Resultado**: Superadmin pode acessar TODOS os dados de TODOS os tenants diretamente via PostgREST, sem passar por Edge Functions.

---

## RESUMO DE RISCOS

| Prioridade | Risco | Impacto | Recomendação |
|------------|-------|---------|--------------|
| **P0** | Superadmin sem escopo de tenant em RLS | Acesso irrestrito a todos os dados | Avaliar necessidade de impersonation-aware RLS |
| **P0** | `digital_cards` SELECT público | Exposição de todos os cards | Restringir a lookup por ID |
| **P1** | `memberships` UPDATE sem with_check | Alteração irrestrita de campos | Adicionar with_check |
| **P2** | `security_timeline` view sem RLS | Possível vazamento de eventos | Avaliar se precisa proteção |

---

## CONCLUSÃO

### Status: ✅ AUDITORIA COMPLETA

A auditoria identificou que o modelo de RLS do TATAME PRO segue um padrão **Tipo B/C** (auth.uid + tenant_id), com **ZERO suporte a impersonation** no nível de RLS.

O sistema de impersonation atual funciona **exclusivamente em Edge Functions**, onde o header `x-impersonation-id` é validado manualmente. Queries diretas via PostgREST (SDK Supabase) **NÃO respeitam impersonation**.

### Decisão Necessária:

1. **Aceitar o modelo atual**: Impersonation apenas via Edge Functions. Superadmin tem acesso total via RLS. Audit trail via Edge Functions.

2. **Evoluir para impersonation-aware RLS**: Criar função `is_superadmin_for_tenant(tenant_id)` que valida header de impersonation. Todas as 31 policies com `is_superadmin()` precisariam ser atualizadas.

**Recomendação**: Manter modelo atual (opção 1) é mais seguro operacionalmente, desde que:
- Operações sensíveis passem por Edge Functions
- Frontend force Edge Functions para operações de escrita
- Audit trail seja feito em Edge Functions

---

## PRÓXIMOS PASSOS

| PI | Escopo | Esforço |
|----|--------|---------|
| **P0.1** | Corrigir `digital_cards` SELECT público | 1h |
| **P0.2** | Adicionar with_check em `memberships` UPDATE | 30min |
| **P1** | Documentar modelo de segurança (RLS vs Edge Functions) | 2h |
| **P2** | Avaliar impersonation-aware RLS (se necessário) | 8h+ |

---

```
P0 – BACKEND RLS AUDIT = ✅ CONCLUÍDO
✅ Visibilidade total das policies (119)
✅ Riscos mapeados (4 críticos, 2 médios)
✅ Nenhuma alteração em produção
✅ Base sólida para correção cirúrgica
```

