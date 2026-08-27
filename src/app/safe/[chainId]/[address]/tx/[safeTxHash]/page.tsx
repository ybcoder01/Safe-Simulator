import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getAbiPort,
  getPersistencePort,
  getSafeDataPort,
  getSimulationPort,
} from "@/container";
import { decodedCallSummary } from "@/core/analysis/decoding/calldata";
import { resolveContractInsight } from "@/lib/api/contract-insight";
import { resolveExecutionInsight } from "@/lib/api/execution-insight";
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

  const [transaction, insight, execution] = await Promise.all([
    Promise.resolve(toTransactionView(persisted)),
    resolveContractInsight(getSafeDataPort(), getAbiPort(), persisted),
    resolveExecutionInsight(getSimulationPort(), persisted),
  ]);
  const decoded = insight.decoded;
  const nestedCalls =
    decoded?.parameters.flatMap((parameter) => parameter.nestedCalls) ?? [];
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
              <p className="eyebrow">Execution evidence</p>
              <h2>
                {execution.mode === "executed-replay"
                  ? "On-chain replay"
                  : execution.mode === "direct-call-check"
                    ? "Read-only call check"
                    : "Execution unavailable"}
              </h2>
            </div>
            <span>
              {execution.success === null
                ? "No verdict"
                : execution.success
                  ? "Succeeded"
                  : "Reverted"}
            </span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Evidence source</dt>
              <dd>{execution.coverage.outcome}</dd>
            </div>
            <div>
              <dt>Gas used</dt>
              <dd>{execution.gasUsed ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Block</dt>
              <dd>{execution.blockNumber ?? "Latest state"}</dd>
            </div>
            <div>
              <dt>Event logs</dt>
              <dd>
                {execution.coverage.eventLogs === "complete"
                  ? `${execution.logs.length} emitted`
                  : "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>Token event extraction</dt>
              <dd>{execution.coverage.tokenEvents}</dd>
            </div>
            <div>
              <dt>Call trace</dt>
              <dd>{execution.coverage.callTrace}</dd>
            </div>
            <div>
              <dt>Storage diff</dt>
              <dd>{execution.coverage.storageDiff}</dd>
            </div>
          </dl>
          {execution.rootCall ? (
            <div className="calldata">
              <span>Outer call</span>
              <strong>
                {execution.rootCall.reverted ? "Reverted" : "Completed"} ·{" "}
                {execution.rootCall.from} → {execution.rootCall.to}
              </strong>
              <code>{execution.rootCall.input}</code>
            </div>
          ) : null}
          {execution.error ? (
            <div className="calldata">
              <span>Execution error</span>
              <strong>{execution.error}</strong>
            </div>
          ) : null}
          {execution.logs.slice(0, 20).map((log) => (
            <div className="calldata" key={`${log.logIndex}-${log.address}`}>
              <span>Event log {log.logIndex}</span>
              <strong>{log.address}</strong>
              <code>
                {log.topics[0] ?? "No topic"} · {log.data}
              </code>
            </div>
          ))}
          {execution.logs.length > 20 ? (
            <div className="panel-empty">
              {execution.logs.length - 20} additional logs are available through
              the transaction API.
            </div>
          ) : null}
          <div className="calldata">
            <span>Coverage limits</span>
            {execution.warnings.map((warning) => (
              <strong key={warning}>{warning}</strong>
            ))}
          </div>
        </section>

        <section className="detail-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Token activity</p>
              <h2>Receipt-derived movements</h2>
            </div>
            <span>{execution.tokenMovements.length} recognized</span>
          </div>
          {execution.coverage.tokenEvents === "unavailable" ? (
            <div className="panel-empty">
              Token event evidence is unavailable for this transaction.
            </div>
          ) : execution.tokenMovements.length === 0 ? (
            <div className="panel-empty">
              No canonical ERC-20-shaped Transfer events were emitted.
            </div>
          ) : (
            execution.tokenMovements.map((movement) => (
              <div
                className="calldata"
                key={`movement-${movement.logIndex}-${movement.token}`}
              >
                <span>{movement.direction} movement</span>
                <strong>{movement.amount} base units</strong>
                <code>
                  {movement.token} · {movement.from} → {movement.to}
                </code>
              </div>
            ))
          )}
          <div className="panel-empty">
            Derived from canonical event shape. The emitting contract is not
            independently proven to implement ERC-20.
          </div>
        </section>

        <section className="detail-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Allowances</p>
              <h2>Receipt-derived changes</h2>
            </div>
            <span>
              {execution.allowanceChanges.some(
                (allowance) => allowance.infinite,
              )
                ? "Infinite detected"
                : `${execution.allowanceChanges.length} recognized`}
            </span>
          </div>
          {execution.coverage.tokenEvents === "unavailable" ? (
            <div className="panel-empty">
              Allowance event evidence is unavailable for this transaction.
            </div>
          ) : execution.allowanceChanges.length === 0 ? (
            <div className="panel-empty">
              No canonical ERC-20-shaped Approval events were emitted.
            </div>
          ) : (
            execution.allowanceChanges.map((allowance) => (
              <div
                className="calldata"
                key={`allowance-${allowance.logIndex}-${allowance.token}`}
              >
                <span>
                  {allowance.infinite
                    ? "Infinite allowance"
                    : "Bounded allowance"}
                </span>
                <strong>
                  {allowance.owner} → {allowance.spender}
                </strong>
                <code>
                  {allowance.token} · {allowance.amount} base units
                </code>
              </div>
            ))
          )}
        </section>

        <section className="detail-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Contract metadata</p>
              <h2>{insight.metadata.label ?? "Target contract"}</h2>
            </div>
            <span>
              {insight.metadata.verified
                ? "Verified by Sourcify"
                : "No verified ABI"}
            </span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Metadata source</dt>
              <dd>{insight.metadata.source}</dd>
            </div>
            <div>
              <dt>Proxy status</dt>
              <dd>
                {insight.implementationChain.length > 0
                  ? `${insight.implementationChain.length} implementation layer(s)`
                  : "No ERC-1967 implementation detected"}
              </dd>
            </div>
          </dl>
          {insight.implementationChain.length > 0 ? (
            <div className="calldata">
              <span>Implementation chain</span>
              <code>
                {[transaction.to, ...insight.implementationChain].join(" → ")}
              </code>
            </div>
          ) : null}
        </section>

        <section className="detail-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Decoded action</p>
              <h2>Human-readable call</h2>
            </div>
            <span>
              {insight.provenance === "verified-abi"
                ? "Verified ABI"
                : insight.provenance === "safe-service"
                  ? "Safe service decode"
                  : insight.provenance === "signature-database"
                    ? "Signature match · unverified"
                    : (decoded?.method ??
                      (transaction.summary
                        ? "Known selector"
                        : "Unknown selector"))}
            </span>
          </div>
          <div className="calldata">
            <span>Decode provenance</span>
            <strong>
              {insight.provenance === "verified-abi"
                ? "Sourcify verified contract ABI"
                : insight.provenance === "safe-service"
                  ? "Safe transaction service"
                  : insight.provenance === "signature-database"
                    ? `Sourcify signature database · ${insight.signature}`
                    : "Raw calldata only"}
            </strong>
          </div>
          {decoded ? (
            <>
              <div className="calldata">
                <span>Summary</span>
                <strong>{decodedCallSummary(decoded)}</strong>
              </div>

              {decoded.parameters.length > 0 ? (
                <dl className="detail-list">
                  {decoded.parameters.map((parameter, index) => (
                    <div key={`${parameter.name}-${index}`}>
                      <dt>
                        {parameter.name || `Parameter ${index + 1}`} ·{" "}
                        {parameter.type}
                      </dt>
                      <dd>
                        {parameter.nestedCalls.length > 0 ? (
                          `${parameter.nestedCalls.length} decoded calls`
                        ) : (
                          <code>{parameter.value}</code>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {nestedCalls.map((call, index) => (
                <div className="calldata" key={`${call.to}-${index}`}>
                  <span>Nested call {index + 1}</span>
                  <strong>{decodedCallSummary(call)}</strong>
                  <code>
                    {call.to ?? "Unknown target"} ·{" "}
                    {call.operation ?? "Unknown operation"}
                  </code>
                </div>
              ))}
            </>
          ) : transaction.summary ? (
            <div className="calldata">
              <span>Selector summary · ABI unverified</span>
              <strong>{transaction.summary}</strong>
            </div>
          ) : (
            <div className="panel-empty">
              No verified decode is available. Review the raw calldata below.
            </div>
          )}
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
