import { notFound } from '#common/errors/http-error.js';

export function notFoundHandler(req, res, next) {
  next(notFound(`No route for ${req.method} ${req.originalUrl}`));
}
