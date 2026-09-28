# Product Rules for Non-Reimbursable Items — Design Walkthrough

*Prepared as a take-home submission. No access to the real `leap`, `leap-admin`,
or `leap-api` repositories was available — this document is explicit about
what is a confirmed design decision vs. an assumption to validate against
the real codebase.*

---

## 1. The task in one sentence

> A rule is the company's *current* policy. Once an invoice is saved, the
> match result becomes a *historical fact* that never changes again, even
> if the rule that caused it is later edited or deleted.

Everything else in this design follows from keeping those two things —
live policy and frozen history — strictly separate.

---

## 2. Why this task is "medium-hard", and where specifically

Not a single hard algorithm — the matching logic itself is a few lines.
The difficulty is that **one feature touches six layers** (DB, admin UI,
API, employee app, ERP integration, budget calc), and if any two of them
drift out of sync, the failure mode is silent — wrong numbers, not a
crash. The three riskiest spots, in order:

1. **Company data isolation.** A leak here is the worst possible outcome —
   company A's rule must never affect company B's invoice, in either
   direction.
2. **Preview/save consistency.** If preview and save each implement their
   own matching logic, they *will* eventually disagree — showing "OK" on
   preview and then blocking on save (or the reverse) is a confusing,
   hard-to-reproduce bug.
3. **Keyword matching semantics.** "cerveja" (beer) as a substring also
   matches "cervejaria" (a bar/venue name) — technically correct per the
   task's literal wording, but worth a business sign-off before shipping.

---

## 3. Data model

```
Company
   │
   ├── ProductRule (Alcohol, keyword "cerveja")
   ├── ProductRule (Tobacco, keyword "cigarro")
   └── ProductRule (Fuel, ncm_prefix "2710")

Invoice                              <- fiscal document, amount is READ-ONLY
   │  amount = 60           (never touched by this feature)
   │  reimbursableAmount = 30   (NEW, computed once, frozen at save)
   │
   ├── InvoiceItem: Arroz         blocked=false
   ├── InvoiceItem: Cerveja       blocked=true, blockedByRuleName="Alcohol" (SNAPSHOT)
   └── InvoiceItem: Refrigerante  blocked=false
```

**Key decision: `blockedByRuleName` is a copied string, not just a foreign
key.** The task requires the warning to survive the rule being renamed or
deleted. A foreign key alone breaks the moment the rule is deleted (or
silently changes meaning if renamed). Copying the name at evaluation time
is what makes the historical record self-contained.

**Key decision: `reimbursableAmount` is a stored column, computed once,
not a derived value re-computed on every read.** If it were computed live
from current rules, deleting a rule tomorrow would silently change last
month's budget numbers today — directly violating "blocked state is
frozen at save time."

**Backfill requirement:** every invoice that exists before this ships
must get `reimbursableAmount = amount`, or historical budget totals move
on deploy day for no reason. (See `migration.sql`.)

Real table/column names were never available, so `schema-additions.prisma`
documents every assumed name inline and `NOTES.md` lists them separately —
this is expected to need adjusting once matched against the real
`schema.prisma`.

---

## 4. Request flow

```
Admin Dashboard                                Employee App
      │                                              │
      ▼                                        scan invoice
 CRUD rules                                          │
 (company-scoped)                                    ▼
      │                                        POST /invoices/preview
      ▼                                              │
 ProductRule table                          load ACTIVE rules (company)
                                                      │
                                              evaluateInvoiceAgainstRules()
                                                      │
                                              show warning + both totals
                                                      │
                                              user clicks Save
                                                      │
                                              POST /invoices/save
                                                      │
                                    load ACTIVE rules AGAIN (fresh read)
                                                      │
                                              evaluateInvoiceAgainstRules()
                                                      │
                                    persist: amount, reimbursableAmount,
                                             per-item blocked + rule snapshot
                                                      │
                                        ┌─────────────┴─────────────┐
                                        ▼                           ▼
                                  App shows saved             ERP send uses
                                  invoice + warnings           reimbursableAmount
                                                              (refuses if 0)
```

**Why save re-reads rules instead of trusting the preview result:** the
task explicitly calls this out, and it closes a real race condition — an
admin could disable a rule in the seconds between the user previewing and
clicking save. Trusting a cached preview result would silently reimburse
something the company just decided not to.

**Why preview and save call the *same* function:** this isn't a style
preference — it's the only way to structurally prevent the "preview says
fine, save blocks it" class of bug. Both endpoints call
`evaluateInvoiceAgainstRules(items, rules)`, a pure function with no I/O,
so there is only one place the matching logic can be wrong.

---

## 5. Matching logic

| Match type | Rule | Product | Logic |
|---|---|---|---|
| NCM_PREFIX | `2203` | NCM `2203.00.00` | strip all non-digits from both sides, then `startsWith` |
| KEYWORD | `cerveja` | `"Cerveja Brahma"` | NFD-normalize + strip accents + lowercase both sides, then substring `includes` |

A product is blocked if it matches **any** active rule. When multiple
active rules match the same product, this implementation records the
**first match in stable creation order** — flagged as an assumption
worth confirming, since the task says "which rule blocked it" in the
singular without specifying a tie-break.

Unknown/future rule types **fail closed** (never block) rather than fail
open (block everything) — a deliberate defensive choice: a bug should
never accidentally start blocking every reimbursement company-wide.

22 tests cover this function alone (case-insensitivity, accent-folding,
NCM punctuation variance, inactive rules being ignored, multi-rule
tie-break, unknown match type, empty rule sets).

---

## 6. Company isolation — how it's actually enforced

Not just "hidden in the UI." Every repository function requires
`companyId` as an argument and filters by it:

```js
findActiveRulesByCompany(companyId)      // never findAllActiveRules()
findRuleByIdForCompany(id, companyId)    // returns null if id belongs to another company
```

And `companyId` is never read from the request body — only from
server-trusted auth context (`request.companyId`, set by an auth
middleware reading a verified token — stubbed here since real auth isn't
available, see `src/plugins/fakeAuth.js`). A malicious client sending
`{"companyId": "someone-else"}` in the request body has no effect;
routes/services never look there.

This is tested at three levels: the pure matching function (rules from
company B never evaluated against company A's items), the service layer
(company A cannot read/update/delete company B's rule by guessing its
id), and the HTTP layer (same checks, over `fastify.inject()` — an
in-process simulated request, no real network needed).

---

## 7. ERP send and folder batch

- Send uses `reimbursableAmount`, never `amount`.
- `reimbursableAmount === 0` → refuse with a clear error, never push a
  zero-value entry to the ERP.
- Inside a folder batch, one fully-blocked invoice is **skipped**, not a
  reason to abort the rest of the batch. A genuine ERP/network error,
  however, still propagates — silently swallowing a real outage would
  hide a systemic problem, whereas skipping a business-rule refusal is
  expected, routine behavior. (This distinction is implemented but worth
  confirming against how the real folder-send code already handles
  partial failures, if it does.)

---

## 8. What's implemented and runnable vs. what's still a design/mock

| Layer | Status |
|---|---|
| DB schema design + backfill migration | Designed (assumed table/column names, documented) |
| Matching function (`evaluateInvoiceAgainstRules`) | **Implemented, 22 tests** |
| Rule CRUD service, company-scoped | **Implemented, tested** |
| Invoice preview/save service | **Implemented, tested** |
| ERP send + folder batch logic | **Implemented, tested** |
| HTTP routes (Fastify) | **Implemented, tested, runnable with `npm run dev` + curl** |
| Persistence | In-memory stand-in — same function signatures a real Prisma repository would have; swapping in real Prisma only touches `src/repositories/*.js` |
| Auth | Header stand-in (`x-company-id`) — same swap principle, only `src/plugins/fakeAuth.js` changes |
| Admin dashboard UI, App UI | **Implemented as prototypes, and connected to the real backend above (not static mocks)** |
| Budget wiring | **Implemented and tested** — invoice save consumes `reimbursableAmount`, not the raw amount |

**62 automated tests, all passing**, spanning unit (matching function),
service, and HTTP-integration levels — deliberately mirroring the
unit/contract/security/integration split the real `leap-api` already
uses per its own engineering docs.

---

## 9. Open questions for the team (would ask before/while building further)

1. When one product matches multiple active rules, which rule should be
   recorded — first match, most specific, or all of them? (Implemented
   as "first match in creation order" — easy to change, but the answer
   changes the function's contract.)
2. Is keyword matching meant to be pure substring (as implemented, per
   the task's literal wording), or should it be whole-word? ("cerveja"
   currently also matches "cervejaria".)
3. Does the real folder-send code already have a "skip failed item,
   continue the rest" pattern we should reuse, or is this the first
   feature to need it?
4. Real schema names — table/column names, ID type (cuid vs.
   auto-increment vs. UUID), and whether `InvoiceItem.valorTotal` really
   is the right per-item source of truth for computing
   `reimbursableAmount`.
