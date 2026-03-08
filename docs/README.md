Tatame Pro Engineering Documentation

This directory defines the engineering governance of the Tatame Pro platform.

---

## AI Engineering Brain

Located in `/ai`.

Defines how AI agents must interpret the system.

Files:

- SYSTEM_CONTEXT.md
- ARCHITECTURE_CONTEXT.md
- DOMAIN_MODELS.md
- PROMPT_RULES.md
- AGENT_PLAYBOOK.md

---

## Engineering Governance

Defines system architecture and engineering standards.

Files:

- SYSTEM_MAP.md
- SYSTEM_ENTITIES.md
- PRODUCT_MODULES.md
- ENGINEERING_GUARDRAILS.md
- AI_DEVELOPMENT_WORKFLOW.md

---

## Prompt Infrastructure

Defines how Claude must generate prompts for Lovable.

Files:

- PROMPT_COMPILER.md
- REPOSITORY_ANALYSIS_PROMPT.md

Templates:

- prompts/FEATURE_PROMPT_TEMPLATE
- prompts/BUGFIX_PROMPT_TEMPLATE
- prompts/REFACTOR_PROMPT_TEMPLATE
- prompts/MIGRATION_PROMPT_TEMPLATE

---

## Purpose

This structure ensures that AI-assisted development remains:

- deterministic
- safe
- architecture-aligned
- efficient in Lovable token usage.