import { beforeEach, describe, expect, it } from 'vitest';

import { __resetForTests as resetRules } from '../src/repositories/productRuleRepository.js';
import { __resetForTests as resetInvoices } from '../src/repositories/invoiceRepository.js';
import { createProductRule, deactivateProductRule } from '../src/services/productRuleService.js';
import { previewInvoice, saveInvoiceWithRules } from '../src/services/invoiceRuleService.js';

beforeEach(() => {
  resetRules();
  resetInvoices();
});

function sampleInvoice() {
  return {
    amount: 60,
    items: [
      { id: 'i1', description: 'Arroz', ncm: '1006.30.00', valorTotal: 20 },
      { id: 'i2', description: 'Cerveja Brahma', ncm: '2203.00.00', valorTotal: 30 },
      { id: 'i3', description: 'Refrigerante', ncm: '2202.10.00', valorTotal: 10 },
    ],
  };
}

describe('preview and save use the same evaluator — cannot drift apart', () => {
  it('preview and save flag the exact same item, for the exact same reason', () => {
    createProductRule('company-a', { name: 'Alcoholic drinks', matchType: 'KEYWORD', matchValues: ['cerveja'] });

    const preview = previewInvoice('company-a', sampleInvoice());
    const saved = saveInvoiceWithRules('company-a', sampleInvoice());

    const previewBlocked = preview.items.find((i) => i.blocked);
    const savedBlocked = saved.items.find((i) => i.blocked);

    expect(previewBlocked.id).toBe('i2');
    expect(savedBlocked.id).toBe('i2');
    expect(previewBlocked.blockedByRuleName).toBe('Alcoholic drinks');
    expect(savedBlocked.blockedByRuleName).toBe('Alcoholic drinks');
    expect(preview.reimbursableAmount).toBe(30);
    expect(saved.reimbursableAmount).toBe(30);
    expect(saved.amount).toBe(60); // fiscal amount is untouched
  });
});

describe('save always re-reads rules fresh — never trusts a stale preview', () => {
  it('a rule created AFTER preview but BEFORE save still applies at save time', () => {
    // No rules yet -> preview sees nothing blocked.
    const preview = previewInvoice('company-a', sampleInvoice());
    expect(preview.items.every((i) => !i.blocked)).toBe(true);

    // Admin adds a rule in between preview and save.
    createProductRule('company-a', { name: 'Alcoholic drinks', matchType: 'KEYWORD', matchValues: ['cerveja'] });

    const saved = saveInvoiceWithRules('company-a', sampleInvoice());
    expect(saved.items.find((i) => i.id === 'i2').blocked).toBe(true);
    expect(saved.reimbursableAmount).toBe(30);
  });
});

describe('blocked state is frozen at save time', () => {
  it('deactivating a rule after save does not change the already-saved invoice', () => {
    const rule = createProductRule('company-a', {
      name: 'Alcoholic drinks',
      matchType: 'KEYWORD',
      matchValues: ['cerveja'],
    });

    const saved = saveInvoiceWithRules('company-a', sampleInvoice());
    expect(saved.reimbursableAmount).toBe(30);

    deactivateProductRule('company-a', rule.id);

    // Nothing in this codebase re-evaluates a saved invoice, so re-reading
    // the same object should still show the frozen result.
    expect(saved.reimbursableAmount).toBe(30);
    expect(saved.items.find((i) => i.id === 'i2').blockedByRuleName).toBe('Alcoholic drinks');
  });
});

describe('company isolation applies to invoice evaluation too', () => {
  it("company B's rule never blocks company A's invoice", () => {
    createProductRule('company-b', { name: 'Alcoholic drinks', matchType: 'KEYWORD', matchValues: ['cerveja'] });

    const saved = saveInvoiceWithRules('company-a', sampleInvoice());

    expect(saved.items.every((i) => !i.blocked)).toBe(true);
    expect(saved.reimbursableAmount).toBe(60);
  });
});

describe('fully-blocked invoice still saves, with reimbursableAmount 0', () => {
  it('every item blocked -> reimbursableAmount is 0, invoice is still saved (not refused here)', () => {
    // "a" appears in "arroz", "cerveja brahma" and "refrigerante" (accent-
    // folded), so this single broad rule matches every item in the sample.
    createProductRule('company-a', { name: 'Broad rule', matchType: 'KEYWORD', matchValues: ['a'] });

    const saved = saveInvoiceWithRules('company-a', sampleInvoice());
    expect(saved.items.every((i) => i.blocked)).toBe(true);
    expect(saved.reimbursableAmount).toBe(0);
  });
});
