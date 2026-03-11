/**
 * Password Complexity Validation (P1-14)
 *
 * Centralized password validation for all auth flows.
 * Requirements:
 *   - 8-72 characters
 *   - At least 1 uppercase letter
 *   - At least 1 lowercase letter
 *   - At least 1 digit
 *   - No common weak patterns
 */

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

const WEAK_PATTERNS = [
  "12345678", "password", "qwerty", "abcdefgh", "letmein",
  "admin123", "welcome1", "iloveyou", "monkey12", "dragon12",
  "trustno1", "baseball", "shadow12", "master12", "michael1",
];

export function validatePasswordComplexity(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || typeof password !== "string") {
    return { valid: false, errors: ["Senha é obrigatória."] };
  }

  if (password.length < 8) {
    errors.push("A senha deve ter pelo menos 8 caracteres.");
  }

  if (password.length > 72) {
    errors.push("A senha deve ter no máximo 72 caracteres.");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("A senha deve conter pelo menos uma letra maiúscula.");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("A senha deve conter pelo menos uma letra minúscula.");
  }

  if (!/\d/.test(password)) {
    errors.push("A senha deve conter pelo menos um número.");
  }

  if (WEAK_PATTERNS.some((p) => password.toLowerCase().includes(p))) {
    errors.push("Senha muito fraca. Escolha uma senha mais segura.");
  }

  return { valid: errors.length === 0, errors };
}
