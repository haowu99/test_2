/**
 * routes/invoices.js — /api/app/invoices/preview and /save
 *
 * Mirrors the /api/app namespace described in ASYN_Overview.docx for
 * customer-facing (leap) flows. Same thin-route principle as productRules.js.
 *
 * DELIBERATELY NO requireCompanyAdmin HERE: unlike product rule CRUD,
 * previewing/saving an invoice is an ordinary employee action, not an
 * admin-only one — the task never restricts who can scan/save a receipt.
 */
import { previewInvoice, saveInvoiceWithRules } from '../services/invoiceRuleService.js';
import { sendError } from '../errors.js';

const invoiceItemSchema = {
  type: 'object',
  required: ['id', 'description', 'valorTotal'],
  properties: {
    id: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    ncm: { type: ['string', 'null'] },
    valorTotal: { type: 'number', minimum: 0 },
  },
};

const invoiceBodySchema = {
  type: 'object',
  required: ['amount', 'items'],
  properties: {
    employeeId: { type: 'string' },
    amount: { type: 'number', minimum: 0 },
    items: { type: 'array', items: invoiceItemSchema },
  },
};

export async function invoiceRoutes(fastify) {
  fastify.post(
    '/api/app/invoices/preview',
    { schema: { body: invoiceBodySchema } },
    async (request, reply) => {
      try {
        const result = previewInvoice(request.companyId, request.body);
        return { data: result };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  fastify.post(
    '/api/app/invoices/save',
    { schema: { body: invoiceBodySchema } },
    async (request, reply) => {
      try {
        const saved = saveInvoiceWithRules(request.companyId, request.body);
        reply.code(201);
        return { data: saved };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );
}
