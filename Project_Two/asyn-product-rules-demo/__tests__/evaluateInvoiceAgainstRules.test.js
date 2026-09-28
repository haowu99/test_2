import { describe, expect, it } from 'vitest';

import {
  computeReimbursableAmount,
  evaluateInvoiceAgainstRules,
} from '../src/evaluateInvoiceAgainstRules.js';

function item(overrides = {}) {
  return {
    id: 'item-1',
    description: 'Cerveja Pilsen 350ml',
    ncm: '2203.00.00',
    valorTotal: 10,
    ...overrides,
  };
}

function rule(overrides = {}) {
  return {
    id: 'rule-1',
    name: 'Alcoholic drinks',
    matchType: 'NCM_PREFIX',
    matchValues: ['2203'],
    active: true,
    ...overrides,
  };
}

describe('evaluateInvoiceAgainstRules — NCM_PREFIX', () => {
  it('blocks an item whose NCM starts with the rule prefix', () => {
    const [result] = evaluateInvoiceAgainstRules([item()], [rule()]);
    expect(result.blocked).toBe(true);
    expect(result.blockedByRuleId).toBe('rule-1');
    expect(result.blockedByRuleName).toBe('Alcoholic drinks');
  });

  it('matches even when the product NCM has punctuation and the rule does not', () => {
    const [result] = evaluateInvoiceAgainstRules(
      [item({ ncm: '2203.00.00' })],
      [rule({ matchValues: ['2203'] })],
    );
    expect(result.blocked).toBe(true);
  });

  it('does not block an item with a different NCM', () => {
    const [result] = evaluateInvoiceAgainstRules(
      [item({ ncm: '1006.30.00' })], // rice, not beer
      [rule()],
    );
    expect(result.blocked).toBe(false);
    expect(result.blockedByRuleId).toBeNull();
    expect(result.blockedByRuleName).toBeNull();
  });

  it('does not block an item with no NCM at all', () => {
    const [result] = evaluateInvoiceAgainstRules([item({ ncm: undefined })], [rule()]);
    expect(result.blocked).toBe(false);
  });
});

describe('evaluateInvoiceAgainstRules — KEYWORD', () => {
  const keywordRule = rule({
    id: 'rule-2',
    name: 'Beer keyword rule',
    matchType: 'KEYWORD',
    matchValues: ['cerveja'],
  });

  it('blocks a matching item, ignoring case', () => {
    const [result] = evaluateInvoiceAgainstRules(
      [item({ description: 'CERVEJA PILSEN 350ML' })],
      [keywordRule],
    );
    expect(result.blocked).toBe(true);
  });

  it('blocks a matching item, ignoring accents', () => {
    const [result] = evaluateInvoiceAgainstRules(
      [item({ description: 'Cêrvejä Artesanal' })],
      [keywordRule],
    );
    expect(result.blocked).toBe(true);
  });

  it('matches as a substring, per the task spec, even inside a longer word', () => {
    // Documented, intentional behavior (see module docstring assumption #2)
    // — not a bug. "cervejaria" contains "cerveja".
    const [result] = evaluateInvoiceAgainstRules(
      [item({ description: 'Cervejaria Colombo - Vale Presente' })],
      [keywordRule],
    );
    expect(result.blocked).toBe(true);
  });

  it('does not block an unrelated product', () => {
    const [result] = evaluateInvoiceAgainstRules(
      [item({ description: 'Leite Integral 1L' })],
      [keywordRule],
    );
    expect(result.blocked).toBe(false);
  });
});

describe('evaluateInvoiceAgainstRules — rule activation and multi-rule order', () => {
  it('ignores inactive rules', () => {
    const [result] = evaluateInvoiceAgainstRules([item()], [rule({ active: false })]);
    expect(result.blocked).toBe(false);
  });

  it('returns unblocked for every item when there are no active rules', () => {
    const results = evaluateInvoiceAgainstRules([item(), item({ id: 'item-2' })], []);
    expect(results.every((r) => r.blocked === false)).toBe(true);
  });

  it('when multiple active rules match, uses the first one in array order', () => {
    const first = rule({ id: 'rule-a', name: 'Rule A' });
    const second = rule({ id: 'rule-b', name: 'Rule B' });
    const [result] = evaluateInvoiceAgainstRules([item()], [first, second]);
    expect(result.blockedByRuleId).toBe('rule-a');
    expect(result.blockedByRuleName).toBe('Rule A');
  });

  it('does not block on an unknown matchType (fails closed, not open)', () => {
    const weirdRule = rule({ matchType: 'SOMETHING_NEW' });
    const [result] = evaluateInvoiceAgainstRules([item()], [weirdRule]);
    expect(result.blocked).toBe(false);
  });

  it('preserves item order and count in the output', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })];
    const results = evaluateInvoiceAgainstRules(items, []);
    expect(results.map((r) => r.itemId)).toEqual(['a', 'b', 'c']);
  });
});

describe('computeReimbursableAmount', () => {
  it('equals the invoice amount when nothing is blocked', () => {
    const items = [item({ valorTotal: 32.41 })];
    const evaluations = evaluateInvoiceAgainstRules(items, []);
    expect(computeReimbursableAmount(32.41, items, evaluations)).toBe(32.41);
  });

  it('subtracts only the blocked items', () => {
    const items = [
      item({ id: 'a', valorTotal: 12.45, description: 'Brocolis', ncm: '0704.90.00' }),
      item({ id: 'b', valorTotal: 10, description: 'Cerveja Pilsen' }),
    ];
    const rules = [rule({ matchType: 'KEYWORD', matchValues: ['cerveja'] })];
    const evaluations = evaluateInvoiceAgainstRules(items, rules);
    // 12.45 + 10 = 22.45 total, item "b" (10) is blocked
    expect(computeReimbursableAmount(22.45, items, evaluations)).toBe(12.45);
  });

  it('returns 0 when every item is blocked', () => {
    const items = [item({ valorTotal: 13.2 })];
    const evaluations = evaluateInvoiceAgainstRules(items, [rule()]);
    expect(computeReimbursableAmount(13.2, items, evaluations)).toBe(0);
  });

  it('avoids floating point noise (e.g. does not return -0 or 0.00000001)', () => {
    const items = [item({ valorTotal: 13.2 })];
    const evaluations = evaluateInvoiceAgainstRules(items, [rule()]);
    const result = computeReimbursableAmount(13.2, items, evaluations);
    expect(Object.is(result, -0)).toBe(false);
    expect(result).toBe(0);
  });
});
