"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AddressIdentity } from "@/components/shared/address-identity";
import { TokenIdentity } from "@/components/shared/token-identity";
import { formatTokenAmount } from "@/core/analysis/tokens/metadata";
import type { AddressBookView } from "@/lib/api/address-book";
import type { TokenBalanceChangeResult } from "@/lib/api/token-balance-changes";
import type { TokenMetadataView } from "@/lib/api/token-metadata";
import { groupDigits } from "@/lib/api/token-presentation";

const REQUEST_TIMEOUT_MS = 12_000;

export interface ProgressiveEvidenceRequest {
  readonly address: string;
  readonly chainId: number;
  readonly safeTxHash: string;
}

interface RawPayloadView {
  readonly safeTxGas: string;
  readonly baseGas: string;
  readonly gasPrice: string;
  readonly gasToken: string | null;
  readonly refundReceiver: string | null;
}

interface ProgressiveEvidence {
  readonly rawPayload: RawPayloadView | null;
  readonly balanceChanges: TokenBalanceChangeResult;
}

type EvidenceState =
  | { readonly status: "loading"; readonly evidence: null }
  | { readonly status: "ready"; readonly evidence: ProgressiveEvidence }
  | { readonly status: "failed"; readonly evidence: null };

const resolvedEvidence = new Map<string, ProgressiveEvidence>();
const pendingEvidence = new Map<string, Promise<ProgressiveEvidence>>();

function requestKey(request: ProgressiveEvidenceRequest) {
  return [
    request.chainId,
    request.address.toLowerCase(),
    request.safeTxHash.toLowerCase(),
  ].join(":");
}

async function fetchEvidence(
  request: ProgressiveEvidenceRequest,
): Promise<ProgressiveEvidence> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("/api/v1/transaction-progressive-evidence", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Evidence request failed.");
    const payload = (await response.json()) as {
      readonly data?: ProgressiveEvidence;
    };
    if (!payload.data) throw new Error("Evidence response was incomplete.");
    return payload.data;
  } finally {
    clearTimeout(timeout);
  }
}

function loadEvidence(
  key: string,
  request: ProgressiveEvidenceRequest,
): Promise<ProgressiveEvidence> {
  const cached = resolvedEvidence.get(key);
  if (cached) return Promise.resolve(cached);

  const active = pendingEvidence.get(key);
  if (active) return active;

  const pending = fetchEvidence(request)
    .then((evidence) => {
      resolvedEvidence.set(key, evidence);
      return evidence;
    })
    .finally(() => pendingEvidence.delete(key));
  pendingEvidence.set(key, pending);
  return pending;
}

function useProgressiveEvidence(request: ProgressiveEvidenceRequest) {
  const key = requestKey(request);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<EvidenceState>(() => {
    const cached = resolvedEvidence.get(key);
    return cached
      ? { status: "ready", evidence: cached }
      : { status: "loading", evidence: null };
  });

  useEffect(() => {
    let active = true;
    void loadEvidence(key, request)
      .then((evidence) => {
        if (active) setState({ status: "ready", evidence });
      })
      .catch(() => {
        if (active) setState({ status: "failed", evidence: null });
      });
    return () => {
      active = false;
    };
  }, [attempt, key, request]);

  const retry = useCallback(() => {
    resolvedEvidence.delete(key);
    pendingEvidence.delete(key);
    setState({ status: "loading", evidence: null });
    setAttempt((value) => value + 1);
  }, [key]);

  return { ...state, retry };
}

function humanTokenAmount(
  amount: string | null,
  decimals: number | null | undefined,
  symbol: string | null | undefined = null,
) {
  if (amount === null) return "Unavailable";
  const negative = amount.startsWith("-");
  const magnitude = negative ? amount.slice(1) : amount;
  const formatted = groupDigits(formatTokenAmount(magnitude, decimals ?? null));
  if (formatted === null) return "Amount unavailable";
  return `${negative ? "−" : ""}${formatted}${symbol ? ` ${symbol}` : ""}`;
}

export function ProgressiveBalanceChangesPanel({
  addressBook,
  request,
  tokenMetadata,
}: {
  readonly addressBook: readonly AddressBookView[];
  readonly request: ProgressiveEvidenceRequest;
  readonly tokenMetadata: readonly TokenMetadataView[];
}) {
  const { evidence, retry, status } = useProgressiveEvidence(request);
  const balanceChanges = evidence?.balanceChanges ?? null;
  const metadataByAddress = useMemo(
    () =>
      new Map(
        tokenMetadata.map((item) => [item.token.toLowerCase(), item] as const),
      ),
    [tokenMetadata],
  );

  return (
    <section className="detail-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Token state changes</p>
          <h2>Before and after balances</h2>
        </div>
        <span>
          {status === "loading"
            ? "Loading after report"
            : status === "failed" || !balanceChanges
              ? "Unavailable"
              : balanceChanges.anchor.type === "exact-blocks"
                ? `Blocks ${balanceChanges.anchor.beforeBlock} → ${balanceChanges.anchor.afterBlock}`
                : balanceChanges.anchor.type === "latest-state-projection"
                  ? "Pending projection"
                  : "Unavailable"}
        </span>
      </div>
      {status === "loading" ? (
        <div className="panel-empty">
          Loading optional balance evidence without delaying the security report.
        </div>
      ) : status === "failed" || !balanceChanges ? (
        <div className="panel-empty">
          Balance evidence could not be loaded. This does not change the
          deterministic security verdict.{" "}
          <button className="text-link" type="button" onClick={retry}>
            Try again
          </button>
        </div>
      ) : balanceChanges.items.length === 0 ? (
        <div className="panel-empty">
          No token-account pairs were identified from Transfer-shaped event
          evidence.
        </div>
      ) : (
        balanceChanges.items.map((change, index) => {
          const metadata = metadataByAddress.get(change.token.toLowerCase());
          const before = humanTokenAmount(
            change.before,
            metadata?.decimals,
            metadata?.symbol,
          );
          const after = humanTokenAmount(
            change.after,
            metadata?.decimals,
            metadata?.symbol,
          );
          const delta = humanTokenAmount(
            change.delta,
            metadata?.decimals,
            metadata?.symbol,
          );

          return (
            <div
              className={`calldata balance-change balance-change-${change.status}`}
              key={`balance-change-${index}-${change.token}-${change.account}`}
            >
              <span>
                {change.status.replaceAll("-", " ")}
                {change.consistentWithEvents === true
                  ? " · matches Transfer events"
                  : change.consistentWithEvents === false
                    ? " · differs from Transfer events"
                    : ""}
              </span>
              <TokenIdentity
                chainId={request.chainId}
                symbol={metadata?.symbol}
                token={change.token}
              />
              <div className="approval-party">
                <span>Affected account</span>
                <AddressIdentity
                  address={change.account}
                  addressBook={addressBook}
                  chainId={request.chainId}
                />
              </div>
              <dl className="balance-change-values">
                <div>
                  <dt>Before</dt>
                  <dd>{before}</dd>
                </div>
                <div>
                  <dt>After</dt>
                  <dd>{after}</dd>
                </div>
                <div>
                  <dt>Net change</dt>
                  <dd>{delta}</dd>
                </div>
              </dl>
              {change.warning ? <code>{change.warning}</code> : null}
            </div>
          );
        })
      )}
      {balanceChanges?.warnings.map((warning) => (
        <div className="panel-empty" key={warning}>
          {warning}
        </div>
      ))}
    </section>
  );
}

export function ProgressiveRawPayloadStatus({
  request,
}: {
  readonly request: ProgressiveEvidenceRequest;
}) {
  const { evidence, status } = useProgressiveEvidence(request);
  if (status === "loading") return <span>Loading Safe execution fields</span>;
  if (status === "failed" || !evidence?.rawPayload) {
    return <span>Stored fields only</span>;
  }
  return <span>Safe execution fields available</span>;
}

export function ProgressiveRawPayloadFields({
  addressBook,
  request,
}: {
  readonly addressBook: readonly AddressBookView[];
  readonly request: ProgressiveEvidenceRequest;
}) {
  const { evidence, status } = useProgressiveEvidence(request);
  const payload = evidence?.rawPayload ?? null;
  const unavailable = status === "loading" ? "Loading…" : "Unavailable";

  return (
    <>
      <div>
        <dt>Safe transaction gas</dt>
        <dd>{payload?.safeTxGas ?? unavailable}</dd>
      </div>
      <div>
        <dt>Base gas</dt>
        <dd>{payload?.baseGas ?? unavailable}</dd>
      </div>
      <div>
        <dt>Gas price</dt>
        <dd>{payload?.gasPrice ?? unavailable}</dd>
      </div>
      <div>
        <dt>Gas token</dt>
        <dd>
          {payload?.gasToken ? (
            <AddressIdentity
              address={payload.gasToken}
              addressBook={addressBook}
              chainId={request.chainId}
            />
          ) : status === "loading" ? (
            "Loading…"
          ) : (
            "Native or unavailable"
          )}
        </dd>
      </div>
      <div>
        <dt>Refund receiver</dt>
        <dd>
          {payload?.refundReceiver ? (
            <AddressIdentity
              address={payload.refundReceiver}
              addressBook={addressBook}
              chainId={request.chainId}
            />
          ) : status === "loading" ? (
            "Loading…"
          ) : (
            "Default or unavailable"
          )}
        </dd>
      </div>
    </>
  );
}

export function ProgressiveRawPayloadWarning({
  request,
}: {
  readonly request: ProgressiveEvidenceRequest;
}) {
  const { evidence, retry, status } = useProgressiveEvidence(request);
  if (status !== "failed" && (status !== "ready" || evidence?.rawPayload)) {
    return null;
  }

  return (
    <div className="raw-evidence-warning">
      The optional live Safe payload could not be read. Stored transaction
      fields remain authoritative; unavailable gas fields are not inferred.{" "}
      {status === "failed" ? (
        <button className="text-link" type="button" onClick={retry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
