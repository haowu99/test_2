import { AppError } from '../errors.js';

/**
 * fakeAuth — STAND-IN for the real leap-api auth middleware.
 *
 * In the real project, `request.user.companyId` (or similar) would be set
 * by verifying a bearer token (see ASYN_Overview.docx: "Sessions are based
 * on bearer tokens"). We don't have that middleware here, so this plugin
 * fakes it by reading a plain `x-company-id` header instead — good enough
 * to demonstrate and test the company-isolation behavior end-to-end over
 * real HTTP, without needing a real login system.
 *
 * THE IMPORTANT PART THIS DEMONSTRATES: every route handler below reads
 * companyId from `request.companyId` (set here, from server-trusted
 * context) — never from the request body or query string. That is the
 * actual security property the task requires; swapping this fake header
 * check for real bearer-token verification later does not change any
 * route or service code, only this one file.
 *
 * ROLE (added after review feedback): the task says "A company ADMIN can
 * create product rules" — not any authenticated employee of the company.
 * `x-role` is a second fake header standing in for whatever the real JWT/
 * session would carry (e.g. `request.user.role`). It defaults to 'ADMIN'
 * when absent, purely so every earlier test/demo call that only ever set
 * x-company-id keeps working without being rewritten — this default is a
 * demo convenience, NOT a safe default for a real system. A real
 * implementation must have no default: an unauthenticated or role-less
 * request must be rejected, not silently treated as an admin.
 */
export async function fakeAuthPlugin(fastify) {
  fastify.addHook('preHandler', async (request, reply) => {
    const companyId = request.headers['x-company-id'];
    if (!companyId) {
      throw new AppError('UNAUTHENTICATED', 'Missing x-company-id header (stand-in for a real auth token)', 401);
    }
    request.companyId = companyId;
    request.role = request.headers['x-role'] || 'ADMIN';
  });
}

/**
 * requireCompanyAdmin — preHandler for routes that only a company admin
 * may call (product rule CRUD). Employee-role requests get a structured
 * 403, matching the task's "A company admin can create product rules"
 * requirement — company membership alone is not enough.
 */
export async function requireCompanyAdmin(request, reply) {
  if (request.role !== 'ADMIN') {
    return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Only a company admin can manage product rules.' } });
  }
}
