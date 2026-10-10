import { badRequest } from '#common/errors/http-error.js';

const MAX_SKILLS = 50;
const MAX_SKILL_LENGTH = 100;
const MAX_BUDGET = 1_000_000_000;
const VALID_SCOPE_SIZES = ['solo', 'small-team', 'firm'];

/**
 * Validates and returns sanitized profile fields. Throws badRequest with
 * field-keyed details on failure (same shape as auth.validation.js).
 *
 * Every field is optional: a PATCH that sends only `skills` leaves the other
 * fields untouched. But when present, each must pass.
 */
export function parseProfileUpdate(body) {
  const errors = {};
  const update = {};

  // --- skills ---
  if (body.skills !== undefined) {
    if (!Array.isArray(body.skills)) {
      errors.skills = 'Skills must be an array.';
    } else {
      const cleaned = [
        ...new Set(
          body.skills
            .filter((s) => typeof s === 'string')
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && s.length <= MAX_SKILL_LENGTH),
        ),
      ];
      if (cleaned.length > MAX_SKILLS) {
        errors.skills = `You can save at most ${MAX_SKILLS} skills.`;
      } else {
        update.skills = cleaned;
      }
    }
  }

  // --- budgetMin & budgetMax ---
  const hasMin = body.budgetMin !== undefined;
  const hasMax = body.budgetMax !== undefined;

  if (hasMin) {
    const n = Number(body.budgetMin);
    if (!Number.isFinite(n) || n < 0 || n > MAX_BUDGET || !Number.isInteger(n)) {
      errors.budgetMin = `Budget minimum must be an integer between 0 and ${MAX_BUDGET.toLocaleString()}.`;
    } else {
      update.budgetMin = n;
    }
  }

  if (hasMax) {
    const n = Number(body.budgetMax);
    if (!Number.isFinite(n) || n < 0 || n > MAX_BUDGET || !Number.isInteger(n)) {
      errors.budgetMax = `Budget maximum must be an integer between 0 and ${MAX_BUDGET.toLocaleString()}.`;
    } else {
      update.budgetMax = n;
    }
  }

  // Cross-field: min <= max when both are sent in body
  if (update.budgetMin !== undefined && update.budgetMax !== undefined) {
    if (update.budgetMin > update.budgetMax) {
      errors.budgetMin = 'Minimum budget cannot be greater than maximum budget.';
    }
  }

  // --- scopeSizes ---
  if (body.scopeSizes !== undefined) {
    if (!Array.isArray(body.scopeSizes)) {
      errors.scopeSizes = 'Scope sizes must be an array.';
    } else {
      const cleaned = [...new Set(body.scopeSizes.filter((s) => VALID_SCOPE_SIZES.includes(s)))];
      const invalid = body.scopeSizes.filter(
        (s) => typeof s === 'string' && !VALID_SCOPE_SIZES.includes(s),
      );
      if (invalid.length > 0) {
        errors.scopeSizes = `Invalid scope sizes: ${invalid.join(', ')}. Accepted: ${VALID_SCOPE_SIZES.join(', ')}.`;
      } else {
        update.scopeSizes = cleaned;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    throw badRequest('Check the details you entered.', errors);
  }

  return update;
}
