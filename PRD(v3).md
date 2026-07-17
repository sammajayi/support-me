# SupportMe — Product Requirements Document (v3)

**Version:** 3.0
**Date:** July 2026
**Project:** SupportMe — Fiat-Ramped, Multi-Asset Tipping for Creators
**Stack:** Next.js · Stellar SDK · Soroban (Rust) · Express · Prisma · PostgreSQL

---

## 1. Overview

SupportMe already settles creator tips on-chain: wallet-based auth, a two-contract
Soroban settlement/registry split, live SSE dashboards. v3 closes the real-world
loop and adds asset choice, while keeping the change surface deliberately small.

Two capabilities ship in this iteration:

1. **Multi-asset donations** — supporters can tip in **USDC** as well as **XLM**.
2. **Fiat off-ramp (SEP-24 withdraw)** — a creator cashes out their balance to a
   bank account through a Stellar **anchor**, from `/settings`, without leaving the
   platform or touching a CEX.

Everything else (deposit on-ramp, path-payment auto-settlement, mainnet NGN anchor)
is explicitly **out of scope** for v3 and parked in the roadmap.

The UI is **rebranded to a neobrutalist design system** in the same iteration.

---

## 2. Why This Scope

- **Contract already supports multi-asset.** `donation::donate` takes a
  `token: Address` and transfers via a generic `token::Client`
  (`contracts/donation/src/lib.rs:73-86`). XLM-only is a *frontend* limitation
  (`frontend/lib/contract.js:57` hardcodes the native SAC). Adding USDC needs no
  contract change and keeps every existing Rust/Jest/Vitest suite green.
- **DB already models currency.** `Donation.currency String @default("XLM")`
  already exists in `backend/prisma/schema.prisma`, and the frontend `Donation`
  type already carries a `currency` field. No migration required for multi-asset.
- **SEP-24 withdraw needs no contract change.** It is an external anchor
  integration wired into `/settings`. It is the single highest-value piece of the
  new vision ("cash out to a bank") and self-contained.
- **The anchor is a required third party, but free for the MVP.** SEP-24 is a
  protocol for talking to a regulated **anchor**; the anchor is structurally
  required. For the MVP we use the SDF reference anchor at
  **`testanchor.stellar.org`** (issues the Stellar Reference Token, SRT; fake KYC;
  testnet). No signup, cost, or partnership. The same client code repoints at a
  real NGN anchor on mainnet later by swapping the home domain.

---

## 3. Target Users

- **Creators** active on social platforms who want a shareable tip link and the
  ability to cash out to a bank account.
- **Supporters** who want to tip in the asset they hold (XLM or USDC).
- **Diaspora supporters** who prefer USD-denominated (USDC) tips.

---

## 4. In Scope (v3)

### 4.1 Multi-Asset Donations (USDC + XLM)

- Supporter picks the asset (XLM or USDC) on the creator profile donation form.
- The frontend resolves the correct SAC contract address per asset and passes it
  to the unchanged `donate` contract call.
- The donation is recorded off-chain with its real `currency` value.
- Dashboard, recent-supporters feed, and stats display the asset per donation.

**Requirements**
- Asset selector defaulting to XLM, with USDC as the second option.
- USDC issuer + SAC contract id configured via env (testnet USDC).
- Amount validation and balance display are asset-aware.
- Existing single-asset donations continue to work unchanged.

### 4.2 Fiat Off-Ramp — SEP-24 Withdraw (creator cash-out)

A creator initiates a withdrawal from `/settings`:

1. **SEP-10 auth** — the creator's wallet signs the anchor's challenge; the app
   holds a short-lived anchor auth token.
2. **Discover transfer server** — fetch the anchor's `stellar.toml`, read
   `TRANSFER_SERVER_SEP0024`.
3. **`GET /info`** — confirm the anchor supports withdraw for the asset.
4. **`POST /transactions/withdraw/interactive`** (bearer auth, JSON body with
   `asset_code`, `account`) → anchor returns an interactive `url`.
5. **Open popup** with `&callback=postMessage`; listen for the `message` event.
6. **Sign the payment** — on the callback, build a Stellar payment from the
   creator to `withdraw_anchor_account` for `amount_in`, with the base64
   `withdraw_memo`, and have the creator sign it in their wallet.
7. **Poll status** — `GET /transaction?id=<id>` until a terminal status; surface
   `pending_user_transfer_start` → `pending_anchor` → `completed` (or `error`) in
   the UI.

**Requirements**
- Withdraw panel in `/settings`, visible only to a creator with a connected wallet.
- Anchor home domain and withdrawable asset configured via env
  (default `testanchor.stellar.org`, asset SRT/USDC per sandbox availability).
- Clear state machine surfaced to the user: `incomplete`, `pending_user_transfer_start`,
  `pending_anchor`, `completed`, `error`.
- Non-blocking: a failed/abandoned withdraw never corrupts creator profile state.
- A visible note that this runs against a **testnet anchor sandbox** (no real bank
  settlement yet).

---

## 5. Out of Scope (v3) → Roadmap

- **SEP-24 deposit (fan on-ramp).** A pre-donation deposit step for supporters
  holding only fiat. Deferred — it entangles the donate flow with pending/failed
  deposit states.
- **Path-payment auto-settlement.** Tip in asset A, creator receives asset B.
  Deferred — DEX paths, slippage, and fund-loss edge cases; also a contract change.
- **On-chain asset in the donation log.** `DonationRecord`/`DonatedEvent` don't
  store which asset was sent. v3 tracks asset off-chain only. Adding it on-chain is
  a real append-only-log migration and is deferred.
- **Mainnet + real NGN anchor.** v3 is testnet-only against the SDF sandbox.

---

## 6. UI / Design — Neobrutalism Rebrand

The visual system is replaced in the same iteration. This is a token + component
refresh, not an information-architecture rewrite. Pages stay: landing,
`/[username]`, `/dashboard`, `/settings`.

**Design language**
- Hard **2–3px solid black borders** on all cards, inputs, buttons.
- **Chunky offset drop shadows** (e.g. `4px 4px 0 #000`), no blur, no gradients.
- **Flat, saturated block colors** instead of the current soft indigo gradients.
- High-contrast typography, heavy weights for headings.
- Buttons visibly "press" (shadow collapses on active).
- Remove leftover emojis (`☕`, `💜`) already partially migrated to Hugeicons;
  finish that migration in the new style.

**Token changes** (`frontend/app/globals.css` `@theme`)
- Introduce neobrutalist tokens: `--color-ink` (#000), block accent colors,
  `--shadow-brutal`. Keep the existing token names where components reference them
  to limit churn; remap values.

**Rebrand copy**
- Landing + profile hero reframed around: **"Get tipped in crypto. Cash out to
  your bank."** Surface multi-asset (XLM/USDC) and the cash-out story.

**Components touched**
- `frontend/app/page.jsx` (landing), `frontend/app/[username]/page.tsx` (profile +
  donation form + asset picker), `frontend/components/DonationForm.jsx`,
  `frontend/app/settings/page.tsx` (withdraw panel), `frontend/app/dashboard/page.tsx`
  (currency display), `frontend/components/Skeleton.tsx`.

---

## 7. Technical Design

### 7.1 Frontend

- `frontend/lib/contract.js` — accept an `assetCode`/asset param; resolve the SAC
  contract id per asset instead of hardcoding native. XLM path unchanged.
- New `frontend/lib/anchor.js` (or `sep24.js`) — SEP-10 auth, TOML discovery,
  `/info`, interactive withdraw, popup + `postMessage`, payment signing, status
  polling. Pure client module, mirrors the SDF `basic-payment-app` reference.
- `frontend/lib/assets.js` — asset registry (code, issuer, SAC id) from env.

### 7.2 Backend

- No new endpoints required for v3. Donations already POST with a `currency`
  field; ensure the donate call sends the real asset code so it persists correctly.
- Withdraw is entirely client↔anchor; the backend is not in the withdraw path.

### 7.3 Contracts

- **No changes.** `donate` already accepts any token address.

### 7.4 Config (env)

```
NEXT_PUBLIC_USDC_ISSUER=<testnet USDC issuer G...>
NEXT_PUBLIC_USDC_SAC_ID=<USDC SAC contract C...>
NEXT_PUBLIC_ANCHOR_HOME_DOMAIN=testanchor.stellar.org
NEXT_PUBLIC_ANCHOR_ASSET_CODE=SRT   # or USDC per sandbox support
```

---

## 8. Success Criteria

- A supporter can complete a **USDC** tip and an **XLM** tip on the same profile;
  both appear with the correct currency in the dashboard/feed.
- A creator can run a full **SEP-24 withdraw** against `testanchor.stellar.org`:
  auth → interactive → sign payment → poll to a terminal status, all reflected in
  the `/settings` UI.
- The app is visibly neobrutalist across landing, profile, dashboard, settings.
- `cargo test`, backend `jest`, and frontend `vitest` + `next build` all pass; CI
  stays green.

---

## 9. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Sandbox anchor doesn't offer USDC withdraw | Use the anchor's advertised asset (SRT) for the withdraw demo; keep the asset configurable via env. |
| Popup blocked by browser | Open the popup synchronously from the click handler; show a fallback link. |
| Withdraw abandoned mid-flow | Treat as non-terminal; never write partial state; allow retry. |
| USDC SAC id misconfigured | Fail the donation build with a clear "asset not configured" error, mirroring the existing missing-contract guard. |
| Neobrutalism refresh breaks Vitest snapshot/DOM assertions | Update component tests alongside the style change; run vitest before commit. |

---

## 10. Roadmap (post-v3)

- [ ] SEP-24 **deposit** on-ramp (fan tips in fiat)
- [ ] Path-payment auto-settlement to creator's preferred payout asset
- [ ] On-chain asset field in the donation log (append-only migration)
- [ ] Mainnet + partnered NGN anchor
- [ ] Embeddable donation widget
- [ ] Creator goals / progress tracking
