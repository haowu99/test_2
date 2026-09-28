/**
 * server.js — wires everything together into a real, runnable HTTP server.
 *
 * Run with: npm run dev
 * Then, in another terminal, curl it (see README.md for example requests).
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fakeAuthPlugin } from './plugins/fakeAuth.js';
import { productRuleRoutes } from './routes/productRules.js';
import { invoiceRoutes } from './routes/invoices.js';
import { createProductRule } from './services/productRuleService.js';
import { AppError } from './errors.js';

export function buildServer() {
  const fastify = Fastify({ logger: false });

  // CORS is only needed because the two UI prototypes are plain static
  // HTML files opened directly in the browser (file:// or a simple local
  // server), not served by this same Fastify instance. A real leap-admin
  // / leap app would be served from a proper origin with its own CORS
  // policy — this permissive '*' setup is a demo convenience only.
  fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-company-id', 'x-role'],
  });

  // Single place every error path funnels through, so the response
  // envelope is identical whether the failure came from Fastify's own
  // JSON-schema body validation, one of our AppError subclasses thrown
  // deep in a service, or a genuine unexpected bug. Added after review
  // feedback: previously schema-validation failures and thrown business
  // errors had two different response shapes.
  fastify.setErrorHandler((err, request, reply) => {
    if (err.validation) {
      // Fastify's own JSON-schema validation failure (malformed request
      // body/params) — this is the "HTTP-shape validation" layer.
      reply.code(400);
      return { error: { code: 'VALIDATION_ERROR', message: err.message } };
    }
    if (err instanceof AppError) {
      reply.code(err.statusCode);
      return { error: { code: err.code, message: err.message } };
    }
    // Unknown/unexpected — a real bug, not the caller's fault. Don't
    // disguise it as a 400, and don't leak internals into the message.
    reply.code(err.statusCode || 500);
    return { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } };
  });

  // Registered together inside one encapsulated context so the auth
  // preHandler hook actually applies to these routes. (A Fastify quirk
  // worth knowing: a hook added inside a plugin only applies to routes
  // registered within that SAME encapsulation, not to sibling plugins
  // registered separately on the outer instance.)
  fastify.register(async (instance) => {
    // Called directly (not via instance.register) on purpose: Fastify
    // gives every register() call its own encapsulated child context, so
    // a hook added inside a *registered* plugin would only apply within
    // that plugin's own context — not to the sibling route plugins below.
    // Calling the function directly attaches the hook to `instance`
    // itself, so it actually covers everything registered after it here.
    await fakeAuthPlugin(instance);
    await instance.register(productRuleRoutes);
    await instance.register(invoiceRoutes);
  });

  // Deliberately outside the block above -> no auth required, same as a
  // real infra health-check endpoint would be.
  fastify.get('/health', async () => ({ ok: true }));

  return fastify;
}

// Only actually start listening when this file is run directly
// (`node src/server.js`), not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = buildServer();

  // Demo seed data only — a real deployment would never auto-create
  // rules on boot. This exists purely so the two UI prototypes
  // (admin-ui/, app-ui/) have something real to show against
  // immediately after `npm run dev`, without requiring you to first
  // click through the admin UI to create a rule by hand.
  //
  // UPDATED per product feedback (2026-09-10): primary matching should
  // be NCM-based, not keyword-based, since NCM is the government's
  // official tax code on every NFC-e receipt and cannot be edited or
  // hidden by an employee — unlike a free-text product name. The
  // product owner also asked for two ready-made rules (Alcohol,
  // Tobacco) covering ALL relevant codes, so an admin doesn't have to
  // look up and add every individual code by hand.
  //
  // STARTER LIST ONLY — NOT VERIFIED against Brazil's official NCM/TIPI
  // table. These are the well-known chapter-level prefixes for
  // beverages (ch. 22) and tobacco (ch. 24); a real rollout should
  // confirm the full, authoritative code list with whoever owns fiscal
  // classification data before relying on this for production.
  createProductRule('company-demo', {
    name: 'Alcoholic drinks',
    matchType: 'NCM_PREFIX',
    matchValues: ['2203', '2204', '2205', '2206', '2208'], // beer, wine, vermouth, other fermented, spirits/liqueurs
    description: 'All alcoholic beverage NCM codes — company policy §4.2. Starter list, needs verification against the official NCM table.',
  });
  createProductRule('company-demo', {
    name: 'Tobacco',
    matchType: 'NCM_PREFIX',
    matchValues: ['2401', '2402', '2403'], // raw tobacco, cigars/cigarettes, other manufactured tobacco
    description: 'All tobacco-related NCM codes. Starter list, needs verification against the official NCM table.',
  });

  server.listen({ port: 3000 }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Server listening at ${address}`);
    console.log('Seeded company-demo with 2 active rules: "Alcoholic drinks" and "Tobacco" (both NCM-prefix based, multiple codes each)');
  });
}
