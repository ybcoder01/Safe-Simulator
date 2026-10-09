import type { ReactNode } from "react";

import { AddressIdentity } from "@/components/shared/address-identity";
import type { AlertStage } from "@/lib/alert-stage";
import type { AddressBookView } from "@/lib/api/address-book";
import type { BriefVerdictId, TransactionBrief } from "@/lib/transaction-brief";

export interface BriefFlowRow {
  readonly key: string;
  readonly direction: "inbound" | "outbound" | "self" | "external";
  readonly amount: string | null;
  readonly symbol: string | null;
  readonly from: string;
  readonly to: string;
}

interface Props {
  readonly addressBook: readonly AddressBookView[];
  readonly brief: TransactionBrief;
  readonly chainId: number;
  readonly children?: ReactNode;
  readonly executed: boolean;
  readonly flow: readonly BriefFlowRow[];
  readonly knownLabels: Readonly<Record<string, string>>;
  readonly safeAddress: string;
  readonly stage: AlertStage;
  readonly totalMovements: number;
}

const ICONS: Readonly<Record<BriefVerdictId, string>> = {
  expected: "✓",
  check: "!",
  stop: "×",
  unverified: "?",
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_FLOW_ROWS = 4;

function FlowNode({
  address,
  addressBook,
  chainId,
  knownLabels,
  safeAddress,
}: {
  readonly address: string;
  readonly addressBook: readonly AddressBookView[];
  readonly chainId: number;
  readonly knownLabels: Readonly<Record<string, string>>;
  readonly safeAddress: string;
}) {
  const key = address.toLowerCase();
  if (key === safeAddress.toLowerCase()) {
    return (
      <div className="brief-node brief-node-safe">
        <strong>Your Safe</strong>
        <span>This wallet</span>
      </div>
    );
  }
  if (key === ZERO_ADDRESS) {
    return (
      <div className="brief-node brief-node-burn">
        <strong>Removed</strong>
        <span>Taken out of circulation</span>
      </div>
    );
  }
  const label = knownLabels[key] ?? null;
  return (
    <div className="brief-node">
      {label ? <strong>{label}</strong> : <strong>Another address</strong>}
      <AddressIdentity
        address={address}
        addressBook={addressBook}
        chainId={chainId}
        compact
      />
    </div>
  );
}

export function TransactionBriefPanel({
  addressBook,
  brief,
  chainId,
  children,
  executed,
  flow,
  knownLabels,
  safeAddress,
  stage,
  totalMovements,
}: Props) {
  const { verdict } = brief;
  const shownFlow = flow.slice(0, MAX_FLOW_ROWS);

  return (
    <section
      aria-labelledby="brief-sentence"
      className={`brief brief-${verdict.id}`}
    >
      <div className="brief-verdict" role="status">
        <span className="brief-verdict-icon" aria-hidden="true">
          {ICONS[verdict.id]}
        </span>
        <div>
          <p className="eyebrow">
            {executed ? "Result of the safety check" : "Safe to sign?"}
          </p>
          <h2>{verdict.label}</h2>
          <p>{verdict.reason}</p>
        </div>
        <span className="brief-stage" title={stage.detail}>
          {stage.label}
        </span>
      </div>

      <div className="brief-body">
        <p className="eyebrow">In plain words</p>
        <p className="brief-sentence" id="brief-sentence">
          {brief.sentence}
        </p>

        {shownFlow.length > 0 ? (
          <div className="brief-flow" aria-label="Where the money goes">
            {shownFlow.map((row) => (
              <div
                className={`brief-flow-row brief-flow-${row.direction}`}
                key={row.key}
              >
                <FlowNode
                  address={row.from}
                  addressBook={addressBook}
                  chainId={chainId}
                  knownLabels={knownLabels}
                  safeAddress={safeAddress}
                />
                <div className="brief-flow-arrow">
                  <strong>
                    {row.amount ? `${row.amount} ` : ""}
                    {row.symbol ?? "tokens"}
                  </strong>
                  <span aria-hidden="true">→</span>
                </div>
                <FlowNode
                  address={row.to}
                  addressBook={addressBook}
                  chainId={chainId}
                  knownLabels={knownLabels}
                  safeAddress={safeAddress}
                />
              </div>
            ))}
            {totalMovements > shownFlow.length ? (
              <p className="brief-flow-more">
                {totalMovements - shownFlow.length} more{" "}
                {totalMovements - shownFlow.length === 1
                  ? "movement is"
                  : "movements are"}{" "}
                listed in the technical details.
              </p>
            ) : null}
          </div>
        ) : null}

        <ul className="brief-effects">
          {brief.effects.map((effect) => (
            <li key={effect}>{effect}</li>
          ))}
        </ul>
      </div>

      {brief.checks.length > 0 ? (
        <div className="brief-group">
          <h3>{executed ? "Worth checking now" : "Check before signing"}</h3>
          <ol className="brief-checks">
            {brief.checks.map((check) => (
              <li
                className={`brief-check brief-check-${check.severity}`}
                key={check.key}
              >
                <strong>{check.title}</strong>
                <p>
                  <span>What to do:</span> {check.action}
                </p>
                <details>
                  <summary>Why this matters</summary>
                  <p>{check.why}</p>
                </details>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {brief.notes.length > 0 ? (
        <div className="brief-group">
          <h3>Fine, for your information</h3>
          <ul className="brief-notes">
            {brief.notes.map((note) => (
              <li key={note.key}>
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>{note.title}</strong>
                  <p>{note.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {brief.confirmations.length > 0 ? (
        <div className="brief-group">
          <h3>What we confirmed, and what we could not</h3>
          <ul className="brief-confirmations">
            {brief.confirmations.map((row) => (
              <li
                className={
                  row.confirmed ? "brief-confirmed" : "brief-not-confirmed"
                }
                key={row.key}
              >
                <span aria-hidden="true">{row.confirmed ? "✓" : "!"}</span>
                <div>
                  <strong>{row.label}</strong>
                  <p>{row.text}</p>
                </div>
                <em>{row.confirmed ? "Confirmed" : "Not confirmed"}</em>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {children}

      <p className="brief-boundary">
        Safe Inspector is read-only: it cannot sign or run anything. This is
        evidence-based guidance, not a guarantee. Compare the full recipient and
        amount with the original request before you approve.
      </p>
    </section>
  );
}
