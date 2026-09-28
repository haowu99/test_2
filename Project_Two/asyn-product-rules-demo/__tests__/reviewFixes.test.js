import { beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '../src/server.js';
import { evaluateInvoiceAgainstRules } from '../src/evaluateInvoiceAgainstRules.js';
import { __resetForTests as resetRules } from '../src/repositories/productRuleRepository.js';
import { __resetForTests as resetInvoices } from '../src/repositories/invoiceRepository.js';

beforeEach(() => {
  resetRules();
  resetInvoices();
});

describe('review fix — admin-only rule management', () => {
  it('an employee (non-ADMIN role) cannot create a product rule', async () => {
    const server = buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/product-rules',
      headers: { 'x-company-id': 'company-a', 'x-role': 'EMPLOYEE' },
      payload: { name: 'Alcohol', matchType: 'KEYWORD', matchValues: ['cerveja'] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('an ADMIN role can create a product rule', async () => {
    const server = buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/product-rules',
      headers: { 'x-company-id': 'company-a', 'x-role': 'ADMIN' },
      payload: { name: 'Alcohol', matchType: 'KEYWORD', matchValues: ['cerveja'] },
    });
    expect(res.statusCode).toBe(201);
  });

  it('a request with no x-role header defaults to ADMIN (documented demo convenience, not a real default)', async () => {
    const server = buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/product-rules',
      headers: { 'x-company-id': 'company-a' },
      payload: { name: 'Alcohol', matchType: 'KEYWORD', matchValues: ['cerveja'] },
    });
    expect(res.statusCode).toBe(201);
  });

  it('an employee can still preview/save invoices — the admin check only applies to rule CRUD', async () => {
    const server = buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/app/invoices/preview',
      headers: { 'x-company-id': 'company-a', 'x-role': 'EMPLOYEE' },
      payload: { amount: 10, items: [{ id: 'i1', description: 'Café', valorTotal: 10 }] },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('review fix — Fastify schema validation rejects malformed bodies before the handler runs', () => {
  it('rejects a rule with an invalid matchType at the HTTP layer', async () => {
    const server = buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/product-rules',
      headers: { 'x-company-id': 'company-a' },
      payload: { name: 'X', matchType: 'PRICE_RANGE', matchValues: ['10'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a rule missing the required matchValues field', async () => {
    const server = buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/product-rules',
      headers: { 'x-company-id': 'company-a' },
      payload: { name: 'X', matchType: 'KEYWORD' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an invoice item with a negative valorTotal', async () => {
    const server = buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/app/invoices/preview',
      headers: { 'x-company-id': 'company-a' },
      payload: { amount: 10, items: [{ id: 'i1', description: 'X', valorTotal: -5 }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('review fix — empty/whitespace matchValues is rejected (both layers)', () => {
  it('rejects an empty matchValues array at the Fastify schema layer', async () => {
    const server = buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/product-rules',
      headers: { 'x-company-id': 'company-a' },
      payload: { name: 'X', matchType: 'KEYWORD', matchValues: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a whitespace-only matchValue at the service layer (schema minLength alone would not catch it)', async () => {
    const server = buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/product-rules',
      headers: { 'x-company-id': 'company-a' },
      payload: { name: 'X', matchType: 'KEYWORD', matchValues: ['   '] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('a whitespace-only matchValue never reaches the matcher, so it can never match every product by accident', async () => {
    // Defense in depth: even if validation were ever bypassed, confirm the
    // matcher itself does not treat an empty/whitespace keyword as "match everything".
    const [result] = evaluateInvoiceAgainstRules(
      [{ id: 'i1', description: 'Arroz', valorTotal: 10 }],
      [{ id: 'r1', name: 'X', matchType: 'KEYWORD', matchValues: ['   '], active: true }],
    );
    expect(result.blocked).toBe(false);
  });
});

describe('review fix — deterministic multi-rule tie-break (oldest rule wins, id as secondary key)', () => {
  it('two rules with the exact same createdAt timestamp still resolve deterministically via id', () => {
    const sameTimestamp = new Date('2026-01-01T00:00:00Z');
    const ruleA = { id: 'rule-b', name: 'B', matchType: 'KEYWORD', matchValues: ['cerveja'], active: true, createdAt: sameTimestamp };
    const ruleB = { id: 'rule-a', name: 'A', matchType: 'KEYWORD', matchValues: ['cerveja'], active: true, createdAt: sameTimestamp };
    // Caller is responsible for sorting (repository does this in practice);
    // this test documents the CONTRACT the matcher relies on: whichever
    // rule is FIRST in the array wins. The repository guarantees "oldest
    // createdAt, then id ascending" — simulated here directly.
    const sorted = [ruleA, ruleB].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    const [result] = evaluateInvoiceAgainstRules(
      [{ id: 'i1', description: 'Cerveja', valorTotal: 10 }],
      sorted,
    );
    expect(result.blockedByRuleId).toBe('rule-a'); // 'rule-a' sorts before 'rule-b'
  });
});

describe('review fix — PATCH also rejects blank name/matchValue (not just create)', () => {
  it('rejects editing an existing rule\'s name down to whitespace', async () => {
    const server = buildServer();
    const create = await server.inject({
      method: 'POST', url: '/api/admin/product-rules',
      headers: { 'x-company-id': 'company-a' },
      payload: { name: 'Alcohol', matchType: 'KEYWORD', matchValues: ['cerveja'] },
    });
    const rule = create.json().data;

    const res = await server.inject({
      method: 'PATCH', url: `/api/admin/product-rules/${rule.id}`,
      headers: { 'x-company-id': 'company-a' },
      payload: { name: '   ' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects editing an existing rule\'s matchValue down to whitespace', async () => {
    const server = buildServer();
    const create = await server.inject({
      method: 'POST', url: '/api/admin/product-rules',
      headers: { 'x-company-id': 'company-a' },
      payload: { name: 'Alcohol', matchType: 'KEYWORD', matchValues: ['cerveja'] },
    });
    const rule = create.json().data;

    const res = await server.inject({
      method: 'PATCH', url: `/api/admin/product-rules/${rule.id}`,
      headers: { 'x-company-id': 'company-a' },
      payload: { matchValues: ['   '] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');

    // Confirm the original value was never overwritten by the rejected patch.
    const list = await server.inject({
      method: 'GET', url: '/api/admin/product-rules',
      headers: { 'x-company-id': 'company-a' },
    });
    expect(list.json().data[0].matchValues).toEqual(['cerveja']);
  });
});

describe('review fix — every error path returns the same { error: { code, message } } envelope', () => {
  it('a 404 (rule not found) uses the structured envelope, not a bare message', async () => {
    const server = buildServer();
    const res = await server.inject({
      method: 'DELETE',
      url: '/api/admin/product-rules/does-not-exist',
      headers: { 'x-company-id': 'company-a' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Rule not found' } });
  });

  it('a 401 (missing auth header) also uses the structured envelope', async () => {
    const server = buildServer();
    const res = await server.inject({ method: 'GET', url: '/api/admin/product-rules' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
  });
});
