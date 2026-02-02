
# P1.0 — CORREÇÃO DE PERDA DE FOCO EM FORMULÁRIOS

## Diagnóstico

| Arquivo | Problema | Linha |
|---------|----------|-------|
| `src/pages/AcademiesList.tsx` | `AcademyForm` definido como função inline | 187-260 |
| `src/pages/CoachesList.tsx` | `CoachForm` definido como função inline | 279-326 |

### Causa Raiz

Quando uma função de componente é definida **dentro** de outro componente:
1. A cada render, uma nova referência de função é criada
2. React trata isso como um componente diferente
3. O componente anterior é desmontado e um novo é montado
4. Inputs perdem foco porque são recriados no DOM

### Por que isso ocorre aqui

- `setFormData({ ...formData, field: value })` dispara re-render
- Re-render recria `AcademyForm` / `CoachForm` com nova referência
- React desmonta inputs antigos e monta novos
- Foco é perdido

---

## Correção Proposta

### Estratégia: Inlining de JSX

Substituir as chamadas `<AcademyForm />` e `<CoachForm />` pelo JSX que elas retornam, **diretamente no local de uso**.

Isso elimina a criação de função a cada render, mantendo o JSX como expressão estável.

---

## Arquivo 1: `src/pages/AcademiesList.tsx`

### Alteração 1.1 — Remover definição de `AcademyForm`

**Remover (linhas 187-260):**
```typescript
const AcademyForm = () => (
  <div className="space-y-4">
    ...
  </div>
);
```

### Alteração 1.2 — Substituir `<AcademyForm />` por JSX direto

**Substituir na linha 291:**
```typescript
<AcademyForm />
```

**Por:**
```typescript
<div className="space-y-4">
  <div className="grid grid-cols-2 gap-4">
    <div className="space-y-2">
      <Label htmlFor="name">{t('admin.academies.formName')}</Label>
      <Input
        id="name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        placeholder={t('admin.academies.formNamePlaceholder')}
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="slug">{t('admin.academies.formSlug')}</Label>
      <Input
        id="slug"
        value={formData.slug}
        onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
        placeholder={t('admin.academies.formSlugPlaceholder')}
      />
    </div>
  </div>
  <div className="grid grid-cols-2 gap-4">
    <div className="space-y-2">
      <Label htmlFor="sport_type">{t('admin.academies.formSport')}</Label>
      <Input
        id="sport_type"
        value={formData.sport_type}
        onChange={(e) => setFormData({ ...formData, sport_type: e.target.value })}
        placeholder={t('admin.academies.formSportPlaceholder')}
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="city">{t('admin.academies.formCity')}</Label>
      <Input
        id="city"
        value={formData.city}
        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
        placeholder={t('admin.academies.formCityPlaceholder')}
      />
    </div>
  </div>
  <div className="grid grid-cols-2 gap-4">
    <div className="space-y-2">
      <Label htmlFor="state">{t('admin.academies.formState')}</Label>
      <Input
        id="state"
        value={formData.state}
        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
        placeholder={t('admin.academies.formStatePlaceholder')}
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="phone">{t('admin.academies.formPhone')}</Label>
      <Input
        id="phone"
        value={formData.phone}
        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        placeholder={t('admin.academies.formPhonePlaceholder')}
      />
    </div>
  </div>
  <div className="space-y-2">
    <Label htmlFor="email">{t('admin.academies.formEmail')}</Label>
    <Input
      id="email"
      type="email"
      value={formData.email}
      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
      placeholder={t('admin.academies.formEmailPlaceholder')}
    />
  </div>
</div>
```

### Alteração 1.3 — Substituir segunda ocorrência (linha 390)

Aplicar o mesmo JSX na segunda ocorrência de `<AcademyForm />` (dialog de edição).

**Nota:** Os IDs dos inputs são os mesmos em ambos os formulários, mas como apenas um dialog está aberto por vez, não há conflito.

---

## Arquivo 2: `src/pages/CoachesList.tsx`

### Alteração 2.1 — Remover definição de `CoachForm`

**Remover (linhas 279-326):**
```typescript
const CoachForm = () => (
  <div className="space-y-4">
    ...
  </div>
);
```

### Alteração 2.2 — Substituir `<CoachForm />` por JSX direto (linha 357)

**Por:**
```typescript
<div className="space-y-4">
  <div className="space-y-2">
    <Label htmlFor="full_name">{t('admin.coaches.formName')}</Label>
    <Input
      id="full_name"
      value={formData.full_name}
      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
      placeholder={t('admin.coaches.formNamePlaceholder')}
    />
  </div>
  <div className="grid grid-cols-2 gap-4">
    <div className="space-y-2">
      <Label htmlFor="main_sport">{t('admin.coaches.formSport')}</Label>
      <Input
        id="main_sport"
        value={formData.main_sport}
        onChange={(e) => setFormData({ ...formData, main_sport: e.target.value })}
        placeholder={t('admin.coaches.formSportPlaceholder')}
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="rank">{t('admin.coaches.formRank')}</Label>
      <Input
        id="rank"
        value={formData.rank}
        onChange={(e) => setFormData({ ...formData, rank: e.target.value })}
        placeholder={t('admin.coaches.formRankPlaceholder')}
      />
    </div>
  </div>
  {!editingCoach && (
    <div className="space-y-2">
      <Label htmlFor="profile_email">{t('admin.coaches.formEmail')}</Label>
      <Input
        id="profile_email"
        type="email"
        value={formData.profile_email}
        onChange={(e) => setFormData({ ...formData, profile_email: e.target.value })}
        placeholder={t('admin.coaches.formEmailPlaceholder')}
      />
      <p className="text-xs text-muted-foreground">
        {t('admin.coaches.formEmailHint')}
      </p>
    </div>
  )}
</div>
```

### Alteração 2.3 — Substituir segunda ocorrência (linha 512)

Aplicar o mesmo JSX na segunda ocorrência de `<CoachForm />` (dialog de edição).

**Nota para CoachForm no modo edição:** O campo `profile_email` é condicionalmente renderizado baseado em `!editingCoach`, então o JSX já trata isso corretamente.

---

## Arquivos Modificados

| Arquivo | Operação |
|---------|----------|
| `src/pages/AcademiesList.tsx` | EDIT |
| `src/pages/CoachesList.tsx` | EDIT |

---

## Não Alterado

- ❌ Rotas
- ❌ Edge Functions
- ❌ RLS
- ❌ Schemas
- ❌ Eventos
- ❌ Comportamento de submit
- ❌ Validações
- ❌ Chamadas de API
- ❌ Layout visual
- ❌ Textos
- ❌ Estados globais
- ❌ Hooks novos

---

## Critérios de Aceite

| Ação | Resultado Esperado |
|------|-------------------|
| Digitar em qualquer campo | Foco permanece |
| Navegar entre campos | Foco correto |
| Submeter formulário | Funciona normalmente |
| Console | Zero erros |

---

## Resumo da Correção

| Antes | Depois |
|-------|--------|
| Função inline cria novo componente a cada render | JSX direto mantém elementos estáveis no DOM |
| `<AcademyForm />` / `<CoachForm />` | JSX inlined |
| Inputs são recriados | Inputs persistem |
| Foco perdido | Foco mantido |
