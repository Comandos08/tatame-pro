
# PROMPT 4/4 — Padronização i18n (Admin)

## RESUMO

| Métrica | Valor |
|---------|-------|
| Arquivos a MODIFICAR | 5 |
| Keys i18n a criar | 72 |
| Layout/UX alterados | ZERO |
| Lógica de negócio alterada | ZERO |
| Risco de regressão | Baixíssimo |

---

## STRINGS HARDCODED IDENTIFICADAS

### 1. AthletesList.tsx

| Linha | String Hardcoded | Nova Key |
|-------|------------------|----------|
| 163 | `'pt-BR'` (locale formatDate) | — (mantido, padrão) |
| 168 | `'Nome'` | `admin.athletes.csv.name` |
| 169 | `'E-mail'` | `admin.athletes.csv.email` |
| 170 | `'Data de Nascimento'` | `admin.athletes.csv.birthDate` |
| 171 | `'Academia'` | `admin.athletes.csv.academy` |
| 174 | `'Status Filiação'` | `admin.athletes.csv.membershipStatus` |
| 176 | `'Sem filiação'` | `admin.athletes.noMembership` |
| 180 | `'Início Filiação'` | `admin.athletes.csv.membershipStart` |
| 185 | `'Fim Filiação'` | `admin.athletes.csv.membershipEnd` |
| 198 | `'Atletas'` | `admin.athletes.title` |
| 201 | `'Gerencie os atletas cadastrados na organização'` | `admin.athletes.description` |
| 219 | `'Buscar por nome...'` | `admin.athletes.searchPlaceholder` |
| 228 | `'Academia'` (placeholder) | `admin.athletes.filterAcademy` |
| 231 | `'Todas academias'` | `admin.athletes.allAcademies` |
| 242 | `'Status'` (placeholder) | `admin.athletes.filterStatus` |
| 245 | `'Todos status'` | `admin.athletes.allStatus` |
| 246 | `'Ativa'` | — (usar `status.active`) |
| 247 | `'Aguardando Aprovação'` | — (usar `status.pending_review`) |
| 248 | `'Aguardando Pagamento'` | — (usar `status.pending_payment`) |
| 249 | `'Expirada'` | — (usar `status.expired`) |
| 266 | `'Nenhum atleta encontrado com os filtros selecionados.'` | `admin.athletes.emptyFiltered` |
| 276 | `'Atleta'` | `admin.athletes.tableAthlete` |
| 277 | `'Academia'` | `admin.athletes.tableAcademy` |
| 278 | `'Status Filiação'` | `admin.athletes.tableMembershipStatus` |
| 279 | `'Período'` | `admin.athletes.tablePeriod` |
| 280 | `'Ações'` | — (usar `common.actions`) |
| 315 | `'Sem filiação'` | `admin.athletes.noMembership` (reusar) |
| 335 | `'Graduações'` | `admin.athletes.gradings` |

### 2. AcademiesList.tsx

| Linha | String Hardcoded | Nova Key |
|-------|------------------|----------|
| 89 | `'Academia criada com sucesso'` | `admin.academies.createSuccess` |
| 92 | `'Erro ao criar academia'` | `admin.academies.createError` |
| 118 | `'Academia atualizada com sucesso'` | `admin.academies.updateSuccess` |
| 121 | `'Erro ao atualizar academia'` | `admin.academies.updateError` |
| 137 | `'Status atualizado'` | `admin.academies.statusUpdated` |
| 140 | `'Erro ao atualizar status'` | `admin.academies.statusError` |
| 172 | `'Nome é obrigatório'` | `admin.academies.nameRequired` |
| 189 | `'Nome *'` | `admin.academies.formName` |
| 194 | `'Nome da academia'` | `admin.academies.formNamePlaceholder` |
| 198 | `'Slug'` | `admin.academies.formSlug` |
| 203 | `'slug-da-academia'` | `admin.academies.formSlugPlaceholder` |
| 209 | `'Modalidade'` | `admin.academies.formSport` |
| 214 | `'Ex: BJJ'` | `admin.academies.formSportPlaceholder` |
| 218 | `'Cidade'` | `admin.academies.formCity` |
| 223 | `'Cidade'` | `admin.academies.formCityPlaceholder` |
| 229 | `'Estado'` | `admin.academies.formState` |
| 234 | `'UF'` | `admin.academies.formStatePlaceholder` |
| 238 | `'Telefone'` | `admin.academies.formPhone` |
| 243 | `'(11) 99999-9999'` | `admin.academies.formPhonePlaceholder` |
| 248 | `'E-mail'` | `admin.academies.formEmail` |
| 254 | `'academia@email.com'` | `admin.academies.formEmailPlaceholder` |
| 269 | `'Academias'` | `admin.academies.title` |
| 271 | `'Gerencie as academias vinculadas à'` | `admin.academies.description` |
| 279 | `'Nova Academia'` | `admin.academies.newAcademy` |
| 284 | `'Criar Academia'` | `admin.academies.createTitle` |
| 286 | `'Adicione uma nova academia à organização'` | `admin.academies.createDesc` |
| 291 | `'Cancelar'` | — (usar `common.cancel`) |
| 296 | `'Criar'` | `admin.academies.create` |
| 312 | `'Erro ao carregar academias'` | `admin.academies.loadError` |
| 334 | `'Todas modalidades'` | `admin.academies.allSports` |
| 369 | `'Ativa'` | — (usar `status.active`) |
| 369 | `'Inativa'` | `admin.academies.inactive` |
| 378 | `'Editar'` | — (usar `common.edit`) |
| 383 | `'Editar Academia'` | `admin.academies.editTitle` |
| 385 | `'Atualize as informações da academia'` | `admin.academies.editDesc` |
| 390 | `'Cancelar'` | — (usar `common.cancel`) |
| 395 | `'Salvar'` | — (usar `common.save`) |
| 413 | `'Nenhuma academia cadastrada'` | `admin.academies.emptyTitle` |
| 415 | `'Comece cadastrando as academias vinculadas à sua organização.'` | `admin.academies.emptyDesc` |
| 420 | `'Criar primeira academia'` | `admin.academies.createFirst` |

### 3. CoachesList.tsx

| Linha | String Hardcoded | Nova Key |
|-------|------------------|----------|
| 141 | `'Coach cadastrado com sucesso'` | `admin.coaches.createSuccess` |
| 144 | `'Erro ao criar coach'` | `admin.coaches.createError` |
| 166 | `'Coach atualizado com sucesso'` | `admin.coaches.updateSuccess` |
| 169 | `'Erro ao atualizar coach'` | `admin.coaches.updateError` |
| 185 | `'Status atualizado'` | `admin.coaches.statusUpdated` |
| 188 | `'Erro ao atualizar status'` | `admin.coaches.statusError` |
| 212 | `'Coach vinculado à academia'` | `admin.coaches.linkSuccess` |
| 216 | `'Coach já está vinculado a esta academia'` | `admin.coaches.alreadyLinked` |
| 218 | `'Erro ao vincular coach'` | `admin.coaches.linkError` |
| 251 | `'Nome é obrigatório'` | `admin.coaches.nameRequired` |
| 264 | `'Selecione uma academia'` | `admin.coaches.selectAcademy` |
| 280 | `'Nome Completo *'` | `admin.coaches.formName` |
| 285 | `'Nome do coach'` | `admin.coaches.formNamePlaceholder` |
| 290 | `'Modalidade Principal'` | `admin.coaches.formSport` |
| 295 | `'Ex: BJJ'` | `admin.coaches.formSportPlaceholder` |
| 299 | `'Graduação'` | `admin.coaches.formRank` |
| 304 | `'Ex: Faixa Preta 3° grau'` | `admin.coaches.formRankPlaceholder` |
| 310 | `'E-mail do Perfil (opcional)'` | `admin.coaches.formEmail` |
| 315 | `'coach@email.com'` | `admin.coaches.formEmailPlaceholder` |
| 319 | `'Se o coach já possui conta, informe o e-mail para vincular'` | `admin.coaches.formEmailHint` |
| 335 | `'Coaches'` | `admin.coaches.title` |
| 337 | `'Gerencie os professores e instrutores da'` | `admin.coaches.description` |
| 345 | `'Novo Coach'` | `admin.coaches.newCoach` |
| 350 | `'Cadastrar Coach'` | `admin.coaches.createTitle` |
| 352 | `'Adicione um novo coach à organização'` | `admin.coaches.createDesc` |
| 357 | `'Cancelar'` | — (usar `common.cancel`) |
| 362 | `'Criar'` | `admin.coaches.create` |
| 374 | `'Vincular à Academia'` | `admin.coaches.linkTitle` |
| 376 | `'Vincule ... a uma academia'` | `admin.coaches.linkDesc` |
| 381 | `'Academia'` | `admin.coaches.academyLabel` |
| 384 | `'Selecione a academia'` | `admin.coaches.selectAcademyPlaceholder` |
| 396 | `'Função'` | `admin.coaches.roleLabel` |
| 412 | `'Cancelar'` | — (usar `common.cancel`) |
| 417 | `'Vincular'` | `admin.coaches.link` |
| 431 | `'Erro ao carregar coaches'` | `admin.coaches.loadError` |
| 453 | `'Todas modalidades'` | `admin.coaches.allSports` |
| 477 | `'Academias:'` | `admin.coaches.academiesLabel` |
| 489 | `'Ativo'` | — (usar `status.active`) |
| 490 | `'Inativo'` | `admin.coaches.inactive` |
| 500 | `'Editar'` | — (usar `common.edit`) |
| ~505 | `'Editar Coach'` | `admin.coaches.editTitle` |
| ~507 | `'Atualize as informações do coach'` | `admin.coaches.editDesc` |
| ~512 | `'Cancelar'` | — (usar `common.cancel`) |
| ~517 | `'Salvar'` | — (usar `common.save`) |
| ~533 | `'Nenhum coach cadastrado'` | `admin.coaches.emptyTitle` |
| ~535 | `'Comece cadastrando os coaches da organização.'` | `admin.coaches.emptyDesc` |
| ~540 | `'Cadastrar primeiro coach'` | `admin.coaches.createFirst` |
| ~545 | `'Vincular'` | `admin.coaches.linkAcademy` |

---

## NOVAS KEYS I18N

### pt-BR.ts (72 novas keys)

```typescript
// Admin Athletes
'admin.athletes.title': 'Atletas',
'admin.athletes.description': 'Gerencie os atletas cadastrados na organização',
'admin.athletes.searchPlaceholder': 'Buscar por nome...',
'admin.athletes.filterAcademy': 'Academia',
'admin.athletes.allAcademies': 'Todas academias',
'admin.athletes.filterStatus': 'Status',
'admin.athletes.allStatus': 'Todos status',
'admin.athletes.emptyFiltered': 'Nenhum atleta encontrado com os filtros selecionados.',
'admin.athletes.tableAthlete': 'Atleta',
'admin.athletes.tableAcademy': 'Academia',
'admin.athletes.tableMembershipStatus': 'Status Filiação',
'admin.athletes.tablePeriod': 'Período',
'admin.athletes.noMembership': 'Sem filiação',
'admin.athletes.gradings': 'Graduações',
'admin.athletes.csv.name': 'Nome',
'admin.athletes.csv.email': 'E-mail',
'admin.athletes.csv.birthDate': 'Data de Nascimento',
'admin.athletes.csv.academy': 'Academia',
'admin.athletes.csv.membershipStatus': 'Status Filiação',
'admin.athletes.csv.membershipStart': 'Início Filiação',
'admin.athletes.csv.membershipEnd': 'Fim Filiação',

// Admin Academies
'admin.academies.title': 'Academias',
'admin.academies.description': 'Gerencie as academias vinculadas à',
'admin.academies.newAcademy': 'Nova Academia',
'admin.academies.createTitle': 'Criar Academia',
'admin.academies.createDesc': 'Adicione uma nova academia à organização',
'admin.academies.create': 'Criar',
'admin.academies.createSuccess': 'Academia criada com sucesso',
'admin.academies.createError': 'Erro ao criar academia',
'admin.academies.editTitle': 'Editar Academia',
'admin.academies.editDesc': 'Atualize as informações da academia',
'admin.academies.updateSuccess': 'Academia atualizada com sucesso',
'admin.academies.updateError': 'Erro ao atualizar academia',
'admin.academies.statusUpdated': 'Status atualizado',
'admin.academies.statusError': 'Erro ao atualizar status',
'admin.academies.loadError': 'Erro ao carregar academias',
'admin.academies.nameRequired': 'Nome é obrigatório',
'admin.academies.formName': 'Nome *',
'admin.academies.formNamePlaceholder': 'Nome da academia',
'admin.academies.formSlug': 'Slug',
'admin.academies.formSlugPlaceholder': 'slug-da-academia',
'admin.academies.formSport': 'Modalidade',
'admin.academies.formSportPlaceholder': 'Ex: Jiu-Jitsu',
'admin.academies.formCity': 'Cidade',
'admin.academies.formCityPlaceholder': 'Cidade',
'admin.academies.formState': 'Estado',
'admin.academies.formStatePlaceholder': 'UF',
'admin.academies.formPhone': 'Telefone',
'admin.academies.formPhonePlaceholder': '(11) 99999-9999',
'admin.academies.formEmail': 'E-mail',
'admin.academies.formEmailPlaceholder': 'academia@email.com',
'admin.academies.allSports': 'Todas modalidades',
'admin.academies.inactive': 'Inativa',
'admin.academies.emptyTitle': 'Nenhuma academia cadastrada',
'admin.academies.emptyDesc': 'Comece cadastrando as academias vinculadas à sua organização.',
'admin.academies.createFirst': 'Criar primeira academia',

// Admin Coaches
'admin.coaches.title': 'Coaches',
'admin.coaches.description': 'Gerencie os professores e instrutores da',
'admin.coaches.newCoach': 'Novo Coach',
'admin.coaches.createTitle': 'Cadastrar Coach',
'admin.coaches.createDesc': 'Adicione um novo coach à organização',
'admin.coaches.create': 'Criar',
'admin.coaches.createSuccess': 'Coach cadastrado com sucesso',
'admin.coaches.createError': 'Erro ao criar coach',
'admin.coaches.editTitle': 'Editar Coach',
'admin.coaches.editDesc': 'Atualize as informações do coach',
'admin.coaches.updateSuccess': 'Coach atualizado com sucesso',
'admin.coaches.updateError': 'Erro ao atualizar coach',
'admin.coaches.statusUpdated': 'Status atualizado',
'admin.coaches.statusError': 'Erro ao atualizar status',
'admin.coaches.loadError': 'Erro ao carregar coaches',
'admin.coaches.nameRequired': 'Nome é obrigatório',
'admin.coaches.selectAcademy': 'Selecione uma academia',
'admin.coaches.formName': 'Nome Completo *',
'admin.coaches.formNamePlaceholder': 'Nome do coach',
'admin.coaches.formSport': 'Modalidade Principal',
'admin.coaches.formSportPlaceholder': 'Ex: Jiu-Jitsu',
'admin.coaches.formRank': 'Graduação',
'admin.coaches.formRankPlaceholder': 'Ex: Faixa Preta 3° grau',
'admin.coaches.formEmail': 'E-mail do Perfil (opcional)',
'admin.coaches.formEmailPlaceholder': 'coach@email.com',
'admin.coaches.formEmailHint': 'Se o coach já possui conta, informe o e-mail para vincular',
'admin.coaches.linkTitle': 'Vincular à Academia',
'admin.coaches.linkDesc': 'Vincule {name} a uma academia',
'admin.coaches.academyLabel': 'Academia',
'admin.coaches.selectAcademyPlaceholder': 'Selecione a academia',
'admin.coaches.roleLabel': 'Função',
'admin.coaches.link': 'Vincular',
'admin.coaches.linkSuccess': 'Coach vinculado à academia',
'admin.coaches.alreadyLinked': 'Coach já está vinculado a esta academia',
'admin.coaches.linkError': 'Erro ao vincular coach',
'admin.coaches.allSports': 'Todas modalidades',
'admin.coaches.academiesLabel': 'Academias:',
'admin.coaches.inactive': 'Inativo',
'admin.coaches.emptyTitle': 'Nenhum coach cadastrado',
'admin.coaches.emptyDesc': 'Comece cadastrando os coaches da organização.',
'admin.coaches.createFirst': 'Cadastrar primeiro coach',
'admin.coaches.linkAcademy': 'Vincular',
```

---

## ALTERAÇÕES POR ARQUIVO

### 1. `src/locales/pt-BR.ts`
- Adicionar 72 novas keys no namespace `admin.*`

### 2. `src/locales/en.ts`
- Adicionar 72 novas keys correspondentes em inglês

### 3. `src/locales/es.ts`
- Adicionar 72 novas keys correspondentes em espanhol

### 4. `src/pages/AthletesList.tsx`
- Substituir todas as strings hardcoded por `t('admin.athletes.*')`
- Reutilizar keys existentes (`common.actions`, `status.*`)

### 5. `src/pages/AcademiesList.tsx`
- Substituir todas as strings hardcoded por `t('admin.academies.*')`
- Reutilizar keys existentes (`common.cancel`, `common.save`, `common.edit`, `status.active`)

### 6. `src/pages/CoachesList.tsx`
- Substituir todas as strings hardcoded por `t('admin.coaches.*')`
- Reutilizar keys existentes

---

## VALIDAÇÃO

1. **Compilação**: `npm run typecheck` passa sem erros
2. **PT-BR**: Textos exibidos são idênticos aos atuais
3. **EN/ES**: Troca de idioma exibe traduções corretas
4. **Layout**: Nenhuma alteração visual
5. **Fluxos**: Nenhuma lógica de negócio alterada

---

## GARANTIAS

- **ZERO alterações de layout**
- **ZERO alterações de lógica de negócio**
- **ZERO alterações de guards/hooks/schemas**
- **ZERO alterações de UX visual**
- **ZERO alterações de comportamento condicional**
- **Apenas substituição de strings por `t()`**

---

## SEÇÃO TÉCNICA

### Padrão de Implementação

```typescript
// ANTES
<h1>Atletas</h1>

// DEPOIS
const { t } = useI18n();
...
<h1>{t('admin.athletes.title')}</h1>
```

### Keys com Interpolação

```typescript
// Para descrições com nome do tenant
<p>{t('admin.academies.description')} {tenant.name}</p>

// Para linkDesc com nome do coach
<DialogDescription>
  {t('admin.coaches.linkDesc').replace('{name}', linkingCoach?.full_name || '')}
</DialogDescription>
```

### Reutilização de Keys Existentes

| String | Key Existente |
|--------|---------------|
| Cancelar | `common.cancel` |
| Salvar | `common.save` |
| Editar | `common.edit` |
| Ações | `common.actions` |
| Ativa | `status.active` |
| Aguardando Aprovação | `status.pending_review` |
| Aguardando Pagamento | `status.pending_payment` |
| Expirada | `status.expired` |
