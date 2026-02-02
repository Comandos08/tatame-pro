
# P-MENU-01 — REORGANIZAÇÃO DO MENU SUPERIOR (UX CLEANUP)

## SAFE MODE · VISUAL ONLY · ZERO REGRESSÃO

---

## ANÁLISE DO ESTADO ATUAL

### Estrutura Existente

O sistema utiliza um layout de **Sidebar + Header**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ SIDEBAR (lg:visible)           │ HEADER (sticky top)                   │
│ ─────────────────────────      │ ─────────────────────────────────────│
│ [Logo] Tenant Name             │ [☰] │ <flex-1/> │ [🌐] [🌙] [?] Sport │
│ ─────────────────────────      │                                       │
│ Impersonation Badge            │                                       │
│ ─────────────────────────      │                                       │
│ • Minha Área                   │                                       │
│ • Dashboard                    │                                       │
│ • Atletas                      │                                       │
│ • ... (12+ itens)             │                                       │
│ ─────────────────────────      │                                       │
│ [Avatar] User Menu             │                                       │
└────────────────────────────────────────────────────────────────────────┘
```

### Problemas Identificados

| Problema | Onde |
|----------|------|
| Header vazio em desktop (só utility buttons) | `AppShell.tsx` linhas 239-327 |
| Informação de tenant duplicada (sidebar + header) | Sidebar mostra logo/nome |
| Muitos ícones sem contexto visível | Globe, Moon, HelpCircle, Building2 |
| Sport types exibido no header (pouco útil) | Linha 321-325 |
| Nenhum indicador de impersonation no header | Só aparece no sidebar |

### Restrições Técnicas Identificadas

| Ação Proposta | Viabilidade | Razão |
|---------------|-------------|-------|
| "Criar Evento" global | ✅ Viável | `CreateEventDialog` não requer contexto |
| "Criar Categoria" global | ❌ Inviável | Requer `eventId` obrigatório |
| "Criar Atleta" global | ❌ Inviável | Atletas são criados via fluxo de membership |

---

## ESCOPO REVISADO (SAFE + VIÁVEL)

### O Que SERÁ Feito

1. **Adicionar indicador de tenant/impersonation no header**
2. **Consolidar utility buttons em um único menu**
3. **Remover exibição de sport types (baixo valor)**
4. **Adicionar botão "Criar Evento" global no header** (somente para admin)
5. **Melhorar espaçamento e hierarquia visual**

### O Que NÃO Será Feito

- ❌ Menu "Criar" com múltiplas opções (restrição técnica)
- ❌ Navegação central no header (já existe na sidebar)
- ❌ Alterações em routes/guards/contexts

---

## FASE 1 — NOVA ESTRUTURA DO HEADER

### Layout Proposto

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ [☰] │ [Logo] TenantName [🟡 Impersonating] │ <flex/> │ [+] [⚙] [Avatar]│
└─────────────────────────────────────────────────────────────────────────┘

ESQUERDA:
- Mobile menu button
- Tenant logo + nome (em desktop)
- Badge de impersonation (se ativo)

DIREITA:
- Botão "+ Evento" (admin only, visível)
- Settings dropdown (consolida: Theme, Language, Help)
- Avatar dropdown (perfil, admin global, logout)
```

### Detalhamento

**Esquerda — Contexto**
```tsx
<div className="flex items-center gap-3">
  {/* Mobile menu */}
  <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
    <Menu className="h-5 w-5" />
  </Button>
  
  {/* Tenant indicator (desktop) */}
  <div className="hidden lg:flex items-center gap-2">
    {tenant?.logoUrl ? (
      <img src={tenant.logoUrl} alt="" className="h-6 w-6 rounded" />
    ) : null}
    <span className="text-sm font-medium truncate max-w-[150px]">{tenant?.name}</span>
  </div>
  
  {/* Impersonation badge */}
  {isImpersonating && (
    <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
      {t('impersonation.badge')}
    </Badge>
  )}
</div>
```

**Direita — Ações**
```tsx
<div className="flex items-center gap-2">
  {/* Quick Create Event (admin only) */}
  {can('TENANT_EVENTS') && (
    <CreateEventDialog>
      <Button size="sm" className="hidden sm:flex">
        <Plus className="mr-2 h-4 w-4" />
        {t('events.createEvent')}
      </Button>
    </CreateEventDialog>
  )}
  
  {/* Settings dropdown (Theme + Language + Help) */}
  <SettingsDropdown />
  
  {/* User menu */}
  <UserMenu />
</div>
```

---

## FASE 2 — CRIAR COMPONENTE `HeaderSettingsDropdown`

**Arquivo:** `src/components/layout/HeaderSettingsDropdown.tsx`

**Responsabilidade:** Consolidar Theme, Language e Help em um único dropdown

```tsx
export function HeaderSettingsDropdown() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {/* Language submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Globe className="mr-2 h-4 w-4" />
            {t('language.select')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {languages.map(lang => (...))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        
        {/* Theme submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {resolvedTheme === 'dark' ? <Moon /> : <Sun />}
            {t('theme.label')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => setTheme('light')}>...</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}>...</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')}>...</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        
        <DropdownMenuSeparator />
        
        {/* Help link */}
        <DropdownMenuItem onClick={() => navigate(`/${tenantSlug}/app/help`)}>
          <HelpCircle className="mr-2 h-4 w-4" />
          {t('nav.help')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

---

## FASE 3 — EXTRAIR COMPONENTE `HeaderUserMenu`

**Arquivo:** `src/components/layout/HeaderUserMenu.tsx`

Move a lógica do user menu atual do sidebar para um componente reutilizável no header.

```tsx
export function HeaderUserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Avatar className="h-7 w-7">
            <AvatarImage src={currentUser?.avatarUrl} />
            <AvatarFallback>{getInitials(currentUser?.name)}</AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline text-sm max-w-[80px] truncate">
            {currentUser?.name?.split(' ')[0]}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{currentUser?.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isGlobalSuperadmin && (
          <DropdownMenuItem onClick={() => navigate('/admin')}>
            <Shield className="mr-2 h-4 w-4" />
            {t('nav.globalAdmin')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          {t('nav.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

---

## FASE 4 — ATUALIZAR `AppShell.tsx`

### Alterações no Header (linhas 239-327)

```tsx
{/* Header */}
<header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/95 backdrop-blur px-4 lg:px-6">
  {/* LEFT: Context */}
  <div className="flex items-center gap-3">
    <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
      <Menu className="h-5 w-5" />
    </Button>
    
    {/* Tenant name (desktop only, since sidebar shows on lg) */}
    <div className="hidden lg:flex items-center gap-2">
      {tenant?.logoUrl && (
        <img src={tenant.logoUrl} alt="" className="h-6 w-6 rounded object-cover" />
      )}
      <span className="text-sm font-medium text-foreground truncate max-w-[180px]">
        {tenant?.name}
      </span>
    </div>
    
    {/* Impersonation badge */}
    {isImpersonating && (
      <Badge variant="outline" className="text-xs border-warning/50 bg-warning/10 text-warning-foreground">
        {t('impersonation.badge')}
      </Badge>
    )}
  </div>
  
  {/* SPACER */}
  <div className="flex-1" />
  
  {/* RIGHT: Actions */}
  <div className="flex items-center gap-1">
    {/* Quick Create Event (admin, desktop) */}
    {can('TENANT_EVENTS') && (
      <CreateEventDialog>
        <Button size="sm" variant="default" className="hidden md:flex gap-2">
          <Plus className="h-4 w-4" />
          <span>{t('events.createEvent')}</span>
        </Button>
      </CreateEventDialog>
    )}
    
    {/* Settings dropdown */}
    <HeaderSettingsDropdown />
    
    {/* User menu */}
    <HeaderUserMenu />
  </div>
</header>
```

---

## FASE 5 — CRIAR DIRETÓRIO E ARQUIVOS

### Estrutura de Arquivos

```
src/components/layout/
├── HeaderSettingsDropdown.tsx  (NOVO)
├── HeaderUserMenu.tsx          (NOVO)
└── index.ts                    (NOVO - barrel export)
```

---

## FASE 6 — i18n (NOVAS CHAVES)

### Chaves a Adicionar

```typescript
// pt-BR, en, es
'settings.title': 'Configurações' | 'Settings' | 'Configuración',
'theme.label': 'Tema' | 'Theme' | 'Tema',
'impersonation.badge': 'Impersonação' | 'Impersonation' | 'Suplantación',
```

> Nota: Maioria das chaves já existe (`language.select`, `theme.light`, `nav.help`, etc.)

---

## ARQUIVOS A CRIAR/MODIFICAR

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/components/layout/HeaderSettingsDropdown.tsx` | CRIAR | Consolida Theme + Language + Help |
| `src/components/layout/HeaderUserMenu.tsx` | CRIAR | Avatar dropdown com logout |
| `src/components/layout/index.ts` | CRIAR | Barrel exports |
| `src/layouts/AppShell.tsx` | EDITAR | Refatorar header |
| `src/locales/pt-BR.ts` | EDITAR | +2 keys |
| `src/locales/en.ts` | EDITAR | +2 keys |
| `src/locales/es.ts` | EDITAR | +2 keys |

---

## COMPARAÇÃO VISUAL

### Antes

```
[☰] │ <─────── flex-1 ──────> │ [🌐] [🌙] [?] [Sport Types]
```

- 4 botões de ícone isolados
- Sport types ocupando espaço
- Nenhum contexto de tenant
- Nenhum indicador de impersonation

### Depois

```
[☰] │ [Logo] TenantName [🟡 Badge] │ <─ flex ─> │ [+ Evento] [⚙] [👤]
```

- Contexto do tenant visível
- Impersonation badge no header
- Botão de ação rápida (Criar Evento)
- Utilities consolidadas em 1 dropdown
- User menu claro com avatar

---

## QA CHECKLIST

### Visual
- [ ] Header não parece "vazio" em desktop
- [ ] Tenant name visível (lg+)
- [ ] Badge de impersonation aparece quando ativo
- [ ] Botão "Criar Evento" só para admin
- [ ] Settings dropdown funciona (Theme + Language + Help)
- [ ] User menu funciona (Admin global + Logout)

### Funcional
- [ ] Theme toggle funciona
- [ ] Language toggle funciona
- [ ] Help navega corretamente
- [ ] Criar Evento abre dialog
- [ ] Logout funciona
- [ ] Admin global navega para /admin

### Regressão
- [ ] Mobile menu continua funcionando
- [ ] Sidebar continua funcionando
- [ ] Nenhum warning no console
- [ ] Todos os fluxos existentes OK

---

## CRITÉRIOS DE ACEITE

```text
✅ Header mais informativo
✅ Menos clutter visual
✅ Contexto de tenant visível
✅ Impersonation destacado
✅ Ação rápida disponível
✅ Zero regressão
```

---

## O QUE NÃO SERÁ ALTERADO

- ❌ Sidebar (continua igual)
- ❌ Routes
- ❌ Guards / Permissions
- ❌ Contexts (Auth, Tenant, Impersonation)
- ❌ Edge Functions
- ❌ Banco de dados
- ❌ RLS policies
