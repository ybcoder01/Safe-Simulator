"use client";

import { useState } from "react";

import {
  appendUniqueTransferViews,
  type TransferView,
} from "@/lib/api/transfer-activity";
import { explorerTransactionUrl } from "@/lib/explorer-links";

interface TransferActivityProps {
  readonly address: string;
  readonly chainId: number;
  readonly initialTransfers: readonly TransferView[];
  readonly nextCursor: string | null;
}

function shorten(value: string, start = 10, end = 8) {
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function timestampLabel(timestamp: number) {
  return new Date(timestamp * 1_000).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

function directionLabel(direction: TransferView["direction"]) {
  switch (direction) {
    case "incoming":
      return "received";
    case "outgoing":
      return "sent";
    case "self":
      return "self";
    case "related":
      return "related";
  }
}

export function TransferActivity({
  address,
  chainId,
  initialTransfers,
  nextCursor: initialCursor,
}: TransferActivityProps) {
  const [transfers, setTransfers] =
    useState<readonly TransferView[]>(initialTransfers);
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({ cursor: nextCursor, limit: "25" });
      const response = await fetch(
        `/api/v1/safes/${chainId}/${address}/transfers?${query}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as {
        readonly data?: readonly TransferView[];
        readonly nextCursor?: string | null;
        readonly error?: { readonly message?: string };
      };
      if (!response.ok || !body.data) {
        throw new Error(
          body.error?.message ?? "Could not load asset movements.",
        );
      }

      setTransfers((current) =>
        appendUniqueTransferViews(current, body.data ?? []),
      );
      setNextCursor(body.nextCursor ?? null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load asset movements.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="history-panel transfer-activity-panel"
      aria-labelledby="transfer-activity-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Persisted transfer stream</p>
          <h2 id="transfer-activity-title">Asset movements</h2>
        </div>
        <span>
          {transfers.length}
          {nextCursor ? "+" : ""} loaded
        </span>
      </div>

      {transfers.length === 0 ? (
        <div className="history-empty">
          <div className="empty-icon" aria-hidden="true">
            ⇄
          </div>
          <h3>No asset movements imported</h3>
          <p>
            Native and token transfers reported for this Safe will appear here
            after synchronization. Amounts remain in raw units until token
            decimals are independently resolved.
          </p>
        </div>
      ) : (
        <div className="history-list">
          {transfers.map((transfer) => {
            const explorerUrl = explorerTransactionUrl(
              chainId,
              transfer.transactionHash,
            );

            return (
              <article
                className="history-row transfer-history-row"
                key={[
                  transfer.transactionHash,
                  transfer.token ?? "native",
                  transfer.from,
                  transfer.to,
                  transfer.amount,
                ].join(":")}
              >
                <span className={`tx-status tx-transfer-${transfer.direction}`}>
                  {directionLabel(transfer.direction)}
                </span>
                <div>
                  <strong>
                    {transfer.token ? shorten(transfer.token) : "Native asset"}
                  </strong>
                  <span>
                    {transfer.amount} raw units · {shorten(transfer.from)} →{" "}
                    {shorten(transfer.to)}
                  </span>
                </div>
                <span>Block {transfer.blockNumber}</span>
                <div className="transfer-execution-meta">
                  <time
                    dateTime={new Date(
                      transfer.timestamp * 1_000,
                    ).toISOString()}
                  >
                    {timestampLabel(transfer.timestamp)}
                  </time>
                  {explorerUrl ? (
                    <a
                      className="explorer-link"
                      href={explorerUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      View transaction <span aria-hidden="true">↗</span>
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {nextCursor ? (
        <div className="history-actions">
          <button
            className="button button-small"
            disabled={loading}
            onClick={loadMore}
            type="button"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
