# Product Rules feature — runnable demo (Steps 1–3)

> ⚠️ **`x-company-id` / `x-role` headers are a TEST-ONLY authentication
> seam, not a real auth mechanism.** Anyone can set any value in these
> headers — there is no verification. This is only safe because this
> server is a local demo. In the real ASYN API, company/role context
> must come from the existing verified bearer-token session middleware
> (see `src/plugins/fakeAuth.js` for the full explanation, and
> `INTEGRATION_CHECKLIST.md` for what must change before this touches
> production).

> **Verified clean before each delivery:** unzip to a fresh directory,
> `npm install`, `npm test` → 8 test files, 62 tests, all passing. If
> your run shows different numbers or fails, you are very likely running
> against a `node_modules` folder that came from a manual re-zip (delete
> it and reinstall) rather than this project's own dependency list.

## What this is

A take-home exercise submission for the "company product rules for
non-reimbursable items" task (see `TASK_original.docx` — copied from the
Task.docx for reference). No access to the real `leap-api` repository or
its Prisma schema was available, so this demo:

- Implements the real business logic described in the task, matching the
  layering (`route → service → repository`) documented in the ASYN
  engineering overview.
- Replaces the real Prisma/MySQL layer with a small in-memory repository
  (`src/repositories/`) that has the *same function signatures* a real
  Prisma repository would have. Swapping in real Prisma calls later only
  touches these two files — nothing above them (services, and eventually
  routes) needs to change.
- Is fully runnable and tested on a plain laptop with nothing but Node.js
  installed — no database, no Docker, no real API keys needed.

## This is now ONE connected system, not separate pieces

`admin-ui/product-rules-prototype.html` and `app-ui/invoice-preview-prototype.html`
call the **real backend** (`src/server.js`) over HTTP — they are not static
mockups with hardcoded data. Creating a rule in the admin prototype is
immediately visible to the app prototype's invoice preview, because both
are reading/writing the same in-memory data through the same API.

### Try the full connected demo (recommended)

1. `npm install`
2. `npm run dev` — starts the API on `http://localhost:3000` and seeds one
   demo rule ("Alcoholic drinks", company `company-demo`).
3. Open `admin-ui/product-rules-prototype.html` in your browser (double-click
   it, or drag it into a browser window). You'll see the seeded rule loaded
   live from the API. Try creating a new rule (e.g. name "Tobacco products",
   keyword "cigarro") — it's saved to the real backend.
4. Open `app-ui/invoice-preview-prototype.html` in another tab. It calls
   `/api/app/invoices/preview` with a sample scanned invoice and shows
   whichever items are blocked **based on whatever rules currently exist**
   — including the one you just created in step 3. Click "Save invoice" to
   call `/api/app/invoices/save` for real (also updates the employee's
   budget consumption behind the scenes — see `src/services/budgetService.js`).
5. Stop the server with `Ctrl+C` when done. All data was in-memory only —
   restarting `npm run dev` resets everything back to the single seed rule.

## How to run this yourself (from zero)

1. Install **Node.js** (LTS) from https://nodejs.org — this is the
   JavaScript runtime.
2. Open a terminal in this folder (`asyn-demo/`).
3. Install dependencies:
   ```
   npm install
   ```
4. Run the tests:
   ```
   npm test
   ```
   You should see all test files pass, e.g. `Test Files  8 passed (8)` /
   `Tests  62 passed (62)`.
5. (Optional) Start the real HTTP server and try it with curl:
   ```
   npm run dev
   ```
   Then, in a second terminal:
   ```
   # No auth header -> rejected
   curl -i http://localhost:3000/api/admin/product-rules

   # Create a rule for company-a
   curl -X POST http://localhost:3000/api/admin/product-rules \
     -H "x-company-id: company-a" -H "Content-Type: application/json" \
     -d '{"name":"Alcoholic drinks","matchType":"KEYWORD","matchValue":"cerveja"}'

   # Preview an invoice for company-a
   curl -X POST http://localhost:3000/api/app/invoices/preview \
     -H "x-company-id: company-a" -H "Content-Type: application/json" \
     -d '{"amount":60,"items":[{"id":"i1","description":"Arroz","ncm":"1006.30.00","valorTotal":20},{"id":"i2","description":"Cerveja Brahma","ncm":"2203.00.00","valorTotal":30},{"id":"i3","description":"Refrigerante","ncm":"2202.10.00","valorTotal":10}]}'
   ```
   Stop the server with `Ctrl+C` in that first terminal when done.

## Project layout

```
src/
  normalize.js                    Step 2 — text/NCM normalization helpers
  evaluateInvoiceAgainstRules.js  Step 2 — the core pure matching function
  repositories/
    productRuleRepository.js      IN-MEMORY stand-in for Prisma (rules table)
    invoiceRepository.js          IN-MEMORY stand-in for Prisma (invoices table)
    budgetRepository.js           IN-MEMORY stand-in for Prisma (budget consumption)
  services/
    productRuleService.js         Step 3 — admin rule CRUD, company-scoped
    invoiceRuleService.js         Step 3 — preview + save (same evaluator, both places)
                                   also wires budget consumption on save
    erpSendService.js             Step 3 — ERP send, incl. folder-batch skip logic
    budgetService.js              Step 6 — monthly budget consumption using
                                   reimbursableAmount, not the raw invoice amount
  plugins/
    fakeAuth.js                   Stand-in for real bearer-token auth middleware
  routes/
    productRules.js               Step 3b — HTTP layer for rule CRUD
    invoices.js                   Step 3b — HTTP layer for preview/save
  server.js                       Wires everything into a real, runnable Fastify
                                   server; CORS + seed data for the UI prototypes

admin-ui/
  product-rules-prototype.html    Step 4 — admin rule management screen,
                                   calls the real API above (fetch, not mock data)

app-ui/
  invoice-preview-prototype.html  Step 5 — employee invoice preview/save screen,
                                   also calls the real API above

__tests__/                        one test file per src/ file above, plus routes.test.js
                                   (tests the HTTP layer via Fastify's in-process `inject`,
                                   no real network socket needed)

schema-additions.prisma           Step 1 — DB design (assumptions documented inline)
migration.sql                     Step 1 — backfill script for existing invoices
NOTES.md                          Full list of assumptions + open questions
```

## Fixes made after external review (this round)

- **`npm install` intermittently crashed** with `Cannot read properties of
  null (reading 'edgesOut')` on some npm versions — a known npm/arborist
  bug triggered by vitest 4's large optional-peer-dependency graph, not a
  problem with this project's own dependencies. Added `.npmrc` with
  `legacy-peer-deps=true`, verified stable across multiple repeated fresh
  installs. This is very likely why earlier review attempts intermittently
  couldn't get `npm test` running.
- **Editing an existing rule (`PATCH`) could blank out its `name` or
  `matchValue`** — creating a rule correctly rejected empty/whitespace
  values, but editing one afterward skipped that check, so `{ "name": "   " }`
  silently succeeded. Fixed in `productRuleService.js`; the original value
  is now provably untouched by a rejected patch (see
  `__tests__/reviewFixes.test.js`).

## Fixes made after external review (previous round)

An external review of an earlier packaging of this project found real,
valid issues, plus a couple of claims that didn't hold up against what
was actually shipped. For transparency:

**Confirmed and fixed:**
- `schema-additions.prisma`, `migration.sql`, `NOTES.md` had never
  actually been copied into this project folder, despite the README
  referencing them — now present at the project root.
- Product rule CRUD had no admin-role check, only a company check — any
  authenticated employee could manage rules. Added `x-role` (fake header,
  defaults to `ADMIN` for demo convenience — see `src/plugins/fakeAuth.js`
  for why that default is explicitly *not* safe in a real system) and a
  `requireCompanyAdmin` guard on the rule routes only (not on invoice
  preview/save, which any employee should be able to do).
- Routes had no Fastify-level JSON-schema validation, only service-layer
  validation — added `schema.body` to every route, so malformed requests
  are rejected before the handler runs, in addition to (not instead of)
  business validation in the service layer.
- Error responses had no stable machine-readable code, just a message —
  added `src/errors.js` with a shared `{ error: { code, message } }`
  envelope, used consistently for validation errors, not-found errors,
  auth errors, and Fastify's own schema-validation failures.
- Multi-rule tie-break sort had no secondary key — two rules with an
  identical `createdAt` timestamp had undefined order. Added `id` as a
  stable secondary sort key.
- `reimbursableAmount` had no floor — added a defensive `nonNegative()`
  clamp (see `src/money.js`) against malformed upstream input, even
  though it should never trigger under normal operation.
- The admin UI prototype silently treated failed API calls (create/edit/
  deactivate/delete) as successes — it now checks `res.ok` and shows the
  real error instead of closing the modal.

**Considered and deliberately not done, with reasoning:**
- *Wrapping invoice-save + budget-consumption in a database transaction*:
  there is no real transaction primitive to wrap here — the "database" is
  an in-memory array, so simulating a `$transaction` block would be
  theater, not proof of anything. The code is structured so this is a
  contained, one-place swap once real Prisma repositories exist (see the
  comment in `src/services/invoiceRuleService.js`).
- *Switching monetary values from `number` to a `Decimal` type*: same
  reasoning — there's no real Prisma/MySQL round-trip to prove a `Decimal`
  type is being honored. `src/money.js` centralizes rounding/clamping now,
  and documents that a real implementation should use Prisma `Decimal`.

**Corrected (the review's claim didn't match what was actually shipped):**
- The claim that the delivered zip contained `node_modules` and failed
  `npm test` in a clean environment — the zip built by this project always
  excludes `node_modules`; the file that feedback was based on appears to
  have been a separately re-zipped copy (it contained `__MACOSX` and
  `.DS_Store`, which only appear when re-compressing via macOS Finder)
  that picked up a locally-installed, platform-specific `node_modules`.
  Re-verified clean in this round.
- The claim that blocked items in the App UI prototype only show a
  top-level "N items won't be reimbursed" banner, with no per-item rule
  name — the `ItemRow` component already renders the rule name under each
  blocked item individually; this was true in the version reviewed too.

## What is a guess vs. what is solid

**Solid, would not change even against the real codebase:**
- The matching rules themselves (NCM prefix / keyword, accent-insensitive)
- The preview/save architecture: one shared evaluator function, save always
  re-reads rules fresh, blocked state is frozen forever after save
- The company-isolation approach: every repository function requires and
  filters by `companyId`, and it always comes from server-side auth context
- The ERP refusal-on-zero and folder skip-and-continue behavior

**Guesses, would need adjusting against the real schema/codebase:**
- Real table/column names (see comments in `schema-additions.prisma`
  and `NOTES.md` — every assumed name is flagged)
- Real auth middleware shape (`companyId` here is just passed as a plain
  function argument, standing in for whatever `request.user.companyId` or
  equivalent looks like in the real Fastify app)
- Whether "first matching rule wins" is the right tie-break policy when a
  product matches multiple rules (implemented this way, flagged as a
  question in NOTES.md)
- Whether keyword matching should be substring (as implemented, per the
  task's literal wording) or whole-word (also flagged in NOTES.md)

## Not yet built / intentionally out of scope

- Real Prisma repository implementation once the schema is known (current
  in-memory repositories have the exact function signatures a real one
  would — only their bodies would change)
- Real bearer-token auth (currently a header stand-in, see `src/plugins/fakeAuth.js`)
- The two UI prototypes are plain HTML/React demos of the two real screens,
  not the actual `leap` (Vue/Quasar) or `leap-admin` (Next.js) codebases —
  but they DO call the real backend above, they are not disconnected mocks
