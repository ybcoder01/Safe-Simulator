import type { ReactNode } from "react";

import {
  ProgressiveBriefFlow,
  type SiloShareLookup,
} from "@/components/safes/progressive-brief-flow";
import type { AlertStage } from "@/lib/alert-stage";
import type { AddressBookView } from "@/lib/api/address-book";
import type { BriefVerdictId, TransactionBrief } from "@/lib/transaction-brief";

export interface BriefFlowRow {
  readonly key: string;
  readonly logIndex?: number;
  readonly direction: "inbound" | "outbound" | "self" | "external";
  readonly amount: string | null;
  readonly symbol: string | null;
  readonly worth?: { readonly amount: string; readonly symbol: string } | null;
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
  readonly siloShareLookup?: SiloShareLookup | null;
  readonly stage: AlertStage;
  readonly totalMovements: number;
}

const ICONS: Readonly<Record<BriefVerdictId, string>> = {
  expected: "✓",
  check: "!",
  stop: "×",
  unverified: "?",
};

export function TransactionBriefPanel({
  addressBook,
  brief,
  chainId,
  children,
  executed,
  flow,
  knownLabels,
  safeAddress,
  siloShareLookup,
  stage,
  totalMovements,
}: Props) {
  const { verdict } = brief;

  const ROW_ICONS = { ok: "✓", check: "!", stop: "×", unknown: "?" } as const;

  return (
    <section
      aria-labelledby="brief-sentence"
      className={`brief brief-v-${verdict.id}`}
    >
      <div className="brief-verdict" role="status">
        <span className="brief-verdict-icon" aria-hidden="true">
          {ICONS[verdict.id]}
        </span>
        <div>
          <h2>{verdict.label}</h2>
          <p>{verdict.reason}</p>
        </div>
        <span className="brief-stage" title={stage.detail}>
          {stage.label}
        </span>
      </div>

      <div className="brief-body">
        <p className="brief-sentence" id="brief-sentence">
          {brief.sentence}
        </p>

        {brief.rows.length > 0 ? (
          <ul className="brief-rows">
            {brief.rows.map((row) => (
              <li className={`brief-row brief-row-${row.status}`} key={row.key}>
                <span aria-hidden="true">{ROW_ICONS[row.status]}</span>
                <strong>{row.label}</strong>
                <em>{row.text}</em>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="brief-todo">
          <h3>{executed ? "What to look at" : "Before you sign"}</h3>
          <ul>
            {brief.todo.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <details className="brief-more">
        <summary>
          <span>See the full detail</span>
          <span aria-hidden="true">+</span>
        </summary>

        <ProgressiveBriefFlow
          addressBook={addressBook}
          chainId={chainId}
          effects={brief.effects}
          flow={flow}
          knownLabels={knownLabels}
          safeAddress={safeAddress}
          siloShareLookup={siloShareLookup}
          totalMovements={totalMovements}
        />

        {brief.checks.length > 0 ? (
          <div className="brief-group">
            <h3>Why each check matters</h3>
            <ol className="brief-checks">
              {brief.checks.map((check) => (
                <li
                  className={`brief-check brief-check-${check.severity}`}
                  key={check.key}
                >
                  <strong>{check.title}</strong>
                  <p>{check.why}</p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {brief.notes.length > 0 ? (
          <div className="brief-group">
            <h3>Good to know</h3>
            <ul className="brief-notes">
              {brief.notes.map((note) => (
                <li key={note.key}>
                  <span aria-hidden="true">{note.normal ? "✓" : "i"}</span>
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
          evidence-based guidance, not a guarantee.
        </p>
      </details>
    </section>
  );
}
