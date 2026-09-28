/**
 * errors.js — small shared error vocabulary so every route returns the
 * same envelope shape: { error: { code, message } }.
 *
 * Added after review feedback: previously every thrown error was mapped
 * to a generic 400/404 with just a message, indistinguishable from each
 * other by machine-readable code. `code` is what a real frontend or a
 * calling service would branch on; `message` is for humans/logs only.
 */

export class AppError extends Error {
  /**
   * @param {string} code - stable, machine-readable identifier, e.g. 'RULE_NOT_FOUND'
   * @param {string} message - human-readable detail
   * @param {number} statusCode - HTTP status this maps to
   */
  constructor(code, message, statusCode) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ValidationError extends AppError {
  constructor(message) {
    super('VALIDATION_ERROR', message, 400);
  }
}

export class NotFoundError extends AppError {
  constructor(message) {
    super('NOT_FOUND', message, 404);
  }
}

/**
 * Fastify route handlers call this in their catch blocks. Known AppErrors
 * map to their own status/code; anything else is an unexpected bug, so it
 * is logged as a 500 rather than silently reported as if it were the
 * caller's fault (a real bug should never come back as "400 bad request").
 *
 * @param {import('fastify').FastifyReply} reply
 * @param {Error} err
 */
export function sendError(reply, err) {
  if (err instanceof AppError) {
    reply.code(err.statusCode);
    return { error: { code: err.code, message: err.message } };
  }
  // Unknown/unexpected error — do not leak internals, but do not disguise
  // it as a validation problem either.
  reply.code(500);
  return { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } };
}
