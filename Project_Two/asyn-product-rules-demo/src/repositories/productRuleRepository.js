/**
 * productRuleRepository — IN-MEMORY STAND-IN for the real Prisma repository.
 *
 * WHY THIS FILE EXISTS: we do not have access to the real leap-api codebase
 * or its Prisma schema (this is a take-home exercise, not a live repo). To
 * still produce runnable, testable code instead of just "trust me" logic,
 * this repository fakes persistence with a plain in-memory array.
 *
 * WHAT WOULD CHANGE IN THE REAL PROJECT:
 * Every function below would become a thin wrapper around
 * `prisma.productRule.findMany(...)`, `.create(...)`, etc. The function
 * SIGNATURES (name, inputs, outputs) are designed to be the real contract —
 * only the body changes when swapped for a real Prisma repository. This is
 * exactly the "repository" layer described in ASYN_Overview.docx: "Contain
 * focused Prisma queries and writes with explicit persistence projections."
 *
 * SECURITY NOTE: every read/write below takes companyId as an explicit,
 * required argument, and every query filters by it. There is no method
 * that returns rules across companies. This mirrors the task's hard
 * requirement: "An admin only sees and edits their own company's rules."
 */

/** @type {Array<{id: string, companyId: string, name: string, matchType: 'NCM_PREFIX'|'KEYWORD', matchValues: string[], description: string|null, active: boolean, createdAt: Date, updatedAt: Date}>} */
const rules = [];

let idCounter = 1;
function nextId() {
  return `rule_${idCounter++}`;
}

/**
 * Fetch every ACTIVE rule for one company, in stable creation order.
 * Stable order matters: it's what makes "first matching rule wins"
 * deterministic (see evaluateInvoiceAgainstRules.js assumption #1).
 *
 * @param {string} companyId
 * @returns {Array<object>}
 */
export function findActiveRulesByCompany(companyId) {
  return rules
    .filter((r) => r.companyId === companyId && r.active)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
}

/**
 * Fetch every rule (active or not) for one company — used by the admin
 * dashboard's rule list screen.
 *
 * @param {string} companyId
 * @returns {Array<object>}
 */
export function findAllRulesByCompany(companyId) {
  return rules
    .filter((r) => r.companyId === companyId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
}

/**
 * Fetch a single rule, but ONLY if it belongs to the given company.
 * Returns null both when the rule doesn't exist AND when it belongs to
 * someone else — callers must not be able to distinguish the two, or
 * that itself leaks whether an id exists in another company.
 *
 * @param {string} id
 * @param {string} companyId
 * @returns {object|null}
 */
export function findRuleByIdForCompany(id, companyId) {
  return rules.find((r) => r.id === id && r.companyId === companyId) ?? null;
}

/**
 * @param {{companyId: string, name: string, matchType: string, matchValues: string[], description?: string}} input
 * @returns {object} the created rule
 */
export function createRule(input) {
  const now = new Date();
  const rule = {
    id: nextId(),
    companyId: input.companyId,
    name: input.name,
    matchType: input.matchType,
    matchValues: input.matchValues,
    description: input.description ?? null,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  rules.push(rule);
  return rule;
}

/**
 * Partial update, still scoped to companyId so one company can never
 * touch another's rule even by guessing an id.
 *
 * @param {string} id
 * @param {string} companyId
 * @param {Partial<{name: string, matchType: string, matchValues: string[], description: string|null, active: boolean}>} patch
 * @returns {object|null} the updated rule, or null if not found for that company
 */
export function updateRuleForCompany(id, companyId, patch) {
  const rule = findRuleByIdForCompany(id, companyId);
  if (!rule) return null;
  Object.assign(rule, patch, { updatedAt: new Date() });
  return rule;
}

/**
 * @param {string} id
 * @param {string} companyId
 * @returns {boolean} true if a rule was deleted
 */
export function deleteRuleForCompany(id, companyId) {
  const index = rules.findIndex((r) => r.id === id && r.companyId === companyId);
  if (index === -1) return false;
  rules.splice(index, 1);
  return true;
}

/** Test-only helper to reset state between test files. Never used in "prod" code paths. */
export function __resetForTests() {
  rules.length = 0;
  idCounter = 1;
}
