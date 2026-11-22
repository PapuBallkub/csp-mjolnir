// Captures the security log for one test (ADR 0043), instead of letting lines
// reach stdout. Outside the test glob, like accounts.js.

import { setSecurityLogSink } from '#common/logging/security-log.js';

/**
 * @param {import('node:test').TestContext} t - The sink goes back when the test ends
 */
export function captureSecurityLog(t) {
  const captured = [];
  const previous = setSecurityLogSink((line, stream) => captured.push({ line, stream }));
  t.after(() => setSecurityLogSink(previous));

  const lines = () => captured.map(({ line, stream }) => ({ stream, ...JSON.parse(line) }));
  const events = (name) => lines().filter((entry) => entry.event === name);

  return {
    /** Every line exactly as written, for checking what must never appear */
    raw: () => captured.map(({ line }) => line).join('\n'),
    lines,
    events,
    /**
     * The lines for one event, once at least one has arrived. Admin actions
     * log when the response closes, which can be a moment after fetch returns.
     */
    async waitFor(name, { count = 1, timeout = 2000 } = {}) {
      const deadline = Date.now() + timeout;
      while (events(name).length < count && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return events(name);
    },
  };
}
