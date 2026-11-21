const HOUR = 60 * 60 * 1000;

// Each request lands in the admins' review queue, so this caps how much one
// account can add to it (threat-model T12, ASVS V2.4.1). Counted per account,
// not per address: only signed-in users can ask, and a lab's shared address
// shouldn't make one student's requests spend another's.
export const technologyRateLimits = {
  technologyRequest: { windowMs: 24 * HOUR, limit: 20 },
};
