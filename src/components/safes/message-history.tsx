"use client";

import Link from "next/link";
import { useState } from "react";

import {
  appendUniqueMessageViews,
  type MessageView,
} from "@/lib/api/message-details";

interface MessageHistoryProps {
  readonly address: string;
  readonly chainId: number;
  readonly initialMessages: readonly MessageView[];
  readonly nextCursor: string | null;
}

function shorten(value: string, start = 10, end = 8) {
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function payloadSummary(message: MessageView) {
  const compact = message.payloadDisplay.replace(/\s+/g, " ").trim();
  if (!compact) return "Empty payload";
  return compact.length > 96 ? `${compact.slice(0, 96)}…` : compact;
}

export function MessageHistory({
  address,
  chainId,
  initialMessages,
  nextCursor: initialCursor,
}: MessageHistoryProps) {
  const [messages, setMessages] =
    useState<readonly MessageView[]>(initialMessages);
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
        `/api/v1/safes/${chainId}/${address}/messages?${query}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as {
        readonly data?: readonly MessageView[];
        readonly nextCursor?: string | null;
        readonly error?: { readonly message?: string };
      };
      if (!response.ok || !body.data) {
        throw new Error(
          body.error?.message ?? "Could not load signed messages.",
        );
      }

      const incoming = body.data;
      setMessages((current) => appendUniqueMessageViews(current, incoming));
      setNextCursor(body.nextCursor ?? null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load signed messages.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="history-panel" aria-labelledby="message-history-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Off-chain activity</p>
          <h2 id="message-history-title">Signed messages</h2>
        </div>
        <span>
          {messages.length}
          {nextCursor ? "+" : ""} loaded
        </span>
      </div>

      {messages.length === 0 ? (
        <div className="history-empty">
          <div className="empty-icon" aria-hidden="true">
            ✦
          </div>
          <h3>No signed messages imported</h3>
          <p>
            Messages reported by the Safe Transaction Service will appear here
            after synchronization.
          </p>
        </div>
      ) : (
        <div className="history-list">
          {messages.map((message) => (
            <Link
              className="history-row"
              href={`/safe/${chainId}/${address}/message/${message.messageHash}`}
              key={message.messageHash}
            >
              <span
                className={`tx-status ${
                  message.reportedConfirmationCountMeetsCurrentThreshold
                    ? "tx-executed"
                    : "tx-pending"
                }`}
              >
                reported
              </span>
              <div>
                <strong>{shorten(message.messageHash)}</strong>
                <span>{payloadSummary(message)}</span>
              </div>
              <span>
                {message.confirmationCount}/{message.currentThreshold} reports
              </span>
              <time
                dateTime={new Date(message.createdAt * 1_000).toISOString()}
              >
                {new Date(message.createdAt * 1_000).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "UTC",
                })}
              </time>
            </Link>
          ))}
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
