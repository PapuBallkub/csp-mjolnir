import { toPublicUser } from '#features/auth/auth.service.js';

import { parseProfileUpdate } from './profile.validation.js';
import { updateProfile } from './profile.service.js';

export async function update(req, res) {
  const fields = parseProfileUpdate(req.body);

  // When nothing passes validation (empty body or all fields filtered out),
  // return the current user rather than a pointless no-op write.
  if (Object.keys(fields).length === 0) {
    return res.json({ user: req.user });
  }

  const user = await updateProfile(req.user.id, fields);
  res.json({ user: toPublicUser(user) });
}
