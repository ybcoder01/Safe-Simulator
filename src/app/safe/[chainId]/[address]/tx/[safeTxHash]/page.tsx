import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getAbiPort,
  getCachePort,
  getChainPort,
  getPersistencePort,
  getSafeDataPort,
  getSimulationPort,
} from "@/container";
import { AddressBookEditor } from "@/components/safes/address-book-editor";
import { AddressIdentity } from "@/components/shared/address-identity";
import { CopyIdentifierButton } from "@/components/shared/copy-identifier-button";
import { TokenIdentity } from "@/components/shared/token-identity";
import { decodedCallSummary } from "@/core/analysis/decoding/calldata";
import { formatTokenAmount } from "@/core/analysis/tokens/metadata";
import { resolveApprovalRisk } from "@/lib/api/approval-risk";
import { resolveContractInsight } from "@/lib/api/contract-insight";
import { decodedAddressFields } from "@/lib/api/decoded-addresses";
import { resolveEvidenceVerdict } from "@/lib/api/evidence-verdict";
import { resolveExecutionInsight } from "@/lib/api/execution-insight";
import { parseProfileId, PROFILE_COOKIE } from "@/lib/api/profile";
import { resolveStorageChangeAnalysis } from "@/lib/api/storage-changes";
import { resolveExecutionTokenMetadata } from "@/lib/api/token-metadata";
import { explorerTransactionUrl } from "@/lib/explorer-links";
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

  const persistence = getPersistencePort();
  const cache = getCachePort();
  const persisted = await persistence.findTransaction(safe.data, hash.data);
  if (!persisted) notFound();

  const cookieStore = await cookies();
  const profileId = parseProfileId(cookieStore.get(PROFILE_COOKIE)?.value);
  const chain = getChainPort();
  const safeData = getSafeDataPort();
  const abi = getAbiPort();
  const [transaction, insight, execution, addressBook, rawPayload] =
    await Promise.all([
      Promise.resolve(toTransactionView(persisted)),
      resolveContractInsight(safeData, abi, persisted),
      resolveExecutionInsight(
        getSimulationPort(),
        persisted,
        { cache, persistence },
        { chain, safeData },
      ),
      profileId
        ? persistence.listAddressBookEntries(profileId, safe.data)
        : Promise.resolve([]),
      safeData.getMultisigTransaction(safe.data, hash.data).catch(() => null),
    ]);
  const [approvalRisk, tokenMetadata, storageAnalysis] = await Promise.all([
    resolveApprovalRisk(chain, persisted, insight, execution),
    resolveExecutionTokenMetadata(
      chain,
      cache,
      persisted.safe.chainId,
      execution,
    ),
    resolveStorageChangeAnalysis(abi, persisted.safe.chainId, execution),
  ]);
  const verdict = resolveEvidenceVerdict(
    persisted,
    insight,
    execution,
    addressBook,
    approvalRisk,
    storageAnalysis,
  );
  const tokenMetadataByAddress = new Map(
    tokenMetadata.items.map((metadata) => [
      metadata.token.toLowerCase(),
      metadata,
    ]),
  );
  const decoded = insight.decoded;
  const nestedCalls =
    decoded?.parameters.flatMap((parameter) => parameter.nestedCalls) ?? [];
  const safePath = `/safe/${safe.data.chainId}/${safe.data.address}`;
  const executedExplorerUrl = transaction.executedTxHash
    ? explorerTransactionUrl(safe.data.chainId, transaction.executedTxHash)
    : null;

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
            <div className="identifier-actions transaction-hash-actions">
              <code>{transaction.safeTxHash}</code>
              <CopyIdentifierButton
                label="Copy Safe transaction hash"
                value={transaction.safeTxHash}
              />
            </div>
          </div>
          <div className="transaction-title-labels">
            <span
              className={`tx-activity tx-activity-${transaction.activity.type}`}
              title={`Classified from ${transaction.activity.basis.replaceAll("-", " ")} evidence.`}
            >
              {transaction.activity.label}
            </span>
            <span className={`tx-status tx-${transaction.status}`}>
              {transaction.status}
            </span>
          </div>
        </header>

        <section className="detail-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Evidence verdict</p>
              <h2>{verdict.headline}</h2>
            </div>
            <span>{verdict.verdict}</span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Coverage</dt>
              <dd>{verdict.coverage}</dd>
            </div>
            <div>
              <dt>Trust rule</dt>
              <dd>{verdict.trustBoundary}</dd>
            </div>
          </dl>
          {verdict.findings.map((finding, index) => (
            <div className="calldata" key={`${finding.code}-${index}`}>
              <span>{finding.severity} finding</span>
              <strong>{finding.title}</strong>
              <code>{finding.detail}</code>
              {finding.addresses.length > 0 ? (
                <code>{finding.addresses.join(" · ")}</code>
              ) : null}
            </div>
          ))}
          {verdict.addresses.map((assessment) => (
            <div
              className="calldata"
              key={`address-trust-${assessment.address.toLowerCase()}`}
            >
              <span>
                {assessment.status} · {assessment.source.replaceAll("-", " ")} ·{" "}
                {assessment.roles.join(" · ")}
              </span>
              <strong>
                {assessment.label ?? "No registry or profile label"}
              </strong>
              <code>{assessment.address}</code>
            </div>
          ))}
        </section>

        {profileId ? (
          <AddressBookEditor
            chainId={safe.data.chainId}
            initialEntries={addressBook}
            safeAddress={safe.data.address}
            suggestions={verdict.addresses.map((assessment) => ({
              address: assessment.address,
              label: assessment.label,
              roles: assessment.roles,
            }))}
          />
        ) : null}

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
                  : execution.mode === "safe-execution-check"
                    ? "Full Safe execution check"
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
          {execution.internalCalls.slice(0, 40).map((call, index) => (
            <div className="calldata" key={`internal-call-${index}-${call.to}`}>
              <span>
                Internal call {index + 1} · depth {call.depth} ·{" "}
                {call.operation}
              </span>
              <strong>
                {call.reverted ? "Reverted" : "Completed"} · {call.from} →{" "}
                {call.to}
              </strong>
              <code>{call.input}</code>
              {call.error ? <code>{call.error}</code> : null}
            </div>
          ))}
          {execution.internalCalls.length > 40 ? (
            <div className="panel-empty">
              {execution.internalCalls.length - 40} additional internal calls
              are available through the transaction API.
            </div>
          ) : null}
          {execution.coverage.callTrace === "complete" &&
          execution.internalCalls.length === 0 ? (
            <div className="panel-empty">
              The complete trace contains no internal calls.
            </div>
          ) : null}
          {storageAnalysis.items.length > 0 ? (
            <div className="calldata">
              <span>Storage interpretation</span>
              <strong>
                {storageAnalysis.namedCount} named · {storageAnalysis.rawCount}{" "}
                raw
              </strong>
              {storageAnalysis.warnings.map((warning) => (
                <code key={warning}>{warning}</code>
              ))}
            </div>
          ) : null}
          {storageAnalysis.items.slice(0, 40).map((change, index) => (
            <div
              className="calldata"
              key={`storage-${index}-${change.address}-${change.slot}`}
            >
              <span>
                {change.status === "named"
                  ? "Named storage slot · verified layout"
                  : "Unrecognized raw storage slot change"}
              </span>
              <strong>
                {change.status === "named"
                  ? `${change.contractLabel ? `${change.contractLabel} · ` : ""}${change.label} · ${change.type}`
                  : change.address}
              </strong>
              {change.status === "named" ? <code>{change.address}</code> : null}
              <code>{change.slot}</code>
              <code>
                {change.before} → {change.after}
              </code>
            </div>
          ))}
          {storageAnalysis.items.length > 40 ? (
            <div className="panel-empty">
              {storageAnalysis.items.length - 40} additional storage changes are
              available through the transaction API.
            </div>
          ) : null}
          {execution.coverage.storageDiff === "complete" &&
          execution.storageChanges.length === 0 ? (
            <div className="panel-empty">
              The complete prestate diff contains no storage slot changes.
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
              <p className="eyebrow">Safe configuration</p>
              <h2>Receipt-derived changes</h2>
            </div>
            <span>{execution.safeConfigurationChanges.length} recognized</span>
          </div>
          {execution.coverage.eventLogs === "unavailable" ? (
            <div className="panel-empty">
              Safe configuration event evidence is unavailable for this
              transaction.
            </div>
          ) : execution.safeConfigurationChanges.length === 0 ? (
            <div className="panel-empty">
              No canonical Safe configuration events were emitted by this Safe.
            </div>
          ) : (
            execution.safeConfigurationChanges.map((change) => (
              <div
                className="calldata"
                key={`safe-change-${change.logIndex}-${change.field}`}
              >
                <span>
                  {change.field} · {change.action}
                </span>
                <strong>
                  {change.before ?? "Previous value not emitted"} →{" "}
                  {change.after ?? "No longer configured"}
                </strong>
                <code>
                  Receipt log {change.logIndex} · canonical Safe event
                </code>
              </div>
            ))
          )}
          <div className="panel-empty">
            Only events emitted by this Safe are interpreted. Values absent from
            an event remain unknown and are never inferred from raw storage.
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
            execution.tokenMovements.map((movement) => {
              const metadata = tokenMetadataByAddress.get(
                movement.token.toLowerCase(),
              );
              const formatted = formatTokenAmount(
                movement.amount,
                metadata?.decimals ?? null,
              );

              return (
                <div
                  className="calldata"
                  key={`movement-${movement.logIndex}-${movement.token}`}
                >
                  <span>
                    {movement.direction} movement ·{" "}
                    {metadata?.status ?? "unavailable"} metadata
                  </span>
                  <TokenIdentity
                    amount={formatted}
                    chainId={safe.data.chainId}
                    symbol={metadata?.symbol}
                    token={movement.token}
                  />
                  <code>Raw: {movement.amount} base units</code>
                  <code>
                    {movement.from} → {movement.to}
                  </code>
                  {metadata?.warning ? <code>{metadata.warning}</code> : null}
                </div>
              );
            })
          )}
          <div className="panel-empty">
            Metadata resolved for{" "}
            {
              tokenMetadata.items.filter(
                (metadata) => metadata.status === "resolved",
              ).length
            }{" "}
            of {tokenMetadata.totalTokens} token contracts
            {tokenMetadata.blockHash
              ? " at the execution block"
              : " at latest state"}
            {tokenMetadata.limited
              ? "; additional token contracts remain unenriched"
              : ""}
            .
          </div>
          <div className="panel-empty">
            Derived from canonical event shape. The emitting contract is not
            independently proven to implement ERC-20.
          </div>
        </section>

        <section className="detail-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Approval risk</p>
              <h2>Requested and receipt-proven changes</h2>
            </div>
            <span>
              {[...approvalRisk.requests, ...approvalRisk.executedChanges].some(
                (item) => item.infinite,
              )
                ? "Infinite detected"
                : `${approvalRisk.requests.length} requested · ${approvalRisk.executedChanges.length} emitted`}
            </span>
          </div>

          <div className="calldata">
            <span>Calldata requests</span>
            <strong>{approvalRisk.requests.length} recognized</strong>
          </div>
          {approvalRisk.requests.length === 0 ? (
            <div className="panel-empty">
              No direct or recursively decoded ERC-20 or Permit2 authorization
              request was recognized.
            </div>
          ) : (
            approvalRisk.requests.map((approval, index) => {
              const severity =
                approval.infinite === true || approval.spender === null
                  ? "critical"
                  : approval.newSpenderAtAnchor !== false
                    ? "warning"
                    : "bounded";
              const headline =
                approval.standard === "operator-all"
                  ? approval.infinite
                    ? "Full token operator access requested"
                    : "Full token operator access revoked"
                  : approval.infinite === true
                    ? "Infinite resulting allowance requested"
                    : approval.amount !== null &&
                        approval.amountMode === "increase"
                      ? `Increase allowance by ${approval.amount} base units`
                      : approval.amount !== null &&
                          approval.amountMode === "decrease"
                        ? `Decrease allowance by ${approval.amount} base units`
                        : approval.amount !== null
                          ? `${approval.amount} base units requested`
                          : "Authorization request detected";

              return (
                <div
                  className={`calldata approval-review-card approval-review-${severity}`}
                  key={`approval-request-${index}-${approval.target}`}
                >
                  <div className="approval-review-heading">
                    <span>
                      requested · {approval.standard} · {approval.method}
                      {approval.depth > 0
                        ? ` · nested depth ${approval.depth}`
                        : ""}
                    </span>
                    <strong>{headline}</strong>
                    <em>{severity}</em>
                  </div>
                  {approval.token ? (
                    <TokenIdentity
                      chainId={safe.data.chainId}
                      token={approval.token}
                    />
                  ) : (
                    <code>Token contract unavailable</code>
                  )}
                  <div className="approval-party">
                    <span>Spender or operator</span>
                    {approval.spender ? (
                      <AddressIdentity
                        address={approval.spender}
                        addressBook={addressBook}
                        chainId={safe.data.chainId}
                      />
                    ) : (
                      <strong>Cannot be established from this call</strong>
                    )}
                  </div>
                  <code>
                    Owner: {approval.owner ?? "Unavailable"} · target:{" "}
                    {approval.target}
                  </code>
                  <code>
                    Prior authorization: {approval.priorAmount ?? "Unavailable"}{" "}
                    · new spender at comparison anchor:{" "}
                    {approval.newSpenderAtAnchor === null
                      ? "unknown"
                      : approval.newSpenderAtAnchor
                        ? "yes"
                        : "no"}
                  </code>
                  {approval.amountMode !== "absolute" ? (
                    <code>
                      Projected resulting allowance:{" "}
                      {approval.resultingAmount ?? "Unavailable"}
                    </code>
                  ) : null}
                  {approval.expiration !== null ? (
                    <code>Expiration: {approval.expiration}</code>
                  ) : null}
                  {approval.warning ? <code>{approval.warning}</code> : null}
                </div>
              );
            })
          )}

          <div className="calldata">
            <span>Receipt events</span>
            <strong>{approvalRisk.executedChanges.length} recognized</strong>
          </div>
          {execution.coverage.tokenEvents === "unavailable" ? (
            <div className="panel-empty">
              Allowance event evidence is unavailable for this transaction.
            </div>
          ) : approvalRisk.executedChanges.length === 0 ? (
            <div className="panel-empty">
              No canonical ERC-20-shaped Approval events were emitted.
            </div>
          ) : (
            approvalRisk.executedChanges.map((allowance) => {
              const metadata = tokenMetadataByAddress.get(
                allowance.token.toLowerCase(),
              );
              const formatted = formatTokenAmount(
                allowance.amount,
                metadata?.decimals ?? null,
              );

              return (
                <div
                  className="calldata"
                  key={`allowance-${allowance.logIndex}-${allowance.token}`}
                >
                  <span>
                    emitted ·{" "}
                    {allowance.infinite
                      ? "infinite allowance"
                      : "bounded allowance"}{" "}
                    · {metadata?.status ?? "unavailable"} metadata
                  </span>
                  <div className="approval-party">
                    <span>Receipt-proven spender</span>
                    <AddressIdentity
                      address={allowance.spender}
                      addressBook={addressBook}
                      chainId={safe.data.chainId}
                    />
                  </div>
                  <code>Owner: {allowance.owner}</code>
                  <TokenIdentity
                    amount={formatted}
                    chainId={safe.data.chainId}
                    symbol={metadata?.symbol}
                    token={allowance.token}
                  />
                  <code>Raw: {allowance.amount} base units</code>
                  <code>
                    Prior allowance: {allowance.priorAmount ?? "Unavailable"} ·
                    new at comparison anchor:{" "}
                    {allowance.newSpenderAtAnchor === null
                      ? "unknown"
                      : allowance.newSpenderAtAnchor
                        ? "yes"
                        : "no"}
                  </code>
                  {allowance.warning ? <code>{allowance.warning}</code> : null}
                  {metadata?.warning ? <code>{metadata.warning}</code> : null}
                </div>
              );
            })
          )}

          <div className="calldata">
            <span>Approval coverage limits</span>
            {approvalRisk.warnings.map((warning) => (
              <strong key={warning}>{warning}</strong>
            ))}
          </div>
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
                          <span className="decoded-parameter-value">
                            <code>{parameter.value}</code>
                            {decodedAddressFields(
                              safe.data.chainId,
                              parameter,
                            ).map((field) => (
                              <span
                                className="decoded-address-field"
                                key={field.address.toLowerCase()}
                              >
                                <span>
                                  {field.role} · {field.source}
                                </span>
                                <AddressIdentity
                                  address={field.address}
                                  addressBook={addressBook}
                                  chainId={safe.data.chainId}
                                  compact
                                />
                              </span>
                            ))}
                          </span>
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
                  {call.to ? (
                    <AddressIdentity
                      address={call.to}
                      addressBook={addressBook}
                      chainId={safe.data.chainId}
                    />
                  ) : (
                    <code>Unknown target</code>
                  )}
                  <code>{call.operation ?? "Unknown operation"}</code>
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

        <section className="detail-panel raw-evidence-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Public source data</p>
              <h2>Raw transaction evidence</h2>
            </div>
            <span>
              {rawPayload
                ? "Safe execution fields available"
                : "Stored fields only"}
            </span>
          </div>
          <p className="trust-copy">
            These values are presented without reinterpretation. Missing Safe
            execution fields are shown as unavailable rather than inferred.
          </p>
          <dl className="detail-list raw-transaction-fields">
            <div>
              <dt>Safe transaction hash</dt>
              <dd>
                <span className="identifier-actions identifier-actions-end">
                  <code>{transaction.safeTxHash}</code>
                  <CopyIdentifierButton
                    label="Copy Safe transaction hash"
                    value={transaction.safeTxHash}
                  />
                </span>
              </dd>
            </div>
            <div>
              <dt>Safe</dt>
              <dd>
                <AddressIdentity
                  address={safe.data.address}
                  addressBook={addressBook}
                  chainId={safe.data.chainId}
                />
              </dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>
                <span className="identifier-actions identifier-actions-end">
                  <AddressIdentity
                    address={transaction.to}
                    addressBook={addressBook}
                    chainId={safe.data.chainId}
                  />
                  <CopyIdentifierButton
                    label="Copy transaction target"
                    value={transaction.to}
                  />
                </span>
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{transaction.status}</dd>
            </div>
            <div>
              <dt>Nonce</dt>
              <dd>{transaction.nonce}</dd>
            </div>
            <div>
              <dt>Operation</dt>
              <dd>{transaction.operation}</dd>
            </div>
            <div>
              <dt>Value</dt>
              <dd>{transaction.value} wei</dd>
            </div>
            <div>
              <dt>Proposed</dt>
              <dd>{formatDate(transaction.proposedAt)} UTC</dd>
            </div>
            <div>
              <dt>Executed</dt>
              <dd>
                {transaction.executedAt === null
                  ? "Not executed"
                  : `${formatDate(transaction.executedAt)} UTC`}
              </dd>
            </div>
            <div>
              <dt>Executed transaction</dt>
              <dd>
                {transaction.executedTxHash ? (
                  <span className="identifier-actions identifier-actions-end">
                    {executedExplorerUrl ? (
                      <a
                        className="explorer-link"
                        href={executedExplorerUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <code>{transaction.executedTxHash}</code>
                        <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <code>{transaction.executedTxHash}</code>
                    )}
                    <CopyIdentifierButton
                      label="Copy executed transaction hash"
                      value={transaction.executedTxHash}
                    />
                  </span>
                ) : (
                  "Unavailable"
                )}
              </dd>
            </div>
            <div>
              <dt>Block number</dt>
              <dd>{transaction.blockNumber ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Block hash</dt>
              <dd>
                <code>{transaction.blockHash ?? "Unavailable"}</code>
              </dd>
            </div>
            <div>
              <dt>Safe transaction gas</dt>
              <dd>{rawPayload?.safeTxGas.toString() ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Base gas</dt>
              <dd>{rawPayload?.baseGas.toString() ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Gas price</dt>
              <dd>{rawPayload?.gasPrice.toString() ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Gas token</dt>
              <dd>
                {rawPayload?.gasToken ? (
                  <AddressIdentity
                    address={rawPayload.gasToken}
                    addressBook={addressBook}
                    chainId={safe.data.chainId}
                  />
                ) : (
                  "Native or unavailable"
                )}
              </dd>
            </div>
            <div>
              <dt>Refund receiver</dt>
              <dd>
                {rawPayload?.refundReceiver ? (
                  <AddressIdentity
                    address={rawPayload.refundReceiver}
                    addressBook={addressBook}
                    chainId={safe.data.chainId}
                  />
                ) : (
                  "Default or unavailable"
                )}
              </dd>
            </div>
          </dl>
          {!rawPayload ? (
            <div className="raw-evidence-warning">
              The live Safe payload could not be read. Stored transaction fields
              remain available above; unavailable gas fields are not inferred.
            </div>
          ) : null}
          <div className="calldata">
            <span>Raw calldata · {transaction.data.length / 2 - 1} bytes</span>
            <code>{transaction.data || "0x"}</code>
          </div>
        </section>

        <section className="detail-panel confirmation-evidence-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Owner attestations</p>
              <h2>Confirmations and raw signatures</h2>
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
                  <AddressIdentity
                    address={confirmation.owner}
                    addressBook={addressBook}
                    chainId={safe.data.chainId}
                    compact
                  />
                  <time>
                    {confirmation.signedAt
                      ? formatDate(confirmation.signedAt)
                      : "Time unavailable"}
                  </time>
                  <details className="confirmation-signature">
                    <summary>Raw signature</summary>
                    <code>{confirmation.signature}</code>
                  </details>
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
