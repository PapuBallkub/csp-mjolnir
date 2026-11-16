import { badRequest } from '#common/errors/http-error.js';

const MAX_PROJECT_ID_LENGTH = 64;

/**
 * Validates that projectId is a non-empty string.
 */
export function validateProjectId(projectId) {
  if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
    throw badRequest('กรุณาระบุรหัสโครงการ', { projectId: 'รหัสโครงการต้องไม่เว้นว่าง' });
  }

  const cleaned = projectId.trim();
  if (cleaned.length > MAX_PROJECT_ID_LENGTH) {
    throw badRequest('รหัสโครงการยาวเกินไป', {
      projectId: `รหัสโครงการต้องมีความยาวไม่เกิน ${MAX_PROJECT_ID_LENGTH} ตัวอักษร`,
    });
  }

  return cleaned;
}
