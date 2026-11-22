import { requestContext, securityEvent } from '#common/logging/security-log.js';

const AUDIT = Symbol('admin audit');

/**
 * One `admin.action` line for every admin write, when its response closes:
 * who, which route, on what, with what result (ADR 0043, ASVS V16.3.2).
 *
 * It's the first handler of each write route, not router-wide middleware,
 * because only there are `req.params` and `req.route` known. A router-wide
 * listener would lose the target on exactly the failures worth seeing: Express
 * puts `req.params` back when a failing request leaves the router.
 *
 * @param {string[]} [picks] - The body fields this route's line keeps. `email`
 *   is logged as its hash; anything else must be a plain value. Never a field
 *   that can carry free text or extracted content.
 */
export function auditAdminAction(picks = []) {
  function auditAdminWrite(req, res, next) {
    const context = requestContext(req);
    const action = `${req.method} ${req.baseUrl}${req.route.path}`;
    const target = Object.values(req.params ?? {})[0];
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const detail = {};
    let email;
    for (const key of picks) {
      if (key === 'email') email = body.email;
      else if (body[key] !== undefined) detail[key] = body[key];
    }
    const userId = req.user?.id;

    // 'close' fires when the response is done, and also when the client goes
    // away first, so an action whose caller hung up still leaves a line
    res.once('close', () => {
      const finished = res.writableFinished;
      securityEvent(
        context,
        'admin.action',
        {
          userId,
          action,
          target,
          email,
          detail,
          status: finished ? res.statusCode : undefined,
          reason: finished ? undefined : 'client_closed',
        },
        { severity: finished && res.statusCode < 400 ? 'INFO' : 'WARNING' },
      );
    });
    next();
  }
  auditAdminWrite[AUDIT] = true;
  return auditAdminWrite;
}

/** Whether a handler is the audit, so a test can check every write route has it. */
export const isAdminAudit = (handler) => handler?.[AUDIT] === true;
