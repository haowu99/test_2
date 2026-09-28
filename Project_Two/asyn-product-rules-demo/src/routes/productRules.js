/**
 * routes/productRules.js — /api/admin/product-rules
 *
 * Per ASYN_Overview.docx's layering ("route -> service -> repository"),
 * this file does ONLY HTTP concerns: read params/body, call the service,
 * shape the response, map thrown errors to status codes. No business logic
 * lives here — it all lives in productRuleService.js so it stays testable
 * without spinning up an HTTP server (see __tests__/productRuleService.test.js).
 *
 * TWO VALIDATION LAYERS, DELIBERATELY (per review feedback + ASYN_Overview.docx:
 * "Routes and schemas ... declare validation"):
 *   1. Fastify's `schema.body` below rejects malformed requests (wrong
 *      types, missing required fields) BEFORE the handler even runs —
 *      this is HTTP-shape validation.
 *   2. productRuleService.js still separately validates business rules
 *      (e.g. "name must be non-empty after trimming whitespace") — this
 *      is business validation, which JSON-schema alone can't express well.
 * Losing either layer would be a regression: schema-only misses business
 * rules; service-only means malformed JSON bodies produce a confusing
 * 500 instead of a clean 400 with a field-level reason.
 *
 * ADMIN-ONLY: `requireCompanyAdmin` runs before every handler here — this
 * is "a company ADMIN can create product rules" from Task.docx, not just
 * "any authenticated user of the company." See src/plugins/fakeAuth.js
 * for why this is a fake-but-structurally-correct stand-in.
 */
import {
  activateProductRule,
  createProductRule,
  deactivateProductRule,
  deleteProductRule,
  listRules,
  updateProductRule,
} from '../services/productRuleService.js';
import { sendError } from '../errors.js';
import { requireCompanyAdmin } from '../plugins/fakeAuth.js';

const ruleBodySchema = {
  type: 'object',
  required: ['name', 'matchType', 'matchValues'],
  properties: {
    name: { type: 'string', minLength: 1 },
    matchType: { type: 'string', enum: ['NCM_PREFIX', 'KEYWORD'] },
    matchValues: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
    description: { type: ['string', 'null'] },
    active: { type: 'boolean' },
  },
  additionalProperties: false,
};

const ruleUpdateBodySchema = {
  type: 'object',
  // No `required` here — PATCH allows partial updates.
  properties: {
    name: { type: 'string', minLength: 1 },
    matchType: { type: 'string', enum: ['NCM_PREFIX', 'KEYWORD'] },
    matchValues: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
    description: { type: ['string', 'null'] },
    active: { type: 'boolean' },
  },
  additionalProperties: false,
};

export async function productRuleRoutes(fastify) {
  fastify.addHook('preHandler', requireCompanyAdmin);

  fastify.get('/api/admin/product-rules', async (request) => {
    return { data: listRules(request.companyId) };
  });

  fastify.post(
    '/api/admin/product-rules',
    { schema: { body: ruleBodySchema } },
    async (request, reply) => {
      try {
        const rule = createProductRule(request.companyId, request.body);
        reply.code(201);
        return { data: rule };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  fastify.patch(
    '/api/admin/product-rules/:id',
    { schema: { body: ruleUpdateBodySchema } },
    async (request, reply) => {
      try {
        const rule = updateProductRule(request.companyId, request.params.id, request.body);
        return { data: rule };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  fastify.post('/api/admin/product-rules/:id/deactivate', async (request, reply) => {
    try {
      return { data: deactivateProductRule(request.companyId, request.params.id) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  fastify.post('/api/admin/product-rules/:id/activate', async (request, reply) => {
    try {
      return { data: activateProductRule(request.companyId, request.params.id) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  fastify.delete('/api/admin/product-rules/:id', async (request, reply) => {
    try {
      deleteProductRule(request.companyId, request.params.id);
      reply.code(204);
      return null;
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
