import { AddressIdentity } from "@/components/shared/address-identity";
import { CopyIdentifierButton } from "@/components/shared/copy-identifier-button";
import { ProtocolMark } from "@/components/shared/protocol-mark";
import { TokenIdentity } from "@/components/shared/token-identity";
import type { AddressBookView } from "@/lib/api/address-book";
import type { TransactionReviewPresentation } from "@/lib/transaction-review-presentation";
import type { TreasuryReviewCheck } from "@/lib/treasury-review";

interface Props {
  readonly addressBook: readonly AddressBookView[];
  readonly chainId: number;
  readonly presentation: TransactionReviewPresentation;
  readonly protocolLabel: string | null;
  readonly protocolLogoKey: string | null;
  readonly targetAddress: string;
  readonly targetLabel: string | null;
  readonly targetTokenSymbol: string | null;
  readonly treasuryChecks: readonly TreasuryReviewCheck[];
  readonly treasuryFocus: string;
}

const SIGNAL_LABELS = {
  clear: "No warnings",
  blocked: "Stop",
  review: "Check first",
  unknown: "Not verified",
} as const;

export function TransactionSafetyOverview({
  addressBook,
  chainId,
  presentation,
  protocolLabel,
  protocolLogoKey,
  targetAddress,
  targetLabel,
  targetTokenSymbol,
  treasuryChecks,
  treasuryFocus,
}: Props) {
  return (
    <section
      aria-labelledby="plain-language-verdict-title"
      className={`transaction-safety-overview safety-${presentation.signal}`}
    >
      <div className="safety-verdict">
        <span className="safety-icon" aria-hidden="true">
          {presentation.icon}
        </span>
        <div>
          <p className="eyebrow">Transaction safety check</p>
          <h2 id="plain-language-verdict-title">{presentation.title}</h2>
          <p>{presentation.detail}</p>
        </div>
        <span className="safety-state-label">
          {SIGNAL_LABELS[presentation.signal]}
        </span>
      </div>

      <div className="treasury-review" aria-labelledby="treasury-review-title">
        <div className="treasury-review-heading">
          <div>
            <span className="safety-card-label">
              Treasury approval checklist
            </span>
            <h3 id="treasury-review-title">What every signer should confirm</h3>
          </div>
          <p>{treasuryFocus}</p>
        </div>
        <div className="treasury-check-list">
          {treasuryChecks.map((check) => (
            <article
              className={`treasury-check treasury-check-${check.status}`}
              key={check.key}
            >
              <span className="treasury-check-icon" aria-hidden="true">
                {check.status === "pass"
                  ? "✓"
                  : check.status === "review"
                    ? "!"
                    : check.status === "unknown"
                      ? "?"
                      : "×"}
              </span>
              <div>
                <span>{check.label}</span>
                <strong>{check.title}</strong>
                <p>{check.detail}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="treasury-history-boundary">
          A previous interaction is context, not proof of safety. Project
          contracts can be upgraded or compromised, so the current identity,
          permissions, recipients, and simulation are checked separately.
        </p>
      </div>

      <div className="safety-overview-grid">
        <article>
          <span className="safety-card-label">What is this transaction?</span>
          <strong>{presentation.actionSummary}</strong>
          <p>
            This is the action Safe Inspector reconstructed from the signed
            transaction and its blockchain execution evidence.
          </p>
        </article>

        <article>
          <span className="safety-card-label">Which project is involved?</span>
          <div className="safety-target-heading">
            {targetTokenSymbol ? (
              <TokenIdentity
                chainId={chainId}
                symbol={targetTokenSymbol}
                token={targetAddress}
              />
            ) : protocolLabel ? (
              <>
                <ProtocolMark
                  label={protocolLabel}
                  logoKey={protocolLogoKey}
                  size={42}
                />
                <strong>{targetLabel ?? protocolLabel}</strong>
              </>
            ) : (
              <strong>{targetLabel ?? presentation.targetType}</strong>
            )}
          </div>
          <span className={`target-type target-type-${presentation.signal}`}>
            {presentation.targetType}
          </span>
          <p>{presentation.targetExplanation}</p>
          <div className="safety-address-actions">
            <AddressIdentity
              address={targetAddress}
              addressBook={addressBook}
              chainId={chainId}
              compact
            />
            <CopyIdentifierButton
              label="Copy transaction destination"
              value={targetAddress}
            />
          </div>
        </article>

        <article className="safety-address-check-card">
          <span className="safety-card-label">
            Was an address or permission changed?
          </span>
          <strong>{presentation.addressCheckTitle}</strong>
          <p>{presentation.addressCheckDetail}</p>
          {presentation.addressChecks.length > 0 ? (
            <ul className="safety-check-list">
              {presentation.addressChecks.map((check) => (
                <li key={check}>{check}</li>
              ))}
            </ul>
          ) : null}
        </article>
      </div>

      <div className="safety-approval-step">
        <span className="safety-card-label">Before the final approval</span>
        <strong>{presentation.nextStep}</strong>
        <p>
          Do not approve from an alert or shortened address alone. Compare the
          full destination, token, amount, recipient, and spender with the
          original request in a separate trusted view.
        </p>
      </div>

      <p className="safety-boundary-note">
        Safe Inspector is read-only. It cannot sign or execute this transaction,
        and this result is not a guarantee against every possible risk.
      </p>
    </section>
  );
}
