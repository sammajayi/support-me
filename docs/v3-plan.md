# SupportMe v3 — Implementation Plan

Scope: **USDC as a second donation asset** + **SEP-24 withdraw (creator cash-out)**
+ **neobrutalism UI rebrand**. Testnet only, against the SDF reference anchor
`testanchor.stellar.org`. No contract changes, no DB migration.

See [PRD(v3)](../PRD(v3).md) for requirements and rationale.

---

## Guiding principles

- **Minimal change surface.** The contract already takes a token address and the DB
  already has a `currency` column — lean on both. Don't touch contracts.
- **Additive, not destructive.** XLM flow keeps working unchanged; USDC and withdraw
  are additions.
- **Keep CI green at every step.** Run the relevant suite after each phase.

---

## Phase 0 — Baseline (verify before changing)

- [ ] Run existing suites to confirm a green starting point:
  - `cd frontend && npm run build && npx vitest run`
  - `cd backend && npm test`
  - `cargo test --workspace`
- [ ] Note any pre-existing failures so they aren't blamed on v3.

## Phase 1 — Neobrutalism rebrand (UI only, no behavior change)

Do this first so multi-asset/withdraw UI is built in the new style, not restyled later.

- [ ] `frontend/app/globals.css` — replace `@theme` tokens: add `--color-ink` (#000),
      flat block accent colors, `--shadow-brutal: 4px 4px 0 #000`. Remap `--color-primary`
      etc. to saturated flats; drop gradients.
- [ ] Landing `frontend/app/page.jsx` — hard borders, offset shadows, remove `☕`/emoji,
      rebrand hero copy to "Get tipped in crypto. Cash out to your bank." Keep Hugeicons.
- [ ] `frontend/components/DonationForm.jsx` — neobrutalist inputs/button; replace `💜`.
- [ ] `frontend/app/[username]/page.tsx`, `dashboard/page.tsx`, `settings/page.tsx`,
      `components/Skeleton.tsx` — apply the system.
- [ ] Update any Vitest assertions that key off old text/emoji/classes.
- [ ] `npx vitest run` + `npm run build` green.

## Phase 2 — USDC as a second asset (frontend-only)

- [ ] `frontend/lib/assets.js` — asset registry: `XLM` (native SAC via SDK) and
      `USDC` (issuer + SAC id from env). Single source of truth.
- [ ] `frontend/lib/contract.js` — `sendDonation` accepts an asset; resolve SAC id
      from the registry instead of hardcoding native (`:57`). Default XLM. Clear
      "asset not configured" error if USDC env missing (mirror existing guard).
- [ ] `frontend/app/[username]/page.tsx` / `DonationForm.jsx` — asset selector
      (XLM default, USDC option); amount label + balance display are asset-aware;
      pass real `currency` when POSTing the donation to the backend.
- [ ] Confirm dashboard + recent-supporters render `currency` per donation.
- [ ] Env: `NEXT_PUBLIC_USDC_ISSUER`, `NEXT_PUBLIC_USDC_SAC_ID` (+ `.env.example`).
- [ ] Tests: extend contract/donation-form tests for asset selection; `vitest` green.

## Phase 3 — SEP-24 withdraw (creator cash-out)

- [ ] `frontend/lib/anchor.js` — client module mirroring the SDF `basic-payment-app`:
  - [ ] `getTransferServerSep24(domain)` — read `TRANSFER_SERVER_SEP0024` from TOML.
  - [ ] SEP-10 auth: fetch challenge, sign with wallet, exchange for anchor token.
  - [ ] `getInfo()` — `GET /info`, confirm withdraw supported for the asset.
  - [ ] `initiateWithdraw({ authToken, assetCode, account })` —
        `POST /transactions/withdraw/interactive` (bearer), return interactive `url`.
  - [ ] `launchPopup(url)` — append `&callback=postMessage`, `window.open`, listen
        for `message`; open synchronously in the click handler to avoid popup block.
  - [ ] On `withdrawal` callback: build payment to `withdraw_anchor_account` for
        `amount_in` with base64 `withdraw_memo`; sign via wallet; submit.
  - [ ] `pollTransaction(id)` — `GET /transaction?id=` until terminal
        (`completed`/`error`); expose intermediate `pending_*` states.
- [ ] `frontend/app/settings/page.tsx` — "Cash out" panel (creator + connected wallet
      only): trigger button, live status (`incomplete` → `pending_user_transfer_start`
      → `pending_anchor` → `completed`/`error`), fallback link, testnet-sandbox note.
- [ ] Env: `NEXT_PUBLIC_ANCHOR_HOME_DOMAIN=testanchor.stellar.org`,
      `NEXT_PUBLIC_ANCHOR_ASSET_CODE` (+ `.env.example`).
- [ ] Tests: unit-test the anchor module's pure parts (TOML parse, status mapping)
      with mocked fetch; component test for the settings panel states.

## Phase 4 — Docs, verify, ship

- [ ] Update `README.md`: v3 section (multi-asset + SEP-24 withdraw), env vars,
      testnet-anchor note. Update `docs/architecture.md` with the anchor flow.
- [ ] Full green: `cargo test --workspace`, backend `jest`, `vitest run`,
      `next build`.
- [ ] Manual smoke on testnet: XLM tip, USDC tip, full withdraw against
      `testanchor.stellar.org`.
- [ ] Commit on a feature branch; open PR (only when you ask).

---

## What we are explicitly NOT doing in v3

- No SEP-24 **deposit** (fan fiat on-ramp).
- No **path-payment** auto-settlement.
- No **contract** changes; no on-chain asset field in the donation log.
- No **mainnet** / real NGN anchor.

## Risk notes

- Sandbox may only advertise **SRT** for withdraw — asset code stays env-configurable;
  demo the withdraw with whatever the anchor supports.
- Neobrutalism touches many components — run `vitest` after Phase 1 before moving on.
- Popup must open synchronously from the user click, or browsers block it.
