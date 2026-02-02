
# P-REG-01 — CORREÇÃO DE INSCRIÇÃO DE ATLETA EM EVENTOS

## SAFE MODE · FRONTEND-ONLY · ZERO REGRESSÃO

---

## RESUMO EXECUTIVO

Corrigir o fluxo de inscrição de atleta em eventos públicos, garantindo:
1. Integração do componente `EventRegistrationButton` na página pública
2. Hierarquia de estados correta (auth → profile → athlete → elegibilidade)
3. CTAs específicos para cada estado do usuário

---

## FASE 1 — CORRIGIR HIERARQUIA DE ESTADOS

### Arquivo: `src/components/events/EventRegistrationButton.tsx`

**Mudanças Necessárias:**

1. Importar estados de auth corretamente:
```typescript
const { currentUser, isLoading: isAuthLoading, isAuthenticated } = useCurrentUser();
```

2. Adicionar tracking de loading do perfil de atleta:
```typescript
const { data: athlete, isLoading: isAthleteLoading } = useQuery({...});
```

3. Nova hierarquia de decisão (prioridade de cima para baixo):

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    NOVA HIERARQUIA DE ESTADOS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. isAuthLoading?                                                          │
│     → Skeleton/Loader (estado transitório)                                  │
│                                                                             │
│  2. !isAuthenticated?                                                       │
│     → "Faça login para se inscrever"                                        │
│       Link para: /{tenantSlug}/login                                        │
│                                                                             │
│  3. isAthleteLoading?                                                       │
│     → Loader (estado transitório)                                           │
│                                                                             │
│  4. !athlete (logado mas sem perfil de atleta)?                             │
│     → "Complete sua filiação para se inscrever"                             │
│       Link para: /{tenantSlug}/membership/new                               │
│                                                                             │
│  5. eventStatus === 'CANCELLED'?                                            │
│     → "Evento Cancelado" (disabled, destructive)                            │
│                                                                             │
│  6. activeRegistration?                                                     │
│     → "Inscrito em: {categoria}" + botão cancelar                           │
│                                                                             │
│  7. !canRegisterForEvent(eventStatus)?                                      │
│     → "Inscrições encerradas"                                               │
│                                                                             │
│  8. categories.length === 0?                                                │
│     → "Nenhuma categoria disponível"                                        │
│                                                                             │
│  9. Elegível                                                                │
│     → Select de categoria + "Inscrever-se"                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Código Refatorado (Seção de Decisão)

```typescript
// Estado 1: Auth carregando
if (isAuthLoading) {
  return (
    <div className="flex items-center justify-center py-4">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

// Estado 2: Não autenticado
if (!isAuthenticated) {
  return (
    <Button asChild variant="default" className="w-full">
      <Link to={`/${tenantSlug}/login?next=/${tenantSlug}/events/${eventId}`}>
        {t('events.loginToRegister')}
      </Link>
    </Button>
  );
}

// Estado 3: Atleta carregando
if (isAthleteLoading) {
  return (
    <div className="flex items-center justify-center py-4">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

// Estado 4: Logado mas sem perfil de atleta (NOVO!)
if (!athlete) {
  return (
    <div className="space-y-2 text-center">
      <p className="text-sm text-muted-foreground">
        {t('events.completeMembershipToRegister')}
      </p>
      <Button asChild variant="default" className="w-full">
        <Link to={`/${tenantSlug}/membership/new`}>
          {t('events.startMembership')}
        </Link>
      </Button>
    </div>
  );
}

// Estados 5-9: Lógica existente (evento cancelado, já inscrito, etc.)
```

---

## FASE 2 — INTEGRAR BOTÃO NA PÁGINA PÚBLICA

### Arquivo: `src/pages/PublicEventDetails.tsx`

**Mudanças:**

1. Importar o componente:
```typescript
import { EventRegistrationButton } from '@/components/events/EventRegistrationButton';
```

2. Substituir o CTA estático (linhas 306-329) pelo componente real:

```tsx
{/* Registration CTA - INTEGRADO */}
<Card className="border-2 border-primary/20">
  <CardHeader className="pb-2">
    <CardTitle className="text-lg">
      {t('events.registerForEvent')}
    </CardTitle>
  </CardHeader>
  <CardContent>
    <EventRegistrationButton
      eventId={event.id}
      eventStatus={event.status as EventStatus}
      tenantId={tenant?.id || ''}
      categories={categories}
      tenantSlug={tenant?.slug || ''}
    />
  </CardContent>
</Card>
```

3. Adicionar prop `tenantSlug` ao componente para suportar links de redirecionamento.

---

## FASE 3 — ATUALIZAR INTERFACE DO COMPONENTE

### Arquivo: `src/components/events/EventRegistrationButton.tsx`

**Adicionar nova prop:**

```typescript
interface EventRegistrationButtonProps {
  eventId: string;
  eventStatus: EventStatus;
  tenantId: string;
  categories: EventCategory[];
  tenantSlug?: string; // NOVO — para links de redirecionamento
}
```

**Fallback para tenantSlug:**
```typescript
// Se não fornecido via prop, extrair da URL
const { tenantSlug: urlTenantSlug } = useParams<{ tenantSlug: string }>();
const resolvedTenantSlug = tenantSlug || urlTenantSlug || '';
```

---

## FASE 4 — NOVAS CHAVES i18n

### Chaves a Adicionar

| Chave | pt-BR | en | es |
|-------|-------|----|----|
| `events.completeMembershipToRegister` | Complete sua filiação para se inscrever | Complete your membership to register | Complete su afiliación para inscribirse |
| `events.startMembership` | Iniciar Filiação | Start Membership | Iniciar Afiliación |
| `events.registerForEvent` | Inscrição no Evento | Event Registration | Inscripción al Evento |

---

## FASE 5 — AJUSTES FINAIS

### Remover lógica problemática

**Antes (linha 138):**
```typescript
if (!currentUser || !athlete) {
  return <Button disabled>{t('events.loginToRegister')}</Button>
}
```

**Depois:**
```typescript
// Removido — substituído por hierarquia explícita acima
```

### Garantir imports necessários

```typescript
import { Link, useParams } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
```

---

## ARQUIVOS A MODIFICAR

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/components/events/EventRegistrationButton.tsx` | EDITAR | Refatorar hierarquia de estados + nova prop |
| `src/pages/PublicEventDetails.tsx` | EDITAR | Integrar componente real |
| `src/locales/pt-BR.ts` | EDITAR | +3 chaves |
| `src/locales/en.ts` | EDITAR | +3 chaves |
| `src/locales/es.ts` | EDITAR | +3 chaves |

---

## COMPARAÇÃO VISUAL

### Antes

```text
Estado: Usuário logado sem perfil de atleta
CTA: "Faça login para se inscrever" ❌
```

### Depois

```text
Estado: Usuário logado sem perfil de atleta
CTA: "Complete sua filiação para se inscrever"
     [Iniciar Filiação] → /{tenant}/membership/new ✅
```

---

## CENÁRIOS DE TESTE

| # | Estado do Usuário | CTA Esperado | Link |
|---|-------------------|--------------|------|
| 1 | Não autenticado | "Faça login para se inscrever" | /{tenant}/login |
| 2 | Auth loading | Spinner | - |
| 3 | Autenticado, athlete loading | Spinner | - |
| 4 | Autenticado, sem atleta | "Complete sua filiação..." + Botão | /{tenant}/membership/new |
| 5 | Autenticado, atleta, já inscrito | "Inscrito em: X" + Cancelar | - |
| 6 | Autenticado, atleta, evento fechado | "Inscrições encerradas" | - |
| 7 | Autenticado, atleta, evento cancelado | "Evento Cancelado" | - |
| 8 | Autenticado, atleta, elegível | Select + "Inscrever-se" | - |

---

## O QUE NÃO SERÁ ALTERADO

- ❌ Nenhuma Edge Function
- ❌ Nenhuma RLS policy
- ❌ Nenhum schema de banco
- ❌ Nenhum Context (Auth, Tenant, etc.)
- ❌ Nenhuma lógica de eligibilidade (eventEligibility.ts)
- ❌ Nenhuma rota

---

## CRITÉRIOS DE ACEITE

```text
✅ Componente integrado na página pública
✅ Estados de loading explícitos
✅ "Faça login" APENAS para não autenticados
✅ "Complete filiação" para logados sem atleta
✅ CTAs com links funcionais
✅ Zero regressão em fluxos existentes
✅ i18n completo (pt/en/es)
```

---

## RESULTADO ESPERADO

```text
P-REG-01 = DONE
Inscrição de atleta funcional
Hierarquia de estados correta
UX clara e institucional
```
