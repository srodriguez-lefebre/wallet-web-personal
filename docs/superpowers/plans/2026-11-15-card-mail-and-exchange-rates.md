# Card mail settings and exchange rates implementation plan

> **For agentic workers:** Use superpowers:executing-plans with focused regression tests.

**Goal:** Configure credit card mail routing and the exchange rate used for estimates from Cards.

**Architecture:** Store each card's mail settings in Wallet. Resolve them when the API ingests a normalized notification. Use the selected bank feed for that card's conversions and record its provenance alongside the frozen rate.

**Tech stack:** React, Zod, Drizzle/Neon, TypeScript, Vitest.

**Spec:** Card setup and bank quote selection agreed in this conversation.

## Global constraints

- Preserve the existing Apps Script payload and the behavior of existing explicit mappings until settings are saved in Wallet.
- Keep debits and transfers on the existing routing path. The first release covers credit card notices.
- Migrate the schema additively. A deployment reading a database from before this migration can still import mail and open Cards.
- Use only the selected source for an opted-in card. Historical estimates require a quote dated at or before the transaction and within four days.
- Preserve recorded amounts, retry identity, and backup and restore compatibility.

## Tasks

- [ ] Add a failing HTTP test in `server/api/wallet-flow.test.ts` for reading, replacing and clearing a card's mail settings. Add `card_mail_settings`, typed GET and PUT under `/api/cards/:id/mail-settings`, and backup support. Verify pre-migration reads, ID validation and backup round-trip.
- [ ] Add failing ingestion tests in `server/ingestion/mail-integrity.test.ts` for source and suffix or alias resolution, ambiguous matches, legacy payloads, and the selected rate. Reuse `runProvider` and the existing review workflow. Add validated adapters for Itaú LINK or pizarra, BROU eBROU or pizarra, and Santander Supernet or pizarra. Offer current Frankfurter reference. Select the side for the debit estimate, including Santander's amount tiers. Reject future, missing, or stale rates.
- [ ] Add a Cards dialog for bank notices using the normal authenticated routes, card availability and account selectors. Test submission by name and persistence through reload. Document one-time Apps Script setup, migration from old mappings, operator checks, quote coverage and fallback. Regenerate OpenAPI and run `npm run check`. Review and merge the PR.
