/**
 * productRuleService — business logic for admin rule management.
 *
 * SECURITY PRINCIPLE (non-negotiable, per Task.docx + ASYN_Overview.docx):
 * `companyId` here always means "the authenticated admin's own company",
 * taken from the session/auth context — NEVER from request body/query
 * params. Every function signature below takes it as a required argument
 * precisely so a route handler cannot forget to pass it. In the real
 * leap-api, `companyId` would come from `request.user.companyId` (or
 * equivalent) set by the auth middleware, not from client input.
 */

import {
  createRule,
  deleteRuleForCompany,
  findAllRulesByCompany,
  findRuleByIdForCompany,
  updateRuleForCompany,
} from '../repositories/productRuleRepository.js';
import { NotFoundError, ValidationError } from '../errors.js';

const VALID_MATCH_TYPES = new Set(['NCM_PREFIX', 'KEYWORD']);

/**
 * @param {{name: string, matchType: string, matchValues: string[], description?: string}} input
 * @throws {ValidationError}
 */
function assertValidRuleInput(input) {
  if (!input || !input.name || !input.name.trim()) {
    throw new ValidationError('name is required');
  }
  if (!VALID_MATCH_TYPES.has(input.matchType)) {
    throw new ValidationError(`matchType must be one of ${[...VALID_MATCH_TYPES].join(', ')}`);
  }
  assertValidMatchValues(input.matchValues);
}

/**
 * A rule now covers a LIST of values (e.g. every NCM code for
 * "alcohol"), not just one — see evaluateInvoiceAgainstRules.js header
 * for why. Every entry must be a real, non-blank string; the list
 * itself must not be empty (an empty list would never match anything,
 * which is almost certainly not what an admin intended when creating
 * a rule).
 *
 * @param {unknown} matchValues
 * @throws {ValidationError}
 */
function assertValidMatchValues(matchValues) {
  if (!Array.isArray(matchValues) || matchValues.length === 0) {
    throw new ValidationError('matchValues must be a non-empty array of strings');
  }
  for (const value of matchValues) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new ValidationError('matchValues cannot contain blank entries');
    }
  }
}

/**
 * Trims every value and drops exact duplicates, preserving first-seen
 * order. Called right before persisting, not during validation, so
 * validation errors still point at the user's original input.
 * @param {string[]} matchValues
 * @returns {string[]}
 */
function normalizeMatchValues(matchValues) {
  const seen = new Set();
  const result = [];
  for (const raw of matchValues) {
    const trimmed = raw.trim();
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

/**
 * @param {string} companyId - authenticated admin's company, from auth context
 * @returns {Array<object>}
 */
export function listRules(companyId) {
  return findAllRulesByCompany(companyId);
}

/**
 * @param {string} companyId
 * @param {{name: string, matchType: string, matchValues: string[], description?: string}} input
 * @returns {object}
 */
export function createProductRule(companyId, input) {
  assertValidRuleInput(input);
  return createRule({ ...input, matchValues: normalizeMatchValues(input.matchValues), companyId });
}

/**
 * @param {string} companyId
 * @param {string} ruleId
 * @param {Partial<{name: string, matchType: string, matchValues: string[], description: string|null, active: boolean}>} patch
 * @returns {object}
 * @throws {Error} if the rule doesn't exist for this company (route layer -> 404)
 */
/**
 * @param {Partial<{name: string, matchType: string, matchValues: string[]}>} patch
 * @throws {ValidationError}
 */
function assertValidPatch(patch) {
  // Review fix: previously only matchType was validated on PATCH — a
  // request like { name: "   " } or { matchValues: [] } passed straight
  // through and silently blanked out a working rule's business fields.
  if (patch.name !== undefined && !patch.name.trim()) {
    throw new ValidationError('name cannot be blank');
  }
  if (patch.matchType !== undefined && !VALID_MATCH_TYPES.has(patch.matchType)) {
    throw new ValidationError(`matchType must be one of ${[...VALID_MATCH_TYPES].join(', ')}`);
  }
  if (patch.matchValues !== undefined) {
    assertValidMatchValues(patch.matchValues);
  }
}

export function updateProductRule(companyId, ruleId, patch) {
  assertValidPatch(patch);
  const normalizedPatch = patch.matchValues !== undefined
    ? { ...patch, matchValues: normalizeMatchValues(patch.matchValues) }
    : patch;
  const updated = updateRuleForCompany(ruleId, companyId, normalizedPatch);
  if (!updated) {
    throw new NotFoundError('Rule not found');
  }
  return updated;
}

/** Convenience wrapper — "deactivate" is just active:false, per NOTES.md's plan. */
export function deactivateProductRule(companyId, ruleId) {
  return updateProductRule(companyId, ruleId, { active: false });
}

export function activateProductRule(companyId, ruleId) {
  return updateProductRule(companyId, ruleId, { active: true });
}

/**
 * @param {string} companyId
 * @param {string} ruleId
 * @throws {NotFoundError} if the rule doesn't exist for this company
 */
export function deleteProductRule(companyId, ruleId) {
  const deleted = deleteRuleForCompany(ruleId, companyId);
  if (!deleted) {
    throw new NotFoundError('Rule not found');
  }
}

/** Exposed for the invoice preview/save services below. */
export function getRuleOrThrow(companyId, ruleId) {
  const rule = findRuleByIdForCompany(ruleId, companyId);
  if (!rule) throw new NotFoundError('Rule not found');
  return rule;
}
