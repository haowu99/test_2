import { beforeEach, describe, expect, it } from 'vitest';

import { __resetForTests } from '../src/repositories/productRuleRepository.js';
import {
  createProductRule,
  deleteProductRule,
  getRuleOrThrow,
  listRules,
  updateProductRule,
} from '../src/services/productRuleService.js';

beforeEach(() => {
  __resetForTests();
});

describe('productRuleService — company isolation (highest-risk requirement)', () => {
  it('company A cannot see company B rules', () => {
    createProductRule('company-a', { name: 'Alcohol', matchType: 'KEYWORD', matchValues: ['cerveja'] });
    createProductRule('company-b', { name: 'Tobacco', matchType: 'KEYWORD', matchValues: ['cigarro'] });

    const aRules = listRules('company-a');
    const bRules = listRules('company-b');

    expect(aRules).toHaveLength(1);
    expect(aRules[0].name).toBe('Alcohol');
    expect(bRules).toHaveLength(1);
    expect(bRules[0].name).toBe('Tobacco');
  });

  it('company A cannot update company B rule by guessing its id', () => {
    const bRule = createProductRule('company-b', {
      name: 'Tobacco',
      matchType: 'KEYWORD',
      matchValues: ['cigarro'],
    });

    expect(() => updateProductRule('company-a', bRule.id, { name: 'Hacked' })).toThrow(
      'Rule not found',
    );
  });

  it('company A cannot delete company B rule by guessing its id', () => {
    const bRule = createProductRule('company-b', {
      name: 'Tobacco',
      matchType: 'KEYWORD',
      matchValues: ['cigarro'],
    });

    expect(() => deleteProductRule('company-a', bRule.id)).toThrow('Rule not found');

    // Rule must still exist for its real owner.
    expect(getRuleOrThrow('company-b', bRule.id).name).toBe('Tobacco');
  });
});

describe('productRuleService — validation', () => {
  it('rejects an empty name', () => {
    expect(() =>
      createProductRule('company-a', { name: '  ', matchType: 'KEYWORD', matchValues: ['cerveja'] }),
    ).toThrow('name is required');
  });

  it('rejects an unknown matchType', () => {
    expect(() =>
      createProductRule('company-a', { name: 'X', matchType: 'PRICE_RANGE', matchValues: ['10'] }),
    ).toThrow('matchType must be one of');
  });
});

describe('productRuleService — deactivate is a status flip, not a delete', () => {
  it('a deactivated rule still exists and can be listed, just inactive', () => {
    const rule = createProductRule('company-a', {
      name: 'Alcohol',
      matchType: 'KEYWORD',
      matchValues: ['cerveja'],
    });
    updateProductRule('company-a', rule.id, { active: false });

    const all = listRules('company-a');
    expect(all).toHaveLength(1);
    expect(all[0].active).toBe(false);
  });
});
