# Safe Inspector

Safe Inspector is a read-only analysis service for public Safe accounts on Ethereum and XDC. It imports Safe configuration and history, replays executed transactions, checks sufficiently confirmed pending actions through the complete Safe execution path, and explains the evidence without requesting a wallet signature.

## Current capabilities

- Manual Safe import with bytecode and on-chain configuration verification.
- Public Safe discovery by owner address.
- Resumable ingestion for multisig transactions, module transactions, transfers, and signed messages.
- Profile-authorized refresh and conservative synchronization freshness.
- Paginated transaction and signed-message history.
- Known calldata decoding, nested call inspection, proxy and verified-source resolution.
- Executed receipt replay and bounded debug trace evidence when the configured RPC supports it.
- Pending Safe execution checks using reported supported-owner signatures.
- ERC-20 movements, allowance adjustments, Permit2 risk, Safe configuration events, and conservative storage interpretation.
- Evidence-based verdicts with profile-scoped trusted and flagged addresses plus a pinned contract registry.
- Quick Trust and Flag actions for addresses identified in a transaction.
- Browser-local search across loaded Safe activity.
- Canonical block-anchor checks before immutable execution evidence is reused.
- Dedicated module-execution replay with separate privileged-path verdicts and findings.
- Responsive route loading and explicit unavailable states when provider evidence is incomplete.

Safe Inspector never signs, proposes, relays, or broadcasts transactions. Signing and relay libraries are forbidden by the repository lint configuration.

## Hosted architecture

- **Application and API:** Next.js App Router on Vercel.
- **Persistence:** Prisma Postgres through `DATABASE_URL`.
- **Cache:** Upstash Redis.
- **Queue:** Upstash QStash with signed callback verification.
- **Scheduling:** Vercel Cron starts the configured sweep; profile-authorized dashboard refreshes can queue a Safe immediately.
- **Chain access:** server-only ranked RPC URLs, with optional server-only trace RPC URLs.
- **Safe data:** Safe Transaction Service endpoints for Ethereum and XDC.
- **Verification:** GitHub CI runs formatting, linting, TypeScript, unit tests, and a production build. Every pull request receives a Vercel preview.

Runtime credentials and imported Safe data live only in hosted services. They are not committed to the repository or exposed through `NEXT_PUBLIC_` variables.

## Architecture rules

- `src/core` is framework-free and cannot import adapters, the application layer, React, or Next.js.
- Adapters implement the interfaces in `src/core/ports.ts`.
- `src/container.ts` is the application composition root.
- Unknown or incomplete analysis remains explicit and is never converted into a safe-looking verdict.
- Executed evidence is keyed by engine version and block hash and is reused only after the canonical transaction anchor is verified.
- Profile address-book records affect labels and trust evaluation only; they cannot erase critical findings.

## Repository verification

The same command sequence enforced by CI is available through:

```bash
pnpm check
```

It runs formatting checks, linting, TypeScript, unit and regression tests with core coverage reporting, and a production build. Hosted previews and production deployments receive their runtime configuration from Vercel; secrets must never be copied into source files, pull requests, or issue comments.

## Operations

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for deployment verification, Safe refresh recovery, provider rotation, QStash key rotation, evidence-version changes, database precautions, rollback, and incident triage.

The original architectural brief and staged implementation plan remain available in [INITIAL_Project_SCOPE.md](INITIAL_Project_SCOPE.md).
