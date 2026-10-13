import { badRequest } from '#common/errors/http-error.js';

const MAX_PROJECT_ID_LENGTH = 64;

/**
 * Validates that projectId is a non-empty string.
 */
export function validateProjectId(projectId) {
  if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
    throw badRequest('Project ID is required.', { projectId: 'Project ID cannot be empty.' });
  }

  const cleaned = projectId.trim();
  if (cleaned.length > MAX_PROJECT_ID_LENGTH) {
    throw badRequest('Project ID is too long.', {
      projectId: `Project ID must not exceed ${MAX_PROJECT_ID_LENGTH} characters.`,
    });
  }

  return cleaned;
}
