# Block 5 — ingestion and shared domain implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` inline, task by task, with one fresh whole-branch review before release. Steps use checkbox syntax.

**Goal:** Complete phase 6 of the approved refactor in the final PR, preserving financial history and old clients.

**Architecture:** Pure TypeScript mail parsers and normalization feed both Node and a generated Apps Script IIFE. Database-backed merchant rules and bounded providers preserve the existing ingestion transaction and idempotency. Shared calculations and schemas are split by domain while preserving runtime contracts.

**Tech stack:** Existing TypeScript, Zod, Drizzle/PostgreSQL, Vitest/MSW/PGlite, esbuild and Apps Script V8.

**Spec:** `PLAN-REFACTOR-wallet-web-personal.md`, Library `libfile_9f80fa2edc88819195e2934855353926`, phase 6, lines 450–523, read directly from Library. Local materialization failed in both authorized supported attempts; this document is an execution plan, not a reconstructed Library file.

## Global constraints

- Base: merged main `2b393e60a57cb79b77e7713d2b023eef01dd0fb4`.
- One branch `refactor/05-ingestion-shared`, reusing the existing isolated G14 worktree. Preserve the original checkout.
- Only one remaining PR. Incremental descriptive commits without coauthors, explicit branch pushes, no force or direct main push.
- Synthetic test data only; no real batches, production bootstrap, financial-data copies, secrets, scopes, trigger or permission changes.
- Preserve old payloads, frozen FX, idempotent financial writes, Needs review for unresolved classifications/mappings and archived history.
- Only additive, tested, recoverable migrations. Validate target and schema compatibility before rollout; leave previous migrations/journal intact.
- Live Apps Script only through Chrome on G14, verified `savarole@gmail.com`, project `wallet-automation` / `19s-crKLBFN90ljuoL3dTK3Jh3rR5z-yVpzNBdIdq094zip2J55IgLam3`, after backup and compatible backend deployment. No Run action or real mailbox processing.

## Review focus

- A lost response and retry must create one financial operation; equal salaries on different dates must remain distinct.
- Category rename, overlapping Uber/Uber Eats aliases, generic payment processors and unknown bank mappings must retain correct classification/review behavior.
- Concurrent provider failures, half-open recovery and invocation deadlines must not call an open circuit or delay a review fallback by 30 seconds.
- Old backups and old Apps Script payloads must remain compatible across additive schema changes and code rollback.
- The generated V8 bundle must match the TS parsers exactly and preserve date, currency, merchant asterisks and strict amount handling.

## Task 1: Typed parsers and generated Apps Script runtime

**Files:** `shared/mail-normalization.ts`; `server/ingestion/parsers/{types,index,itau-credit,itau-debit,itau-transfer,itau-payment,automation-wallet}.ts`; `mail-service/runtime.ts`; `scripts/build-mail.ts`; `mail-service/{normalization,EmailProcessors}.gs`; sandbox VM loader/tests; package scripts/lock.

**Interfaces:** `MailMessage` holds from/subject/date/plainBody/htmlBody. `NormalizedTransaction` preserves the existing consumption shape. Each parser exposes `parse(message): NormalizedTransaction | null`. `WalletMail` IIFE exports dispatch, parsers and shared normalizers; legacy GS entry functions remain adapters. Existing `processPendingEmails` and API payloads retain their behavior.

- [x] Add parser and TS/GS parity regressions for all five formats, malformed recognized messages, formatting asterisks, currencies and dates; run and observe missing-module failures.
- [x] Move existing parser logic without changing financial semantics; generate ES2019 IIFE with esbuild and update the VM loader to execute the actual generated file.
- [x] Add `mail:build` and deterministic `mail:check`; run parser, normalization and sandbox mail suites, types and generated-output check. Expected: all pass, no real services.
- [x] Commit and push this independently validated stage to the same branch.

## Task 2: SQL merchant rules and compatible schema foundation

**Files:** `server/ingestion/{category-resolution,merchant-rules}.ts`; `server/ingestion/process-mail-ingestion.ts`; `server/db/schema.ts`; shared mail-source/backup schemas; one additive migration and Drizzle metadata; category/migration/backup tests.

**Interfaces:** `resolveCategory(db, merchantRaw, useCorrections)` preserves the existing resolution result. SQL returns only matching alias candidates; protected category identities use `systemKey`. New provider-state schema is operational, separate from financial history.

- [x] Add RED tests for rename stability, overlapping and exact aliases, generic processors, unmapped accounts, old payload/source compatibility and migration rollback/repetition.
- [x] Seed current generic rules and Uber/Taxi/insurance overrides as data, resolving categories by stable keys. Remove `genericMerchantCategoryRules` and name-dependent runtime rules; match candidate aliases and corrections in SQL.
- [x] Introduce typed ingestion sources without discarding historical backup values or breaking deployed clients. Preserve existing record/event deduplication and goal writes.
- [x] Verify migration on disposable PostgreSQL/PGlite, full category/mail/concurrency/backup tests, OpenAPI and types. Expected: old and new clients remain compatible, earlier journal untouched.
- [x] Commit and push the validated stage as a draft checkpoint. Apply and verify the compatible schema before authenticated preview testing or production activation.

## Task 3: Bounded providers, persistent circuits and hourly cleanup

**Files:** `server/ingestion/providers/{types,category,rates,circuit,budget}.ts`; existing OpenAI/FX compatibility exports; ingestion pipeline; operational state/cleanup module; provider/integration tests; `vercel.json` maxDuration only.

**Interfaces:** Provider `{name, call(input, {signal, budgetMs})}`; category maximum 10000 ms, FX maximum 4000 ms. Persistent circuit state uses name/open_until/failures, atomic failures and a bounded half-open probe. Stored/frozen rates are preferred; unavailable values lead to review, never invented 1:1.

- [x] Add RED fake-provider and real synthetic-DB tests for timeout, abort, threshold/open/half-open/reset, parallel failures and hourly cleanup claims.
- [x] Use three consecutive failures and a five-minute open interval; this fills unspecified N/M and is documented as an implementation choice. Keep total rate-provider work within its invocation budget.
- [x] Retain Frankfurter v2 after checking its official current currency catalog includes UYU and ARS; validate returned pair/date/finite-positive rate and remove the unused `fixed_fallback` type.
- [x] Make metadata pruning at most hourly through an atomic operational-state claim. Set a bounded function maxDuration without changing routing or security settings.
- [x] Run provider, mail integrity/concurrency, FX and sandbox failure tests; types/lint/spec. Expected: review fallback, no mutation retry, no real provider calls in tests. Commit/push.

## Task 4: Shared domain, inferred schemas and safe import scripts

**Files:** `shared/{dates,money,balances,cards,debts,analytics,budgets,goals}.ts`; `shared/schemas/*`; `shared/types.ts`; consumers/tests; `shared/simulations.ts`; both import scripts and synthetic tests.

**Interfaces:** Existing exported function names keep their financial behavior in focused modules. Clock-dependent calculations receive an explicit `now`. Types derive from Zod; patch nullability/defaults retain current contracts. Script modules expose pure preparation and atomic execution functions for synthetic testing.

- [x] Pin equal-salary/different-date identity, deterministic clock/cutoff behavior, legacy schema/default/patch/nullability and importer rollback with RED tests where behavior is missing.
- [x] Split calculations and update all imports; delete `shared/calculations.ts`, unused constants fixtures and the one-line wallet-backup barrel. Consolidate date/money helpers without changing persistence arithmetic.
- [x] Split schemas by entity, modernize UUID/ISO Zod calls and infer domain types without manually duplicating interfaces. Preserve backup compatibility and generated OpenAPI.
- [x] Use `process.loadEnvFile` in the wallet importer and one atomic batch; merchant catalog path comes from argument/env with no personal WSL default or fixed rule count. Never execute either importer against a real database.
- [x] Run shared/schema/importer regressions, frontend financial parity, types/lint/build/spec and sandbox. Expected: no calculations source file or rule table in TS; all checks pass. Commit/push.

## Task 5: Single final release and conditional live Apps Script update

- [x] Update README, mail instructions, operational checkpoint and generated artifacts. Run `mail:check`, full `npm run check`, sandbox and synthetic full-stack smoke including ingestion retries, equal salaries, generic/unmapped review and backup/restore. Stop own servers.
- [x] One fresh whole-branch reviewer; fix Important/Critical findings with RED→GREEN and a green suite, record rulings and deferred minors.
- [ ] Validate additive migration target and rollback evidence before authenticated preview testing or release. Draft branch pushes and build verification preserve the checkpoint while that gate is pending; they do not authorize requests against real financial data. Open one draft PR, require exact-head CI and READY preview, then ready/normal merge without bypass. Verify main CI, merged SHA, production READY/alias and unauthenticated GET smoke.
- [ ] Reverify Chrome identity/project, save a prior-code backup, compare versioned GS artifacts with the deployed backend contract, then apply through the authorized browser workflow only. No triggers/scopes/properties/credentials/real batches. If a precondition fails, leave the tested versioned code and report the exact blocker.
- [ ] Record final evidence and stop; no sixth PR or unrelated work.
