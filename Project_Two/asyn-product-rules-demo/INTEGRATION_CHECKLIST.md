# Integration Map & Production Checklist

## Where this code would live in the real repositories

```text
leap-api/
├── prisma/schema.prisma
│   └── ProductRule model + Invoice.reimbursableAmount +
│       InvoiceItem.blocked/blockedByRuleId/blockedByRuleName
│       (see schema-additions.prisma for the proposed additions)
├── prisma/migrations/xxxx_product_rules/
│   └── migration.sql (backfill logic in this repo's migration.sql)
├── src/routes/admin/productRules.js      <- src/routes/productRules.js
├── src/routes/app/invoices.js            <- src/routes/invoices.js
├── src/services/productRuleService.js    <- src/services/productRuleService.js
├── src/services/invoiceRuleService.js    <- src/services/invoiceRuleService.js
├── src/services/erpSendService.js        <- src/services/erpSendService.js
├── src/services/budgetService.js         <- src/services/budgetService.js
├── src/repositories/productRuleRepository.js  <- swap in-memory for Prisma calls
├── src/repositories/invoiceRepository.js      <- swap in-memory for Prisma calls
├── src/repositories/budgetRepository.js       <- swap in-memory for Prisma calls
└── src/plugins/auth.js                   <- replace fakeAuth.js entirely

leap-admin/
├── src/app/(protected)/product-rules/page.tsx   <- admin-ui/product-rules-prototype.html
├── src/components/product-rules/RuleForm.tsx    <- (the RuleForm component in that file)
└── src/lib/api/productRules.ts                  <- (the fetch calls in that file)

leap/
├── invoice preview/save screen              <- app-ui/invoice-preview-prototype.html
├── blocked-item warning component           <- (the ItemRow component in that file)
└── ERP send action (folder + single)        <- calls erpSendService via the API
```

The left column above is this project. The right column (or inline note) is
the real file it maps to. Nothing here was invented to *look* like it lives
in a real Next.js/Vue app — the two prototypes are plain HTML/React so they
stay honest about being demonstrations, not the actual production code.

---

## Before applying the schema changes (confirm against real `schema.prisma`)

- [ ] Real model names: `Company`, `Invoice`, `InvoiceItem` (assumed — see `NOTES.md`)
- [ ] Real ID type: `cuid()` string vs auto-increment int vs UUID
- [ ] Real field for invoice's fiscal total (`amount` assumed)
- [ ] Real field for product NCM code and description/name
- [ ] Whether money fields are `Decimal` (they should be) and this
      demo's `number`-based arithmetic (see `src/money.js`) is replaced
      accordingly at the repository boundary
- [ ] Existing `@@map` / table naming conventions in the real project

## Before deploying the backfill migration

- [ ] Run `migration.sql` in a staging environment first
- [ ] Verify `SELECT id FROM Invoice WHERE reimbursableAmount <> amount`
      returns zero rows for all pre-existing invoices
- [ ] Confirm budget/dashboard totals are unchanged for a sample of
      existing employees before/after the migration
- [ ] Only enable the feature (i.e. allow companies to create active
      rules) after the backfill has run successfully

## Wiring into the real API (beyond swapping repositories)

- [ ] Replace `src/plugins/fakeAuth.js` with the real bearer-token auth
      middleware; `request.companyId` / `request.role` must come from a
      verified session, never from a client-supplied header (see the
      warning at the top of `README.md`)
- [ ] Wrap invoice persistence + budget consumption in the same
      transaction boundary the real API's service layer already uses
      for multi-write operations (see the comment in
      `src/services/invoiceRuleService.js`)
- [ ] Reuse whatever "skip and continue" pattern the real folder-send
      code already has, if one exists, instead of the one added here
      (see `src/services/erpSendService.js`)

## Rollback safety

- [ ] The new columns (`reimbursableAmount`, `blocked`,
      `blockedByRuleId`, `blockedByRuleName`) are additive — old code
      paths that don't know about them can safely ignore them
- [ ] Do not delete `blockedByRuleName` snapshots even after a
      `ProductRule` is deleted — that snapshot is the only thing keeping
      historical invoices' warnings intact
- [ ] `blockedByRuleId` must never cascade-delete `InvoiceItem` rows;
      it should be nullable / `SetNull` at most
