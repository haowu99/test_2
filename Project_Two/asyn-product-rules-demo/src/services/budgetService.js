/**
 * budgetService — Task.docx item 6: "The employee's monthly budget
 * consumes the reimbursable amount, not the full invoice value."
 *
 * KEY DECISION: this reads `invoice.reimbursableAmount`, never
 * `invoice.amount`. That single line is the entire feature requirement —
 * everything else here is bookkeeping (which month, which employee).
 *
 * WHY EXISTING INVOICES ARE UNAFFECTED WITHOUT ANY SPECIAL-CASE CODE HERE:
 * the migration (see migration.sql) backfills every pre-existing invoice's
 * reimbursableAmount to equal its amount. So this function never needs an
 * "is this an old invoice?" branch — it always consumes reimbursableAmount,
 * and for old invoices that number happens to equal the full amount. This
 * is the payoff of that earlier design decision: the freeze/backfill
 * happened once, at the data layer, instead of being special-cased in
 * every piece of logic that reads money off an invoice.
 *
 * ASSUMPTION: the invoice input includes an `employeeId` and the invoice's
 * save month is derived from `savedAt` (defaults to "now"). Neither field
 * exists yet in the earlier schema-additions.prisma sketch — flagging
 * here rather than guessing a real Invoice.employeeId column name.
 */

import { addConsumption, getConsumption } from '../repositories/budgetRepository.js';

/**
 * @param {Date} date
 * @returns {string} "YYYY-MM"
 */
function monthKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Record an invoice's reimbursable amount against its employee's budget
 * for the invoice's save month. Intended to be called once, right after
 * `saveInvoiceWithRules` persists the invoice (see invoiceRuleService.js).
 *
 * @param {{companyId: string, employeeId: string, reimbursableAmount: number, savedAt?: Date}} invoice
 * @returns {{month: string, consumedThisMonth: number}}
 */
export function consumeBudgetForInvoice(invoice) {
  const savedAt = invoice.savedAt ?? new Date();
  const month = monthKey(savedAt);
  const consumedThisMonth = addConsumption(
    invoice.companyId,
    invoice.employeeId,
    month,
    invoice.reimbursableAmount,
  );
  return { month, consumedThisMonth };
}

/**
 * @param {string} companyId
 * @param {string} employeeId
 * @param {Date} [date] - defaults to now
 * @returns {number}
 */
export function getMonthlyConsumption(companyId, employeeId, date = new Date()) {
  return getConsumption(companyId, employeeId, monthKey(date));
}
