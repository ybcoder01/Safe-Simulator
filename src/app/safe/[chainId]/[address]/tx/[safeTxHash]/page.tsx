import Link from "next/link";
import { notFound } from "next/navigation";

import { getPersistencePort } from "@/container";
import {
  safeRouteParamsSchema,
  safeTransactionHashSchema,
  toTransactionView,
} from "@/lib/api/safe-details";

interface PageProps {
  readonly params: Promise<{
    chainId: string;
    address: string;
    safeTxHash: string;
  }>;
}

function shorten(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function formatDate(timestamp: number | null) {
  if (timestamp === null) return "Not executed";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "long",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000));
}

export default async function TransactionDetailPage({ params }: PageProps) {
  const values = await params;
  const safe = safeRouteParamsSchema.safeParse(values);
  const hash = safeTransactionHashSchema.safeParse(values.safeTxHash);
  if (!safe.success || !hash.success) notFound();

  const persisted = await getPersistencePort().findTransaction(
    safe.data,
    hash.data,
  );
  if (!persisted) notFound();

  const transaction = toTransactionView(persisted);
  const safePath = `/safe/${safe.data.chainId}/${safe.data.address}`;

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

      <article className="transaction-detail">
        <Link className="dashboard-back" href={safePath}>
          ← Safe overview
        </Link>

        <header className="transaction-title">
          <div>
            <p className="eyebrow">Safe transaction</p>
            <h1>Nonce {transaction.nonce}</h1>
            <code>{transaction.safeTxHash}</code>
          </div>
          <span className={`tx-status tx-${transaction.status}`}>
            {transaction.status}
          </span>
        </header>

        <section className="detail-grid">
          <div>
            <span>Operation</span>
            <strong>
              {transaction.operation === "delegatecall"
                ? "Delegate call"
                : "Contract call"}
            </strong>
          </div>
          <div>
            <span>Value</span>
            <strong>{transaction.value}</strong>
          </div>
          <div>
            <span>Proposed</span>
            <strong>{formatDate(transaction.proposedAt)}</strong>
          </div>
          <div>
            <span>Executed</span>
            <strong>{formatDate(transaction.executedAt)}</strong>
          </div>
        </section>

        <section className="detail-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Call</p>
              <h2>Target and calldata</h2>
            </div>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Target</dt>
              <dd>
                <code>{transaction.to}</code>
              </dd>
            </div>
            <div>
              <dt>Executed transaction</dt>
              <dd>
                {transaction.executedTxHash ? (
                  <code>{transaction.executedTxHash}</code>
                ) : (
                  "Pending"
                )}
              </dd>
            </div>
            <div>
              <dt>Block</dt>
              <dd>{transaction.blockNumber ?? "Pending"}</dd>
            </div>
          </dl>
          <div className="calldata">
            <span>Raw calldata</span>
            <code>{transaction.data || "0x"}</code>
          </div>
        </section>

        <section className="detail-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Approvals</p>
              <h2>Confirmations</h2>
            </div>
            <span>{transaction.confirmations.length} collected</span>
          </div>
          {transaction.confirmations.length === 0 ? (
            <div className="panel-empty">No confirmations recorded.</div>
          ) : (
            <div className="owner-list">
              {transaction.confirmations.map((confirmation, index) => (
                <div className="owner-row" key={confirmation.owner}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <code>{confirmation.owner}</code>
                  <time>
                    {confirmation.signedAt
                      ? formatDate(confirmation.signedAt)
                      : "Time unavailable"}
                  </time>
                </div>
              ))}
            </div>
          )}
        </section>
      </article>

      <footer className="workspace-footer">
        <Link className="text-link" href={safePath}>
          Return to Safe
        </Link>
        <span title={transaction.safeTxHash}>
          Transaction {shorten(transaction.safeTxHash)}
        </span>
      </footer>
    </main>
  );
}
