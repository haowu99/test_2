/**
 * invoiceRuleService — the preview and save flows from Task.docx, item 2 & 3.
 *
 * BOTH previewInvoice() and saveInvoice() below call the exact same
 * evaluateInvoiceAgainstRules() from evaluateInvoiceAgainstRules.js — this
 * is the whole point of that function being pure and separate. It removes
 * the "preview says OK, save says blocked" class of bug by construction:
 * there is only one place the matching logic lives.
 */

import { findActiveRulesByCompany } from '../repositories/productRuleRepository.js';
import { saveInvoice as persistInvoice } from '../repositories/invoiceRepository.js';
import {
  computeReimbursableAmount,
  evaluateInvoiceAgainstRules,
} from '../evaluateInvoiceAgainstRules.js';
import { consumeBudgetForInvoice } from './budgetService.js';

/**
 * Preview: read active rules, evaluate, return — no writes.
 * Task.docx: "on the preview, so the user sees the warning before saving".
 *
 * @param {string} companyId
 * @param {{amount: number, items: Array<{id: string, description: string, ncm?: string, valorTotal: number}>}} invoiceInput
 * @returns {{amount: number, reimbursableAmount: number, items: Array<object>}}
 */
export function previewInvoice(companyId, invoiceInput) {
  const rules = findActiveRulesByCompany(companyId);
  const evaluations = evaluateInvoiceAgainstRules(invoiceInput.items, rules);
  const reimbursableAmount = computeReimbursableAmount(
    invoiceInput.amount,
    invoiceInput.items,
    evaluations,
  );

  return buildInvoiceView(invoiceInput, evaluations, reimbursableAmount);
}

/**
 * Save: RE-READ active rules from the repository (never trust a
 * previously-computed preview result — Task.docx: "again on save, reading
 * the rules fresh from the database"), evaluate again, then persist the
 * frozen result. Once this returns, later rule changes never touch this
 * invoice again — there is no re-evaluation path anywhere in this codebase.
 *
 * TRANSACTION BOUNDARY (review flag, deliberately not "fixed" here): in a
 * real Prisma implementation, `persistInvoice` (creating the invoice +
 * its items) and `consumeBudgetForInvoice` (updating budget consumption)
 * should run inside one `prisma.$transaction([...])`, so a failure in the
 * second write can never leave a saved invoice with no matching budget
 * entry. This in-memory demo repository has no transaction primitive to
 * wrap — there is nothing real to roll back, so simulating one here would
 * just be theater, not proof of anything. The correct fix belongs at the
 * repository layer once real Prisma repositories exist; this function is
 * already structured so that swap is contained (both writes happen here,
 * back to back, in the one place a `$transaction` wrapper would go).
 *
 * @param {string} companyId
 * @param {{amount: number, items: Array<{id: string, description: string, ncm?: string, valorTotal: number}>}} invoiceInput
 * @returns {object} the persisted invoice, id included
 */
export function saveInvoiceWithRules(companyId, invoiceInput) {
  const rules = findActiveRulesByCompany(companyId); // fresh read, deliberately not reused from preview
  const evaluations = evaluateInvoiceAgainstRules(invoiceInput.items, rules);
  const reimbursableAmount = computeReimbursableAmount(
    invoiceInput.amount,
    invoiceInput.items,
    evaluations,
  );

  const itemsWithFlags = invoiceInput.items.map((item, index) => {
    const evaluation = evaluations[index];
    return {
      ...item,
      blocked: evaluation.blocked,
      blockedByRuleId: evaluation.blockedByRuleId,
      blockedByRuleName: evaluation.blockedByRuleName,
    };
  });

  const saved = persistInvoice({
    companyId,
    employeeId: invoiceInput.employeeId,
    amount: invoiceInput.amount,
    reimbursableAmount,
    items: itemsWithFlags,
  });

  // Budget consumption is wired here, right after the invoice is durably
  // saved — Task.docx item 6: "budget consumes the reimbursable amount,
  // not the full invoice value." Deliberately uses `saved.reimbursableAmount`
  // (what actually got persisted) rather than the locally-computed
  // `reimbursableAmount` variable, so budget consumption can never drift
  // from what the invoice record itself says, even if persistInvoice ever
  // adds its own rounding/validation in a real Prisma implementation.
  consumeBudgetForInvoice({
    companyId,
    employeeId: invoiceInput.employeeId,
    reimbursableAmount: saved.reimbursableAmount,
    savedAt: saved.createdAt,
  });

  return saved;
}

/** Shared response shape for the preview path (save returns the persisted row instead). */
function buildInvoiceView(invoiceInput, evaluations, reimbursableAmount) {
  const items = invoiceInput.items.map((item, index) => {
    const evaluation = evaluations[index];
    return {
      ...item,
      blocked: evaluation.blocked,
      blockedByRuleId: evaluation.blockedByRuleId,
      blockedByRuleName: evaluation.blockedByRuleName,
    };
  });

  return {
    amount: invoiceInput.amount,
    reimbursableAmount,
    items,
  };
}
