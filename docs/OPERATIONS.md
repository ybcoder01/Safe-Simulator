# Safe Inspector Operations Runbook

This runbook covers the currently deployed Vercel, Prisma Postgres, Upstash Redis, QStash, Ethereum, and XDC topology. It does not authorize signing, proposing, relaying, broadcasting, or destructive database operations.

## Safety invariants

- Treat every runtime credential as server-only. Never prefix a secret with `NEXT_PUBLIC_`.
- Never paste secret values into source files, pull requests, issue comments, screenshots, or support messages.
- QStash callbacks must continue to require a valid Upstash signature.
- The cron endpoint must continue to require `CRON_SECRET`.
- Unknown, incomplete, stale, or conflicting provider data must remain explicit.
- Do not delete transaction history to resolve an analysis problem. Evidence is versioned and block-anchored.
- Apply database changes forward with reviewed migrations. A Vercel rollback does not reverse a database migration.

## Deployment verification

Every pull request must complete both checks before merge:

1. GitHub CI is green: formatting, linting, TypeScript, unit tests, and production build.
2. The Vercel preview is Ready.

After merging:

1. Confirm the production deployment is Ready in Vercel.
2. Open `/api/health`; expect HTTP `200`, `status: "ok"`, `checks.database: "ok"`, `checks.cache: "ok"`, and a current timestamp. HTTP `503` with `status: "degraded"` means at least one hosted dependency is unavailable.
3. Open `/safes`; confirm the current browser profile can load its watchlist.
4. Open one Safe dashboard; confirm synchronization status and current balances render.
5. Open one executed transaction and one pending transaction when available.
6. Confirm incomplete trace support is described as unavailable or partial rather than inferred.
7. Review Vercel runtime logs for new errors after the deployment.

If a deployment fails before production, fix the pull-request branch. Do not promote a failed or unverified build.

## Safe refresh and backfill recovery

The configured Vercel Cron schedule is `0 0 * * *`, which starts one sweep each day at 00:00 UTC. The dashboard also provides a profile-authorized refresh for an individual bookmarked Safe.

To refresh one Safe:

1. Open its dashboard from the same browser profile that bookmarked it.
2. Select **Refresh data**.
3. Leave the page open while it checks synchronization state.
4. Confirm all four streams—multisig, module, transfer, and message—return to **Synced**.

The refresh queues a signed QStash job. QStash then schedules bounded 100-record pages and resumes from persisted cursors. Repeated requests are deduplicated.

If synchronization is stuck or failed:

1. Check Vercel runtime logs for `/api/v1/jobs/run`.
2. Check QStash delivery attempts and response codes.
3. A `401` from the job route indicates missing or invalid signing keys.
4. A `503` or queue error usually indicates missing QStash configuration.
5. Provider errors should be resolved at the Safe Transaction Service or RPC configuration before retrying.
6. Once the dashboard no longer considers the previous attempt active, use **Refresh data** again.

Do not send unsigned requests directly to the job callback. Do not reset database cursors manually unless a reviewed recovery change explicitly requires it.

## Scheduled sweep checks

The cron request must include the Vercel-provided bearer secret. A successful request queues one bounded sweep, which lists up to 100 Safes at a time and self-enqueues additional pages.

If the scheduled sweep did not run:

1. Confirm the production project has `CRON_SECRET`.
2. Confirm the cron is present and enabled in the Vercel project.
3. Inspect the cron invocation and the first `sync-sweep` QStash delivery.
4. Confirm `APP_BASE_URL` points to the stable public production URL when explicitly set.
5. Use a dashboard refresh for urgent individual Safes while the scheduled path is repaired.

## RPC provider rotation

The application accepts comma-separated ranked fallback URLs:

- `RPC_URL_1` and `TRACE_RPC_URL_1` for Ethereum.
- `RPC_URL_50` and `TRACE_RPC_URL_50` for XDC.

Standard RPC URLs provide reads and receipt evidence. Trace RPC URLs are optional; unsupported trace methods must degrade explicitly.

To rotate or add a provider:

1. Add the new URL first in the appropriate Vercel Preview environment variable.
2. Deploy a preview and verify Safe import, dashboard balances, an executed transaction, and a pending transaction.
3. For a trace provider, verify the call-trace and storage-diff coverage labels on a known transaction.
4. Add the new URL to Production ahead of the old URL.
5. Redeploy production so the environment change takes effect.
6. Verify `/api/health` and repeat the transaction checks.
7. Remove the old URL only after the new provider has been stable.

A provider must not be considered trace-capable merely because standard JSON-RPC calls work.

## QStash signing-key rotation

QStash verification uses both `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY`.

1. Obtain the current pair from the Upstash console.
2. Update both values in Vercel without exposing them in logs or source control.
3. Redeploy production.
4. Queue a dashboard refresh and confirm the callback succeeds.
5. Review failed deliveries before completing the rotation.

Keep `QSTASH_TOKEN`, callback signing keys, and `CRON_SECRET` distinct.

## Execution-evidence version changes

The current execution namespace is defined by `EXECUTION_EVIDENCE_ENGINE_VERSION`. Evidence also includes its canonical block hash.

Only change the version in a reviewed pull request when evidence semantics change. The pull request must include:

- the reason old evidence cannot be reused;
- regression coverage for the new behavior;
- explicit behavior for partial or unavailable provider data;
- verification that critical findings cannot be weakened.

A version bump makes old records unreachable through the new lookup key. Opening transaction details produces evidence under the new version when providers return complete supported data.

Signed single-transaction `analyze` jobs persist a profile-neutral baseline under `TRANSACTION_ANALYSIS_ENGINE_VERSION`. Profile Trust and Flag records are applied only when serving a transaction and are never copied into the shared result. Completed immutable analyses are reused; pending analyses remain refreshable.

A bookmarked Safe dashboard exposes an explicit **Reanalyze history** request. The request is profile-authorized and deduplicated in a 15-minute window. Its signed `reanalyze` callback reads no more than five persisted transactions per page, spaces individual `analyze` deliveries by three seconds, and delays the next cursor page until the current batch has been published. Only the current transaction-analysis engine version is accepted.

Queue acceptance does not mean the full history has finished. Check QStash deliveries and Vercel runtime logs for the Safe and engine version. Repeating the request inside the deduplication window is safe and does not create a parallel scan. Do not manually construct cursors or send unsigned callback requests.

## Module-execution analysis

Module transactions bypass the normal multisig confirmation path and use the separate `MODULE_ANALYSIS_ENGINE_VERSION` evidence namespace. The first synchronized module page queues no more than five signed `analyze-module` jobs, spaced by three seconds. Later pages do not schedule analysis automatically.

A module result becomes immutable only when replay evidence matches both the canonical transaction anchor and the persisted module block. Missing replay or anchor evidence remains explicitly refreshable. Any anchor conflict is critical and flagged. Even otherwise clean module execution remains unverified because current module authority and historical execution validity are separate questions.

The `0003_module_analysis` migration is additive but required by the module history route and callback. Apply it to Preview before deploying code from this change, verify the module history page and signed callback, then apply it to Production before promoting or merging the code deployment. A code rollback can retain the additive table; do not reverse the migration while module-analysis code is running.

## Database precautions

Prisma Postgres is authoritative for imported Safe data, cursors, profile bookmarks, address-book records, and persisted execution evidence.

- Use the provider console for read-only diagnosis where possible.
- Never edit or delete transaction rows to clear an evidence problem.
- Preserve block hashes and engine versions; they are audit boundaries.
- Take a provider backup or restore point before a material migration.
- Apply migrations before code that requires the new schema becomes production.
- Verify preview behavior before applying an equivalent production change.
- Treat profile identifiers as sensitive application data even though tracked chain data is public.

## Rollback

Use Vercel rollback when a production code deployment is unhealthy and the previous deployment is compatible with the current database schema.

After rollback:

1. Confirm the production domain points to the intended deployment.
2. Check `/api/health`.
3. Verify watchlist, dashboard, executed replay, and refresh queue behavior.
4. Review whether any forward database migration remains active.
5. Open a corrective pull request rather than editing production source state.

Do not roll back across an incompatible schema change without a reviewed database recovery plan.

## Incident triage

Start with the narrowest affected layer:

- **Whole site unavailable:** Vercel deployment status and runtime logs.
- **Health probe degraded:** use the non-secret `checks` map to identify PostgreSQL or Redis, then inspect that provider and Vercel runtime logs.
- **Watchlist unavailable:** Prisma Postgres connectivity and `DATABASE_URL`.
- **Refresh not queued:** QStash token, production callback URL, and dashboard authorization.
- **Job callback rejected:** QStash current and next signing keys.
- **History stale:** Safe Transaction Service endpoint, stream cursor status, and QStash deliveries.
- **Balances or imports failing:** standard RPC fallback list.
- **Replay unavailable:** receipt RPC and optional trace RPC support.
- **Stale execution evidence warning:** canonical receipt anchor and the next synchronization cycle.
- **Cache unavailable:** Upstash Redis configuration; PostgreSQL evidence remains authoritative.

Record the affected chain, Safe address, route, UTC time, deployment identifier, and non-secret error message. Never include credentials.

## Automated Preview smoke check

A successful Vercel Preview deployment triggers the GitHub **Preview smoke** workflow. The check accepts only a `.vercel.app` URL, requires an explicit Preview environment marker, and refuses the production domain. GitHub supplies a short-lived OIDC token so Vercel can recognize the protected request without storing a reusable bypass secret.

Preview queue publications use the deployment-specific `VERCEL_URL`. They must never use `VERCEL_PROJECT_PRODUCTION_URL` or a Production `APP_BASE_URL`; Production continues to use its stable public callback URL.

Protected Preview deployments must enable Vercel **Protection Bypass for Automation** and expose its system variable as `VERCEL_AUTOMATION_BYPASS_SECRET`. The QStash publisher forwards that value only as the `x-vercel-protection-bypass` destination header when `VERCEL_ENV=preview`; Production receives no bypass header. Missing Preview configuration fails closed before publication. Never place this secret in a callback URL, source, logs, pull-request text, or screenshots. Rotate it in Vercel and redeploy if disclosure is suspected.

The smoke check verifies:

- the overview and Safe watchlist pages render;
- the read-only product language remains present;
- the core browser security headers remain active;
- `/api/health` reports healthy PostgreSQL and Redis dependencies;
- a known public Ethereum Safe can be verified and imported for a fresh, randomly generated Preview profile;
- the imported Safe is returned by the watchlist and detail APIs;
- one fixed successful SAFE-token transfer is ingested and receives a persisted baseline analysis;
- the transaction detail preserves its public confirmation and execution identities, Safe-service decode, receipt-backed outbound token movement, explicit trace/storage coverage, and conservative `unverified` verdict;
- the temporary profile bookmark is removed in a `finally` cleanup and confirmed absent.

The lifecycle check never signs, proposes, relays, broadcasts, or modifies blockchain state. Its fixed inputs are public chain and Safe Transaction Service records. It waits no more than 90 seconds for the selected first-page transaction and its bounded background analysis, and fails instead of weakening an assertion when receipt or coverage evidence is unavailable. Cleanup is deliberately profile-scoped: `DELETE /api/v1/safes/{chainId}/{address}` removes only the requesting profile's bookmark and returns an idempotent `204`; it does not delete shared Safe snapshots, transaction history, cursors, or evidence. The known Safe's import queue keys are stable and deduplicated, so repeated Preview deployments do not create parallel backfills.
