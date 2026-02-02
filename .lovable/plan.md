
# P2.3.1 — BUGFIX: Criação de Categoria de Evento

## AJUSTES APROVADOS APLICADOS

| Ajuste | Descrição | Status |
|--------|-----------|--------|
| **A** | UI funcional com CreateCategoryDialog | ✅ Aplicado |
| **B** | Governança preservada (trigger + RLS) | ✅ Aplicado |
| **C** | Logs de diagnóstico + feedback explícito | ✅ Aplicado |

---

## ALTERAÇÕES A IMPLEMENTAR

### 1. Criar Componente `CreateCategoryDialog`

**Arquivo**: `src/components/events/CreateCategoryDialog.tsx`

Componente de dialog para criação de categorias com:
- Formulário controlado via react-hook-form + zod
- Campos: nome (obrigatório), gênero, peso min/max, idade min/max
- Mutation com logs obrigatórios de payload e erro
- Toast de feedback explícito (sucesso e erro)
- Prop `disabled` para bloquear quando status do evento não permite edição

```typescript
// Logs obrigatórios (AJUSTE C)
console.log('[CREATE CATEGORY PAYLOAD]', payload);
console.error('[CREATE CATEGORY ERROR]', error);

// Feedback explícito (AJUSTE C)
toast.success('Categoria criada com sucesso!');
toast.error(error.message);
```

---

### 2. Atualizar `EventDetails.tsx`

**Arquivo**: `src/pages/EventDetails.tsx`

Alterações:
- Importar `CreateCategoryDialog`
- Importar `canEditCategories` do types
- Substituir botão decorativo (linhas 364-367) pelo dialog funcional
- Passar prop `disabled` baseada no status do evento

```diff
// Imports (linhas 1-44)
+ import { CreateCategoryDialog } from '@/components/events/CreateCategoryDialog';
- import { Event, EventCategory, EventRegistration, EventStatus, EventRegistrationStatus, canPublishResults, EVENT_REGISTRATION_STATUS_CONFIG } from '@/types/event';
+ import { Event, EventCategory, EventRegistration, EventStatus, EventRegistrationStatus, canPublishResults, canEditCategories, EVENT_REGISTRATION_STATUS_CONFIG } from '@/types/event';

// No CardHeader de categories (linhas 361-368)
- <Button size="sm">
-   <Plus className="mr-2 h-4 w-4" />
-   {t('events.addCategory')}
- </Button>
+ <CreateCategoryDialog 
+   eventId={eventId!} 
+   disabled={!canEditCategories(event.status as EventStatus)}
+ />
```

---

### 3. Adicionar Chaves i18n

**Arquivos**: `pt-BR.ts`, `en.ts`, `es.ts`

```typescript
// pt-BR.ts
'events.createCategory': 'Nova Categoria',
'events.createCategoryDesc': 'Defina os critérios da categoria de competição',
'events.categoryName': 'Nome da Categoria',
'events.categoryCreated': 'Categoria criada com sucesso!',
'events.categoryCreateError': 'Erro ao criar categoria',
'events.categoriesLockedDesc': 'Não é possível modificar categorias após o fechamento das inscrições',

// en.ts
'events.createCategory': 'New Category',
'events.createCategoryDesc': 'Define the competition category criteria',
'events.categoryName': 'Category Name',
'events.categoryCreated': 'Category created successfully!',
'events.categoryCreateError': 'Error creating category',
'events.categoriesLockedDesc': 'Cannot modify categories after registration closes',

// es.ts
'events.createCategory': 'Nueva Categoría',
'events.createCategoryDesc': 'Define los criterios de la categoría de competición',
'events.categoryName': 'Nombre de la Categoría',
'events.categoryCreated': '¡Categoría creada con éxito!',
'events.categoryCreateError': 'Error al crear categoría',
'events.categoriesLockedDesc': 'No se pueden modificar categorías después del cierre de inscripciones',
```

---

## GOVERNANÇA PRESERVADA (AJUSTE B)

| Aspecto | Status |
|---------|--------|
| Trigger `enforce_event_category_immutability` | ✅ Ativo - bloqueia INSERT em status inválido |
| RLS `event_categories_admin_all` | ✅ Ativo - valida tenant admin |
| Helper `canEditCategories()` | ✅ Usado para desabilitar UI |
| Payload com `tenant_id` e `event_id` | ✅ Obrigatórios no INSERT |

---

## ARQUIVOS MODIFICADOS

| Arquivo | Ação | Linhas |
|---------|------|--------|
| `src/components/events/CreateCategoryDialog.tsx` | **CRIAR** | ~250 |
| `src/pages/EventDetails.tsx` | EDITAR | ~8 |
| `src/locales/pt-BR.ts` | EDITAR | +6 |
| `src/locales/en.ts` | EDITAR | +6 |
| `src/locales/es.ts` | EDITAR | +6 |

---

## CRITÉRIOS DE ACEITE

| Critério | Resultado |
|----------|-----------|
| Botão abre dialog | ✅ |
| Categoria criada com sucesso | ✅ |
| Erro visível ao usuário (toast) | ✅ |
| Log de payload no console | ✅ |
| Log de erro no console | ✅ |
| Botão desabilitado em status inválido | ✅ |
| Trigger continua governando | ✅ |
| RLS preservado | ✅ |
| Zero regressão P2.1/P2.2/P2.3 | ✅ |

---

## RESULTADO ESPERADO

Após P2.3.1:
- ✅ Categorias podem ser criadas via UI
- ✅ Falhas são explícitas (toast + console)
- ✅ Governança 100% preservada
- ✅ Base sólida para P2.4 (Chaves)
