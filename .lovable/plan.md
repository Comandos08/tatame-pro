

# P4B-2 — Athlete Portal Empty States (UX-Only)

## Resumo

Adicionar mensagens complementares e humanizadas nos empty states do Portal do Atleta, orientando o usuário sobre quando os dados aparecerão.

---

## Escopo Exato

| Componente | Ação |
|------------|------|
| `DigitalCardSection.tsx` | Adicionar texto complementar abaixo de `portal.cardNotAvailable` |
| `DiplomasListCard.tsx` | Adicionar texto complementar abaixo de `portal.noDiplomas` |
| `GradingHistoryCard.tsx` | Adicionar texto complementar abaixo de `portal.noGradings` |
| `src/locales/pt-BR.ts` | Adicionar 3 novas i18n keys |
| `src/locales/en.ts` | Adicionar 3 novas i18n keys |
| `src/locales/es.ts` | Adicionar 3 novas i18n keys |

---

## Arquivos NÃO Modificados (SAFE MODE)

| Arquivo | Razão |
|---------|-------|
| `src/routes.tsx` | P4A — Intacto |
| `src/pages/AuthCallback.tsx` | P3 — Intacto |
| `src/components/portal/PortalAccessGate.tsx` | P4B-1 — Intacto |
| `src/components/auth/AthleteRouteGuard.tsx` | P4A — Intacto |
| `src/lib/billing/*` | P1 — Intacto |
| `src/pages/AthletePortal.tsx` | P4B-4 — Futuro |
| `src/components/membership/*` | P4B-3 — Futuro |

---

## Mudanças nos Componentes

### 1. `src/components/portal/DigitalCardSection.tsx`

**Linha 78 - Adicionar texto complementar:**

```text
Antes (manter):
<p className="text-muted-foreground font-medium">{t('portal.cardNotAvailable')}</p>

Depois (adicionar abaixo):
<p className="text-muted-foreground font-medium">{t('portal.cardNotAvailable')}</p>
<p className="text-muted-foreground text-sm mt-1">{t('portal.emptyDigitalCard')}</p>
```

### 2. `src/components/portal/DiplomasListCard.tsx`

**Linha 71 - Adicionar texto complementar:**

```text
Antes (manter):
<p className="text-muted-foreground font-medium">{t('portal.noDiplomas')}</p>

Depois (adicionar abaixo):
<p className="text-muted-foreground font-medium">{t('portal.noDiplomas')}</p>
<p className="text-muted-foreground text-sm mt-1">{t('portal.emptyDiplomas')}</p>
```

### 3. `src/components/portal/GradingHistoryCard.tsx`

**Linha 61 - Adicionar texto complementar:**

```text
Antes (manter):
<p className="text-muted-foreground font-medium">{t('portal.noGradings')}</p>

Depois (adicionar abaixo):
<p className="text-muted-foreground font-medium">{t('portal.noGradings')}</p>
<p className="text-muted-foreground text-sm mt-1">{t('portal.emptyGradings')}</p>
```

---

## Novas Chaves i18n

### pt-BR.ts (após linha 732)

```typescript
'portal.emptyDigitalCard': 'Sua carteira digital será gerada automaticamente após a aprovação da sua filiação.',
'portal.emptyDiplomas': 'Os diplomas de graduação aparecerão aqui conforme você evolui no esporte.',
'portal.emptyGradings': 'Seu histórico de faixas será exibido aqui após sua primeira graduação.',
```

### en.ts (após linha 734)

```typescript
'portal.emptyDigitalCard': 'Your digital card will be generated automatically after your membership is approved.',
'portal.emptyDiplomas': 'Your graduation diplomas will appear here as you progress in the sport.',
'portal.emptyGradings': 'Your belt history will be displayed here after your first graduation.',
```

### es.ts (após linha 734)

```typescript
'portal.emptyDigitalCard': 'Tu credencial digital se generará automáticamente después de la aprobación de tu afiliación.',
'portal.emptyDiplomas': 'Los diplomas de graduación aparecerán aquí a medida que avances en el deporte.',
'portal.emptyGradings': 'Tu historial de cinturones se mostrará aquí después de tu primera graduación.',
```

---

## Validações Garantidas

| Critério | Status |
|----------|--------|
| Nenhum `navigate()` adicionado | Garantido |
| Nenhum `useEffect` novo | Garantido |
| Nenhuma condição nova criada | Garantido |
| Nenhum arquivo fora da lista modificado | Garantido |
| Mensagens não prometem ação automática indevida | Garantido |
| Build compila sem warnings | Garantido |
| P4A continua único responsável por acesso | Garantido |
| P4B-1 permanece intacto | Garantido |

---

## Resultado Esperado

```text
P4B-2 — ATHLETE PORTAL EMPTY STATES
├── UX mais clara e humana ✓
├── Nenhuma mudança de lógica ✓
├── Nenhuma mudança de fluxo ✓
├── Nenhuma dependência nova ✓
├── i18n consistente (pt / en / es) ✓
├── P4A intacto ✓
├── P4B-1 intacto ✓
└── SAFE MODE preservado ✓
```

