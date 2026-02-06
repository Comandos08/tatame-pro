

# P2.4 CORREÇÃO — Suporte a Interpolação i18n (SAFE GOLD)

## Problema Identificado

O componente `EventChangeNoticeCard.tsx` usa interpolação manual (`replace('{from}', ...)`), violando o contrato i18n do projeto. No entanto, a função `t()` atual no `I18nContext.tsx` **não suporta interpolação com parâmetros**.

## Solução em 2 Passos

### PASSO 1 — Estender I18nContext para Suporte a Interpolação

**Arquivo:** `src/contexts/I18nContext.tsx`

**Mudança:**
- Alterar a assinatura da função `t()` de `(key: string) => string` para `(key: string, params?: Record<string, string>) => string`
- Adicionar lógica de interpolação simples que substitui `{placeholder}` pelos valores do objeto `params`

**Antes:**
```typescript
interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}
```

**Depois:**
```typescript
interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string>) => string;
}
```

**Lógica de interpolação (dentro do `useCallback`):**
```typescript
const t = useCallback(
  (key: string, params?: Record<string, string>): string => {
    let value = translations[locale]?.[key] ?? translations["pt-BR"]?.[key];

    if (!value) {
      if (import.meta.env.DEV) {
        console.warn(`[i18n] Missing key "${key}" for locale "${locale}"`);
      }
      return key;
    }

    // Interpolação simples: substitui {placeholder} por params.placeholder
    if (params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        value = value.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), paramValue);
      });
    }

    return value;
  },
  [locale],
);
```

---

### PASSO 2 — Corrigir EventChangeNoticeCard

**Arquivo:** `src/components/events/EventChangeNoticeCard.tsx`

**Substituir a função `getDescription()` inteira por:**
```typescript
const getDescription = (): string => {
  if (type === 'CANCELED') {
    return t(config.descKey);
  }

  return t(config.descKey, {
    from: previousValue || '—',
    to: currentValue || '—',
  });
};
```

---

## Critérios SAFE GOLD

| Critério | Status |
|----------|--------|
| Nenhuma regra de domínio alterada | ✅ |
| Nenhum fetch novo | ✅ |
| Nenhuma ação adicionada | ✅ |
| Nenhum estado novo criado | ✅ |
| Nenhum impacto em billing, roles ou gates | ✅ |
| Retrocompatível (chamadas existentes de `t(key)` continuam funcionando) | ✅ |
| Build limpo esperado | ✅ |

---

## Arquivos a Modificar

1. `src/contexts/I18nContext.tsx` — estender interface e lógica de `t()`
2. `src/components/events/EventChangeNoticeCard.tsx` — usar sintaxe correta de interpolação

---

## Declaração Final

Após implementação:

```
P2.4 CORREÇÃO — Suporte a Interpolação i18n SAFE GOLD concluído.

- Função t() estendida para aceitar parâmetros de interpolação
- EventChangeNoticeCard corrigido para usar t(key, { from, to })
- 100% retrocompatível (nenhuma quebra em chamadas existentes)
- Nenhuma regra de domínio alterada
- Build limpo
```

