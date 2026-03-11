# PLANO DE IMPLEMENTAÇÃO — FASE 5: POLISH

> **Objetivo:** Elevar qualidade operacional sem impactar capacidade de edição via Lovable
> **Critério de seleção:** Apenas itens que são NOVOS ARQUIVOS ou DOCUMENTAÇÃO ou EDGE FUNCTIONS isoladas
> **Risco Lovable:** ZERO — nenhum arquivo que Lovable toca será modificado

---

## ESCOPO APROVADO (8 itens)

### 1. README.md profissional (P2-43)
**Tipo:** Substituição de arquivo existente (template genérico Lovable)
**Risco Lovable:** NENHUM — Lovable não toca no README
**Ação:**
- Substituir README.md template por documentação real do projeto
- Incluir: descrição, stack, setup local, arquitetura, estrutura de pastas, deploy
- Manter compatível com formato Lovable (caso regenere, não quebra nada)

### 2. CONTRIBUTING.md (P2-43)
**Tipo:** Novo arquivo
**Risco Lovable:** NENHUM
**Ação:**
- Criar guia de contribuição com: setup, padrões de código, workflow Git, convenções de commit, processo de PR

### 3. Data Retention Policy (P2-44)
**Tipo:** Novo documento
**Risco Lovable:** NENHUM
**Ação:**
- Criar `docs/DATA-RETENTION-POLICY.md`
- Cobrir: períodos de retenção por tipo de dado, base legal LGPD, processo de exclusão, audit logs

### 4. Circuit Breaker para integrações (P2-31)
**Tipo:** Novo arquivo utilitário (`src/lib/http/circuit-breaker.ts`)
**Risco Lovable:** NENHUM — arquivo novo, Lovable não gera circuit breakers
**Ação:**
- Implementar circuit breaker pattern (closed → open → half-open)
- Integrar com o `http.ts` existente via composição (sem modificar `http.ts`)
- Exportar via `src/lib/http/index.ts` (adição de export apenas)
- Estados: CLOSED (normal) → OPEN (falhas > threshold) → HALF_OPEN (teste de recovery)
- Configurável: failureThreshold, resetTimeout, halfOpenMaxAttempts

### 5. Notify-critical-alert → Slack (P2-46)
**Tipo:** Edge function existente com TODO
**Risco Lovable:** NENHUM — Lovable não toca em edge functions `_shared`
**Ação:**
- Implementar envio para Slack no `notify-critical-alert`
- Usar Slack Incoming Webhook (env var `SLACK_WEBHOOK_URL`)
- Fallback gracioso se webhook não configurado

### 6. CHECK constraints no banco (P2-48)
**Tipo:** Nova migration
**Risco Lovable:** NENHUM — Lovable não gera migrations
**Ação:**
- `birth_date <= CURRENT_DATE` em athletes
- `valid_until > created_at` em memberships/documents com validade
- Migrations aditivas (ADD CONSTRAINT), não destrutivas

### 7. Impersonation cache invalidation (P2-47)
**Tipo:** Modificação mínima em arquivo existente
**Risco Lovable:** BAIXO — arquivo utilitário que Lovable raramente toca
**Ação:**
- Adicionar TTL e invalidação no cache de `impersonation-client.ts`
- Mudança mínima: adicionar timestamp ao cache entry + check de expiração

### 8. Load testing scripts documentados (P2-35)
**Tipo:** Novos arquivos
**Risco Lovable:** NENHUM
**Ação:**
- Criar `load-tests/` com scripts k6 (ou Artillery)
- Cenários: login, membership checkout, event listing, athlete search
- Documentar resultados baseline em `docs/LOAD-TEST-RESULTS.md`
- Adicionar npm script `test:load`

---

## ITENS EXCLUÍDOS (protegendo Lovable)

| Item | Motivo da exclusão |
|---|---|
| Lazy loading de imagens (P1-18) | Toca em componentes que Lovable edita |
| Virtualização de listas (P1-19) | Muda padrão de renderização que Lovable pode reverter |
| Status page pública (P2-33) | Requer hosting configurado (Fase 2) |
| Log aggregation (P2-34) | Requer serviço externo (DataDog/Loki) |
| Staging environment (P2-32) | Requer hosting configurado (Fase 2) |
| Audit log viewer UI (P2-40) | Componente UI complexo que Lovable pode conflitar |
| Font preload (P2-38) | Toca em index.html/CSS que Lovable regenera |
| Dynamic OG tags (P2-41) | Requer hosting com SSR |
| Sitemap.xml (P2-42) | Requer hosting configurado |
| Service Worker (P2-39) | Pode conflitar com Lovable preview |

---

## ORDEM DE EXECUÇÃO

```
Passo 1: Documentação (README + CONTRIBUTING + Data Retention)
         → Zero risco, valor imediato

Passo 2: Circuit Breaker (novo arquivo)
         → Melhora resiliência sem tocar código existente

Passo 3: Notify-critical-alert Slack (edge function)
         → Completa TODO existente

Passo 4: CHECK constraints (migration)
         → Data integrity, aditiva

Passo 5: Impersonation cache fix (mínima mudança)
         → Memory safety

Passo 6: Load testing scripts (novos arquivos)
         → Baseline de performance documentada
```

---

## ESTIMATIVA

| Passo | Esforço estimado |
|---|---|
| Documentação | ~20 min |
| Circuit Breaker | ~15 min |
| Slack notification | ~10 min |
| CHECK constraints | ~10 min |
| Impersonation cache | ~5 min |
| Load testing | ~15 min |
| **TOTAL** | **~75 min de sessão** |

---

## VALIDAÇÃO PÓS-IMPLEMENTAÇÃO

- [ ] `npm run build` passa
- [ ] `npm run lint` passa
- [ ] `npm run test` passa
- [ ] Nenhum arquivo de componente UI foi modificado
- [ ] Nenhum arquivo de página foi modificado
- [ ] Lovable pode continuar editando normalmente
