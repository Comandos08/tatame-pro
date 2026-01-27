# 🏛️ SSF CONSTITUTION — Segurança, Estabilidade e Funcionamento

> **Status**: CONGELADO  
> **Versão**: 1.0.0  
> **Data**: 2026-01-27  
> **Classificação**: DOCUMENTO IMUTÁVEL

---

## 📜 Preâmbulo

Este documento é a **Constituição** do repositório TATAME PRO. Ele define os princípios fundamentais que **não podem ser violados** por nenhuma mudança, feature, refactor ou otimização.

**Documentos Constitucionais (em ordem de precedência):**
1. Este documento (`SSF-CONSTITUTION.md`)
2. [SECURITY-AUTH-CONTRACT.md](./SECURITY-AUTH-CONTRACT.md)
3. [HARDENING.md](./HARDENING.md)
4. [UI-GOVERNANCE.md](./UI-GOVERNANCE.md)

> ⚠️ **REGRA DE OURO**: Se algo "funciona melhor" quebrando uma dessas regras, **está errado**.

---

## 1️⃣ PRINCÍPIOS FUNDAMENTAIS (IMUTÁVEIS)

### 🧠 Princípio 1 — Determinismo Acima de Tudo

O sistema DEVE sempre reagir da mesma forma para o mesmo estado.

| ❌ PROIBIDO | ✅ OBRIGATÓRIO |
|-------------|----------------|
| `setTimeout` para fluxo crítico | Estado → Decisão → Ação |
| "Esperar um pouco" | Transições explícitas |
| Dependência implícita de ordem | Guards determinísticos |

### 🔐 Princípio 2 — Segurança Fail-Closed

Na dúvida: **nega, redireciona ou bloqueia**.

| Situação | Ação |
|----------|------|
| Erro | `/portal` ou `/login` |
| Token estranho | Limpa sessão |
| Contexto inconsistente | Não renderiza |

> ❌ Nunca "tenta seguir".

### 🧱 Princípio 3 — Um Único Ponto de Decisão

| Responsabilidade | Quem |
|------------------|------|
| Decidir destino | `/portal` (PortalRouter) |
| Proteger rota | Guards (RequireRoles, AthleteRouteGuard) |
| Renderizar UI | Componentes |

> ❌ Nenhum componente sabe o "todo".  
> ❌ Guards NUNCA decidem destino final.

---

## 2️⃣ CONTRATO TÉCNICO (OBRIGATÓRIO)

### 🔄 React / Frontend

#### Efeitos (useEffect)

| ❌ PROIBIDO | ✅ OBRIGATÓRIO |
|-------------|----------------|
| `useEffect(async () => {})` | Função async interna |
| `navigate()` no render | `navigate()` só em effect/handler |
| `setState` sem verificar mount | `isMountedRef.current` guard |
| Side-effect sem cleanup | `return () => cleanup()` |
| Fetch sem cancelamento | `AbortController` |
| Execução sem guard | `hasProcessedRef` pattern |

```typescript
// ✅ PADRÃO OBRIGATÓRIO
useEffect(() => {
  const controller = new AbortController();
  const isMounted = { current: true };
  
  async function run() {
    if (hasProcessedRef.current) return;
    hasProcessedRef.current = true;
    
    try {
      const data = await fetch(url, { signal: controller.signal });
      if (isMounted.current) setState(data);
    } catch (e) {
      if (controller.signal.aborted) return;
      // handle error
    }
  }
  
  run();
  
  return () => {
    isMounted.current = false;
    controller.abort();
  };
}, [deps]);
```

#### Navegação

| Regra | Descrição |
|-------|-----------|
| 🔒 Sempre `replace: true` | Exceto navegação deliberada do usuário |
| 🔒 Nunca cadeia de navigate | `navigate → navigate` = BUG |
| 🔒 Nunca `window.location` | Exceto erro fatal irrecuperável |

### 🔐 Auth

| Regra | Descrição |
|-------|-----------|
| ✅ Auth é state machine | 5 estados explícitos, transições válidas |
| ✅ 401 ≠ 403 | 401 = sessão inválida; 403 = permissão negada |
| ✅ Expiry ≠ logout | Tratamentos diferentes |
| ❌ Componente não faz signOut | Tudo via Security Boundary |

**Estados válidos:**
```
unauthenticated → authenticating → authenticated
                                 ↓
                              expired → unauthenticated
```

---

## 3️⃣ MATRIZ DE RISCO PRÉ-PR

Antes de QUALQUER PR que toque nestas áreas:

| Área | Pergunta de Verificação |
|------|-------------------------|
| **Auth** | Isso cria um novo estado implícito? |
| **Routing** | Isso decide destino fora do `/portal`? |
| **Async** | Existe chance de execução dupla? |
| **UX** | Pode gerar tela branca? |
| **Segurança** | Em erro, isso vaza informação? |

> ⚠️ Se uma resposta for "não sei" → **PR BLOQUEADO**.

---

## 4️⃣ CHECKLIST DE SAÚDE CONTÍNUA

### 🧪 Técnico

- [ ] Zero warnings no console
- [ ] Zero `act(...)` warning
- [ ] Zero "state update on unmounted"
- [ ] StrictMode não quebra fluxo
- [ ] E2E de auth 100% verde

### 🔐 Segurança

- [ ] Token inválido → `/login`
- [ ] Tenant inexistente → `/portal`
- [ ] Papel ausente → deny
- [ ] Contexto parcial → fallback seguro

### 🧠 Arquitetura

- [ ] `/portal` continua soberano
- [ ] Guards não tomam decisão final
- [ ] Nenhum bypass novo
- [ ] Nenhum "jeitinho" temporário

---

## 5️⃣ ÁREAS CONGELADAS

As seguintes áreas estão **CONGELADAS** e requerem revisão especial para qualquer alteração:

| Área | Arquivos | Motivo |
|------|----------|--------|
| Auth State Machine | `src/lib/auth/*` | Core de segurança |
| Portal Router | `src/pages/PortalRouter.tsx` | Decision hub único |
| Security Boundary | `src/lib/auth/security-boundary.ts` | Ponto central de decisão |
| Auth Context | `src/contexts/AuthContext.tsx` | Estado de autenticação |
| Route Guards | `src/components/auth/*` | Proteção de rotas |
| Impersonation | `src/contexts/ImpersonationContext.tsx` | Sessões de superadmin |

### Processo para Alterar Área Congelada

1. **Documentar** a necessidade da alteração
2. **Revisar** impacto em todos os documentos constitucionais
3. **Aprovar** com justificativa explícita
4. **Testar** E2E completo de segurança
5. **Reverter** se qualquer teste falhar

---

## 6️⃣ TESTES OBRIGATÓRIOS

| Suite | Arquivo | Cobertura |
|-------|---------|-----------|
| Auth State Machine | `e2e/security/auth-state-machine.spec.ts` | Transições, expiry, 401/403 |
| Routing Guards | `e2e/routing/guards.spec.ts` | Loops, redirects, deep links |
| Session Expiry | `e2e/routing/session-expiry.spec.ts` | Token inválido, refresh |
| Console Warnings | `e2e/ui/console-warnings.spec.ts` | Ref warnings, hydration |
| Loading Contract | `e2e/ui/loading-contract.spec.ts` | Empty states, loading |

> ⚠️ **Todos os testes DEVEM passar antes de qualquer merge.**

---

## 7️⃣ ANTI-PATTERNS (PROIBIDOS)

| Pattern | Por que é Proibido |
|---------|-------------------|
| `setTimeout` para redirect | Não-determinístico, race conditions |
| Boolean-only auth check | Falta estados loading/error |
| Componente decide destino | Viola princípio de ponto único |
| `navigate()` em cadeia | Causa loops |
| Estado implícito | Impossível debugar |
| "Jeitinho" temporário | Nunca é temporário |
| Silenciar warning | Esconde bug real |
| `window.location` sem erro fatal | Perde contexto React |

---

## 8️⃣ COMANDOS DE VERIFICAÇÃO

```bash
# Lint e TypeCheck
npm run lint
npm run typecheck

# Testes de Segurança
npx playwright test e2e/security/

# Testes de Routing
npx playwright test e2e/routing/

# Testes de UI
npx playwright test e2e/ui/

# Suite Completa
npx playwright test
```

---

## 9️⃣ HIERARQUIA DE DECISÃO

```
┌─────────────────────────────────────────────────────────────┐
│                    SSF CONSTITUTION                          │
│                   (Este documento)                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ SECURITY-AUTH   │  │   HARDENING     │  │ UI-GOVERN   │ │
│  │    CONTRACT     │  │                 │  │   ANCE      │ │
│  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘ │
│           │                    │                   │        │
│           └────────────────────┼───────────────────┘        │
│                                │                            │
│                       ┌────────▼────────┐                   │
│                       │   CÓDIGO FONTE   │                   │
│                       │ (Implementação)  │                   │
│                       └─────────────────┘                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔏 DECLARAÇÃO FINAL

Este documento representa o **baseline de segurança, estabilidade e funcionamento** do TATAME PRO.

Qualquer violação destes princípios é considerada um **bug de segurança**, independentemente de funcionar "na prática".

**Melhor UX não justifica:**
- Gambiarra
- Estado implícito
- Fluxo não-determinístico

---

*Aprovado e congelado em 2026-01-27.*  
*Última revisão obrigatória: A cada 6 meses ou após incidente de segurança.*
