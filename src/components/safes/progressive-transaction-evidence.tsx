"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AddressIdentity } from "@/components/shared/address-identity";
import { TokenIdentity } from "@/components/shared/token-identity";
import { formatTokenAmount } from "@/core/analysis/tokens/metadata";
import type { AddressBookView } from "@/lib/api/address-book";
import type { TokenBalanceChangeResult } from "@/lib/api/token-balance-changes";
import type { TokenMetadataView } from "@/lib/api/token-metadata";
import { groupDigits } from "@/lib/api/token-presentation";

const REQUEST_TIMEOUT_MS = 12_000;

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

interface EvidenceContextValue {
  readonly status: "loading" | "ready" | "failed";
  readonly evidence: ProgressiveEvidence | null;
  readonly retry: () => void;
  readonly addressBook: readonly AddressBookView[];
  readonly chainId: number;
  readonly tokenMetadata: ReadonlyMap<string, TokenMetadataView>;
}

const EvidenceContext = createContext<EvidenceContextValue | null>(null);

interface ProviderProps {
  readonly address: string;
  readonly addressBook: readonly AddressBookView[];
  readonly chainId: number;
  readonly children: ReactNode;
  readonly safeTxHash: string;
  readonly tokenMetadata: readonly TokenMetadataView[];
}

export function ProgressiveTransactionEvidenceProvider({
  address,
  addressBook,
  chainId,
  children,
  safeTxHash,
  tokenMetadata,
}: ProviderProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [evidence, setEvidence] = useState<ProgressiveEvidence | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const metadataByAddress = useMemo(
    () =>
      new Map(
        tokenMetadata.map((item) => [item.token.toLowerCase(), item] as const),
      ),
    [tokenMetadata],
  );

  const load = useCallback(() => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    void fetch("/api/v1/transaction-progressive-evidence", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chainId, address, safeTxHash }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Evidence request failed.");
        return (await response.json()) as {
          readonly data?: ProgressiveEvidence;
        };
      })
      .then((payload) => {
        if (!payload.data) throw new Error("Evidence response was incomplete.");
        setEvidence(payload.data);
        setStatus("ready");
      })
      .catch(() => {
        if (activeRequest.current === controller) setStatus("failed");
      })
      .finally(() => {
        clearTimeout(timeout);
        if (activeRequest.current === controller) {
          activeRequest.current = null;
        }
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [address, chainId, safeTxHash]);

  useEffect(() => load(), [load]);

  const retry = useCallback(() => {
    setStatus("loading");
    load();
  }, [load]);

  return (
    <EvidenceContext.Provider
      value={{
        status,
        evidence,
        retry,
        addressBook,
        chainId,
        tokenMetadata: metadataByAddress,
      }}
    >
      {children}
    </EvidenceContext.Provider>
  );
}

function useProgressiveEvidence() {
  const value = useContext(EvidenceContext);
  if (!value) {
    throw new Error(
      "Progressive transaction evidence must be inside its provider.",
    );
  }
  return value;
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

export function ProgressiveBalanceChangesPanel() {
  const { addressBook, chainId, evidence, retry, status, tokenMetadata } =
    useProgressiveEvidence();
  const balanceChanges = evidence?.balanceChanges ?? null;

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
          Loading optional balance evidence without delaying the security
          report.
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
          const metadata = tokenMetadata.get(change.token.toLowerCase());
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
                chainId={chainId}
                symbol={metadata?.symbol}
                token={change.token}
              />
              <div className="approval-party">
                <span>Affected account</span>
                <AddressIdentity
                  address={change.account}
                  addressBook={addressBook}
                  chainId={chainId}
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

export function ProgressiveRawPayloadStatus() {
  const { evidence, status } = useProgressiveEvidence();
  if (status === "loading") return <span>Loading Safe execution fields</span>;
  if (status === "failed" || !evidence?.rawPayload) {
    return <span>Stored fields only</span>;
  }
  return <span>Safe execution fields available</span>;
}

export function ProgressiveRawPayloadFields() {
  const { addressBook, chainId, evidence, status } = useProgressiveEvidence();
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
              chainId={chainId}
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
              chainId={chainId}
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

export function ProgressiveRawPayloadWarning() {
  const { evidence, retry, status } = useProgressiveEvidence();
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
