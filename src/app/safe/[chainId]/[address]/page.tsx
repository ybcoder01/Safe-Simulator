import Link from "next/link";
import { notFound } from "next/navigation";

import { getPersistencePort, getSafeDataPort } from "@/container";
import {
  resolveSyncStatus,
  safeRouteParamsSchema,
  toBalanceView,
  toTransactionView,
} from "@/lib/api/safe-details";

interface PageProps {
  readonly params: Promise<{ chainId: string; address: string }>;
}

function shorten(value: string, start = 8, end = 6) {
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function formatTokenAmount(amount: string, decimals: number) {
  const value = BigInt(amount);
  if (decimals === 0) return value.toString();
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = (value % divisor)
    .toString()
    .padStart(decimals, "0")
    .slice(0, 4)
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000));
}

export default async function SafeDashboardPage({ params }: PageProps) {
  const parsed = safeRouteParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();

  const persistence = getPersistencePort();
  const safe = await persistence.findSafe(parsed.data);
  if (!safe) notFound();

  const [status, page, balanceResult] = await Promise.all([
    resolveSyncStatus(persistence, safe),
    persistence.listTransactions(safe, null, 25),
    getSafeDataPort()
      .getBalances(safe)
      .then((items) => items.map(toBalanceView))
      .catch(() => null),
  ]);
  const transactions = page.items.map(toTransactionView);
  const chainName = safe.chainId === 1 ? "Ethereum" : "XDC Network";
  const basePath = `/safe/${safe.chainId}/${safe.address}`;

  return (
    <main className="workspace shell">
      <header className="workspace-header">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>Safe Inspector</span>
        </Link>
        <span className="read-only-pill">
          <i aria-hidden="true" /> Read-only by design
        </span>
      </header>

      <div className="safe-dashboard">
        <Link className="dashboard-back" href="/safes">
          ← All Safe accounts
        </Link>

        <section className="dashboard-hero">
          <div>
            <p className="eyebrow">{chainName}</p>
            <h1>{shorten(safe.address, 12, 10)}</h1>
            <p className="full-address">{safe.address}</p>
          </div>
          <span className={`verified-pill sync-${status}`}>
            {status === "complete"
              ? "Synced"
              : status === "failed"
                ? "Sync failed"
                : status === "syncing"
                  ? "Syncing"
                  : "Queued"}
          </span>
        </section>

        <section className="dashboard-metrics" aria-label="Safe configuration">
          <article>
            <span>Signing policy</span>
            <strong>
              {safe.threshold} of {safe.owners.length}
            </strong>
          </article>
          <article>
            <span>Nonce</span>
            <strong>{safe.nonce.toString()}</strong>
          </article>
          <article>
            <span>Version</span>
            <strong>{safe.version ?? "Unknown"}</strong>
          </article>
          <article>
            <span>Modules</span>
            <strong>{safe.modules.length}</strong>
          </article>
        </section>

        <div className="dashboard-columns">
          <section className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Configuration</p>
                <h2>Owners and controls</h2>
              </div>
              <span>{safe.owners.length} owners</span>
            </div>
            <div className="owner-list">
              {safe.owners.map((owner, index) => (
                <div className="owner-row" key={owner}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <code>{owner}</code>
                </div>
              ))}
            </div>
            <dl className="config-list">
              <div>
                <dt>Guard</dt>
                <dd>{safe.guard ? shorten(safe.guard) : "None"}</dd>
              </div>
              <div>
                <dt>Implementation</dt>
                <dd>
                  {safe.implementation
                    ? shorten(safe.implementation)
                    : "Unknown"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Assets</p>
                <h2>Current balances</h2>
              </div>
              <span>{balanceResult?.length ?? 0} assets</span>
            </div>
            {balanceResult === null ? (
              <div className="panel-empty">
                Balances are temporarily unavailable.
              </div>
            ) : balanceResult.length === 0 ? (
              <div className="panel-empty">No token balances reported.</div>
            ) : (
              <div className="balance-list">
                {balanceResult.map((balance) => (
                  <div
                    className="balance-row"
                    key={balance.token ?? "native"}
                  >
                    <div>
                      <strong>{balance.symbol}</strong>
                      <span>
                        {balance.token ? shorten(balance.token) : "Native"}
                      </span>
                    </div>
                    <code>
                      {formatTokenAmount(balance.amount, balance.decimals)}
                    </code>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="history-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Activity</p>
              <h2>Transaction history</h2>
            </div>
            <span>
              {transactions.length}
              {page.nextCursor ? "+" : ""} loaded
            </span>
          </div>

          {transactions.length === 0 ? (
            <div className="history-empty">
              <div className="empty-icon" aria-hidden="true">
                ↔
              </div>
              <h3>No Safe transactions yet</h3>
              <p>
                This account is fully synced, but its multisig history is empty.
                New activity will appear after the next synchronization.
              </p>
            </div>
          ) : (
            <div className="history-list">
              {transactions.map((transaction) => (
                <Link
                  className="history-row"
                  href={`${basePath}/tx/${transaction.safeTxHash}`}
                  key={transaction.safeTxHash}
                >
                  <span className={`tx-status tx-${transaction.status}`}>
                    {transaction.status}
                  </span>
                  <div>
                    <strong>
                      Nonce {transaction.nonce} ·{" "}
                      {transaction.operation === "delegatecall"
                        ? "Delegate call"
                        : "Contract call"}
                    </strong>
                    <span>
                      To {shorten(transaction.to)} ·{" "}
                      {transaction.confirmations.length}/{safe.threshold}{" "}
                      confirmations
                    </span>
                  </div>
                  <time dateTime={new Date(
                    transaction.proposedAt * 1_000,
                  ).toISOString()}>
                    {formatDate(transaction.proposedAt)}
                  </time>
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="workspace-footer">
        <Link className="text-link" href="/safes">
          Return to watchlist
        </Link>
        <span>Public data only · No signing capability</span>
      </footer>
    </main>
  );
}
