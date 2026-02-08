
# PI-P7.0 — UX Audit READ-ONLY
## Systematic UX Review Report

**Status:** COMPLETE (Auditoria finalizada)
**Escopo:** Diagnostico completo de UX sem alteracao de codigo
**Impacto funcional:** Zero
**Arquivos alterados:** Nenhum

---

## 1. Executive Summary

O sistema TATAME Pro apresenta uma arquitetura de UX **solidamente estruturada**, com componentes reutilizaveis bem documentados e padroes consistentes. A auditoria identificou **areas de excelencia** que devem ser preservadas e **fricoes pontuais** que podem ser refinadas.

### Visao Geral por Severidade

| Severidade | Quantidade | Descricao |
|------------|------------|-----------|
| S0 | Muitos | Funcionam bem, nao mexer |
| S1 | 8 | Ruido leve |
| S2 | 5 | Friccao real |
| S3 | 2 | Erro grave de UX |
| S4 | 0 | Risco institucional |

---

## 2. Padroes que Funcionam (NAO MEXER)

### 2.1 Componentes UX Unificados (S0 - Excelente)

O sistema possui uma biblioteca de componentes UX bem estruturada em `src/components/ux/`:

```text
BlockedStateCard.tsx  — Estados de bloqueio unificados
EmptyStateCard.tsx    — Estados vazios informativos
LoadingState.tsx      — Carregamento com 3 variantes
TemporaryErrorCard.tsx — Erros recuperaveis
TransitionFeedback.tsx — Feedback de transicao
```

**Evidencia:** Todos usam i18n keys, suportam multiplas variantes, seguem design consistente.
**Recomendacao:** Manter como padrao canonico.

### 2.2 Sistema de i18n (S0 - Excelente)

- Arquivo centralizado `src/locales/pt-BR.ts` com ~2500 linhas
- Suporte a PT-BR, EN, ES
- Uso consistente de `t('key')` em toda aplicacao
- Labels dinamicos com interpolacao (`{count}`, `{name}`)

**Evidencia:** Login, Dashboard, Tenant Landing, Onboarding todos usam t().
**Recomendacao:** Manter arquitetura atual.

### 2.3 Estados de Erro Estruturados (S0 - Excelente)

`IdentityGate.tsx` e `IdentityErrorScreen.tsx` demonstram tratamento robusto:
- Mapeamento de codigos de erro para mensagens amigaveis
- Acoes de escape explicitas (Retry, Logout, GoHome)
- Variantes de icone por severidade
- HTTP 200 com erros neutros em endpoints publicos

**Evidencia:** 
```typescript
case 'TENANT_NOT_FOUND':
  return {
    icon: Building2,
    iconVariant: 'destructive',
    titleKey: 'identityError.tenantNotFound.title',
    descriptionKey: 'identityError.tenantNotFound.desc',
    actions: [...]
  };
```

### 2.4 Tenant Theming (S0 - Excelente)

`TenantLayout.tsx` injeta CSS variables para branding:
```typescript
document.documentElement.style.setProperty('--tenant-primary', hsl);
```

**Resultado:** Landing pages e botoes respeitam cores da organizacao.

### 2.5 Status Badges Semanticos (S0 - Excelente)

`StatusBadge` componente com cores semanticas consistentes:
- ACTIVE = verde
- PENDING = amarelo
- EXPIRED = vermelho
- BLOCKED = destrutivo

---

## 3. Mapa de Friccoes por Area

### 3.1 Autenticacao e Entrada

#### F-AUTH-01: Loading State sem Contexto (S1 - Ruido Leve)

**Tela:** Login.tsx → IdentityLoadingScreen
**Persona:** Todos
**Observacao:** Durante resolucao de identidade, usuario ve apenas spinner
**Expectativa:** Saber o que esta acontecendo
**Comportamento:** Spinner generico por ate 8s antes de hint

**Evidencia:** `IdentityLoadingScreen` mostra timeout hint apenas apos 8s
**Classificacao:** S1 - Nao e bloqueante, mas poderia ser mais informativo

---

#### F-AUTH-02: Mensagem de Erro Generica em Fallback (S2 - Friccao Real)

**Tela:** IdentityErrorScreen.tsx linha 110-120
**Persona:** Usuario Operacional
**Observacao:** Erro default mostra "Ocorreu um erro inesperado"
**Expectativa:** Orientacao especifica do que fazer

**Evidencia:** 
```typescript
default:
  return {
    icon: HelpCircle,
    iconVariant: 'muted',
    titleKey: 'identityError.default.title',
    descriptionKey: 'identityError.default.desc',
    ...
  };
```

**Classificacao:** S2 - Frustante para usuarios em erro nao mapeado

---

### 3.2 Onboarding e Lifecycle

#### F-ONB-01: Wizard com Steps Numerados mas sem Nome Visivel (S1)

**Tela:** TenantOnboarding.tsx
**Persona:** Admin de Organizacao
**Observacao:** Steps mostram numero + icone, titulo so aparece abaixo
**Expectativa:** Ver "Esportes > Academias > ..." na barra de progresso

**Evidencia:** Linha 312-337 mostra apenas numeros clicaveis
**Classificacao:** S1 - Funciona, mas menos claro que poderia

---

#### F-ONB-02: Required Steps sem Destaque Visual Forte (S2)

**Tela:** TenantOnboarding.tsx linha 468-475
**Persona:** Admin de Organizacao
**Observacao:** Steps obrigatorios tem alert vermelho SÓ na view do step
**Expectativa:** Indicacao visual na barra de progresso

**Evidencia:** Alert destructive dentro do step, nao no step indicator
**Classificacao:** S2 - Pode causar confusao sobre progresso

---

### 3.3 Navegacao Global

#### F-NAV-01: Sidebar sem Indicador de Rota Ativa (S3 - Erro Grave)

**Tela:** AppShell.tsx linhas 274-294
**Persona:** Todos
**Observacao:** Links de navegacao nao destacam pagina atual
**Expectativa:** Item ativo com cor diferente ou indicador

**Evidencia:** 
```typescript
<Link
  key={item.name}
  to={item.href}
  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
>
```
Nao ha verificacao de `location.pathname === item.href`

**Classificacao:** S3 - Usuario pode se perder na navegacao

---

#### F-NAV-02: Mobile Menu fecha mas nao indica onde usuario esta (S2)

**Tela:** AppShell.tsx
**Persona:** Usuario Mobile
**Observacao:** Menu lateral fecha apos click, sem confirmacao visual
**Expectativa:** Feedback de transicao ou indicador

**Classificacao:** S2 - Friccao em fluxo mobile

---

### 3.4 Fluxos Criticos

#### F-DOC-01: Emissao de Carteirinha sem Preview (S1)

**Tela:** Fluxo de emissao (via Edge Function)
**Persona:** Admin/Staff
**Observacao:** Carteirinha e gerada diretamente, sem preview do resultado
**Expectativa:** Ver preview antes de confirmar

**Classificacao:** S1 - Nao bloqueia, mas poderia aumentar confianca

---

#### F-APV-01: Lista de Aprovacoes sem Filtros Avancados (S1)

**Tela:** ApprovalsList.tsx
**Persona:** Admin de Organizacao
**Observacao:** Apenas lista cronologica, sem filtro por status/academia
**Expectativa:** Poder filtrar por prioridade/tipo

**Evidencia:** Nao ha componentes de filtro como em AthletesList
**Classificacao:** S1 - Suficiente para volume baixo

---

### 3.5 Telas Administrativas

#### F-ADMIN-01: Tabela de Tenants muito Densa (S1)

**Tela:** AdminDashboard.tsx
**Persona:** Superadmin Global
**Observacao:** Muitas colunas em tabela unica
**Expectativa:** Colunas priorizadas por frequencia de uso

**Classificacao:** S1 - Gerenciavel com scroll horizontal

---

#### F-ADMIN-02: Contagem de Atletas sem Breakdown (S1)

**Tela:** TenantDashboard.tsx
**Persona:** Admin Organizacao
**Observacao:** Total de atletas sem segmentacao por status
**Expectativa:** Ver ativos vs inativos vs pendentes

**Classificacao:** S1 - Informativo mas incompleto

---

### 3.6 Estados de Erro

#### F-ERR-01: NotFound sem Contexto de Origem (S2)

**Tela:** NotFound.tsx
**Persona:** Todos
**Observacao:** Pagina 404 generica, mesma para tenant ou admin
**Expectativa:** Contexto do que falhou (tenant nao existe vs rota invalida)

**Evidencia:** Linha 19 mostra texto fixo: "Pagina nao encontrada"
**Classificacao:** S2 - Perda de contexto em erros

---

#### F-ERR-02: Blocked Screen para Nao-Admin muito Generico (S2)

**Tela:** TenantBlockedScreen.tsx linha 248-300
**Persona:** Usuario Operacional (Atleta)
**Observacao:** Mensagem "Temporariamente indisponivel" sem estimativa
**Expectativa:** Saber se e horas, dias, ou permanente

**Evidencia:** Nao ha indicacao de timeline de resolucao
**Classificacao:** S2 - Gera incerteza

---

### 3.7 Internacionalizacao

#### F-I18N-01: Datas Hardcoded para pt-BR (S3 - Erro Grave)

**Tela:** Multiplas (MembershipList, AthletesList, TenantControl, etc)
**Persona:** Usuarios EN/ES
**Observacao:** `toLocaleDateString('pt-BR')` hardcoded em 26+ arquivos
**Expectativa:** Usar locale do contexto i18n

**Evidencia:** 
```typescript
// MembershipList.tsx:142
return new Date(dateString).toLocaleDateString('pt-BR');

// AdminDashboard.tsx:224
return new Date(dateString).toLocaleDateString('pt-BR', {...});
```

**Classificacao:** S3 - Quebra expectativa de usuarios internacionais

---

#### F-I18N-02: Valores Monetarios Hardcoded para BRL (S2)

**Tela:** EventDetails, PublicEventDetails, AdminDashboard
**Persona:** Organizacoes internacionais
**Observacao:** Formatacao assume pt-BR para moedas

**Evidencia:**
```typescript
// AdminDashboard.tsx:242
value: `R$ ${((billingMetrics?.monthlyRevenue || 0) / 100).toLocaleString('pt-BR', ...)}
```

**Classificacao:** S2 - Incorreto para tenants USD/EUR

---

## 4. Riscos Institucionais (S3/S4)

### R-INST-01: Navegacao Confusa pode Impactar Confianca (S3)

**Contexto:** Sistema institucional para federacoes
**Risco:** Sidebar sem indicador ativo pode parecer "amador"
**Impacto:** Percepcao de qualidade por entidades regulatorias

---

### R-INST-02: Datas em Portugues para Tenants Internacionais (S3)

**Contexto:** Suporte multi-idioma anunciado
**Risco:** Documentos e telas mostrando datas em pt-BR para usuarios EN/ES
**Impacto:** Credibilidade institucional comprometida

---

## 5. Backlog de Achados

| ID | Area | Severidade | Descricao | Evidencia |
|-----|------|------------|-----------|-----------|
| F-AUTH-01 | Auth | S1 | Loading sem contexto temporal | IdentityLoadingScreen.tsx |
| F-AUTH-02 | Auth | S2 | Erro default generico | IdentityErrorScreen.tsx:110 |
| F-ONB-01 | Onboarding | S1 | Steps sem nome na barra | TenantOnboarding.tsx:312 |
| F-ONB-02 | Onboarding | S2 | Required sem destaque visual | TenantOnboarding.tsx:468 |
| F-NAV-01 | Navegacao | S3 | Sidebar sem indicador ativo | AppShell.tsx:274 |
| F-NAV-02 | Navegacao | S2 | Mobile sem feedback visual | AppShell.tsx |
| F-DOC-01 | Documentos | S1 | Emissao sem preview | Edge Function flow |
| F-APV-01 | Aprovacoes | S1 | Lista sem filtros | ApprovalsList.tsx |
| F-ADMIN-01 | Admin | S1 | Tabela densa | AdminDashboard.tsx |
| F-ADMIN-02 | Admin | S1 | Contagem sem breakdown | TenantDashboard.tsx |
| F-ERR-01 | Erros | S2 | 404 sem contexto | NotFound.tsx |
| F-ERR-02 | Erros | S2 | Blocked generico | TenantBlockedScreen.tsx:248 |
| F-I18N-01 | i18n | S3 | Datas hardcoded pt-BR | 26+ arquivos |
| F-I18N-02 | i18n | S2 | Moedas hardcoded BRL | EventDetails, Admin |

---

## 6. Recomendacoes de Foco para P7.1

### Prioridade Alta (S3)

1. **F-NAV-01:** Adicionar indicador de rota ativa na sidebar
2. **F-I18N-01:** Centralizar formatacao de datas usando locale do contexto

### Prioridade Media (S2)

3. **F-AUTH-02:** Enriquecer mensagens de erro default
4. **F-ONB-02:** Destacar steps obrigatorios na barra de progresso
5. **F-I18N-02:** Usar Intl.NumberFormat com locale dinamico
6. **F-ERR-01:** Contextualizar 404 por origem

### Prioridade Baixa (S1)

7. Melhorar loading states com mensagens progressivas
8. Adicionar filtros em ApprovalsList
9. Considerar preview antes de emissao de documentos

---

## 7. Conclusao

O sistema TATAME Pro demonstra **maturidade arquitetural** em UX:
- Componentes reutilizaveis documentados
- i18n estruturado e extenso
- Estados de erro tratados com escape hatches
- Theming por tenant funcional

As friccoes identificadas sao **refinamentos**, nao falhas estruturais. A prioridade deve ser:

1. **Corrigir S3:** Navegacao sem indicador + datas hardcoded
2. **Resolver S2:** Erros genericos + formatacao de moedas
3. **Refinar S1:** Melhorias incrementais de clareza

**Criterios de Aceite SAFE GOLD:**

| Criterio | Status |
|----------|--------|
| Todas areas mapeadas | OK |
| Problemas S2+ registrados | OK (5 S2, 2 S3) |
| Nenhuma linha alterada | OK |
| Relatorio permite decidir NAO mexer | OK |
