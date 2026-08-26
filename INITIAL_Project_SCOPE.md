# Safe Inspector — System Design

**A read-only analysis service for Gnosis Safe accounts: import a Safe, replay its history, and understand every transaction before and after it happens.**

Version 1.0 · August 2026 · Target stack: TypeScript, Next.js, viem, Safe SDK, Vercel

---

## 1. Overview

Safe Inspector sits beside normal Safe operation. It never signs, proposes, or executes anything. Users import one or more Safe accounts — via WalletConnect (connect an owner wallet and auto-discover their Safes) or by manually entering an address and chain — and the system ingests the Safe's full multisig history, then produces a per-transaction analysis:

- transaction simulation (for pending items) and execution replay (for historical items)
- contract state changes, before and after
- ERC-20 balance deltas and token movements
- approvals granted or modified, with infinite-approval and Permit2 detection
- whitelist evaluation: is every touched address, dapp, and underlying contract known and trusted?
- full calldata decoding, including nested MultiSend batches and delegatecalls

The product surface is a dashboard per Safe (balances, owners/threshold, pending queue, history) and a dedicated detail page per transaction or signed message.

Design goals, in priority order: **correctness of analysis** (a wrong "looks safe" verdict is the worst failure), **read-only safety** (no signing paths exist in the codebase), **modularity** (every external dependency behind a port), and **operational simplicity** (everything runs on Vercel-native infrastructure).

## 2. High-Level Architecture

```text
                        ┌─────────────────────────────┐
                        │        Next.js on Vercel     │
                        │                              │
  Browser ──────────────▶  Frontend (App Router, RSC)  │
     │                  │      /safes  /safe/[..]      │
     │ WalletConnect    │                              │
     ▼                  │  API Routes (/api/v1/…)      │
  Owner wallet          │   thin controllers only      │
  (read-only session)   └──────────┬───────────────────┘
                                   │ calls into
                        ┌──────────▼───────────────────┐
                        │      Domain Core (pure TS)    │
                        │  ingestion · analysis · rules │
                        │        ports (interfaces)     │
                        └──┬─────┬─────┬─────┬─────┬───┘
                           │     │     │     │     │  adapters
                 ┌─────────▼┐ ┌──▼───┐ ┌▼────┐ ┌──▼─────┐ ┌▼─────────┐
                 │ Safe Tx  │ │ RPC  │ │Simu-│ │Postgres│ │  Redis   │
                 │ Service  │ │(viem)│ │lator│ │ (Neon) │ │(Upstash) │
                 │(api-kit) │ │      │ │     │ │        │ │          │
                 └──────────┘ └──────┘ └─────┘ └────────┘ └──────────┘

  Background: Vercel Cron (scheduled sync) + Upstash QStash (job queue)
```

The domain core is framework-free TypeScript following ports-and-adapters. API routes and background jobs are thin: they parse input, call a domain service, and serialize output. Every external system — Safe Transaction Service, RPC, the simulator, the database, the cache — is reached only through a port interface, which is what makes the analysis engine unit-testable without any network.

## 3. Module Layout

```text
/src
  /core                     # pure domain, no I/O imports
    /safes                  # Safe aggregate, import rules, owner discovery
    /ingestion              # sync state machine, backfill + incremental
    /analysis               # the analysis engine (see §6)
      /decoding             # calldata, MultiSend, proxy resolution
      /diffing              # state-change extraction and normalization
      /tokens               # ERC-20 delta computation, approval detection
      /trust                # whitelist rules, dapp registry, verdicts
    /ports.ts               # SafeDataPort, ChainPort, SimulationPort,
                            # AbiPort, PersistencePort, CachePort, QueuePort
  /adapters
    /safe-api               # @safe-global/api-kit wrapper
    /chain-viem             # viem public clients per chain
    /simulator-tenderly     # simulation + state diff provider
    /simulator-rpc          # fallback: debug_traceCall prestateTracer
    /abi                    # Sourcify + Etherscan + 4byte + Safe decoder
    /db-drizzle             # Drizzle ORM repositories (Neon Postgres)
    /cache-upstash          # Redis cache implementation
    /queue-qstash           # background job dispatch
  /app                      # Next.js App Router
    /(dashboard)/safes
    /(dashboard)/safe/[chainId]/[address]
    /(dashboard)/safe/[chainId]/[address]/tx/[safeTxHash]
    /(dashboard)/safe/[chainId]/[address]/message/[messageHash]
    /api/v1/…               # REST endpoints + cron/job handlers
  /components               # feature-scoped UI (no cross-feature imports)
  /lib                      # wagmi/WalletConnect config, query client
/tests
  /unit /integration /e2e /fixtures
```

The rule that keeps this modular over time: `core` imports nothing from `adapters` or `app`; `adapters` implement `core/ports.ts`; `app` wires adapters to core via a single composition root (`/src/container.ts`). Swapping Tenderly for a self-hosted fork simulator, or Neon for RDS, touches exactly one adapter.

## 4. Safe Import — Two Paths, Both Read-Only

**Manual import** takes `{chainId, address}`, verifies the address is a Safe (bytecode check for the proxy pattern + `getOwners()`/`getThreshold()` via viem), and registers it.

**WalletConnect import** connects an owner's EOA through WalletConnect/wagmi in read-only mode — the session is used solely to learn the connected address. The backend then calls the Safe Transaction Service `GET /owners/{address}/safes/` per supported chain and presents the discovered Safes for one-click import. No signature is ever requested; optionally, SIWE can be added later to gate private features, but v1 treats all imported Safes as public-chain data viewable by anyone who imports them.

Because everything displayed is public on-chain/Transaction-Service data, there is no custody or permission problem to solve in v1 — "your Safes" is a client-side bookmark list persisted server-side against an anonymous profile ID (cookie) so the dashboard survives revisits.

## 5. Ingestion Pipeline

On import, a **backfill job** is enqueued (QStash) rather than run in the request path — large Safes have thousands of operations and serverless functions have execution limits. The job pages through the Transaction Service:

| Source (api-kit / REST) | Data |
|---|---|
| `/multisig-transactions/` | All proposed + executed multisig txs, confirmations, signatures |
| `/module-transactions/` | Transactions executed by enabled modules |
| `/incoming-transfers/` and `/transfers/` | Native + token inflows/outflows |
| `/messages/` | Off-chain signed messages (EIP-1271) |
| `/balances/` | Current token balances (cache-only, not persisted history) |
| On-chain via viem | Owners, threshold, modules, guard, nonce, implementation version |

Each page of results is normalized into the Postgres schema (§8) and the job re-enqueues itself with a cursor until complete — this chunked, self-continuing pattern is how long backfills fit inside serverless execution windows. **Incremental sync** then runs two ways: a Vercel Cron sweep every 5 minutes across active Safes (detect new txs by comparing latest nonce/tx timestamps), and an on-demand refresh triggered when a user opens a dashboard (stale-while-revalidate: serve stored data instantly, kick a sync job, push updates to the client via polling/SWR revalidation).

Analysis (§6) is a second, separate job stage: ingestion writes raw normalized records and enqueues `analyze(safeTxHash)` per new item. Decoupling them means a simulator outage delays verdicts, not history visibility.

## 6. The Analysis Engine

For each multisig transaction (and each message), the engine produces an immutable `AnalysisResult`. Immutability matters: an executed transaction's analysis never changes, so it is computed once, persisted, and cached forever. Pending transactions are re-analyzed when the chain state they depend on moves (new nonce, re-simulation on dashboard open, TTL 60s).

**6.1 Simulation.** Pending transactions are simulated against latest state: the engine constructs the `execTransaction` call exactly as it would execute (using the Safe Protocol Kit to encode, with signature placeholders and a state override setting threshold checks passable) and submits it to the `SimulationPort`. The primary adapter is Tenderly's simulation API, which returns execution status, full call trace, event logs, and a state diff in one call. The fallback adapter uses raw RPC: `debug_traceCall` with `prestateTracer` in `diffMode` for state changes plus `callTracer` for the call tree — fully self-sufficient on any archive node, at the cost of assembling the pieces ourselves. Executed transactions are **replayed** instead: same tracers, pinned to the transaction's actual block and index, so "what happened" is ground truth rather than a re-estimate.

**6.2 State changes.** The raw diff (account → storage slot → before/after) is normalized into human meaning where possible: slots on recognized contracts (the Safe itself, ERC-20s, known protocols) are mapped through storage layouts fetched from Sourcify/Etherscan verified metadata, producing entries like `owners[3]: added 0xabc…`, `threshold: 2 → 3`, `allowance[safe][spender]: 0 → MAX_UINT256`. Unmapped slots are still shown raw — never silently dropped — flagged as "unrecognized storage change," which is itself a risk signal.

**6.3 ERC-20 changes.** Token movements come from two independent sources that must agree: decoded `Transfer`/`Deposit`/`Withdrawal` logs from the trace, and balance-slot diffs from the state diff. Disagreement (e.g., fee-on-transfer or rebasing tokens) is surfaced explicitly. Output per token: direction, counterparty, amount, USD estimate (price adapter, cache 5 min), and token metadata (symbol/decimals, cached permanently keyed by chain+address).

**6.4 Approvals.** Decoded from both calldata (direct `approve`/`increaseAllowance`/`Permit2` calls, including ones buried in MultiSend batches) and emitted `Approval` events. Each approval is classified: bounded vs infinite, new spender vs modification, spender identity resolved through the trust layer. Infinite approvals to unverified or non-whitelisted spenders produce the highest-severity flag in the system.

**6.5 Decoding and contract resolution.** Calldata decodes through a cascade: Safe Transaction Service's own decoder → verified ABI (Sourcify, then Etherscan) → 4byte signature lookup → raw hex. MultiSend batches are unpacked recursively into individual sub-calls, each analyzed independently; `delegatecall` operations are prominently flagged since they execute foreign code with the Safe's identity. Proxies (EIP-1967, beacon, UUPS) are resolved to implementations so the "underlying smart contract" shown is the code that actually runs, with the proxy→implementation chain displayed.

**6.6 Trust layer.** Every address touched by the transaction (targets, sub-call targets, token contracts, approval spenders, transfer counterparties) is evaluated against, in order: the Safe's own **address book** (user-managed whitelist, per Safe), the **global dapp registry** (seeded from the Safe{Apps} list and well-known protocol deployments, stored as labeled contract sets), **verified-source status**, and **deployment age/activity heuristics**. The verdict per address is `trusted | known | unverified | flagged`, and the transaction inherits its worst constituent verdict plus specific findings (e.g., "delegatecall to unverified contract deployed 2 days ago"). The rule engine lives in `core/analysis/trust` as pure functions over the analysis facts — adding a rule is adding a function and its unit tests.

## 7. Caching Strategy

| Data | Store | Policy |
|---|---|---|
| Analysis of executed txs | Postgres (authoritative) + Redis | Immutable — cache forever, no TTL |
| Analysis of pending txs | Redis | TTL 60s, recomputed on dashboard open |
| Token metadata, ABIs, storage layouts | Redis + Postgres | Permanent (keyed chain+address), warmed by first use |
| Balances / prices | Redis | TTL 30s / 5 min |
| Transaction Service pages during sync | none | Never cached — always fetch fresh in sync jobs |
| Rendered dashboard data | Next.js route cache + SWR | `stale-while-revalidate`, revalidated by sync completion |

Two principles: **immutable data is cached without expiry and persisted, so the expensive simulation work happens exactly once per transaction ever**; and cache is always a projection of Postgres, never the only copy — Redis can be flushed with zero data loss.

## 8. Data Model (Postgres via Drizzle, hosted on Neon)

| Table | Key columns |
|---|---|
| `safes` | id, chain_id, address, threshold, nonce, version, guard, last_synced_at |
| `safe_owners` | safe_id, owner_address, added_at_block |
| `profiles` / `profile_safes` | anonymous profile ↔ bookmarked safes |
| `transactions` | safe_id, safe_tx_hash (uq), nonce, to, value, data, operation, status(pending/executed/failed/replaced), executed_tx_hash, block, timestamps |
| `confirmations` | transaction_id, owner, signature, signed_at |
| `messages` | safe_id, message_hash, payload, confirmations |
| `analysis_results` | transaction_id (uq per version), verdict, findings jsonb, state_diff jsonb, call_tree jsonb, engine_version |
| `token_transfers` | transaction_id, token, from, to, amount, direction |
| `approvals` | transaction_id, token, spender, amount, is_infinite, method |
| `contracts` | chain_id, address, label, is_verified, implementation_of, abi_ref, source(registry/user/heuristic) |
| `address_book` | safe_id, address, label, trust_level — the per-Safe whitelist |
| `sync_cursors` | safe_id, stream, cursor, status |

`analysis_results.engine_version` lets the engine evolve: bumping the version invalidates nothing retroactively but allows a backfill job to re-analyze history under new rules, keeping old verdicts for audit.

## 9. API Surface (all read-only)

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/safes` | Import (manual or from WC discovery); enqueues backfill |
| `GET /api/v1/safes` | Profile's bookmarked Safes with sync status |
| `GET /api/v1/safes/:chain/:addr` | Overview: config, balances, counts, pending queue |
| `GET /api/v1/safes/:chain/:addr/transactions?cursor=` | Paginated history with verdict summaries |
| `GET /api/v1/safes/:chain/:addr/tx/:safeTxHash` | Full detail: decoded call(s), simulation, diffs, tokens, approvals, trust findings, confirmations |
| `GET /api/v1/safes/:chain/:addr/messages/:hash` | Message detail + signer status |
| `PUT /api/v1/safes/:chain/:addr/address-book` | Manage the whitelist |
| `POST /api/v1/jobs/*` (QStash-signed) · `GET /api/v1/cron/sync` (Vercel Cron) | Background entry points, signature-verified |

Zod schemas validate every boundary in and out; the same schemas generate the typed client used by the frontend, so API and UI cannot drift.

## 10. Frontend

Next.js App Router with React Server Components for the data-heavy reads and client components only where interactivity demands (WalletConnect modal, address book editing, live pending-tx polling via TanStack Query). Feature-folder structure mirrors the routes; shared primitives (VerdictBadge, AddressChip with label resolution, TokenAmount, DiffViewer, CallTreeViewer) live in `/components/shared`.

**Dashboard** (`/safe/[chain]/[address]`): header with Safe identity, version, owners × threshold; balance panel (tokens + USD total); **pending actions** front and center — each queued transaction as a card with its verdict badge, confirmation progress (2/3 signed), and a one-line summary of what it does; then paginated history where every row shows nonce, decoded summary, verdict, and token flow at a glance.

**Detail page** (`…/tx/[safeTxHash]`): the full analysis in ordered sections — human-readable summary and verdict with findings; decoded calldata (MultiSend unpacked as a tree, delegatecalls highlighted); simulation outcome; ERC-20 changes; approvals; state changes (named where mapped, raw where not); every involved address with its trust status and a one-click "add to address book"; confirmation timeline showing who signed when. Messages get the equivalent page scoped to EIP-1271 signing.

## 11. Vercel Deployment Topology

Everything runs Vercel-native: the Next.js app (frontend + API routes as serverless functions, Node runtime for analysis routes since they need longer execution), **Neon Postgres** through the Vercel integration (with connection pooling via the Neon serverless driver — mandatory in serverless environments), **Upstash Redis** for cache and **Upstash QStash** for the job queue (both first-class Vercel integrations), **Vercel Cron** for the 5-minute sync sweep, and Vercel's preview deployments giving every PR a full environment against a Neon branch database. Secrets (RPC keys, Tenderly token, Etherscan keys, QStash signing keys) live in Vercel env vars, never in client bundles — all chain access is server-side. Sentry for error tracking; Vercel Analytics + a `/api/health` probe for uptime.

The one Vercel-specific design constraint worth naming: no long-running processes exist anywhere in this design. Backfills self-chunk through the queue, syncs are cron-triggered sweeps, and analysis is per-transaction jobs — every unit of work fits a serverless invocation.

## 12. Testing Strategy

| Layer | Tooling | What is proven |
|---|---|---|
| Unit (core) | Vitest, port mocks | Decoders (MultiSend nesting, proxy resolution), diff normalization, ERC-20 delta math, approval classification, every trust rule — pure functions, hundreds of fast tests, ≥90% coverage gate on `/core` |
| Fixture-based | Recorded Transaction Service + trace payloads (MSW) | Real-world transactions with known-correct analyses: a Uniswap swap, an infinite approval, an owner change, a malicious delegatecall — the regression suite that guards verdict correctness |
| Integration | Anvil mainnet-fork in CI | Adapters against a real EVM: deploy a Safe, execute txs, verify replay analysis matches ground truth end to end |
| Contract tests | Vitest | Each adapter satisfies its port's behavioral contract (pagination, error mapping, retries) |
| E2E | Playwright against preview deploys | Import flow (manual + mocked WalletConnect), dashboard render, detail page for a seeded Safe |
| CI | GitHub Actions | typecheck → lint → unit → integration → e2e on preview; deploy to prod only on green |

The fixture suite is the heart of it: every bug found in production becomes a recorded fixture with the correct expected analysis, so the engine can never regress on a transaction it has been wrong about before.

## 13. Failure Modes and Handling

Transaction Service outage: history serves from Postgres (the whole point of persistence); sync jobs retry with backoff and surface a "last synced" staleness badge. Simulator outage: fall back from Tenderly to the RPC-tracer adapter automatically via the port; if both fail, the transaction shows ingested data with an explicit "analysis pending" state — never a fabricated verdict. RPC provider failure: multi-provider viem transport with fallback ranking. Reorgs: executed-tx analyses key on block hash; a mismatch during sync invalidates and re-runs replay. Oversized Safes: cursor-chunked backfill with per-safe rate limiting so one whale Safe cannot starve the queue. Engine bugs: `engine_version` re-analysis path (§8) corrects history without destroying the audit trail.

## 14. Build Order

Phase 1: manual import, ingestion pipeline, transactions list + detail with decoding and confirmations — useful with zero simulation. Phase 2: analysis engine with the RPC-tracer adapter, verdicts, token/approval extraction, dashboard pending-queue cards. Phase 3: Tenderly adapter, trust layer + address book, WalletConnect discovery, messages. Phase 4: multi-chain expansion, engine-version re-analysis tooling, price enrichment, alerting on new pending transactions.

## 15. Implementation Plan

Ten weeks to production, one-week sprints, each ending in something deployed and demonstrable on a preview URL. The plan assumes one full-stack engineer plus you reviewing; with two engineers, sprints 4–6 and 7–8 parallelize and the timeline compresses to ~7 weeks. Every sprint's definition of done includes its tests green in CI — testing is inside each sprint, not a phase at the end.

### Sprint 0 — Foundation (Week 1)

Repo scaffold and the skeleton that everything hangs on. Initialize the Next.js App Router project with TypeScript strict mode, ESLint (including the custom rule banning signing-kit imports), Prettier, and Vitest. Create the `/src/core`, `/src/adapters`, `/src/app` structure with the dependency-direction lint rule (`core` cannot import from `adapters`/`app`). Write `core/ports.ts` in full — all seven port interfaces with complete method signatures and JSDoc contracts — because the ports are the architecture; everything after this is filling them in. Provision infrastructure: Vercel project, Neon Postgres with the Vercel integration and a branch-per-preview setup, Upstash Redis and QStash, Sentry. Set up GitHub Actions (typecheck → lint → unit) and confirm preview deployments work end to end.

**Done when:** a hello-world page deploys to a preview URL from a PR, CI blocks on a failing test, and `ports.ts` is reviewed and frozen for v1.

### Sprint 1 — Data Layer and Manual Import (Week 2)

Drizzle schema for all tables in §8, with migrations and a seed script. Implement `db-drizzle` repositories satisfying `PersistencePort`, and `cache-upstash` satisfying `CachePort`. Implement `chain-viem` with multi-provider fallback transport for the first two chains (Ethereum mainnet + XDC, or your preferred pair). Build manual import: `POST /api/v1/safes` validates the address is a Safe on-chain (bytecode + `getOwners`/`getThreshold` via protocol-kit reads), registers it, and creates the profile bookmark; `GET /api/v1/safes` lists them. Minimal `/safes` page listing imported Safes.

**Tests:** repository contract tests against a Neon branch DB; import validation unit tests (EOA rejected, non-Safe contract rejected, valid Safe accepted — recorded bytecode fixtures).
**Done when:** you can import a real Safe by address on the preview deploy and see it listed with owners and threshold.

### Sprint 2 — Ingestion Pipeline (Week 3)

The `safe-api` adapter wrapping api-kit for all six streams in §5, with typed pagination. The ingestion state machine in `core/ingestion`: backfill job that pulls one page, normalizes, persists, advances `sync_cursors`, and re-enqueues itself via `queue-qstash` until complete. QStash-signed job endpoint and the Vercel Cron sweep endpoint. Incremental sync logic (nonce/timestamp comparison). Sync status surfaced on the Safes list ("syncing 340/1,200…").

**Tests:** ingestion state machine unit tests with a mocked `SafeDataPort` (multi-page backfill, resume from cursor after crash, incremental pickup); MSW fixtures recorded from the real Transaction Service for one busy Safe.
**Done when:** importing a Safe with 1,000+ historical transactions completes backfill on Vercel without hitting execution limits, and a newly executed transaction appears within one cron cycle.

### Sprint 3 — History UI and Decoding (Week 4)

Calldata decoding cascade in `core/analysis/decoding`: Transaction Service decoder result → verified ABI (Sourcify then Etherscan via the `abi` adapter) → 4byte → raw. Recursive MultiSend unpacking and delegatecall flagging. Proxy resolution (EIP-1967/beacon/UUPS). Dashboard v1: overview header, balances panel, paginated transaction history with decoded one-line summaries and confirmation counts. Detail page v1: decoded call tree, parameters, confirmation timeline, links out to explorers. Messages list + detail.

**Tests:** the decoder is the most fixture-heavy component in the system — nested MultiSend-in-MultiSend, delegatecall batches, unverified targets, malformed calldata; ≥95% branch coverage on `/decoding`.
**Done when:** a real Safe's full history is browsable and every transaction shows a correct human-readable decode, verified against what the official Safe UI displays for the same Safe.

### Sprints 4–5 — Analysis Engine Core (Weeks 5–6)

The heart of the system, two sprints deliberately. Sprint 4: the `simulator-rpc` adapter (`debug_traceCall` with prestateTracer diffMode + callTracer, and replay-at-block for executed txs), `execTransaction` construction with threshold state overrides via protocol-kit, and the diff normalization layer in `core/analysis/diffing` (raw slot diffs → named changes via storage layouts, unmapped slots preserved and flagged). Sprint 5: `core/analysis/tokens` — ERC-20 delta extraction from both logs and balance-slot diffs with disagreement surfacing, approval detection and classification (bounded/infinite, Permit2, buried-in-batch); the `AnalysisResult` assembly with `engine_version`; the analyze job wired into the pipeline so ingestion enqueues analysis per transaction; caching per §7 (immutable-forever for executed, 60s TTL for pending).

**Tests:** the anvil-fork integration suite starts here — deploy a Safe on a mainnet fork in CI, execute known transactions (a transfer, a swap, an infinite approve, an owner swap), assert the replay analysis matches ground truth exactly. Plus the recorded-fixture regression suite (§12) with its first ten fixtures.
**Done when:** the detail page shows simulation outcome, named state changes, token deltas, and approvals for both a pending and an executed transaction, and the fork suite is green in CI.

### Sprint 6 — Trust Layer and Verdicts (Week 7)

`core/analysis/trust`: the rule engine as pure functions over analysis facts. Address book CRUD (`PUT …/address-book`) and per-Safe whitelist evaluation; global dapp registry seeded from the Safe{Apps} list and top-protocol deployments (one-off seeding script into `contracts`); verified-source and deployment-age signals; verdict aggregation (worst-constituent + findings list). UI: VerdictBadge across history rows and pending cards, findings section on the detail page, AddressChip with trust status and one-click add-to-address-book.

**Tests:** one unit test file per rule, plus verdict-aggregation property tests (a single `flagged` constituent always flags the transaction); fixture suite grows to include the malicious-delegatecall and unknown-spender cases with expected findings.
**Done when:** the seeded demo Safe shows differentiated verdicts across its history and adding an address to the whitelist visibly upgrades the relevant transactions' verdicts.

### Sprint 7 — Pending Queue, WalletConnect, Tenderly (Week 8)

Dashboard pending-actions section: queue cards with verdict, summary, confirmation progress, and re-simulation on open (60s TTL path). WalletConnect import: wagmi/AppKit read-only connection, `/owners/{address}/safes/` discovery across chains, multi-select import. The `simulator-tenderly` adapter as primary with automatic port-level fallback to `simulator-rpc`, plus the "analysis pending" degraded state when both fail.

**Tests:** adapter contract tests proving Tenderly and RPC simulators produce equivalent normalized output for the same fixtures; Playwright e2e for the WalletConnect flow with a mocked connector.
**Done when:** connecting an owner wallet surfaces their Safes for one-click import, and killing the Tenderly key in preview env demonstrably fails over to the RPC adapter with no user-visible error.

### Sprint 8 — Hardening and Production Cut (Week 9)

Failure-mode implementation from §13: reorg detection (block-hash mismatch → invalidate + re-replay), Transaction Service staleness badges, per-safe rate limiting in the queue, Sentry alerting rules, `/api/health`. Load pass: import three whale Safes concurrently and fix what breaks (likely: Neon connection pressure and QStash concurrency — tune pool size and queue parallelism). API rate limiting (Upstash ratelimit) on public endpoints. Full Playwright regression across the three core journeys (import → dashboard → detail). Security review against the read-only invariant: dependency audit confirms no signing kit, lint rule verified in CI, env-var exposure check on client bundles.

**Done when:** the e2e suite is green on a production-config deploy, the three whale Safes are fully synced and browsable, and the error budget over 48 hours of soak is clean in Sentry.

### Sprint 9 — Polish and Launch (Week 10)

Empty states, loading skeletons, mobile pass on the dashboard, address-label search, copy review on findings text (the verdict explanations are the product's voice — they must be precise, not alarmist). Price enrichment (USD estimates, 5-min cache). Production domain, analytics, a seeded read-only demo Safe for the landing page. Write the operational runbook: how to re-run a backfill, how to bump `engine_version` and re-analyze, how to rotate providers.

**Done when:** launch.

### Sequencing Logic and Risk Register

The plan front-loads the two highest-risk components. Ingestion-on-serverless (Sprint 2) is where Vercel's execution model bites first — if the self-chunking job pattern fails for whale Safes, the fallback decision (move sync workers to a single small Fly/Railway worker while keeping everything else on Vercel) needs to happen by week 3, not week 8. The tracer-based analysis (Sprints 4–5) is the second: `debug_traceCall` support varies across RPC providers, so the provider choice for archive+trace access (QuickNode/Alchemy tier, or a dedicated node) should be validated with a spike in Sprint 0's spare time. Three smaller risks to track: Etherscan/Sourcify rate limits during heavy backfill (mitigated by the permanent ABI cache — warm it, don't hammer it), Transaction Service undocumented pagination quirks on very old Safes (the recorded fixtures catch format drift), and WalletConnect project-ID configuration across preview environments (use a single WC project with wildcard preview domains from day one).

Cost to run during development: Vercel Pro + Neon launch tier + Upstash pay-as-you-go + an RPC plan with trace support — roughly $70–150/month, dominated by the RPC tier. That RPC line is the one to negotiate or self-host later if analysis volume grows.

---


*Safe SDK usage: `@safe-global/api-kit` for all Transaction Service access, `@safe-global/protocol-kit` for Safe contract encoding/reads during simulation construction. No signing kits are included in the dependency tree — their absence is enforced by a lint rule, making "read-only" a property the CI can verify.*
