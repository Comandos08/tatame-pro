

# PI-D5-GTM1.0 — Go-to-Market Institucional

**Status:** PLAN (Aguardando aprovacao)
**Escopo:** Posicionamento institucional publico + narrativa de apresentacao
**Impacto funcional:** Nenhum (apenas documentacao)
**Arquivos a criar:** 1 (docs/GTM-INSTITUCIONAL.md)
**Risco de regressao:** Nulo

---

## 1. Contexto e Alinhamento

### 1.1 Documentos Existentes Analisados

| Documento | Status | Relacao com GTM |
|-----------|--------|-----------------|
| `docs/SALES-NARRATIVE.md` | Canonico | Narrativa de vendas (5 min) - **mais comercial** |
| `docs/PRODUCT-SCOPE.md` | Canonico | Definicao de escopo - referencia |
| `src/locales/pt-BR.ts` (about.*) | Atualizado PI-D5-ABOUT1.x | Textos institucionais - **base** |
| `src/pages/About.tsx` | Atualizado PI-D5-ABOUT1.2 | Estrutura visual - referencia |

### 1.2 Diferenca Fundamental

```text
SALES-NARRATIVE.md         GTM-INSTITUCIONAL.md
       |                           |
       v                           v
   VENDER                     POSICIONAR
   (converter)                (explicar)
       |                           |
   "Se isso e o que          "Isso e o que
    voce precisa, vamos       o Tatame e."
    conversar."
```

O GTM Institucional nao substitui o SALES-NARRATIVE — ele o complementa como camada anterior (posicionamento) que nao pressupoe intencao de compra.

---

## 2. Arquitetura do Documento

### 2.1 Estrutura Proposta

```text
docs/GTM-INSTITUCIONAL.md
|
+-- 1. Proposito (o que e este documento)
|
+-- 2. Mensagem Central (1 frase)
|
+-- 3. Roteiro de 90 Segundos
|       |-- Bloco 1: Contexto (20s)
|       |-- Bloco 2: Posicao (25s)
|       |-- Bloco 3: Estrutura (25s)
|       |-- Bloco 4: Confianca (20s)
|
+-- 4. Demo Institucional (5 min)
|       |-- Principios da demo
|       |-- Ordem fixa
|       |-- O que mostrar vs. o que NAO mostrar
|
+-- 5. Microcopy Institucional
|       |-- Headlines permitidas
|       |-- Frases proibidas
|
+-- 6. Adaptacoes por Idioma (EN / ES)
|
+-- 7. Criterios de Uso
```

---

## 3. Conteudo Proposto

### 3.1 Mensagem Central (1 frase)

```text
"O Tatame e uma infraestrutura institucional para registro,
governanca e preservacao do historico dos esportes de combate."
```

**Validacao:**
- Nao promete
- Nao compara
- Nao vende
- Nao disputa poder
- Define territorio

### 3.2 Roteiro de 90 Segundos

#### Bloco 1 — Contexto (20s)

> "Os esportes de combate cresceram globalmente, mas seu historico institucional ainda e fragmentado. Registros, graduacoes, vinculos e decisoes dependem de pessoas, gestoes e documentos dispersos."

**Objetivo:** Mostrar que o problema e estrutural, nao operacional.

#### Bloco 2 — Posicao do Tatame (25s)

> "O Tatame nao e uma federacao e nao substitui entidades existentes. Ele atua como uma camada institucional neutra, oferecendo registro estruturado, rastreabilidade e preservacao historica para o ecossistema."

**Objetivo:** Dizer onde o Tatame se encaixa — sem competir.

#### Bloco 3 — Estrutura (25s)

> "A infraestrutura respeita as camadas do esporte: federacoes e conselhos definem normas, organizacoes executam, individuos constroem seu historico. O Tatame apenas registra, preserva e conecta essas camadas."

**Objetivo:** Mostrar que existe ordem (alinhado com about.ecosystem.*).

#### Bloco 4 — Confianca e Longo Prazo (20s)

> "Os registros sao auditaveis, verificaveis e independentes de gestoes especificas. O foco nao e tecnologia, mas continuidade institucional."

**Objetivo:** Fechar com legitimidade.

---

### 3.3 Demo Institucional (5 minutos)

#### Principios

| Principio | Descricao |
|-----------|-----------|
| **Nao e tour** | Nao mostrar todas as telas |
| **Nao e feature-driven** | Mostrar conceitos, nao botoes |
| **Comprovacao de conceito** | "Isso existe, funciona assim" |
| **Institucional** | Falar como se apresentasse a um regulador |

#### Ordem Fixa

| Etapa | Tempo | O que Mostrar | O que NAO Mostrar |
|-------|-------|---------------|-------------------|
| 1. Dashboard | 60s | Visao macro, camadas | Numeros, metricas |
| 2. Federacao/Conselho | 60s | Estrutura hierarquica | Configuracoes internas |
| 3. Registro/Vinculo | 90s | Rastreabilidade de historico | Formularios completos |
| 4. Verificacao Publica | 60s | QR Code, validacao externa | Processo de emissao |
| 5. Encerramento | 30s | Retorno a mensagem-mae | Features adicionais |

#### Script de Transicao

```text
Dashboard → "Aqui temos visao das camadas do ecossistema..."
Fed/Conselho → "Essa e a estrutura institucional..."
Registro → "Cada registro preserva historico verificavel..."
Verificacao → "Qualquer pessoa pode validar externamente..."
Encerramento → "Isso e infraestrutura institucional para o esporte."
```

---

### 3.4 Microcopy Institucional

#### Headlines Permitidas

| Headline | Uso |
|----------|-----|
| "Infraestrutura institucional para o esporte" | Geral |
| "Registro, governanca e preservacao historica" | Tecnico |
| "Uma camada neutra para o ecossistema esportivo" | Posicionamento |
| "Governanca e rastreabilidade para esportes de combate" | Especifico |

#### Frases Proibidas (alinhado com About)

| Proibido | Motivo |
|----------|--------|
| "Gerencie sua federacao" | SaaS |
| "Aumente eficiencia" | Marketing |
| "Controle seus dados" | Operacional |
| "Plataforma completa" | Comercial |
| "Tudo em um so lugar" | Marketing |
| "Solucao integrada" | SaaS |
| "Digitalize sua organizacao" | Operacional |

---

### 3.5 Adaptacoes por Idioma

#### EN — Institutional GTM

```text
Mensagem central:
"Tatame is institutional infrastructure for registration,
governance and historical preservation in combat sports."

Headline principal:
"Institutional infrastructure for sport"
```

#### ES — GTM Institucional

```text
Mensaje central:
"Tatame es una infraestructura institucional para el registro,
la gobernanza y la preservacion historica de los deportes de combate."

Headline principal:
"Infraestructura institucional para el deporte"
```

---

## 4. Relacao com Documentos Existentes

### 4.1 Hierarquia Documental

```text
PRODUCT-SCOPE.md (autoridade maxima)
       |
       v
SALES-NARRATIVE.md (vendas)
       |
       v
GTM-INSTITUCIONAL.md (posicionamento) <-- ESTE DOCUMENTO
       |
       v
About Page (publico)
```

### 4.2 Quando Usar Cada Um

| Documento | Quando Usar |
|-----------|-------------|
| PRODUCT-SCOPE.md | Decisoes de produto, validacao de escopo |
| SALES-NARRATIVE.md | Conversa de vendas, objecoes, fechamento |
| GTM-INSTITUCIONAL.md | Apresentacao inicial, demo, material publico |
| About Page | Visitante do site, primeiro contato |

---

## 5. Criterios de Uso

### 5.1 Este documento DEVE ser usado para

- Primeira reuniao com federacao
- Demo institucional (5 min)
- Apresentacao para conselho/regulador
- Base para material do site
- Treinamento de equipe

### 5.2 Este documento NAO substitui

- SALES-NARRATIVE.md (para fechamento)
- PRODUCT-SCOPE.md (para decisoes)
- Documentacao tecnica

---

## 6. Arquivos Afetados

| Arquivo | Acao |
|---------|------|
| `docs/GTM-INSTITUCIONAL.md` | **CRIAR** |

**Nenhum outro arquivo sera alterado.**

---

## 7. Criterios de Aceite (SAFE GOLD)

| Criterio | Validacao |
|----------|-----------|
| Nao soa comercial | Zero palavras de venda |
| Nao soa SaaS | Zero jargao de produto |
| Serve para reuniao institucional | Pode ser lido em voz alta |
| Sustenta demo curta | Roteiro fecha em 5 min |
| Coerente com About | Nenhuma contradicao com about.* |
| Escalavel | Versoes EN / ES incluidas |
| Alinhado com SALES-NARRATIVE | Complementa, nao contradiz |

---

## 8. Proximo Passo apos Aprovacao

Criacao do arquivo `docs/GTM-INSTITUCIONAL.md` com todo o conteudo acima estruturado em formato markdown canonico.

---

## Resumo Executivo

Este PI cria o documento `docs/GTM-INSTITUCIONAL.md` que serve como alicerce do posicionamento institucional do Tatame, complementando o SALES-NARRATIVE.md existente.

**Diferencial:**
- SALES-NARRATIVE = como vender
- GTM-INSTITUCIONAL = como explicar (sem pressupor intencao de compra)

**Conteudo:**
1. Mensagem central (1 frase)
2. Roteiro de 90 segundos
3. Estrutura de demo de 5 minutos
4. Microcopy institucional (permitido/proibido)
5. Adaptacoes EN/ES

**Impacto funcional:** Zero
**Arquivos criados:** 1
**Risco de regressao:** Nulo

