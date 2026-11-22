import { isProduction } from '#common/config/env.js';
import { HttpError } from '#common/errors/http-error.js';
import { logServerError, securityEvent } from '#common/logging/security-log.js';

// Express 5 forwards a rejected promise from an async handler to here on its
// own, so route handlers need no try/catch or asyncHandler wrapper. The unused
// `next` is required: Express only treats a 4-arity function as an error handler.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status =
    err instanceof HttpError
      ? err.status
      : typeof err.status === 'number'
        ? err.status
        : typeof err.statusCode === 'number'
          ? err.statusCode
          : 500;

  // Unexpected errors keep their stack, as one JSON line on stderr (V16.3.4);
  // a body over the 50 kb limit is an attempt past an input control (V16.3.3).
  // Other 4xx answers are ordinary use and not logged.
  if (status >= 500) {
    logServerError(req, err, status);
  } else if (status === 413) {
    securityEvent(req, 'request.too_large', { status });
  }

  // Production hides what an unexpected failure says, since it can name a
  // collection, a query or a file. An HttpError's message is one we wrote for
  // people ("sign-up by email isn't available, use Google"), so it shows.
  const hidden = status >= 500 && isProduction && !(err instanceof HttpError);

  res.status(status).json({
    error: {
      message: hidden ? 'Internal server error' : err.message,
      ...(err.details ? { details: err.details } : {}),
      // Only our own codes: a database error's numeric code is not for clients
      ...(err instanceof HttpError && typeof err.code === 'string' ? { code: err.code } : {}),
    },
  });
}
