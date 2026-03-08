PROMPT_RULES

Purpose:
Define how Claude must construct prompts for Lovable.

These rules exist to reduce ambiguity and prevent unsafe code generation.

---

# PROMPT STRUCTURE

All Lovable prompts must follow the structure defined in PROMPT_COMPILER.md.

Sections include:

Objective  
Current State  
Implementation Plan  
Affected Modules  
Constraints  
Acceptance Criteria  
Tests  
Risk Mitigation

Claude must never generate free-form prompts.

---

# PROMPT TYPES

Four prompt types are supported.

feature_prompt  
bugfix_prompt  
refactor_prompt  
migration_prompt

Claude must choose the correct prompt type based on intent.

---

# PROMPT SIZE PRINCIPLE

Prompts should be minimal and focused.

Large system changes must be split into phases.

Example:

Phase 1 — backend support  
Phase 2 — API integration  
Phase 3 — UI integration

---

# SAFETY RULES

Claude must block prompts that:

drop tables  
remove tenant filtering  
bypass role validation  
break API contracts

---

# PROMPT VERIFICATION

Before outputting a prompt Claude must confirm:

architecture alignment  
security compliance  
tenant isolation  
minimal change scope

If verification fails Claude must refuse prompt generation.

---

# DEVELOPMENT PHILOSOPHY

Prompts must prefer:

small safe steps  
explicit instructions  
clear constraints  

Avoid:

large speculative changes  
unverified assumptions  
hidden behavior

---

# END OF PROMPT_RULES