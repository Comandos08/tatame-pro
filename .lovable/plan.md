

## Fixes de build (3 arquivos)

### 1. `src/components/CookieConsent.tsx`

Adicionar `return undefined` explícito no `useEffect` para satisfazer TS7030.

```ts
useEffect(() => {
  const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
  if (!consent) {
    const timer = setTimeout(() => setVisible(true), 1000);
    return () => clearTimeout(timer);
  }
  return undefined;
}, []);
```

### 2. `src/components/athlete/EditablePersonalData.tsx` (linha 127)

Migrar para a API do Zod v4: `e.errors[0]` → `e.issues[0]`. É o único call site no frontend.

### 3. `src/components/events/CreateCategoryDialog.tsx`

Substituir `z.coerce.number().optional().or(z.literal(''))` por `z.preprocess` que normaliza `''` → `undefined` antes da coerção. Output passa a ser `number | undefined` (ao invés de `unknown`), realinhando com o `Resolver` do react-hook-form.

```ts
const optionalNumber = (max?: number) => {
  let base = z.coerce.number().min(0);
  if (max !== undefined) base = base.max(max);
  return z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    base.optional(),
  );
};

const categorySchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  gender: z.enum(['MALE', 'FEMALE', 'MIXED']).optional(),
  minWeight: optionalNumber(),
  maxWeight: optionalNumber(),
  minAge: optionalNumber(120),
  maxAge: optionalNumber(120),
});
```

Ajustes correspondentes:
- `defaultValues`: trocar `''` por `undefined` nos 4 campos numéricos.
- Bloco `payload` no `mutationFn`: trocar `data.minWeight !== '' ? Number(data.minWeight) : null` por `data.minWeight ?? null` (e mesma coisa para os 3 outros).

Isso elimina os 4 erros encadeados (linhas 75, 173, 176, 194) com uma única mudança de schema.

## Validação

1. `bun run build` deve retornar zero erros TS.
2. Smoke manual no diálogo "Criar categoria": criar uma categoria sem peso/idade (campos `null` no payload) e outra com valores numéricos.
3. Confirmar que o banner de cookies aparece após 1s e que o cleanup do timer funciona.

## Fora de escopo (registrado)

- Erros de TS em Edge Functions Deno (`supabase/functions/_shared/...`) — task separada conforme alinhado.
- Conserto do `npx tsc --noEmit` no CI workflow — você tratará no repo.

