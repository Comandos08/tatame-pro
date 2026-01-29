
# Plano: Atualização das Modalidades Esportivas (Sem Emojis)

## Resumo das Mudanças

1. Renomear **BJJ → Jiu-Jitsu** e **MuayThai → Muay Thai**
2. Adicionar novas modalidades: **Sambo** e **Krav Maga**
3. Remover **todos os emojis** da plataforma para manter tom institucional

---

## Arquivos a Alterar

### 1. `src/types/tenant.ts`
Atualizar o tipo `SportType`:

```typescript
// ANTES
export type SportType = 'BJJ' | 'Judo' | 'MuayThai' | 'Wrestling' | 'Boxing' | 'Karate' | 'Taekwondo' | 'MMA';

// DEPOIS
export type SportType = 'Jiu-Jitsu' | 'Judo' | 'Muay Thai' | 'Wrestling' | 'Boxing' | 'Karate' | 'Taekwondo' | 'MMA' | 'Sambo' | 'Krav Maga';
```

---

### 2. `src/components/admin/CreateTenantDialog.tsx`
Atualizar lista de modalidades e estilo das badges:

```tsx
// Lista atualizada
const SPORT_TYPES = [
  'Jiu-Jitsu', 
  'Judo', 
  'Muay Thai', 
  'Wrestling', 
  'Karate', 
  'Taekwondo', 
  'Boxing', 
  'MMA', 
  'Sambo', 
  'Krav Maga'
];

// Default atualizado
const [selectedSports, setSelectedSports] = useState<string[]>(['Jiu-Jitsu']);

// Badge com estilo profissional (sem emoji, com indicador visual de seleção)
<Badge
  key={sport}
  variant="outline"
  className={cn(
    "cursor-pointer transition-colors",
    selectedSports.includes(sport) && "border-primary bg-primary/10 text-primary"
  )}
  onClick={() => toggleSport(sport)}
>
  {sport}
</Badge>
```

---

### 3. `src/pages/TenantLanding.tsx`
Remover emojis e simplificar exibição:

**Mudança 1 - Remover mapa de ícones:**
```tsx
// REMOVER completamente
const sportIcons: Record<string, string> = { ... };
```

**Mudança 2 - Hero badge (linha ~90):**
```tsx
// ANTES
{tenant.sportTypes.map((sport) => sportIcons[sport] || "🏅").join(" ")} {tenant.sportTypes.join(" • ")}

// DEPOIS
{tenant.sportTypes.join(" • ")}
```

**Mudança 3 - Badges na seção Sports (linha ~130):**
```tsx
// ANTES
<Badge ...>
  <span className="mr-2 text-xl">{sportIcons[sport] || "🏅"}</span>
  {sport}
</Badge>

// DEPOIS
<Badge ...>
  {sport}
</Badge>
```

---

## Resultado Visual

### Dialog de Criação
| Antes | Depois |
|-------|--------|
| BJJ (fundo vermelho sólido) | Jiu-Jitsu (borda primária, fundo sutil) |
| MuayThai | Muay Thai |
| — | Sambo |
| — | Krav Maga |

### Landing do Tenant
| Antes | Depois |
|-------|--------|
| 🥋 Jiu-Jitsu 🥊 Muay Thai | Jiu-Jitsu • Muay Thai |
| 🥋 Badge com emoji | Badge limpa só com texto |

---

## Seção Técnica

### Import adicional em CreateTenantDialog.tsx
```tsx
import { cn } from "@/lib/utils";
```

### Impacto em dados existentes
O campo `sport_types` no banco é `text[]` (strings livres). Valores antigos como "BJJ" continuarão salvos mas podem ser atualizados manualmente se desejado. Não requer migração obrigatória.

### Arquivos modificados
- `src/types/tenant.ts`
- `src/components/admin/CreateTenantDialog.tsx`
- `src/pages/TenantLanding.tsx`
