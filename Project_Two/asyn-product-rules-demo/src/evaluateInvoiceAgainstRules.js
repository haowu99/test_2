/**
 * evaluateInvoiceAgainstRules — the single source of truth for which
 * invoice items are blocked by which company product rule.
 *
 * This function is intentionally pure: no database access, no I/O, no
 * awareness of Prisma models. Both the preview endpoint and the save
 * endpoint call this same function so their behavior can never drift
 * apart (a real risk if the matching logic were duplicated in two
 * route handlers).
 *
 * UPDATED (per product feedback, 2026-09-10): a rule now holds a LIST
 * of match values (`matchValues: string[]`), not a single one. Reason:
 * a real-world category like "alcohol" or "tobacco" maps to several
 * NCM codes in Brazil's official tax classification, not one — and the
 * product owner does not want a company admin to have to manually look
 * up and add every individual code by hand as separate rules. A rule
 * now matches if the item matches ANY value in the list.
 *
 * ASSUMPTIONS (see NOTES.md — confirm with the team, easy to change here
 * without touching callers):
 *
 *   1. "Which rule blocked it" — when an item matches more than one
 *      active rule, this picks the FIRST matching rule in the order
 *      the `rules` array was given. The caller controls that order
 *      (e.g. by sorting on createdAt before calling this function).
 *
 *   2. Keyword matching is plain substring matching, per the task's
 *      literal wording ("the rule value appears anywhere in the
 *      product name") — NOT whole-word matching. A rule for "cerveja"
 *      will also match a product named "cervejaria". If whole-word
 *      matching is wanted instead, only `matchesKeywordRule` below
 *      needs to change.
 *
 *   3. Inactive rules (`active: false`) are always ignored, regardless
 *      of caller intent — there is no code path that evaluates against
 *      an inactive rule.
 *
 *   4. A rule's `matchValues` is a non-empty list of strings (validated
 *      at the service layer, see productRuleService.js) — this
 *      function does not itself reject an empty list, it simply never
 *      matches anything for one (see "no value in the list matches"
 *      behavior below), fail-closed rather than fail-open.
 */

import { normalizeNcm, normalizeText } from './normalize.js';
import { nonNegative, round2 } from './money.js';

/**
 * @typedef {Object} InvoiceItemInput
 * @property {string} id
 * @property {string} description
 * @property {string} [ncm]
 * @property {number} valorTotal
 */

/**
 * @typedef {Object} ProductRuleInput
 * @property {string} id
 * @property {string} name
 * @property {'NCM_PREFIX'|'KEYWORD'} matchType
 * @property {string[]} matchValues
 * @property {boolean} active
 */

/**
 * @typedef {Object} ItemEvaluation
 * @property {string} itemId
 * @property {boolean} blocked
 * @property {string|null} blockedByRuleId
 * @property {string|null} blockedByRuleName
 */

/**
 * @param {InvoiceItemInput} item
 * @param {ProductRuleInput} rule
 * @returns {boolean}
 */
function matchesNcmPrefixRule(item, rule) {
  if (!item.ncm) return false;
  const itemNcm = normalizeNcm(item.ncm);
  return (rule.matchValues ?? []).some((value) => {
    const prefix = normalizeNcm(value);
    return prefix.length > 0 && itemNcm.startsWith(prefix);
  });
}

/**
 * @param {InvoiceItemInput} item
 * @param {ProductRuleInput} rule
 * @returns {boolean}
 */
function matchesKeywordRule(item, rule) {
  const description = normalizeText(item.description);
  return (rule.matchValues ?? []).some((value) => {
    const keyword = normalizeText(value);
    return keyword.length > 0 && description.includes(keyword);
  });
}

/**
 * @param {InvoiceItemInput} item
 * @param {ProductRuleInput} rule
 * @returns {boolean}
 */
function matchesRule(item, rule) {
  switch (rule.matchType) {
    case 'NCM_PREFIX':
      return matchesNcmPrefixRule(item, rule);
    case 'KEYWORD':
      return matchesKeywordRule(item, rule);
    default:
      // An unknown matchType should never silently match everything -
      // fail closed (never blocks) rather than fail open.
      return false;
  }
}

/**
 * Evaluate every item against every active rule.
 *
 * @param {InvoiceItemInput[]} items
 * @param {ProductRuleInput[]} rules
 * @returns {ItemEvaluation[]} One entry per input item, same order as `items`.
 */
export function evaluateInvoiceAgainstRules(items, rules) {
  const activeRules = rules.filter((rule) => rule.active);

  return items.map((item) => {
    const matchedRule = activeRules.find((rule) => matchesRule(item, rule));

    if (!matchedRule) {
      return {
        itemId: item.id,
        blocked: false,
        blockedByRuleId: null,
        blockedByRuleName: null,
      };
    }

    return {
      itemId: item.id,
      blocked: true,
      blockedByRuleId: matchedRule.id,
      blockedByRuleName: matchedRule.name,
    };
  });
}

/**
 * Derive the reimbursable amount for an invoice, per the task
 * definition: invoice amount minus the value of every blocked item.
 * Never mutates or recomputes `invoiceAmount` itself — that stays the
 * fiscal value of the document.
 *
 * @param {number} invoiceAmount
 * @param {InvoiceItemInput[]} items
 * @param {ItemEvaluation[]} evaluations Output of evaluateInvoiceAgainstRules,
 *   same order/length as `items`.
 * @returns {number}
 */
export function computeReimbursableAmount(invoiceAmount, items, evaluations) {
  const blockedTotal = items.reduce((sum, item, index) => {
    const evaluation = evaluations[index];
    if (evaluation && evaluation.itemId === item.id && evaluation.blocked) {
      return sum + item.valorTotal;
    }
    return sum;
  }, 0);

  // Guard against floating-point noise (e.g. 32.41 - 32.41 producing
  // -0.000000000001) by rounding to 2 decimal places, matching standard
  // currency precision. Also floored at 0: this should never trigger
  // under normal operation (blocked items are a subset of invoice items,
  // so blockedTotal <= invoiceAmount always holds for internally
  // consistent input) — it exists as a defensive floor against malformed
  // upstream data, not as a business rule of its own.
  return nonNegative(round2(invoiceAmount - blockedTotal));
}
