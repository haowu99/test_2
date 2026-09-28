import { beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '../src/server.js';
import { __resetForTests as resetRules } from '../src/repositories/productRuleRepository.js';
import { __resetForTests as resetInvoices } from '../src/repositories/invoiceRepository.js';
import { evaluateInvoiceAgainstRules } from '../src/evaluateInvoiceAgainstRules.js';

beforeEach(() => {
  resetRules();
  resetInvoices();
});

// This whole file exists because of a real product conversation (2026-09-10):
// "alcohol" and "tobacco" each map to SEVERAL NCM codes, not one — an admin
// should be able to create ONE rule that covers all of them, instead of
// creating a separate rule per code by hand.

describe('a single rule with multiple NCM codes blocks any product matching ANY of them', () => {
  it('matches beer, wine, and spirits under one "Alcohol" rule', () => {
    const alcoholRule = {
      id: 'r1',
      name: 'Alcoholic drinks',
      matchType: 'NCM_PREFIX',
      matchValues: ['2203', '2204', '2205', '2206', '2208'], // beer, wine, vermouth, other fermented, spirits
      active: true,
    };
    const items = [
      { id: 'i1', description: 'Cerveja Brahma', ncm: '2203.00.00', valorTotal: 10 },
      { id: 'i2', description: 'Vinho Tinto', ncm: '2204.21.00', valorTotal: 40 },
      { id: 'i3', description: 'Whisky', ncm: '2208.30.00', valorTotal: 90 },
      { id: 'i4', description: 'Arroz', ncm: '1006.30.00', valorTotal: 20 }, // unrelated — must NOT block
    ];

    const results = evaluateInvoiceAgainstRules(items, [alcoholRule]);

    expect(results.map((r) => r.blocked)).toEqual([true, true, true, false]);
    expect(results[0].blockedByRuleName).toBe('Alcoholic drinks');
    expect(results[1].blockedByRuleName).toBe('Alcoholic drinks');
  });

  it('matches multiple tobacco NCM prefixes under one "Tobacco" rule', () => {
    const tobaccoRule = {
      id: 'r2',
      name: 'Tobacco',
      matchType: 'NCM_PREFIX',
      matchValues: ['2401', '2402', '2403'],
      active: true,
    };
    const items = [
      { id: 'i1', description: 'Cigarro Marlboro', ncm: '2402.20.00', valorTotal: 15 },
      { id: 'i2', description: 'Fumo em corda', ncm: '2401.10.00', valorTotal: 8 },
      { id: 'i3', description: 'Refrigerante', ncm: '2202.10.00', valorTotal: 6 }, // unrelated
    ];

    const results = evaluateInvoiceAgainstRules(items, [tobaccoRule]);

    expect(results.map((r) => r.blocked)).toEqual([true, true, false]);
  });

  it('also works for KEYWORD rules with multiple values (e.g. "cerveja" or "vinho")', () => {
    const rule = {
      id: 'r3',
      name: 'Alcoholic drinks',
      matchType: 'KEYWORD',
      matchValues: ['cerveja', 'vinho', 'uisque'],
      active: true,
    };
    const items = [
      { id: 'i1', description: 'Cerveja Brahma 350ml', valorTotal: 10 },
      { id: 'i2', description: 'Vinho Tinto Reserva', valorTotal: 40 },
      { id: 'i3', description: 'Suco de Laranja', valorTotal: 6 }, // unrelated
    ];

    const results = evaluateInvoiceAgainstRules(items, [rule]);

    expect(results.map((r) => r.blocked)).toEqual([true, true, false]);
  });
});

describe('validation for multi-value rules, over real HTTP', () => {
  it('creating a rule with several codes at once succeeds and returns all of them', async () => {
    const server = buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/product-rules',
      headers: { 'x-company-id': 'company-a' },
      payload: { name: 'Alcohol', matchType: 'NCM_PREFIX', matchValues: ['2203', '2204', '2208'] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.matchValues).toEqual(['2203', '2204', '2208']);
  });

  it('rejects a list containing a blank entry, even if other entries are valid', async () => {
    const server = buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/product-rules',
      headers: { 'x-company-id': 'company-a' },
      payload: { name: 'Alcohol', matchType: 'NCM_PREFIX', matchValues: ['2203', '   ', '2208'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('trims whitespace and de-duplicates values before saving', async () => {
    const server = buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/product-rules',
      headers: { 'x-company-id': 'company-a' },
      payload: { name: 'Alcohol', matchType: 'NCM_PREFIX', matchValues: [' 2203 ', '2203', '2204'] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.matchValues).toEqual(['2203', '2204']);
  });

  it('PATCH can add a new code to an existing rule\'s list', async () => {
    const server = buildServer();
    const create = await server.inject({
      method: 'POST',
      url: '/api/admin/product-rules',
      headers: { 'x-company-id': 'company-a' },
      payload: { name: 'Alcohol', matchType: 'NCM_PREFIX', matchValues: ['2203'] },
    });
    const rule = create.json().data;

    const patch = await server.inject({
      method: 'PATCH',
      url: `/api/admin/product-rules/${rule.id}`,
      headers: { 'x-company-id': 'company-a' },
      payload: { matchValues: ['2203', '2204', '2208'] },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().data.matchValues).toEqual(['2203', '2204', '2208']);
  });
});
