
# P2.5 — UX de Falhas Temporárias e Recuperação Inteligente (SAFE GOLD)

## Auditoria Realizada

### Estado Atual do Sistema

| Item | Status |
|------|--------|
| Diretório `src/lib/errors/` | ❌ Não existe — será criado |
| Componente `TemporaryErrorCard` | ❌ Não existe — será criado |
| `BlockedStateCard` existe | ✅ Disponível em `src/components/ux/` |
| `common.contactSupport` i18n | ✅ Já existe nos 3 idiomas |
| `common.retryNow` i18n | ✅ Já existe nos 3 idiomas |
| `common.waitAndRetry` i18n | ❌ Não existe — será adicionado |

### Padrões Existentes Identificados

1. **BlockedStateCard** suporta:
   - `icon` (LucideIcon)
   - `iconVariant` ('destructive' | 'warning' | 'muted')
   - `titleKey`, `descriptionKey`, `hintKey` (i18n keys)
   - `actions[]` com `labelKey`, `onClick`, `variant`, `icon`

2. **Arquivos de Integração Permitidos:**
   - `IdentityGate.tsx` → já usa `BlockedStateCard` no case `ERROR`
   - `TenantDashboard.tsx` → usa estado `loading` básico, sem tratamento de erro visual
   - `AthletesList.tsx` → usa `isLoading`, sem tratamento de erro visual
   - `EventsList.tsx` → usa `toast.error()` para erros, sem card
   - `PortalEvents.tsx` → usa `PortalAccessGate` com erro passado via prop

---

## Arquivos a Criar

### 1. `src/lib/errors/temporaryErrorMap.ts`

Mapa determinístico de tipos de erro para configuração UX:

```text
PASSO 1 — Estrutura do Arquivo
```

**Conteúdo:**
- Type `TemporaryErrorType` com 5 valores: `NETWORK`, `TIMEOUT`, `SERVER`, `RATE_LIMIT`, `UNKNOWN`
- Interface `TemporaryErrorConfig` com: `titleKey`, `descriptionKey`, `reassuranceKey?`, `primaryActionKey`, `secondaryActionKey?`
- Const `TEMPORARY_ERROR_MAP` mapeando cada tipo para sua configuração

**Chaves i18n utilizadas (a serem criadas):**
- `errors.network.*`, `errors.timeout.*`, `errors.server.*`, `errors.rateLimit.*`, `errors.generic.*`
- `common.waitAndRetry` (nova)

---

### 2. `src/components/ux/TemporaryErrorCard.tsx`

Componente wrapper que usa `BlockedStateCard` internamente:

```text
PASSO 2 — Estrutura do Componente
```

**Props:**
```typescript
interface TemporaryErrorCardProps {
  type: TemporaryErrorType;
  onRetry: () => void;
  onSecondaryAction?: () => void;
  className?: string;
}
```

**Comportamento:**
1. Busca config em `TEMPORARY_ERROR_MAP[type]`
2. Se tipo desconhecido → usa config `UNKNOWN`
3. Mapeia tipo → ícone (WifiOff, Clock, ServerCrash, AlertTriangle, AlertCircle)
4. Renderiza `BlockedStateCard` com:
   - `iconVariant="warning"` (erros temporários não são fatais)
   - Ações montadas dinamicamente (primary + secondary opcional)
5. **NÃO faz fetch**
6. **NÃO tenta retry automático**
7. **NÃO tem side effects**

---

### 3. Atualizar `src/components/ux/index.ts`

Adicionar export do novo componente:
```typescript
export { TemporaryErrorCard, type TemporaryErrorCardProps } from './TemporaryErrorCard';
```

---

## Arquivos de i18n a Atualizar

### 4. `src/locales/pt-BR.ts`, `en.ts`, `es.ts`

Adicionar 16 novas chaves de erro:

| Chave | pt-BR | en | es |
|-------|-------|----|----|
| `errors.network.title` | Problema de conexão | Connection problem | Problema de conexión |
| `errors.network.desc` | Não foi possível se conectar ao servidor. | Could not connect to server. | No fue posible conectar al servidor. |
| `errors.network.reassurance` | Isso costuma ser temporário. | This is usually temporary. | Esto suele ser temporal. |
| `errors.timeout.title` | Resposta demorou mais que o esperado | Response took longer than expected | La respuesta tardó más de lo esperado |
| `errors.timeout.desc` | O servidor demorou para responder. | The server took too long to respond. | El servidor tardó en responder. |
| `errors.timeout.reassurance` | Você pode tentar novamente com segurança. | You can safely try again. | Puedes intentar de nuevo con seguridad. |
| `errors.server.title` | Serviço temporariamente indisponível | Service temporarily unavailable | Servicio temporalmente no disponible |
| `errors.server.desc` | Estamos com uma instabilidade no momento. | We are experiencing instability at the moment. | Estamos experimentando inestabilidad en este momento. |
| `errors.server.reassurance` | Nossa equipe já foi notificada. | Our team has been notified. | Nuestro equipo ya ha sido notificado. |
| `errors.rateLimit.title` | Muitas tentativas em pouco tempo | Too many attempts | Demasiados intentos en poco tiempo |
| `errors.rateLimit.desc` | Aguarde alguns instantes antes de tentar novamente. | Please wait a moment before trying again. | Espera unos momentos antes de intentar de nuevo. |
| `errors.rateLimit.reassurance` | Isso ajuda a manter o sistema estável. | This helps keep the system stable. | Esto ayuda a mantener el sistema estable. |
| `errors.generic.title` | Algo não saiu como esperado | Something didn't go as expected | Algo no salió como se esperaba |
| `errors.generic.desc` | Ocorreu um erro inesperado. | An unexpected error occurred. | Ocurrió un error inesperado. |
| `common.waitAndRetry` | Aguardar e tentar novamente | Wait and try again | Esperar e intentar de nuevo |

---

## Integração (NÃO GLOBAL — Pontual)

A integração será preparada estruturalmente mas **não aplicada automaticamente** aos componentes existentes para manter o princípio SAFE GOLD:

```text
PASSO 5 — Uso Recomendado (Documentado, Não Aplicado)
```

O `TemporaryErrorCard` pode ser usado em locais que já tratam erros visualmente:
- `IdentityGate` (case ERROR) — pode substituir BlockedStateCard específico se erro for transitório
- Páginas com `useQuery` que têm `error` state

**Exemplo de uso futuro:**
```tsx
{error && (
  <TemporaryErrorCard
    type="NETWORK"
    onRetry={() => refetch()}
  />
)}
```

---

## Checklist SAFE GOLD

| Critério | Status |
|----------|--------|
| Nenhuma regra de domínio alterada | ✅ |
| Nenhum fetch novo | ✅ |
| Nenhuma ação adicionada que mude estado | ✅ |
| Nenhum retry automático | ✅ |
| Nenhum estado novo persistido | ✅ |
| Nenhum impacto em billing, roles ou gates | ✅ |
| Componente usa BlockedStateCard existente | ✅ |
| i18n completo nos 3 idiomas | ✅ |
| Build limpo esperado | ✅ |
| Se removido, sistema continua funcional | ✅ |

---

## Resumo de Arquivos

| Operação | Arquivo |
|----------|---------|
| **CRIAR** | `src/lib/errors/temporaryErrorMap.ts` |
| **CRIAR** | `src/components/ux/TemporaryErrorCard.tsx` |
| **EDITAR** | `src/components/ux/index.ts` (adicionar export) |
| **EDITAR** | `src/locales/pt-BR.ts` (adicionar 16 chaves) |
| **EDITAR** | `src/locales/en.ts` (adicionar 16 chaves) |
| **EDITAR** | `src/locales/es.ts` (adicionar 16 chaves) |

---

## Declaração Final

Após implementação:

```
P2.5 — UX de Falhas Temporárias SAFE GOLD concluído.

- Comunicação clara de erros transitórios
- Usuário orientado sem pânico
- Nenhuma regra de domínio alterada
- Nenhuma automação invisível
- Totalmente reversível
```
