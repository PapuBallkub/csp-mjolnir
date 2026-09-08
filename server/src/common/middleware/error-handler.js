import { isProduction } from '#common/config/env.js';
import { HttpError } from '#common/errors/http-error.js';

// Express 5 forwards a rejected promise from an async handler to here on its
// own, so route handlers need no try/catch or asyncHandler wrapper. The unused
// `next` is required: Express only treats a 4-arity function as an error handler.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err instanceof HttpError ? err.status : 500;

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    error: {
      message: status >= 500 && isProduction ? 'Internal server error' : err.message,
      ...(err.details ? { details: err.details } : {}),
    },
  });
}
