/**
 * erpSendService — Task.docx item 5: send the RE I M B U R S A B L E amount
 * to the ERP, never the raw invoice amount, and never a zero-value entry.
 *
 * In the real project this would call the actual VHSYS ERP adapter
 * mentioned in ASYN_Overview.docx ("External boundaries include ... a
 * VHSYS ERP adapter"). Here `erpClient` is injected so this logic can be
 * unit-tested without a real HTTP call — same "injectable HTTP client"
 * pattern the overview doc says the real API already uses.
 */

export class InvoiceNotReimbursableError extends Error {
  constructor(invoiceId) {
    super(`Invoice ${invoiceId} cannot be sent: reimbursable amount is 0`);
    this.name = 'InvoiceNotReimbursableError';
    this.invoiceId = invoiceId;
  }
}

/**
 * Send a single invoice. Refuses (throws) instead of sending a 0-value
 * entry when every item was blocked.
 *
 * @param {{id: string, reimbursableAmount: number}} invoice
 * @param {{send: (invoiceId: string, amount: number) => Promise<void>}} erpClient
 */
export async function sendInvoiceToErp(invoice, erpClient) {
  if (invoice.reimbursableAmount <= 0) {
    throw new InvoiceNotReimbursableError(invoice.id);
  }
  await erpClient.send(invoice.id, invoice.reimbursableAmount);
}

/**
 * Folder/batch send — Task.docx: "Inside a folder send, skip that invoice
 * and keep sending the rest." One bad invoice must never abort the batch.
 *
 * @param {Array<{id: string, reimbursableAmount: number}>} invoices
 * @param {{send: (invoiceId: string, amount: number) => Promise<void>}} erpClient
 * @returns {Promise<{sent: string[], skipped: string[]}>}
 */
export async function sendFolderToErp(invoices, erpClient) {
  const sent = [];
  const skipped = [];

  for (const invoice of invoices) {
    try {
      await sendInvoiceToErp(invoice, erpClient);
      sent.push(invoice.id);
    } catch (err) {
      if (err instanceof InvoiceNotReimbursableError) {
        skipped.push(invoice.id);
        continue;
      }
      // A real network/provider error is NOT the same as "nothing to send" -
      // re-throwing here is a deliberate choice worth confirming with the
      // team: should a genuine ERP outage also just skip-and-continue, or
      // abort the whole batch? Left as a re-throw (fail loud) for now since
      // silently swallowing real errors could hide a systemic ERP problem.
      throw err;
    }
  }

  return { sent, skipped };
}
