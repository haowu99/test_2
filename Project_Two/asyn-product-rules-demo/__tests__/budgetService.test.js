import { beforeEach, describe, expect, it } from 'vitest';

import { __resetForTests as resetRules } from '../src/repositories/productRuleRepository.js';
import { __resetForTests as resetInvoices } from '../src/repositories/invoiceRepository.js';
import { __resetForTests as resetBudget } from '../src/repositories/budgetRepository.js';
import { createProductRule } from '../src/services/productRuleService.js';
import { saveInvoiceWithRules } from '../src/services/invoiceRuleService.js';
import { consumeBudgetForInvoice, getMonthlyConsumption } from '../src/services/budgetService.js';

beforeEach(() => {
  resetRules();
  resetInvoices();
  resetBudget();
});

describe('budget consumption — wired through saveInvoiceWithRules', () => {
  it('a blocked item does NOT count against the budget, only the reimbursable part does', () => {
    createProductRule('company-a', { name: 'Alcoholic drinks', matchType: 'KEYWORD', matchValues: ['cerveja'] });

    saveInvoiceWithRules('company-a', {
      employeeId: 'emp-1',
      amount: 60,
      items: [
        { id: 'i1', description: 'Arroz', ncm: '1006.30.00', valorTotal: 20 },
        { id: 'i2', description: 'Cerveja Brahma', ncm: '2203.00.00', valorTotal: 30 },
        { id: 'i3', description: 'Refrigerante', ncm: '2202.10.00', valorTotal: 10 },
      ],
    });

    // Invoice amount was 60, but only 30 (Arroz + Refrigerante) should hit the budget.
    expect(getMonthlyConsumption('company-a', 'emp-1')).toBe(30);
  });

  it('an invoice with nothing blocked consumes its full amount, same as before this feature existed', () => {
    saveInvoiceWithRules('company-a', {
      employeeId: 'emp-1',
      amount: 45,
      items: [{ id: 'i1', description: 'Almoço', ncm: undefined, valorTotal: 45 }],
    });

    expect(getMonthlyConsumption('company-a', 'emp-1')).toBe(45);
  });

  it('multiple invoices in the same month accumulate', () => {
    saveInvoiceWithRules('company-a', {
      employeeId: 'emp-1',
      amount: 20,
      items: [{ id: 'i1', description: 'Café', ncm: undefined, valorTotal: 20 }],
    });
    saveInvoiceWithRules('company-a', {
      employeeId: 'emp-1',
      amount: 15,
      items: [{ id: 'i2', description: 'Táxi', ncm: undefined, valorTotal: 15 }],
    });

    expect(getMonthlyConsumption('company-a', 'emp-1')).toBe(35);
  });

  it('different employees, and different companies, never share a budget bucket', () => {
    saveInvoiceWithRules('company-a', {
      employeeId: 'emp-1',
      amount: 20,
      items: [{ id: 'i1', description: 'Café', ncm: undefined, valorTotal: 20 }],
    });
    saveInvoiceWithRules('company-a', {
      employeeId: 'emp-2',
      amount: 99,
      items: [{ id: 'i2', description: 'Hotel', ncm: undefined, valorTotal: 99 }],
    });
    saveInvoiceWithRules('company-b', {
      employeeId: 'emp-1', // same employeeId string, different company -> must not merge
      amount: 500,
      items: [{ id: 'i3', description: 'Voo', ncm: undefined, valorTotal: 500 }],
    });

    expect(getMonthlyConsumption('company-a', 'emp-1')).toBe(20);
    expect(getMonthlyConsumption('company-a', 'emp-2')).toBe(99);
    expect(getMonthlyConsumption('company-b', 'emp-1')).toBe(500);
  });
});

describe('budget consumption — migrated (pre-existing) invoices', () => {
  it('an old invoice, backfilled so reimbursableAmount === amount, consumes its full original value', () => {
    // Simulates what migration.sql guarantees for every invoice that
    // existed before this feature shipped: reimbursableAmount = amount.
    const oldInvoice = {
      companyId: 'company-a',
      employeeId: 'emp-1',
      reimbursableAmount: 250, // == its original amount, per the backfill
      savedAt: new Date('2026-01-15T10:00:00Z'), // saved before this feature existed
    };

    const result = consumeBudgetForInvoice(oldInvoice);

    expect(result.month).toBe('2026-01');
    expect(result.consumedThisMonth).toBe(250);
    expect(getMonthlyConsumption('company-a', 'emp-1', new Date('2026-01-20'))).toBe(250);
  });

  it("does not leak into a different month's bucket", () => {
    consumeBudgetForInvoice({
      companyId: 'company-a',
      employeeId: 'emp-1',
      reimbursableAmount: 100,
      savedAt: new Date('2026-01-15T10:00:00Z'),
    });
    consumeBudgetForInvoice({
      companyId: 'company-a',
      employeeId: 'emp-1',
      reimbursableAmount: 50,
      savedAt: new Date('2026-02-01T10:00:00Z'),
    });

    expect(getMonthlyConsumption('company-a', 'emp-1', new Date('2026-01-31'))).toBe(100);
    expect(getMonthlyConsumption('company-a', 'emp-1', new Date('2026-02-28'))).toBe(50);
  });
});
