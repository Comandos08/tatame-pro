# TATAME Pro — Threat Model

**Status:** 🟢 ATIVO  
**Versão:** 1.0 (PI-D5.B)  
**Data:** 2026-02-08  
**Modo:** SAFE GOLD

---

## 1. Ativos Protegidos

### 1.1 Identidade
| Ativo | Descrição | Classificação |
|-------|-----------|---------------|
| `auth.users` | Credenciais de autenticação | CRÍTICO |
| `profiles` | Dados de perfil vinculados a usuários | ALTO |
| `user_roles` | Papéis e permissões por tenant | CRÍTICO |
| `federation_roles` | Papéis federativos | CRÍTICO |

### 1.2 Documentos Institucionais
| Ativo | Descrição | Classificação |
|-------|-----------|---------------|
| `digital_cards` | Carteirinhas digitais emitidas | ALTO |
| `diplomas` | Diplomas de graduação | ALTO |
| `document_public_tokens` | Tokens de verificação pública | CRÍTICO |
| `memberships` | Filiações com dados de pagamento | ALTO |

### 1.3 Auditoria
| Ativo | Descrição | Classificação |
|-------|-----------|---------------|
| `audit_logs` | Trilha de auditoria imutável | CRÍTICO |
| `superadmin_impersonations` | Sessões de impersonação | CRÍTICO |
| `decision_logs` | Log de decisões de segurança | ALTO |

### 1.4 Contexto Federativo
| Ativo | Descrição | Classificação |
|-------|-----------|---------------|
| `federations` | Entidades federativas | ALTO |
| `federation_tenants` | Vínculos tenant ↔ federação | ALTO |
| `councils` | Conselhos institucionais | ALTO |
| `council_decisions` | Deliberações formais | ALTO |

---

## 2. Vetores de Ataque

### 2.1 Enumeração de Token
**Descrição:** Atacante tenta descobrir tokens de verificação pública válidos via brute-force ou análise de padrões.

**Mitigações:**
- ✅ Tokens são UUID v4 (2^122 combinações)
- ✅ Nenhum padrão sequencial
- ✅ Resposta neutra (HTTP 200) independente do resultado
- ✅ Rate limiting em endpoints públicos
- ✅ Não há diferença de timing entre token válido/inválido

**Risco Residual:** Baixíssimo (enumeração impraticável)

### 2.2 Forja de Contexto
**Descrição:** Atacante tenta manipular contexto de tenant para acessar dados de outro tenant.

**Mitigações:**
- ✅ RLS em todas as tabelas sensíveis
- ✅ `tenant_id` validado em todas as queries
- ✅ Funções helper (`is_tenant_admin`, `has_role`) são SECURITY DEFINER
- ✅ Nenhum SELECT sem cláusula de tenant
- ✅ Edge Functions usam service_role apenas com validação prévia

**Risco Residual:** Baixo (requer bug em múltiplas camadas)

### 2.3 Escalada de Privilégio
**Descrição:** Atacante tenta elevar seu papel (ex: STAFF → ADMIN_ORGANIZACAO → SUPERADMIN_GLOBAL).

**Mitigações:**
- ✅ Papéis armazenados em `user_roles` separado de `profiles`
- ✅ INSERT/UPDATE em `user_roles` restrito a ADMIN + service_role
- ✅ SUPERADMIN_GLOBAL verificado com `tenant_id IS NULL`
- ✅ `grant-roles` e `revoke-roles` são Edge Functions auditadas
- ✅ Papéis federativos (`federation_roles`) isolados de tenant

**Risco Residual:** Baixo (caminho de escalada explícito e auditado)

### 2.4 Abuso de Edge Functions
**Descrição:** Atacante tenta explorar Edge Functions para:
- Vazar informações via mensagens de erro
- Causar DoS via chamadas em massa
- Injetar payloads maliciosos

**Mitigações:**
- ✅ Todas as funções críticas usam rate limiting (Upstash Redis)
- ✅ Erros neutros (HTTP 200, sem stack trace)
- ✅ Validação explícita de input (UUID, enums)
- ✅ Nenhum raw SQL aceito
- ✅ Funções públicas usam Turnstile CAPTCHA

**Risco Residual:** Médio-Baixo (rate limiting pode ser contornado com IPs distribuídos)

### 2.5 Manipulação de Sessão de Impersonação
**Descrição:** Atacante tenta estender, criar ou sequestrar sessões de impersonação.

**Mitigações:**
- ✅ Apenas SUPERADMIN_GLOBAL pode criar sessões
- ✅ TTL máximo de 60 minutos (hard cap)
- ✅ Uma sessão ativa por superadmin
- ✅ Todas as sessões imutavelmente auditadas
- ✅ Auto-expiração em validação
- ✅ Ownership verificado em end/validate

**Risco Residual:** Baixíssimo (múltiplas camadas de proteção)

---

## 3. Mitigações Existentes (Sumário)

### 3.1 Row-Level Security (RLS)
| Tabela | Política |
|--------|----------|
| `audit_logs` | SELECT: superadmin OU federation role |
| `document_public_tokens` | SELECT: service_role OU superadmin |
| `federation_roles` | SELECT: próprio usuário OU superadmin |
| `superadmin_impersonations` | ALL: superadmin owns session |
| Todas tabelas de tenant | Escopadas por `tenant_id` |

### 3.2 Tokens Opacos
- UUID v4 não enumerável
- Sem padrão sequencial
- Revogação automática ao revogar documento

### 3.3 Auditoria
- Append-only (`DELETE` e `UPDATE` bloqueados)
- Todos eventos críticos registrados
- Categoria e metadata estruturados
- Eventos federativos exigem `federation_id`

### 3.4 Edge Hardening
- Input validation (Zod ou manual)
- Erros neutros (HTTP 200)
- Rate limiting (Upstash)
- CAPTCHA em endpoints públicos

---

## 4. Riscos Aceitos (Explícitos)

### 4.1 Brute-Force Lento com Rate-Limit
**Descrição:** Atacante com muitos IPs pode contornar rate limiting.

**Justificativa:** Tokens UUID v4 (2^122) tornam enumeração impraticável mesmo com 1M req/s por décadas.

**Monitoramento:** Alertas em audit_logs para padrões anômalos.

### 4.2 DoS em Nível de Infraestrutura
**Descrição:** Ataques DDoS volumétricos estão fora do escopo da aplicação.

**Justificativa:** Responsabilidade do provedor (Cloudflare/Supabase Edge).

**Mitigação Parcial:** Rate limiting reduz impacto de ataques pequenos.

### 4.3 Superadmin Malicioso
**Descrição:** Um SUPERADMIN_GLOBAL pode abusar de seus privilégios.

**Justificativa:** Nível de confiança máximo exigido para o papel.

**Mitigação:** Todas ações auditadas, impersonação limitada a 60min, não há delete de audit.

### 4.4 Comprometimento de Service Role Key
**Descrição:** Se a chave service_role vazar, atacante tem acesso total.

**Justificativa:** Risco inerente a qualquer sistema com admin key.

**Mitigação:** 
- Chave nunca exposta no frontend
- Rotação periódica recomendada
- Monitoramento de padrões anômalos

---

## 5. Matriz de Responsabilidades

| Camada | Responsável | Controles |
|--------|-------------|-----------|
| Autenticação | Supabase Auth | JWT, MFA (futuro), session management |
| Autorização | RLS + Edge Functions | Policies, role checks |
| Auditoria | audit_logs | Imutabilidade, categorização |
| Criptografia | Supabase/Postgres | TLS, encryption at rest |
| Rate Limiting | Upstash Redis | Tokens por IP/user |
| DDoS | Cloudflare | Edge protection |

---

## 6. Revisão e Atualização

- **Frequência:** A cada PI de segurança ou mudança de arquitetura
- **Responsável:** Tech Lead + Security Review
- **Aprovação:** Requer revisão constitucional (SSF)

---

*SAFE GOLD: Este documento é versionado e rastreável. Alterações requerem revisão explícita.*
