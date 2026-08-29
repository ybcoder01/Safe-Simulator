import Link from "next/link";

import type { MessageView } from "@/lib/api/message-details";

interface MessageHistoryProps {
  readonly address: string;
  readonly chainId: number;
  readonly messages: readonly MessageView[];
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
  messages,
}: MessageHistoryProps) {
  return (
    <section className="history-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Off-chain activity</p>
          <h2>Signed messages</h2>
        </div>
        <span>{messages.length} loaded</span>
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
              <time dateTime={new Date(message.createdAt * 1_000).toISOString()}>
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
    </section>
  );
}
