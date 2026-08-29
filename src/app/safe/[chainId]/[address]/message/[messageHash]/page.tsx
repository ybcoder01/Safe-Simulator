import Link from "next/link";
import { notFound } from "next/navigation";

import { getPersistencePort } from "@/container";
import {
  messageHashSchema,
  toMessageView,
} from "@/lib/api/message-details";
import { safeRouteParamsSchema } from "@/lib/api/safe-details";

interface PageProps {
  readonly params: Promise<{
    chainId: string;
    address: string;
    messageHash: string;
  }>;
}

export default async function MessageDetailPage({ params }: PageProps) {
  const values = await params;
  const safeRef = safeRouteParamsSchema.safeParse(values);
  const messageHash = messageHashSchema.safeParse(values.messageHash);
  if (!safeRef.success || !messageHash.success) notFound();

  const persistence = getPersistencePort();
  const [safe, message] = await Promise.all([
    persistence.findSafe(safeRef.data),
    persistence.findMessage(safeRef.data, messageHash.data),
  ]);
  if (!safe || !message) notFound();

  const view = toMessageView(message, safe.threshold);
  const chainName = safe.chainId === 1 ? "Ethereum" : "XDC Network";
  const created = new Date(view.createdAt * 1_000);

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
        <Link
          className="dashboard-back"
          href={`/safe/${safe.chainId}/${safe.address}`}
        >
          ← Safe overview
        </Link>

        <header className="transaction-title">
          <div>
            <p className="eyebrow">Signed message · {chainName}</p>
            <h1>Message detail</h1>
            <code>{view.messageHash}</code>
          </div>
          <span
            className={`verified-pill ${
              view.reportedConfirmationCountMeetsCurrentThreshold
                ? "sync-complete"
                : "sync-syncing"
            }`}
          >
            {view.reportedConfirmationCountMeetsCurrentThreshold
              ? "Reported count meets current threshold"
              : "Below current threshold"}
          </span>
        </header>

        <section className="detail-grid" aria-label="Message summary">
          <div>
            <span>Created</span>
            <strong>
              <time dateTime={created.toISOString()}>
                {created.toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "UTC",
                })}
              </time>
            </strong>
          </div>
          <div>
            <span>Payload form</span>
            <strong>{view.payloadKind}</strong>
          </div>
          <div>
            <span>Reported confirmations</span>
            <strong>{view.confirmationCount}</strong>
          </div>
          <div>
            <span>Current threshold</span>
            <strong>{view.currentThreshold}</strong>
          </div>
        </section>

        <section className="detail-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Message payload</p>
              <h2>Reported content</h2>
            </div>
            <span>{view.payloadKind}</span>
          </div>
          <div className="calldata">
            <span>Payload</span>
            <code>{view.payloadDisplay || "Empty payload"}</code>
          </div>
        </section>

        <section className="detail-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Confirmation evidence</p>
              <h2>Reported signers</h2>
            </div>
            <span>{view.confirmationCount} unique owners reported</span>
          </div>

          {view.confirmations.length === 0 ? (
            <div className="panel-empty">No confirmations were reported.</div>
          ) : (
            <div className="owner-list">
              {view.confirmations.map((confirmation, index) => (
                <div className="owner-row" key={confirmation.owner}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div className="message-confirmation">
                    <code>{confirmation.owner}</code>
                    <code>{confirmation.signature}</code>
                  </div>
                  {confirmation.signedAt ? (
                    <time
                      dateTime={new Date(
                        confirmation.signedAt * 1_000,
                      ).toISOString()}
                    >
                      {new Date(
                        confirmation.signedAt * 1_000,
                      ).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "UTC",
                      })}
                    </time>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <p className="trust-copy">
            Confirmation records and signature bytes are displayed as reported
            by the Safe Transaction Service. This view does not
            cryptographically validate them. The threshold and owner set shown
            are current and may differ from the configuration at message
            creation time.
          </p>
        </section>
      </article>

      <footer className="workspace-footer">
        <Link
          className="text-link"
          href={`/safe/${safe.chainId}/${safe.address}`}
        >
          Return to Safe
        </Link>
        <span>Public data only · No signing capability</span>
      </footer>
    </main>
  );
}
