/**
 * money.js — tiny, centralized helpers for monetary arithmetic.
 *
 * REVIEW FLAG, DELIBERATELY NOT "FIXED" HERE: this codebase represents
 * money as plain JavaScript `number`. For a real financial system backed
 * by Prisma/MySQL, monetary columns should be `Decimal` (Prisma's
 * arbitrary-precision type), not float-backed numbers — JS `number` can
 * silently misrepresent values like 0.1 + 0.2. Introducing a real
 * decimal library (e.g. decimal.js) here, with no real persistence layer
 * to round-trip through, would add complexity without adding proof of
 * anything. What CAN be fixed at this layer regardless of the underlying
 * type is: (1) always round to 2dp at money boundaries, and (2) never let
 * a computed amount go negative. Both are done here, centrally, so the
 * business logic that calls these never has to remember to do it inline.
 */

/**
 * Round to 2 decimal places (standard currency precision), avoiding
 * floating-point artifacts like `-0` or `9.999999999998`.
 * @param {number} value
 * @returns {number}
 */
export function round2(value) {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded; // normalizes -0 to 0
}

/**
 * Clamp to a non-negative amount. Used for reimbursableAmount: even
 * though it should never mathematically go negative in normal operation
 * (blocked items are a subset of an invoice's items), this is a defensive
 * floor against malformed input (e.g. item totals that don't reconcile
 * with the invoice's fiscal amount) rather than trusting upstream data
 * is always internally consistent.
 * @param {number} value
 * @returns {number}
 */
export function nonNegative(value) {
  return value < 0 ? 0 : value;
}
