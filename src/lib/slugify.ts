/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔗 SLUGIFY — URL-SAFE SLUG GENERATOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Utilitário centralizado para geração de slugs URL-safe.
 * Usado em formulários de criação de organizações e Edge Functions.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Palavras reservadas que não podem ser usadas como slugs.
 * Estas rotas são usadas pelo sistema e conflitariam com tenants.
 */
const RESERVED_SLUGS = [
  'about',
  'admin',
  'api',
  'app',
  'auth',
  'forgot-password',
  'help',
  'identity',
  'join',
  'login',
  'logout',
  'portal',
  'reset-password',
  'signup',
  'verify',
] as const;

/**
 * Gera slug URL-safe a partir de texto.
 *
 * Transformações:
 * - Converte para minúsculas
 * - Remove acentos (NFD normalization)
 * - Substitui espaços e caracteres especiais por hífen
 * - Remove hífens duplicados
 * - Remove hífens no início e fim
 *
 * @example
 * slugify("+FIGHT CT - Jiu-Jitsu") // → "fight-ct-jiu-jitsu"
 * slugify("Academia São Paulo") // → "academia-sao-paulo"
 * slugify("") // → ""
 */
export function slugify(text: string): string {
  if (!text) return '';

  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9]+/g, '-')     // Substitui não-alfanuméricos por hífen
    .replace(/-+/g, '-')              // Remove hífens duplicados
    .replace(/^-+|-+$/g, '');         // Remove hífens nas pontas
}

/**
 * Verifica se um slug é válido (não vazio e não reservado).
 *
 * @example
 * isValidSlug("minha-academia") // → true
 * isValidSlug("admin") // → false
 * isValidSlug("") // → false
 */
export function isValidSlug(slug: string): boolean {
  if (!slug || slug.length === 0) return false;
  return !RESERVED_SLUGS.includes(slug.toLowerCase() as typeof RESERVED_SLUGS[number]);
}

/**
 * Lista de slugs reservados para validação externa.
 */
export const reservedSlugs = RESERVED_SLUGS;
