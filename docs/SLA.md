# SLA — Service Level Agreement
# Tatame Pro — Plataforma de Gestão Esportiva

> **Versão:** 1.0.0
> **Data de Vigência:** A definir no primeiro contrato assinado
> **Revisão:** Anual ou mediante solicitação formal

---

## 1. Escopo

Este SLA se aplica ao serviço Tatame Pro na modalidade SaaS, acessível via navegador web, contratado por organizações esportivas (federações, ligas, academias) sob o modelo multi-tenant.

---

## 2. Disponibilidade (Uptime)

### Target de Uptime

| Nível de Plano | Uptime Garantido | Downtime Máximo/Mês |
|---|---|---|
| **Plano Base (Trial / Starter)** | 99,0% | 7h 18m |
| **Plano Profissional** | 99,5% | 3h 39m |
| **Plano Enterprise (a definir)** | 99,9% | 43m 49s |

### Janelas de Manutenção

- **Manutenção programada:** Domingos entre 02h00 e 06h00 (horário de Brasília)
- Avisos com mínimo de **72 horas de antecedência** via e-mail ao responsável técnico da organização
- Manutenções programadas **não contam** para o cálculo de downtime

### Medição

- Uptime medido por ferramenta externa independente (ex: Betterstack, UptimeRobot)
- Intervalo de verificação: a cada 1 minuto
- URL monitorada: health check endpoint do sistema
- Relatórios mensais disponíveis sob solicitação

---

## 3. Tempos de Recuperação

### RTO — Recovery Time Objective

| Tipo de Incidente | RTO (Tempo Máximo para Restauração) |
|---|---|
| Indisponibilidade total (P0) | **4 horas** |
| Degradação severa (P1) | **8 horas** |
| Degradação parcial (P2) | **24 horas** |
| Bug não crítico (P3) | **5 dias úteis** |

### RPO — Recovery Point Objective

| Dado | RPO (Perda Máxima de Dados Tolerada) |
|---|---|
| Banco de dados principal | **24 horas** (Point-in-Time Recovery via Supabase) |
| Documentos enviados (Storage) | **24 horas** |
| Logs de auditoria | **0** (imutáveis por design — hash chain) |

> **Nota:** O Supabase Pro/Team habilita PITR (Point-in-Time Recovery) com retenção de até 7 dias. Verificar configuração ativa no dashboard do projeto.

---

## 4. Classificação de Incidentes

| Prioridade | Definição | Exemplo |
|---|---|---|
| **P0 — Crítico** | Sistema totalmente indisponível ou perda de dados | Banco de dados inacessível, falha total de autenticação |
| **P1 — Alto** | Fluxo crítico de negócio impactado | Filiações não podem ser aprovadas, pagamentos falhando |
| **P2 — Médio** | Feature degradada mas workaround existe | Filtro de busca lento, relatório com erro |
| **P3 — Baixo** | Bug cosmético ou de baixo impacto | Texto incorreto, ícone errado |

---

## 5. Canais e Tempos de Resposta

| Prioridade | Canal de Reporte | Tempo de 1ª Resposta | Atualização de Status |
|---|---|---|---|
| P0 | E-mail urgente + WhatsApp | **30 minutos** | A cada 1 hora |
| P1 | E-mail | **2 horas** | A cada 4 horas |
| P2 | E-mail ou sistema de suporte | **1 dia útil** | A cada 2 dias úteis |
| P3 | Sistema de suporte | **3 dias úteis** | Na resolução |

---

## 6. Créditos de Serviço

Caso o uptime mensal fique abaixo do garantido (excluindo manutenções programadas e exclusões):

| Uptime Real no Mês | Crédito Aplicável |
|---|---|
| 99,0% – 99,5% (Plano Profissional) | 10% da mensalidade do mês |
| 95,0% – 99,0% | 25% da mensalidade do mês |
| Abaixo de 95,0% | 50% da mensalidade do mês |

- Créditos são aplicados na próxima fatura
- Solicitação deve ser feita em até **15 dias** após o incidente
- Créditos não são convertíveis em dinheiro

---

## 7. Exclusões (Não Contabilizadas como Downtime)

Os seguintes eventos **não** geram crédito de SLA:

- Manutenções programadas comunicadas com antecedência
- Incidentes causados por terceiros (Supabase, Stripe, Cloudflare, provedores de internet do cliente)
- Ataques de negação de serviço (DDoS) em andamento
- Ações do próprio cliente (configurações incorretas, uso indevido da API)
- Force majeure (desastres naturais, regulamentações governamentais)
- Limitações do plano contratado (ex: funcionalidades de evento requerem plano Profissional)

---

## 8. Responsabilidades do Cliente

Para que o SLA seja aplicável, o cliente deve:

- Manter dados de contato do responsável técnico atualizados
- Reportar incidentes dentro do prazo estabelecido
- Cumprir com as obrigações de pagamento em dia
- Não realizar integrações ou automações que violem os Termos de Uso

---

## 9. Backup e Retenção de Dados

| Dado | Estratégia | Retenção |
|---|---|---|
| Banco de dados (PostgreSQL) | Supabase automated backups + PITR | 7 dias (PITR) + 30 dias (snapshots) |
| Documentos de atletas (Storage) | Supabase Storage com replicação | Enquanto o tenant estiver ativo + 90 dias após cancelamento |
| Logs de auditoria | Registros imutáveis (hash chain) | Mínimo 5 anos (requisito esportivo) |
| Dados de billing (Stripe) | Mantidos pelo Stripe | Conforme regulamentação financeira |

---

## 10. Contato e Escalonamento

| Nível | Contato | Quando Acionar |
|---|---|---|
| Suporte N1 | suporte@tatame.app | Dúvidas e P3 |
| Suporte N2 | tech@tatame.app | P2 e P1 sem resolução em 4h |
| Escalação executiva | Responsável de Produto | P0 ou P1 sem resolução em 8h |

---

## 11. Revisão e Vigência

- Este SLA entra em vigor na data de assinatura do contrato de serviço
- Revisado anualmente ou mediante alterações substanciais na infraestrutura
- Alterações comunicadas com **30 dias de antecedência**
- Versão atual sempre disponível em `/docs/SLA.md` no repositório do projeto

---

## Changelog

| Versão | Data | Alteração |
|---|---|---|
| 1.0.0 | 2026-03-10 | Versão inicial — definição de uptime, RTO, RPO, créditos e exclusões |
