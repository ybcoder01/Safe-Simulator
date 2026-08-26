# Safe Inspector

Safe Inspector is a read-only analysis service for Safe accounts. It imports public Safe data, replays executed transactions, simulates pending actions, and explains calldata, state changes, token flows, approvals, and trust findings.

The project is currently at **Sprint 2 / ingestion**. The UI verifies and bookmarks Ethereum and XDC Safe accounts through read-only RPC calls, with Neon persistence and Upstash caching behind typed ports.

The resumable ingestion pipeline is also available: imports enqueue four independent history streams, signed queue callbacks persist one page at a time, and the production cron starts a bounded sweep every five minutes.

## Local development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`. The health probe is available at `/api/health`.

Provision Neon and Upstash through the Vercel Marketplace, pull the environment into `.env.local`, then apply the schema:

```bash
pnpm db:migrate
```

For local queue delivery, run the QStash development service and set `QSTASH_DEV=true`. Production callbacks require the QStash token and both signing keys; scheduled sweeps require `CRON_SECRET`.

## Verification

```bash
pnpm check
```

This runs formatting, linting, TypeScript, unit tests, and a production build.

## Architecture rules

- `src/core` is framework-free and cannot import `adapters`, `app`, React, or Next.js.
- Adapters implement the seven interfaces in `src/core/ports.ts`.
- `src/container.ts` will be the only application composition root.
- Signing and relay kits are forbidden by ESLint; Safe Inspector never signs, proposes, or broadcasts.
- Unknown or incomplete analysis must remain explicit. It is never converted into a safe-looking verdict.

## Planned phases

1. Manual import, persistence, and Safe Transaction Service ingestion.
2. Transaction decoding, history, and confirmation views.
3. Trace-based simulation/replay, state diffs, token and approval analysis.
4. Trust rules, address books, WalletConnect discovery, and multi-chain hardening.
