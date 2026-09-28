# Product Rules — Step 1 Notes (DB schema + migration)

## What this step delivers

- `ProductRule` model: one row = one criterion (NCM prefix or keyword),
  scoped to a company, with active/inactive status.
- New fields on the existing invoice/item tables to store the frozen
  block decision and the reimbursable total.
- A backfill migration so existing invoices are unaffected (their
  `reimbursableAmount` starts equal to their `amount`).

## Assumptions made (please confirm against the real schema.prisma)

1. Existing model names are `Company`, `Invoice`, `InvoiceItem`. If the
   real names differ (e.g. `Empresa`, `NotaFiscal`, `NotaFiscalItem`,
   or something in the PR-parser naming style like `Receipt`/
   `ReceiptItem`), every reference below needs renaming.
2. `Invoice` already has a field holding the fiscal total — I called it
   `amount`. This field is read-only from this feature's perspective.
3. `InvoiceItem` already has a field for the product's NCM code and one
   for its description/name. Exact field names unconfirmed.
4. IDs are Prisma `cuid()` strings, matching a common modern Prisma
   convention. If the real project uses auto-increment integers or
   UUIDs, the `id String @id @default(cuid())` lines need to change
   accordingly — this affects every new foreign key too.
5. `blockedByRuleId` is optional and does not cascade-delete
   `InvoiceItem` rows when a `ProductRule` is deleted. This is required
   by the task ("keeping a copy of the rule name so the warning
   survives the rule being renamed or deleted") — deleting a rule must
   never delete or block deletion of historical invoice data.

## Open business-logic questions (not schema questions — worth asking the team before Step 2)

1. **Multiple rules matching one product — RESOLVED, not still open.**
   The repository sorts active rules by `createdAt ASC, id ASC` before
   the matcher ever sees them (`findActiveRulesByCompany` in
   `productRuleRepository.js`), and the matcher takes the first match in
   whatever order it's given. Contract, stated plainly: **if multiple
   active rules match the same product, the oldest active rule wins; if
   two rules share the exact same `createdAt` (unlikely but possible),
   `id` breaks the tie.** This is deterministic and tested
   (`__tests__/reviewFixes.test.js`).

2. **Keyword matching granularity.** Task says "the rule value appears
   anywhere in the product name, ignoring case and accents" — this
   reads as pure substring matching, not whole-word matching. That
   means a rule for "cerveja" would also match a product literally
   named "cervejaria" (a place name/category, not a beverage). Worth
   confirming this is the intended (simpler) behavior before locking
   in substring-only matching, since it's cheap to add a whole-word
   boundary check now but harder to migrate blocked-flag history later
   if the rule changes shape after data already exists.

3. **Company-scoping enforcement layer.** The task requires "an admin
   only sees and edits their own company's rules" and "rules from one
   company never affect another company's invoices." I'm assuming this
   must be enforced at the service layer (every query filtered by the
   authenticated user's companyId), not just hidden in the UI — worth
   explicitly confirming this matches how other company-scoped
   resources (e.g. employees, folders) are already secured in leap-api,
   so Step 2 follows the same pattern rather than inventing a new one.

4. **Invoice amount vs. sum of item totals may not reconcile exactly.**
   Real NFC-e invoices can include discounts, freight, or rounding
   adjustments, so `sum(item.valorTotal)` is not guaranteed to equal
   `invoice.amount`. `computeReimbursableAmount` only ever subtracts
   blocked items' totals from the invoice's own `amount` — it never
   validates the two reconcile — and `reimbursableAmount` is floored at
   0 (`src/money.js`) as a defensive measure, not a business rule. I did
   not invent a reconciliation/validation policy here because real
   NFC-e data may have known, legitimate reasons for the mismatch that
   I have no visibility into — this needs an answer from whoever owns
   the existing invoice-normalization logic, not a guess baked into the
   matcher.

5. **A rule now covers a LIST of match values (added 2026-09-10, per
   product feedback).** A category like "alcohol" maps to several NCM
   codes (beer, wine, spirits are separate codes), so a rule's
   `matchValues` is now `string[]`, and matches if the item hits ANY
   value in the list. Two things still need answers from the team,
   not guessed at here:
   - **The actual code list.** The seed data in `server.js` ships a
     starter list for "Alcoholic drinks" (NCM chapter 22 prefixes) and
     "Tobacco" (chapter 24 prefixes) — these are well-known chapter
     groupings, NOT verified against Brazil's official NCM/TIPI table.
     Before this goes anywhere near production, someone who owns
     fiscal classification data needs to confirm the full, authoritative
     list per category.
   - **How the list is stored in MySQL.** Prisma's native list type
     isn't supported on MySQL — see the OPEN QUESTION comment in
     `schema-additions.prisma` for the two real options (JSON column
     vs. a child table) and why I didn't pick one unilaterally.

## Next step (Step 2, once the above is confirmed or reasonably assumed)

A single pure function, e.g. `evaluateInvoiceAgainstRules(items, rules)`,
with no I/O — takes already-fetched items and rules, returns which
items are blocked and by which rule. This is the piece both the
preview endpoint and the save endpoint call, so their behavior can
never drift apart. Easiest piece to unit-test in isolation before
wiring up routes.
