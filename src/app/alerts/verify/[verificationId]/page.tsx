import Link from "next/link";
import type { Metadata } from "next";

import { getPersistencePort } from "@/container";
import {
  isTelegramVerificationId,
  verifyTelegramAlertReceipt,
} from "@/lib/api/telegram-alert-receipts";

interface PageProps {
  readonly params: Promise<{ readonly verificationId: string }>;
}

export const metadata: Metadata = {
  title: "Verify Telegram alert | Safe Inspector",
  robots: { index: false, follow: false },
};

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "long",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000));
}

function verdictLabel(verdict: string): string {
  switch (verdict) {
    case "flagged":
      return "Danger signal found — do not sign yet";
    case "unverified":
      return "Could not verify enough — review manually";
    case "known":
      return "Known target — still check every detail";
    case "trusted":
      return "No known warning found in available evidence";
    default:
      return verdict;
  }
}

export default async function AlertVerificationPage({ params }: PageProps) {
  const { verificationId } = await params;
  const receipt = isTelegramVerificationId(verificationId)
    ? await getPersistencePort().findTelegramAlertReceipt(verificationId)
    : null;
  const authentic = receipt ? verifyTelegramAlertReceipt(receipt) : false;
  const payload = receipt?.payload;
  const reportUrl = payload
    ? `/safe/${payload.chainId}/${payload.safeAddress}/tx/${payload.safeTxHash}`
    : null;

  return (
    <main className="workspace shell alert-verification-shell">
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

      <section
        className={`alert-verification-card ${authentic ? "alert-authentic" : "alert-invalid"}`}
      >
        <p className="eyebrow">Alert authenticity</p>
        <div className="alert-authenticity-heading">
          <span aria-hidden="true">{authentic ? "✓" : "✕"}</span>
          <div>
            <h1>
              {authentic
                ? "Authentic Safe Inspector alert"
                : "Alert could not be verified"}
            </h1>
            <p>
              {authentic
                ? "The saved alert details match an independently signed Safe Inspector receipt."
                : "Do not rely on this Telegram message or sign because of it. The ID is unknown, altered, or its signature is invalid."}
            </p>
          </div>
        </div>

        {authentic && payload ? (
          <>
            <div className="alert-safety-boundary">
              <strong>This does not mean the transaction is safe.</strong>
              <span>
                It only proves the alert is authentic. Compare these exact
                details with your signing wallet before you approve anything.
              </span>
            </div>

            <dl className="alert-receipt-details">
              <div>
                <dt>Safety result at alert time</dt>
                <dd>{verdictLabel(payload.verdict)}</dd>
              </div>
              <div>
                <dt>Safe account</dt>
                <dd>{payload.safeAddress}</dd>
              </div>
              <div>
                <dt>Network chain ID</dt>
                <dd>{payload.chainId}</dd>
              </div>
              <div>
                <dt>Safe nonce</dt>
                <dd>{payload.nonce}</dd>
              </div>
              <div>
                <dt>Transaction status at alert time</dt>
                <dd>{payload.status}</dd>
              </div>
              <div>
                <dt>Signatures at alert time</dt>
                <dd>
                  {payload.signerAddresses.length} of {payload.threshold}
                </dd>
              </div>
              <div>
                <dt>Target address</dt>
                <dd>{payload.target}</dd>
              </div>
              <div>
                <dt>Native value in wei</dt>
                <dd>{payload.value}</dd>
              </div>
              <div>
                <dt>Operation</dt>
                <dd>{payload.operation}</dd>
              </div>
              <div>
                <dt>Safe transaction hash</dt>
                <dd>{payload.safeTxHash}</dd>
              </div>
              <div>
                <dt>Alert issued</dt>
                <dd>{formatTimestamp(payload.issuedAt)} UTC</dd>
              </div>
              <div>
                <dt>Verification ID</dt>
                <dd>{payload.verificationId}</dd>
              </div>
              <div>
                <dt>Signing key</dt>
                <dd>{receipt.signingKeyId}</dd>
              </div>
            </dl>

            <details className="alert-technical-details">
              <summary>Show technical data for wallet comparison</summary>
              <dl>
                <dt>Calldata</dt>
                <dd>{payload.calldata}</dd>
                <dt>Warning codes</dt>
                <dd>
                  {payload.findingCodes.length > 0
                    ? payload.findingCodes.join(", ")
                    : "None recorded"}
                </dd>
                <dt>Signer addresses</dt>
                <dd>
                  {payload.signerAddresses.length > 0
                    ? payload.signerAddresses.join(", ")
                    : "None recorded"}
                </dd>
                <dt>Receipt fingerprint</dt>
                <dd>{receipt.payloadDigest}</dd>
              </dl>
            </details>

            <div className="alert-verification-actions">
              <Link className="button" href={reportUrl ?? "/safes"}>
                Open full safety report
              </Link>
              <Link className="text-link" href="/alerts/verify">
                Verify another alert
              </Link>
            </div>
          </>
        ) : (
          <div className="alert-verification-actions">
            <Link className="button" href="/alerts/verify">
              Try another ID
            </Link>
            <Link className="text-link" href="/safes">
              Open inspector
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
