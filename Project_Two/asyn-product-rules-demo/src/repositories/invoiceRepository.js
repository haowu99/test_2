/**
 * invoiceRepository — IN-MEMORY STAND-IN, same rationale as
 * productRuleRepository.js. Represents the Invoice + InvoiceItem tables
 * described in schema-additions.prisma.
 */

/** @type {Array<object>} */
const invoices = [];
let idCounter = 1;

/**
 * @param {{companyId: string, amount: number, reimbursableAmount: number, items: Array<object>}} input
 * @returns {object} the saved invoice, including its generated id
 */
export function saveInvoice(input) {
  const invoice = {
    id: `invoice_${idCounter++}`,
    companyId: input.companyId,
    employeeId: input.employeeId,
    amount: input.amount,
    reimbursableAmount: input.reimbursableAmount,
    items: input.items,
    createdAt: new Date(),
  };
  invoices.push(invoice);
  return invoice;
}

/**
 * @param {string} id
 * @returns {object|null}
 */
export function findInvoiceById(id) {
  return invoices.find((inv) => inv.id === id) ?? null;
}

/** Test-only helper. */
export function __resetForTests() {
  invoices.length = 0;
  idCounter = 1;
}
