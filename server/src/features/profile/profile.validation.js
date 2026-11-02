import { badRequest } from '#common/errors/http-error.js';
import { SYSTEM_ARCHETYPES } from '#pipeline/extraction/index.js';

const MAX_SKILLS = 150;
const MAX_SKILL_LENGTH = 100;
const MAX_CERTIFICATIONS = 50;
const MAX_CERTIFICATION_LENGTH = 100;
const MAX_BUDGET = 10_000_000_000;
const MAX_PREFERRED_ARCHETYPES = 10;
const VALID_ENTITY_TYPES = ['juristic', 'individual'];

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

  // --- entityType ---
  if (body.entityType !== undefined) {
    if (typeof body.entityType !== 'string' || !VALID_ENTITY_TYPES.includes(body.entityType.trim())) {
      errors.entityType = `Entity type must be either 'juristic' or 'individual'.`;
    } else {
      update.entityType = body.entityType.trim();
    }
  }

  // --- preferredArchetypes ---
  if (body.preferredArchetypes !== undefined) {
    if (!Array.isArray(body.preferredArchetypes)) {
      errors.preferredArchetypes = 'Preferred archetypes must be an array.';
    } else {
      const cleaned = [
        ...new Set(
          body.preferredArchetypes
            .filter((a) => typeof a === 'string')
            .map((a) => a.trim().toLowerCase())
            .filter((a) => SYSTEM_ARCHETYPES.includes(a)),
        ),
      ];
      if (cleaned.length > MAX_PREFERRED_ARCHETYPES) {
        errors.preferredArchetypes = `You can save at most ${MAX_PREFERRED_ARCHETYPES} preferred archetypes.`;
      } else {
        update.preferredArchetypes = cleaned;
      }
    }
  }

  // --- maxPastPortfolioTHB ---
  if (body.maxPastPortfolioTHB !== undefined) {
    const n = Number(body.maxPastPortfolioTHB);
    if (!Number.isFinite(n) || n < 0 || n > MAX_BUDGET || !Number.isInteger(n)) {
      errors.maxPastPortfolioTHB = `Max past portfolio must be an integer between 0 and ${MAX_BUDGET.toLocaleString()} THB.`;
    } else {
      update.maxPastPortfolioTHB = n;
    }
  }

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

  // Cross-field: min <= max when both are sent in body (0 means no upper limit)
  if (update.budgetMin !== undefined && update.budgetMax !== undefined) {
    if (update.budgetMax !== 0 && update.budgetMin > update.budgetMax) {
      errors.budgetMin = 'Minimum budget cannot be greater than maximum budget.';
    }
  }

  // --- certifications ---
  if (body.certifications !== undefined) {
    if (!Array.isArray(body.certifications)) {
      errors.certifications = 'Certifications must be an array.';
    } else {
      const cleaned = [
        ...new Set(
          body.certifications
            .filter((c) => typeof c === 'string')
            .map((c) => c.trim())
            .filter((c) => c.length > 0 && c.length <= MAX_CERTIFICATION_LENGTH),
        ),
      ];
      if (cleaned.length > MAX_CERTIFICATIONS) {
        errors.certifications = `You can save at most ${MAX_CERTIFICATIONS} certifications.`;
      } else {
        update.certifications = cleaned;
      }
    }
  }

  // --- matchNotification (FR-14 Preparation) ---
  if (body.matchNotification !== undefined) {
    if (typeof body.matchNotification !== 'object' || body.matchNotification === null || Array.isArray(body.matchNotification)) {
      errors.matchNotification = 'Match notification settings must be an object.';
    } else {
      const mn = body.matchNotification;
      const validatedMn = {};

      if (mn.enabled !== undefined) {
        if (typeof mn.enabled !== 'boolean') {
          errors['matchNotification.enabled'] = 'Enabled must be a boolean.';
        } else {
          validatedMn.enabled = mn.enabled;
        }
      }

      if (mn.minScore !== undefined) {
        const score = Number(mn.minScore);
        if (!Number.isFinite(score) || score < 50 || score > 95) {
          errors['matchNotification.minScore'] = 'Minimum match score must be an integer between 50 and 95.';
        } else {
          validatedMn.minScore = Math.round(score);
        }
      }

      if (mn.frequency !== undefined) {
        const validFreq = ['instant', 'daily', 'weekly'];
        if (typeof mn.frequency !== 'string' || !validFreq.includes(mn.frequency.trim())) {
          errors['matchNotification.frequency'] = "Frequency must be 'instant', 'daily', or 'weekly'.";
        } else {
          validatedMn.frequency = mn.frequency.trim();
        }
      }

      if (mn.includeSubcontract !== undefined) {
        if (typeof mn.includeSubcontract !== 'boolean') {
          errors['matchNotification.includeSubcontract'] = 'includeSubcontract must be a boolean.';
        } else {
          validatedMn.includeSubcontract = mn.includeSubcontract;
        }
      }

      update.matchNotification = validatedMn;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw badRequest('Check the details you entered.', errors);
  }

  return update;
}
