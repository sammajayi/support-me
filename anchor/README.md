# Local Anchor Platform (testnet, dev only)

A self-hosted [Stellar Anchor Platform](https://github.com/stellar/anchor-platform)
(v4.6.0) for developing SupportMe's SEP-24 deposit/withdraw flow against a
reliable local anchor — instead of the public `testanchor.stellar.org`, which
periodically errors server-side.

> **This is throwaway developer infrastructure. It is not part of the SupportMe
> product and never ships.** On mainnet, SupportMe points at a real regulated
> anchor by setting `NEXT_PUBLIC_ANCHOR_HOME_DOMAIN` / `NEXT_PUBLIC_ANCHOR_ASSET_CODE`
> — no code change. This directory just gives you an always-up anchor for local
> development.

## What it runs

Six containers (adapted from the official `quick-run/` compose): the Anchor
Platform SEP + platform servers, the Kotlin reference backend (KYC form +
settlement), the SEP-24 reference UI, Kafka, and two Postgres databases. Expect
a multi-GB image pull on first run.

It serves **its own testnet USDC** — an issuer keypair we generate and fund, so
the distribution account actually holds USDC and can settle deposits and
withdrawals. (SDF's demo USDC can't settle for us: we don't hold its issuing
key.)

## Prerequisites

- Docker with Compose
- [Stellar CLI](https://github.com/stellar/stellar-cli) (`stellar`) — key gen + funding
- Node.js — runs `issue-usdc.mjs` (uses `@stellar/stellar-sdk`, already a repo dep)

## Run

```bash
cd anchor
chmod +x setup.sh        # first time only
./setup.sh
```

`setup.sh` is re-runnable and idempotent: it reuses existing keypairs, so
re-running won't re-fund or re-mint. It generates + funds three testnet
keypairs (SEP-10 host, distribution, USDC issuer), issues local USDC, renders
the config templates, and starts the stack.

Verify:

```bash
curl http://localhost:8080/.well-known/stellar.toml            # TOML with USDC
curl http://localhost:8080/sep24/info | jq '.deposit.USDC'     # USDC enabled
```

Stop / reset:

```bash
docker compose down        # stop
docker compose down -v     # stop + wipe DB volumes (fresh start)
```

## Point the frontend at it

Set in `frontend/.env.local`:

```
NEXT_PUBLIC_ANCHOR_HOME_DOMAIN=localhost:8080
NEXT_PUBLIC_ANCHOR_ASSET_CODE=USDC
```

The frontend discovers the USDC issuer from this anchor's TOML
(`frontend/lib/anchor.js` → `loadAnchorConfig`), so nothing else changes.

> **HTTP note:** this anchor is served over plain `http://localhost:8080`.
> `@stellar/stellar-sdk`'s TOML resolver defaults to HTTPS; loading a
> `localhost` domain may require passing `allowHttp: true` (and `httpFetch`
> options). If the frontend can't fetch the TOML, that's the cause — see the
> "allowHttp" handling in `lib/anchor.js`.

## Files

| File | Purpose |
|------|---------|
| `docker-compose.yaml` | the six services, pinned to `stellar/anchor-platform:4.6.0` |
| `dev.env` | Anchor Platform SEP config (dev constants; real secret injected at runtime) |
| `setup.sh` | keypair gen + funding + USDC issuance + template render + `up` |
| `issue-usdc.mjs` | establishes trustline + mints local USDC to the distribution account |
| `config/*.template` | config templates; `setup.sh` renders them to gitignored real files |

Rendered `config/*.yaml` and `config/stellar.localhost.toml` contain the
distribution account's **secret seed** and are gitignored. Never commit them.
