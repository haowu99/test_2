import { beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '../src/server.js';
import { __resetForTests as resetRules } from '../src/repositories/productRuleRepository.js';
import { __resetForTests as resetInvoices } from '../src/repositories/invoiceRepository.js';

beforeEach(() => {
  resetRules();
  resetInvoices();
});

describe('HTTP layer — /health', () => {
  it('responds without needing auth', async () => {
    const server = buildServer();
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe('HTTP layer — auth is required on business routes', () => {
  it('rejects requests with no x-company-id header', async () => {
    const server = buildServer();
    const res = await server.inject({ method: 'GET', url: '/api/admin/product-rules' });
    expect(res.statusCode).toBe(401);
  });
});

describe('HTTP layer — product rule CRUD', () => {
  it('creates, lists, and only within the same company', async () => {
    const server = buildServer();

    const createRes = await server.inject({
      method: 'POST',
      url: '/api/admin/product-rules',
      headers: { 'x-company-id': 'company-a' },
      payload: { name: 'Alcoholic drinks', matchType: 'KEYWORD', matchValues: ['cerveja'] },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json().data;
    expect(created.name).toBe('Alcoholic drinks');

    // Company B should see nothing.
    const listB = await server.inject({
      method: 'GET',
      url: '/api/admin/product-rules',
      headers: { 'x-company-id': 'company-b' },
    });
    expect(listB.json().data).toHaveLength(0);

    // Company A sees its own rule.
    const listA = await server.inject({
      method: 'GET',
      url: '/api/admin/product-rules',
      headers: { 'x-company-id': 'company-a' },
    });
    expect(listA.json().data).toHaveLength(1);

    // Company B cannot delete company A's rule by guessing the id.
    const deleteAttempt = await server.inject({
      method: 'DELETE',
      url: `/api/admin/product-rules/${created.id}`,
      headers: { 'x-company-id': 'company-b' },
    });
    expect(deleteAttempt.statusCode).toBe(404);
  });
});

describe('HTTP layer — invoice preview and save', () => {
  it('full flow: create rule, preview blocks the item, save persists the same block', async () => {
    const server = buildServer();

    await server.inject({
      method: 'POST',
      url: '/api/admin/product-rules',
      headers: { 'x-company-id': 'company-a' },
      payload: { name: 'Alcoholic drinks', matchType: 'KEYWORD', matchValues: ['cerveja'] },
    });

    const invoicePayload = {
      amount: 60,
      items: [
        { id: 'i1', description: 'Arroz', ncm: '1006.30.00', valorTotal: 20 },
        { id: 'i2', description: 'Cerveja Brahma', ncm: '2203.00.00', valorTotal: 30 },
        { id: 'i3', description: 'Refrigerante', ncm: '2202.10.00', valorTotal: 10 },
      ],
    };

    const preview = await server.inject({
      method: 'POST',
      url: '/api/app/invoices/preview',
      headers: { 'x-company-id': 'company-a' },
      payload: invoicePayload,
    });
    expect(preview.json().data.reimbursableAmount).toBe(30);

    const save = await server.inject({
      method: 'POST',
      url: '/api/app/invoices/save',
      headers: { 'x-company-id': 'company-a' },
      payload: invoicePayload,
    });
    expect(save.statusCode).toBe(201);
    expect(save.json().data.reimbursableAmount).toBe(30);
    expect(save.json().data.amount).toBe(60);
  });
});
