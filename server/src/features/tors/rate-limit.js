const MINUTE = 60 * 1000;

// Anyone can open a preview, so the caller's address is all there is to count
// (advanced feature 5, ASVS V2.4.1). A reader opens up to three documents per
// TOR, and a university lab or a mobile carrier's NAT puts many readers behind
// one address, so this is generous: it stops a script, not a person.
export const torRateLimits = {
  preview: { windowMs: 10 * MINUTE, limit: 60 },
};
