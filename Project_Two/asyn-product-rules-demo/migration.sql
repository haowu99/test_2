-- ============================================================
-- PRODUCT RULES FEATURE — backfill migration
-- ============================================================
--
-- ASSUMPTION: table/column names below are guesses based on the
-- Prisma model names in schema-additions.prisma (`Invoice`,
-- `InvoiceItem`, `Company`, `ProductRule`). Prisma's default
-- @@map behavior would produce table names like `Invoice` or
-- `invoices` depending on the project's conventions — confirm the
-- real generated table/column names before running this.
--
-- Run this AFTER the schema migration that adds the new columns
-- (reimbursableAmount, blocked, blockedByRuleId, blockedByRuleName)
-- but BEFORE the feature is enabled for any company.

-- 1) Every existing invoice must keep counting its full value.
--    reimbursableAmount starts equal to amount for all rows that
--    exist at migration time.
UPDATE Invoice
SET reimbursableAmount = amount
WHERE reimbursableAmount IS NULL;

-- 2) Every existing invoice item is, by definition, not blocked —
--    the feature did not exist when these were saved.
UPDATE InvoiceItem
SET blocked = FALSE,
    blockedByRuleId = NULL,
    blockedByRuleName = NULL
WHERE blocked IS NULL;

-- Sanity check to run manually after migration (not part of the
-- automated migration itself): total reimbursableAmount across all
-- pre-existing invoices should exactly equal total amount, i.e. this
-- should return zero rows.
--
-- SELECT id FROM Invoice WHERE reimbursableAmount <> amount;
