# Safe Inspector: living project status

Last updated: 2026-09-26
Production: <https://safe-simulator.vercel.app>  
Repository: <https://github.com/ybcoder01/Safe-Simulator>  
Telegram bot: `@safealerts_bot`

This is the living product and delivery record for Safe Inspector. Update it
whenever a feature, production dependency, security boundary, deployment state,
or priority changes. Never place credentials, tokens, private profile data, or
unredacted runtime logs in this file.

## 1. Product purpose

Safe Inspector is a read-only safety assistant for Safe multisig users. It
independently retrieves the canonical Safe transaction payload, simulates or
replays available execution evidence, identifies suspicious permissions and
addresses, and presents the result in language a non-technical signer can act
on.

The product is intended to answer these questions before another signer
approves a proposal:

1. What will this transaction actually do?
2. Is the target a wallet, a known contract, an unverified contract, or unknown?
3. Which assets, permissions, owners, modules, or Safe settings may change?
4. Does the payload contain a known-dangerous or unfamiliar address?
5. Are the available simulation and trace results complete enough to rely on?
6. Who has already signed, and can the proposal now be executed?

Safe Inspector never signs, proposes, relays, broadcasts, or executes a
transaction. It is an independent review surface and alert channel, not a
replacement for a signing wallet or hardware-wallet verification.

## 2. Current production state

| Area                            | State | Notes                                                                                                              |
| ------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------ |
| Web application                 | Live  | Production domain is assigned and serving the merged application.                                                  |
| Supported networks              | Live  | Ethereum mainnet (`1`) and XDC mainnet (`50`).                                                                     |
| Safe import and discovery       | Live  | Imports by Safe address and public discovery by owner address.                                                     |
| Transaction review              | Live  | Executed, pending, failed, and replaced transaction states are supported.                                          |
| Draft simulation                | Live  | A target, native value, and calldata can be reviewed before a Safe proposal exists.                                |
| Beginner-facing verdict         | Live  | Clear green, yellow, orange, and red guidance with plain-language next actions.                                    |
| XDC protocol and token identity | Live  | Reviewed registry, protocol logos, token logos, and deterministic fallbacks.                                       |
| Telegram alerts                 | Live  | `@safealerts_bot` is connected to Production and has delivered an end-to-end signer alert for an XDC Safe.         |
| Signed alert verification       | Live  | Unique verification IDs, Ed25519-signed receipts, key rotation, and the no-signing verification page are deployed. |
| Production database             | Live  | Neon Postgres; Telegram migrations `0006` and `0007` were applied and verified.                                    |
| Queue and scheduling            | Live  | Upstash QStash and Vercel Cron; production QStash variables were verified present.                                 |
| CI and previews                 | Live  | Formatting, linting, TypeScript, tests, build, and Vercel Preview checks.                                          |

The Telegram production deployment and signed verification flow corresponding
to merged PRs `#134` and `#135` were verified Ready. Telegram confirmed the
production webhook `/api/v1/telegram/webhook` with zero pending updates. A live
XDC Safe alert was delivered and its independently signed receipt was verified.

## 3. User journeys

### 3.1 Import and inspect a Safe

1. Open the Safe watchlist.
2. Select Ethereum or XDC.
3. Enter a Safe address.
4. The application verifies deployed bytecode, owners, threshold, nonce,
   modules, guard, fallback handler, and implementation before saving it.
5. The dashboard synchronizes multisig transactions, module transactions,
   transfers, and signed messages.
6. Open any transaction to review its safety summary and evidence.

### 3.2 Discover Safes by owner

1. Select a supported network.
2. Enter an owner address.
3. Review public Safe Transaction Service matches.
4. Import a candidate to perform full on-chain verification.

Discovery results are candidates only. Import is the verification boundary.

### 3.3 Review a pending proposal

The review page shows:

- a beginner-facing safety result;
- transaction status and replacement state;
- target identity and account type;
- decoded action where reliable;
- signers and threshold progress;
- requested permissions and token movements;
- internal calls, delegate calls, and storage changes when available;
- evidence provenance and explicit coverage limitations;
- recommended next action;
- profile Trust and Flag controls for involved addresses.

### 3.4 Preview a draft call

Draft simulation accepts:

- target contract or wallet address;
- native value in wei;
- even-length hexadecimal calldata beginning with `0x`.

The preview calls the target from the Safe address at latest chain state. It
does not validate Safe signatures, nonce ordering, guards, or the complete Safe
execution wrapper. A full review should be repeated after the real Safe
proposal exists.

### 3.5 Connect Telegram

1. Open a bookmarked Safe dashboard.
2. Select **Connect Telegram**.
3. Open `@safealerts_bot` through the generated link.
4. Press **Start** within ten minutes.
5. The link is consumed once and the chat begins watching that Safe.
6. Use `/safes` to list watched Safes or `/stop` to disable all subscriptions
   for the chat.

Telegram cannot initiate a private conversation until the user starts the bot.

## 4. Safety verdicts

| Signal | Telegram heading         | Meaning                                                                                  |
| ------ | ------------------------ | ---------------------------------------------------------------------------------------- |
| Red    | `DO NOT SIGN YET`        | Critical evidence was detected. Stop and independently verify the payload and addresses. |
| Orange | `REVIEW BEFORE SIGNING`  | Evidence is unresolved or a warning requires signer review.                              |
| Yellow | `CHECK THE DETAILS`      | The transaction is recognized, but the evidence is not explicitly trusted.               |
| Green  | `NO KNOWN WARNING FOUND` | No warning was found in the available evidence. This is not a guarantee of safety.       |

Unknown, incomplete, stale, or conflicting evidence must never be converted
into a green result.

## 5. Telegram alert behavior

### 5.1 Events that produce alerts

- A new proposal receives its first owner signature.
- Another owner signs.
- The signature threshold is reached.
- The proposal executes.
- Execution fails.
- The proposal is replaced by a competing transaction.

Unsigned proposals do not currently generate Telegram alerts. The watcher polls
once per minute, then allows approximately twelve seconds for independent
analysis. Delivery is therefore not instantaneous. A one-of-one Safe may
execute before the alert is delivered.

### 5.2 Information included in every transaction alert

The Telegram preview is a novice-first decision card. It includes:

- a status-aware risk heading that distinguishes pending, executable,
  executed, failed, and replaced transactions;
- a plain-language explanation of whether the transaction can still be
  stopped;
- the decoded action category and reviewed protocol name when available;
- approvals collected and the threshold that applied to the transaction;
- up to three plain-language reasons for concern without raw address dumps;
- one explicit next step;
- the shortened Safe address and human-readable network name;
- a single **Open verified safety report** button.

Full signer and target addresses, hashes, nonce, calldata, operation,
verification identity, and evidence details remain available in the signed
report. This keeps Telegram readable without weakening independent
verification.

Delivery is idempotent for each subscriber and exact proposal state. Queue
retries cannot intentionally deliver the same state twice.

### 5.3 Critical Safe-control alerts

- owner added, removed, or replaced;
- signing threshold changed;
- module enabled or disabled;
- guard changed;
- fallback handler changed;
- Safe implementation changed.

### 5.4 Token and approval alerts

- a new wallet or contract receives spending approval;
- prior allowance was zero;
- unlimited ERC-20 allowance is requested;
- maximum allowance is observed in execution evidence;
- NFT or compatible-token `setApprovalForAll` is requested;
- Permit2 signature transfer is requested;
- maximum-value Permit2 transfer is requested;
- token or spender identity is unresolved;
- token or spender is explicitly flagged.

### 5.5 Address-injection and transfer alerts

- a known flagged address is involved;
- a recipient, sender, token, or spender is unknown;
- a transfer participant lacks trusted evidence;
- an internal call reaches an unknown target;
- the transaction target cannot be classified as a wallet or contract;
- target contract source is unverified;
- an involved address has no match in profile-trusted or registry-known records.

A newly created attacker address can be labelled unknown or suspicious, but it
cannot be proven malicious unless a trusted source or the user profile has
flagged it. The short Telegram preview explains the concern; the signed report
displays canonical addresses so signers can compare them with the intended
destination shown elsewhere.

### 5.6 Contract-execution and evidence alerts

- unexpected direct delegate call;
- unexpected internal delegate call;
- Safe-owned or caller-owned storage may be changed;
- historical Safe batch bytecode could not be verified;
- calldata cannot be decoded;
- function identification is only a signature match;
- storage changes cannot be explained;
- execution, trace, or provider evidence is incomplete;
- independent analysis is unavailable after bounded retries.

The Telegram message is intentionally concise. The linked report remains the
authoritative place for complete evidence and coverage details.

## 6. Core analysis coverage

- Safe Transaction Service decoded payloads and confirmations.
- Canonical transaction status, execution identity, and replacement state.
- Executed receipt replay.
- Pending Safe execution checks with reported supported-owner signatures.
- Native and ERC-20 movements.
- Allowance changes and requested approvals.
- Permit2 requests.
- Nested and batched calls.
- Proxy and implementation resolution.
- Verified source and ABI resolution through configured providers.
- Internal call traces when the RPC supports them.
- Storage diffs with conservative interpretation.
- Safe configuration changes.
- Profile-specific trusted and flagged addresses.
- Pinned protocol and contract identities.
- Dedicated module-execution evidence and verdict namespace.

Executed evidence is keyed by engine version and canonical block hash. It is
reused only after the chain anchor is verified.

## 7. XDC protocol and token registry

The source-controlled XDC registry currently contains 171 reviewed protocol
identities. Identity establishes who a contract is; it does not make every
interaction safe.

| Protocol  | Entries | Interaction whitelist | Identity only |
| --------- | ------: | --------------------: | ------------: |
| XSwap     |       8 |                     8 |             0 |
| Curve     |      26 |                     8 |            18 |
| Silo      |      37 |                     9 |            28 |
| Morpho    |       8 |                     6 |             2 |
| Fathom    |      62 |                    12 |            50 |
| Oku Trade |      17 |                     9 |             8 |
| Stargate  |      11 |                     5 |             6 |
| YieldNest |       1 |                     1 |             0 |
| Reservoir |       1 |                     1 |             0 |

Reviewed token identities include:

- XDC and WXDC with the XDC artwork;
- Fathom USDC Underlying (`USDC`), 6 decimals;
- YieldNest RWA MAX (`ynRWAx`), 18 decimals;
- Wrapped Savings rUSD (`wsrUSD`), 18 decimals.

Unknown tokens use deterministic fallback artwork. Liquidity-position artwork
is used only after positive LP identification. Aave remains excluded from the
XDC registry until an official chain-50 deployment record is available.

Full sources and contract counts are maintained in
[`XDC_PROTOCOL_REGISTRY.md`](XDC_PROTOCOL_REGISTRY.md).

## 8. Hosted architecture

| Layer                   | Implementation                                                                   |
| ----------------------- | -------------------------------------------------------------------------------- |
| Web and API             | Next.js App Router on Vercel                                                     |
| Runtime                 | Node.js 22                                                                       |
| Persistence             | Neon Postgres through server-only `NEON_DATABASE_URL`                            |
| ORM and migrations      | Drizzle ORM and Drizzle Kit                                                      |
| Cache and rate limiting | Upstash Redis                                                                    |
| Queue                   | Upstash QStash with signed callback verification                                 |
| Scheduling              | Vercel Cron plus profile-authorized on-demand refresh                            |
| Chain client            | Viem with ranked standard, archive, and optional trace RPCs                      |
| Safe data               | Safe Transaction Service for Ethereum and XDC                                    |
| Contract metadata       | Sourcify, configured explorer evidence, on-chain bytecode, and pinned registries |
| Alert delivery          | Telegram Bot API webhook and outbound messages                                   |

Layering rules:

- `src/core` is framework-independent.
- Adapter contracts are defined in `src/core/ports.ts`.
- `src/container.ts` is the composition root.
- Profile trust labels may affect address trust evaluation but cannot erase a
  critical execution finding.
- Signing and relay libraries are prohibited by repository lint rules.

## 9. Database state

Applied migration series:

1. `0000_wild_mother_askani.sql`
2. `0001_profile_address_book.sql`
3. `0002_execution_evidence.sql`
4. `0003_module_analysis.sql`
5. `0004_native_transfer_deduplication.sql`
6. `0005_transaction_summaries.sql`
7. `0006_melodic_living_mummy.sql`
8. `0007_mean_wither.sql`

Migration `0006` adds:

- `telegram_link_tokens`;
- `telegram_subscriptions`;
- `telegram_deliveries`;
- `telegram_delivery_status`;
- foreign keys and idempotency/subscription indexes.

The three Telegram tables were confirmed present in Production after the
migration. Database changes are forward-only unless a separately reviewed
recovery plan says otherwise.

Migration `0007` adds the verification ID, signed receipt payload, digest,
signature, and signing-key identifier to Telegram delivery records. It must be
applied before deploying the signed-alert code.

## 10. Runtime configuration

Variable names are documented here; values must remain only in Vercel or an
approved password manager.

### Required hosted services

- `NEON_DATABASE_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `QSTASH_TOKEN`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`
- `CRON_SECRET`
- `SAFE_API_KEY`

### Telegram

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_WEBHOOK_SECRET`
- `ALERT_SIGNING_PRIVATE_KEY`
- `ALERT_SIGNING_PUBLIC_KEYS`
- `ALERT_SIGNING_KEY_ID`

The three Telegram variables are configured for Production. The token and
webhook secret are stored as Vercel secrets. No populated Telegram variables
are stored in repository `.env` files.

The alert-signing private key is a separate Ed25519 identity and must never be
the Telegram bot token or webhook secret. `ALERT_SIGNING_PUBLIC_KEYS` is a JSON
key ring indexed by key ID; old public keys remain in the ring so historical
receipts continue to verify after rotation.

### Chain providers

- `RPC_URL_1`, `ARCHIVE_RPC_URL_1`, `TRACE_RPC_URL_1`
- `RPC_URL_50`, `ARCHIVE_RPC_URL_50`, `TRACE_RPC_URL_50`
- optional `SAFE_TX_SERVICE_URL_1` and `SAFE_TX_SERVICE_URL_50`
- optional `XDCSCAN_API_KEY`

### Optional services

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `TENDERLY_ACCESS_TOKEN`
- `SENTRY_DSN`
- `VERCEL_AUTOMATION_BYPASS_SECRET` for protected Preview callbacks

No secret may use a `NEXT_PUBLIC_` prefix.

## 11. Security boundaries and limitations

- Safe Inspector is advisory and cannot block a signature or execution.
- It analyzes canonical public data; it cannot prove what a signer intended to
  approve on another interface.
- Green means no known warning was found, not that a transaction is guaranteed
  safe.
- Fresh attacker addresses may be unknown rather than explicitly malicious.
- Trace and storage coverage depend on provider capability.
- Draft previews do not reproduce the entire Safe execution wrapper.
- Telegram alerts start after the first observed signature, not at unsigned
  proposal creation.
- Polling introduces an expected delay of roughly one to two minutes.
- A compromised Telegram account or device remains outside the trust boundary.
- A compromised Telegram bot token can send messages that appear to come from
  the legitimate bot. The webhook secret protects inbound webhook requests; it
  does not authenticate outbound Telegram messages to recipients.
- Signers must still compare target, spender, amount, operation, and network in
  their signing wallet.

### Telegram transport-compromise threat

Telegram must be treated as a notification transport, not as proof that a
transaction is genuine or safe. A stolen bot token cannot create a Safe
transaction, produce an owner signature, or alter an existing Safe transaction
hash. It can, however, send a forged message that attempts to persuade owners
to sign a real malicious proposal or visit a phishing site.

The Telegram account alone cannot prove that a message was emitted by Safe
Inspector if the bot token is compromised. Every real alert therefore links to
an independently signed receipt on the official Safe Inspector domain. Signers
must verify that report or open a bookmarked Safe Inspector or Safe wallet
directly, then compare the chain, Safe, nonce, Safe transaction hash, target,
operation, value, spender, and calldata before signing. A green Telegram
heading is never authorization to sign.

Implemented hardening and remaining operational controls:

1. Every alert receives a high-entropy server-generated verification ID stored
   with the canonical Safe transaction hash and exact analyzed payload digest.
2. Telegram contains one **Open verified safety report** button and no approval
   or signing action. The ID and full technical fields remain in the report.
3. A signer verifies the official `safe-simulator.vercel.app` domain, or opens
   a bookmarked Safe Inspector and checks the same transaction independently.
4. The official verification page confirms whether the alert was emitted by
   Safe Inspector and displays the canonical fields again.
5. A separate non-exportable signing key should sign alert receipts so the
   Telegram bot token alone cannot forge a valid receipt. The public key and
   key identifier must be published independently of Telegram.
6. Production monitoring must detect bot-token or webhook changes, unexpected
   send volume, and authentication failures. Suspected compromise requires an
   immediate BotFather token rotation, Vercel secret update, redeployment, and
   subscriber warning through an independent channel.
7. High-risk organizations should use an additional independent notification
   channel and require every signer to verify the payload in their own wallet.

Connection-link protections:

- ten-minute expiry;
- single use;
- only a SHA-256 hash is stored;
- profile and Safe binding;
- webhook secret-header validation with constant-time comparison.

## 12. Verification and release process

Run the same local checks enforced by CI:

```bash
pnpm check
```

This runs formatting, linting, TypeScript, unit and regression tests, coverage,
and a production build.

Release gates:

1. CI is green.
2. Vercel Preview is Ready.
3. Preview smoke passes.
4. Required migration is applied before dependent Production code.
5. Production deployment is Ready.
6. `/api/health` reports healthy database and cache dependencies.
7. One executed and one pending review render correctly.
8. Runtime logs show no new production errors.
9. Run the bounded Production read soak for material releases.

Do not merge or deploy merely to carry an isolated wording or documentation
change when it can safely be bundled with the next relevant product change.

## 13. Public manual-test references

These are public blockchain records, not private credentials.

- XDC Safe used for manual proposal testing:
  `0xc8bAe80ca5c2C9eC3bd4AC16c422220a33b6B173`
- Previously reviewed transaction:
  `0x27d9bdd76f4e61d25a6715521c5be8ee9bef9df91a487118040a8fcac9d6a5ea`
- Additional XDC Safe review path:
  `0x74c0517c6640aa4da429a5f218f0636b9eab419b`
- Previously reviewed transaction:
  `0x91efdea758f6f57a8dc2f3e35eafb11d6b2878f73ee143e11a8b3cf75bfd85dc`
- Harmless WXDC read target:
  `0x951857744785E80e2De051c32EE7b25f9c458C42`
- Harmless `name()` calldata:
  `0x06fdde03`

Never execute a deliberately suspicious test transaction. For warning tests,
use a controlled address, zero native value, and zero token allowance where
possible; leave the proposal unexecuted.

## 14. Telegram regression acceptance test

After an alert-format or delivery change:

1. Open a bookmarked XDC Safe in Production.
2. Select **Connect Telegram**.
3. Start `@safealerts_bot` and confirm **Alerts enabled** names the correct Safe
   and chain.
4. Create and sign a harmless proposal.
5. Confirm one concise alert arrives with the correct lifecycle heading,
   plain-language action, threshold progress, and verified-report button.
6. Open the report and compare the exact chain, Safe, nonce, hash, target,
   value, operation, and signer state.
7. Add another signature when available and confirm one new alert arrives.
8. Confirm threshold-reached language.
9. Execute or replace the harmless proposal and confirm the final status alert.
10. Test `/safes` and `/stop`.

## 15. Prioritized next work

### P0: operate the alert path reliably

- Inspect QStash and Vercel logs for duplicate, delayed, or failed deliveries.
- Confirm the report link opens the exact Safe and transaction.

### P0: prevent bot-token spoofing

- Complete review and deployment of the implemented server-issued verification
  IDs, signed receipts, and official-domain verification page.
- Provision the separate Ed25519 signing identity and apply migration `0007`.
- Verify altered receipts and unknown IDs fail closed in Preview and Production.
- Monitor Telegram webhook identity and unexpected outbound volume, and write a
  tested bot-token compromise and subscriber-notification procedure.
- Do not promote Telegram alerts for broad signer reliance until this gate is
  complete.

### P1: production usability

- Add in-app Telegram subscription management per Safe.
- Show last successful alert, last poll, and actionable delivery failure state.
- Provide an explicit test-alert action that cannot touch blockchain state.
- Improve non-technical wording for remaining fallback finding titles.

### P1: threat coverage

- Add immediate Telegram coverage for module executions that bypass the normal
  multisig proposal path.
- Add organization policies for refund receiver, gas token, value limits,
  approved recipients, and expected protocols.
- Evaluate reputable real-time threat-intelligence sources for malicious
  addresses without treating third-party labels as infallible.

### P2: operational maturity

- Delivery dashboards and alerting for webhook, queue, provider, and Telegram
  failures.
- Backup and restore rehearsal.
- Documented incident response and credential-rotation drill.
- Defined production SLOs for analysis and alert latency.

## 16. Decision log

| Date       | Decision                                                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-25 | Telegram alerts were deployed and configured using `@safealerts_bot`.                                                                                                                           |
| 2026-09-25 | Telegram webhook registration was confirmed by Telegram with zero pending updates.                                                                                                              |
| 2026-09-25 | Migration `0006` was applied directly to the reviewed Neon Production database and the new tables were verified.                                                                                |
| 2026-09-25 | Telegram credentials remain only in Vercel Production secret storage; local registration artifacts were removed.                                                                                |
| 2026-09-25 | End-to-end Telegram delivery testing became the next release gate; no additional feature PR should precede it unless it fixes a blocker.                                                        |
| 2026-09-25 | Bot-token compromise was elevated to a P0 threat: Telegram is notification-only, and independently verifiable signed alert receipts are required before broad rollout.                          |
| 2026-09-25 | A local feature branch implemented unique alert IDs, separately signed Ed25519 receipts, key-rotation support, and an official no-signing verification page; deployment remains pending review. |
| 2026-09-26 | Signed alert verification is deployed, migration `0007` and the signing key are active, and a live XDC signer alert was delivered and verified.                                                 |
| 2026-09-26 | Telegram previews were redesigned as status-aware, novice-first decision cards; complete technical evidence remains in the signed report.                                                       |

## 17. Related documents

- [`OPERATIONS.md`](OPERATIONS.md) — deployment, queue, database, recovery, and incident procedures.
- [`TELEGRAM_ALERT_THREAT_MODEL.md`](TELEGRAM_ALERT_THREAT_MODEL.md) — attack scenarios and alert guarantees.
- [`XDC_PROTOCOL_REGISTRY.md`](XDC_PROTOCOL_REGISTRY.md) — reviewed protocol identities and evidence sources.
- [`../INITIAL_Project_SCOPE.md`](../INITIAL_Project_SCOPE.md) — original architecture and staged implementation plan.

## 18. How to maintain this document

For every meaningful product change:

1. Update **Current production state**.
2. Update the relevant capability, boundary, or architecture section.
3. Move completed work out of **Prioritized next work**.
4. Add a short dated entry to **Decision log**.
5. Do not record secrets, private chat IDs, private profile IDs, or sensitive
   operational output.
