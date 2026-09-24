import { AddressIdentity } from "@/components/shared/address-identity";
import { CopyIdentifierButton } from "@/components/shared/copy-identifier-button";
import { ProtocolMark } from "@/components/shared/protocol-mark";
import { TokenIdentity } from "@/components/shared/token-identity";
import type { AddressBookView } from "@/lib/api/address-book";
import type { TransactionReviewPresentation } from "@/lib/transaction-review-presentation";

interface Props {
  readonly addressBook: readonly AddressBookView[];
  readonly chainId: number;
  readonly presentation: TransactionReviewPresentation;
  readonly protocolLabel: string | null;
  readonly protocolLogoKey: string | null;
  readonly targetAddress: string;
  readonly targetLabel: string | null;
  readonly targetTokenSymbol: string | null;
}

export function TransactionSafetyOverview({
  addressBook,
  chainId,
  presentation,
  protocolLabel,
  protocolLogoKey,
  targetAddress,
  targetLabel,
  targetTokenSymbol,
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
        <span className="safety-state-label">{presentation.signal}</span>
      </div>

      <div className="safety-overview-grid">
        <article>
          <span className="safety-card-label">What this transaction does</span>
          <strong>{presentation.actionSummary}</strong>
          <p>{presentation.nextStep}</p>
        </article>

        <article>
          <span className="safety-card-label">You are interacting with</span>
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
      </div>

      <p className="safety-boundary-note">
        Safe Inspector is read-only. It cannot sign or execute this transaction,
        and this result is not a guarantee against every possible risk.
      </p>
    </section>
  );
}
