/**
 * budgetRepository — IN-MEMORY STAND-IN, same rationale as the other
 * repositories in this folder (see productRuleRepository.js header).
 *
 * ASSUMPTION (flagged, not confirmed against real schema): budget is
 * tracked per employee, per company, per calendar month ("monthly
 * budget" per Task.docx item 6). The real project may already have an
 * Employee/Budget model with a monthly cap — this stand-in only tracks
 * *consumption*, not the cap itself, since the task only asks what
 * amount consumption should be based on, not how caps are configured.
 */

/** @type {Map<string, number>} key: `${companyId}:${employeeId}:${yyyyMm}` -> consumed amount */
const consumption = new Map();

function key(companyId, employeeId, yyyyMm) {
  return `${companyId}:${employeeId}:${yyyyMm}`;
}

/**
 * @param {string} companyId
 * @param {string} employeeId
 * @param {string} yyyyMm - e.g. "2026-08"
 * @param {number} amount - added to whatever was already consumed this month
 * @returns {number} the new running total for that employee/month
 */
export function addConsumption(companyId, employeeId, yyyyMm, amount) {
  const k = key(companyId, employeeId, yyyyMm);
  const current = consumption.get(k) ?? 0;
  const updated = Math.round((current + amount) * 100) / 100;
  consumption.set(k, updated);
  return updated;
}

/**
 * @param {string} companyId
 * @param {string} employeeId
 * @param {string} yyyyMm
 * @returns {number}
 */
export function getConsumption(companyId, employeeId, yyyyMm) {
  return consumption.get(key(companyId, employeeId, yyyyMm)) ?? 0;
}

/** Test-only helper. */
export function __resetForTests() {
  consumption.clear();
}
