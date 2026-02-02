

# P1.1 REVISADO — ATLETAS & CERTIFICAÇÃO (CORE DO PRODUTO)

## ⚠️ MODO DE EXECUÇÃO

- **SAFE GOLD MODE** — Zero Interpretação
- ❌ NÃO tocar em EVENTOS
- ❌ NÃO criar novas rotas
- ❌ NÃO alterar Edge Functions
- ❌ NÃO alterar RLS ou banco
- ❌ NÃO alterar schemas / migrations
- ✅ APENAS frontend (React / UI / hooks existentes)
- ✅ APENAS arquivos explicitamente listados

---

## 📋 ESCOPO FECHADO (REAFIRMADO)

| Permitido | Proibido |
|-----------|----------|
| UI React existente | Novas rotas |
| Filtros client-side | Edge Functions |
| Ordenação client-side | RLS / Migrations |
| Chaves i18n necessárias | Eventos |
| Ajustes CSS simples | Novas APIs |
| Mensagens institucionais | Refatorações oportunistas |

---

## 1️⃣ LISTA DE ATLETAS — FILTRO POR GRADUAÇÃO + ORDENAÇÃO

### Arquivo: `src/pages/AthletesList.tsx`

**1.1. Adicionar imports (linha 11)**

Adicionar `ArrowUpDown` ao import de lucide-react:
```typescript
import { 
  Search, 
  Users, 
  Loader2, 
  ChevronRight,
  Building2,
  Award,
  Filter,
  ArrowUpDown  // ADICIONAR
} from 'lucide-react';
```

**1.2. Adicionar estados (linha 69, após filterStatus)**

```typescript
const [filterGrading, setFilterGrading] = useState<string>('all');
const [sortBy, setSortBy] = useState<'name' | 'grading'>('name');
```

**1.3. Adicionar interface para grading (após linha 60)**

```typescript
interface GradingLevel {
  id: string;
  display_name: string;
  order_index: number;
}

interface AthleteCurrentGrading {
  athlete_id: string;
  grading_level_id: string;
  display_name: string;
  order_index: number;
}
```

**1.4. Adicionar query para níveis de graduação (após linha 85)**

```typescript
// Fetch grading levels for filter dropdown
const { data: gradingLevels } = useQuery({
  queryKey: ['grading-levels-filter', tenant?.id],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('grading_levels')
      .select('id, display_name, order_index')
      .eq('tenant_id', tenant!.id)
      .eq('is_active', true)
      .order('order_index');
    if (error) throw error;
    return data as GradingLevel[];
  },
  enabled: !!tenant?.id,
});
```

**1.5. Modificar query principal (linhas 88-159)**

Estender a interface `AthleteWithMembership` para incluir graduação atual:

```typescript
interface AthleteWithMembership {
  // ... campos existentes ...
  currentGrading: {
    level_id: string;
    display_name: string;
    order_index: number;
  } | null;
}
```

Dentro do queryFn, após buscar memberships:

```typescript
// Get current gradings for these athletes
const { data: gradingsData } = await supabase
  .from('athlete_current_grading')
  .select('athlete_id, grading_level_id, display_name, order_index')
  .in('athlete_id', athleteIds);

// Create grading map
const gradingsByAthlete = new Map<string, AthleteCurrentGrading>();
gradingsData?.forEach(g => {
  gradingsByAthlete.set(g.athlete_id, g);
});

// Combine data including grading
let result: AthleteWithMembership[] = athletesData.map(athlete => ({
  // ... campos existentes ...
  currentGrading: gradingsByAthlete.has(athlete.id)
    ? {
        level_id: gradingsByAthlete.get(athlete.id)!.grading_level_id,
        display_name: gradingsByAthlete.get(athlete.id)!.display_name,
        order_index: gradingsByAthlete.get(athlete.id)!.order_index,
      }
    : null,
}));

// Filter by grading if specified
if (filterGrading && filterGrading !== 'all') {
  result = result.filter(a => a.currentGrading?.level_id === filterGrading);
}

// Sort
result.sort((a, b) => {
  if (sortBy === 'grading') {
    const orderA = a.currentGrading?.order_index ?? 999;
    const orderB = b.currentGrading?.order_index ?? 999;
    return orderA - orderB;
  }
  return a.full_name.localeCompare(b.full_name);
});
```

Adicionar `filterGrading` e `sortBy` às dependências da query:
```typescript
queryKey: ['athletes-list', tenant?.id, searchName, filterAcademy, filterStatus, filterGrading, sortBy],
```

**1.6. Adicionar filtros UI (após linha 251, dentro do CardContent)**

Após o Select de filterStatus:

```tsx
<Select value={filterGrading} onValueChange={setFilterGrading}>
  <SelectTrigger className="w-full md:w-[200px]">
    <Award className="h-4 w-4 mr-2" />
    <SelectValue placeholder={t('admin.athletes.filterGrading')} />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">{t('admin.athletes.allGradings')}</SelectItem>
    {gradingLevels?.map((level) => (
      <SelectItem key={level.id} value={level.id}>
        {level.display_name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
<Select value={sortBy} onValueChange={(v) => setSortBy(v as 'name' | 'grading')}>
  <SelectTrigger className="w-full md:w-[150px]">
    <ArrowUpDown className="h-4 w-4 mr-2" />
    <SelectValue placeholder={t('admin.athletes.sortBy')} />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="name">{t('admin.athletes.sortByName')}</SelectItem>
    <SelectItem value="grading">{t('admin.athletes.sortByGrading')}</SelectItem>
  </SelectContent>
</Select>
```

**1.7. Adicionar coluna de graduação na tabela (após linha 278)**

Adicionar nova coluna no TableHeader:
```tsx
<TableHead>{t('admin.athletes.tableGrading')}</TableHead>
```

Adicionar célula correspondente no TableBody (após linha 306):
```tsx
<TableCell>
  {athlete.currentGrading ? (
    <Badge variant="secondary">{athlete.currentGrading.display_name}</Badge>
  ) : (
    <span className="text-muted-foreground">-</span>
  )}
</TableCell>
```

---

## 2️⃣ VERIFICAÇÃO DE CARTEIRA (VerifyCard.tsx)

### Escopo: APENAS UI — Mensagem Institucional

**Arquivo: `src/pages/VerifyCard.tsx`**

**Nota:** Esta página é de verificação pública por ID único. Não existe lista de carteiras para filtrar.

**Ajuste:** Adicionar mensagem institucional similar ao VerifyDiploma.

**Linha 415-418, substituir:**

```tsx
<div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-4 border-t">
  <Shield className="h-4 w-4" />
  <span>{t('verification.authenticDocument')} {verification.tenantName}</span>
</div>
```

**Por:**

```tsx
<div className="text-center pt-4 border-t space-y-2">
  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
    <Shield className="h-4 w-4" />
    <span>{t('verification.authenticDocument')} {verification.tenantName}</span>
  </div>
  <p className="text-xs text-muted-foreground">
    {t('verification.cardInstitutionalMessage')}
  </p>
</div>
```

---

## 3️⃣ VERIFICAÇÃO DE DIPLOMA (VerifyDiploma.tsx)

### Escopo: Mensagem Institucional + Busca por ID apenas (LGPD-safe)

**Arquivo: `src/pages/VerifyDiploma.tsx`**

**Linhas 383-386, substituir:**

```tsx
<div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-4 border-t">
  <Shield className="h-4 w-4" />
  <span>{t('verification.authenticDiploma')} {verification.tenantName}</span>
</div>
```

**Por:**

```tsx
<div className="text-center pt-4 border-t space-y-2">
  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
    <Shield className="h-4 w-4" />
    <span>{t('verification.authenticDiploma')} {verification.tenantName}</span>
  </div>
  <p className="text-xs text-muted-foreground">
    {t('verification.diplomaInstitutionalMessage')}
  </p>
</div>
```

**❌ Proibido:**
- Busca por nome (LGPD)
- Alteração de API/Edge Function
- Alteração de query server-side

---

## 4️⃣ CHAVES i18n — ADIÇÕES

### Arquivo: `src/locales/pt-BR.ts`

**Após linha 1603 (admin.athletes.csv.membershipEnd):**

```typescript
'admin.athletes.filterGrading': 'Graduação',
'admin.athletes.allGradings': 'Todas graduações',
'admin.athletes.sortBy': 'Ordenar',
'admin.athletes.sortByName': 'Nome (A–Z)',
'admin.athletes.sortByGrading': 'Graduação',
'admin.athletes.tableGrading': 'Graduação',
```

**Após linha 413 (verification.grading):**

```typescript
'verification.diplomaInstitutionalMessage': 'Este diploma foi emitido por uma organização oficial registrada na plataforma TATAME Pro.',
'verification.cardInstitutionalMessage': 'Esta carteira digital foi emitida por uma organização oficial registrada na plataforma TATAME Pro.',
```

### Arquivo: `src/locales/en.ts`

**Após admin.athletes.csv.membershipEnd:**

```typescript
'admin.athletes.filterGrading': 'Grading',
'admin.athletes.allGradings': 'All gradings',
'admin.athletes.sortBy': 'Sort by',
'admin.athletes.sortByName': 'Name (A–Z)',
'admin.athletes.sortByGrading': 'Grading',
'admin.athletes.tableGrading': 'Grading',
```

**Após verification.grading:**

```typescript
'verification.diplomaInstitutionalMessage': 'This diploma was issued by an official organization registered on the TATAME Pro platform.',
'verification.cardInstitutionalMessage': 'This digital card was issued by an official organization registered on the TATAME Pro platform.',
```

### Arquivo: `src/locales/es.ts`

**Após admin.athletes.csv.membershipEnd:**

```typescript
'admin.athletes.filterGrading': 'Graduación',
'admin.athletes.allGradings': 'Todas las graduaciones',
'admin.athletes.sortBy': 'Ordenar',
'admin.athletes.sortByName': 'Nombre (A–Z)',
'admin.athletes.sortByGrading': 'Graduación',
'admin.athletes.tableGrading': 'Graduación',
```

**Após verification.grading:**

```typescript
'verification.diplomaInstitutionalMessage': 'Este diploma fue emitido por una organización oficial registrada en la plataforma TATAME Pro.',
'verification.cardInstitutionalMessage': 'Esta credencial digital fue emitida por una organización oficial registrada en la plataforma TATAME Pro.',
```

---

## 5️⃣ MENU DE IDIOMAS — AJUSTE VISUAL

### Arquivo: `src/components/PublicHeader.tsx`

**Linhas 69-75 e 159-167, alterar classe do DropdownMenuItem selecionado:**

De:
```tsx
className={locale === loc ? 'bg-accent' : ''}
```

Para:
```tsx
className={locale === loc ? 'bg-accent text-accent-foreground font-medium' : ''}
```

### Arquivo: `src/layouts/AppShell.tsx`

**Linha ~267, no DropdownMenuItem de idiomas:**

Adicionar `cursor-pointer` para melhor UX:
```tsx
<DropdownMenuItem 
  key={lang.code} 
  onClick={() => setLocale(lang.code)}
  className="flex items-center justify-between cursor-pointer"
>
```

---

## 6️⃣ LOGO DISTORCIDA NO LOGIN

### Arquivo: `src/pages/Login.tsx`

**Linha 206-207, ajustar container e imagem:**

De:
```tsx
<div className="h-24 w-24 rounded-2xl mx-auto flex items-center justify-center mb-8 glow-primary">
  <img src={iconLogo} alt="TATAME" className="h-24 w-24 rounded-2xl object-contain" />
</div>
```

Para:
```tsx
<div className="w-24 h-24 rounded-2xl mx-auto flex items-center justify-center mb-8 glow-primary overflow-hidden">
  <img src={iconLogo} alt="TATAME" className="max-h-full max-w-full rounded-2xl object-contain" />
</div>
```

---

## 📦 RESUMO DE ARQUIVOS MODIFICADOS

| Arquivo | Alterações |
|---------|------------|
| `src/pages/AthletesList.tsx` | Filtro graduação, ordenação, coluna tabela |
| `src/pages/VerifyCard.tsx` | Mensagem institucional |
| `src/pages/VerifyDiploma.tsx` | Mensagem institucional |
| `src/pages/Login.tsx` | Ajuste CSS logo |
| `src/layouts/AppShell.tsx` | Ajuste dropdown idioma |
| `src/components/PublicHeader.tsx` | Ajuste dropdown idioma |
| `src/locales/pt-BR.ts` | +8 chaves |
| `src/locales/en.ts` | +8 chaves |
| `src/locales/es.ts` | +8 chaves |

---

## 🚫 FORA DE ESCOPO (CONFIRMADO)

- ❌ Eventos (módulo inteiro)
- ❌ Rankings  
- ❌ Brackets / Competições
- ❌ Pagamentos
- ❌ Novas rotas
- ❌ Edge Functions
- ❌ RLS / Migrations
- ❌ Novas APIs
- ❌ Novas permissões

---

## ✅ CRITÉRIOS DE ACEITE (BINÁRIO)

| Item | Resultado Esperado |
|------|-------------------|
| Lista de atletas | Completa |
| Filtro por graduação | Funciona |
| Ordenação (Nome/Graduação) | Funciona |
| Verificação de carteira | Mensagem institucional visível |
| Verificação de diploma | Mensagem institucional visível |
| Labels i18n | Estáveis em pt-BR, en, es |
| Menu idioma | Visual correto com contraste |
| Login | Logo sem distorção |
| Console | Zero erros |

❌ Se qualquer item falhar → P1.1 REPROVADO

