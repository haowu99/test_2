import { describe, expect, it, vi } from 'vitest';

import {
  InvoiceNotReimbursableError,
  sendFolderToErp,
  sendInvoiceToErp,
} from '../src/services/erpSendService.js';

function fakeErpClient() {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

describe('sendInvoiceToErp', () => {
  it('sends the reimbursable amount, not the raw invoice amount', async () => {
    const erp = fakeErpClient();
    await sendInvoiceToErp({ id: 'inv-1', reimbursableAmount: 100 }, erp);
    expect(erp.send).toHaveBeenCalledWith('inv-1', 100);
  });

  it('refuses instead of sending a zero-value entry', async () => {
    const erp = fakeErpClient();
    await expect(sendInvoiceToErp({ id: 'inv-1', reimbursableAmount: 0 }, erp)).rejects.toThrow(
      InvoiceNotReimbursableError,
    );
    expect(erp.send).not.toHaveBeenCalled();
  });
});

describe('sendFolderToErp — one bad invoice never aborts the batch', () => {
  it('skips fully-blocked invoices and keeps sending the rest', async () => {
    const erp = fakeErpClient();
    const invoices = [
      { id: 'a', reimbursableAmount: 100 },
      { id: 'b', reimbursableAmount: 0 },
      { id: 'c', reimbursableAmount: 50 },
      { id: 'd', reimbursableAmount: 200 },
    ];

    const result = await sendFolderToErp(invoices, erp);

    expect(result.sent).toEqual(['a', 'c', 'd']);
    expect(result.skipped).toEqual(['b']);
    expect(erp.send).toHaveBeenCalledTimes(3);
  });

  it('a real ERP/network error still aborts (is not silently swallowed like a skip)', async () => {
    const erp = { send: vi.fn().mockRejectedValue(new Error('ERP is down')) };
    const invoices = [{ id: 'a', reimbursableAmount: 100 }];

    await expect(sendFolderToErp(invoices, erp)).rejects.toThrow('ERP is down');
  });
});
