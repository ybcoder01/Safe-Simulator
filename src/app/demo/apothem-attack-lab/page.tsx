import type { Metadata } from "next";
import Link from "next/link";

import { ApothemAttackLabInspector } from "@/components/testnet/apothem-attack-lab";

export const metadata: Metadata = {
  title: "XDC Apothem attack lab",
  description:
    "Inspect real XDC Apothem transactions against common treasury attack patterns using test assets only.",
  robots: { index: false, follow: false },
};

const SCENARIOS = [
  {
    title: "Unlimited token approval",
    detail:
      "Approve the UnknownSpender for the maximum uint256 value, then verify that the inspector warns about future token access.",
  },
  {
    title: "Injected recipient",
    detail:
      "Call the training router with a recipient that differs from the independently approved address.",
  },
  {
    title: "Delegatecall storage risk",
    detail:
      "Create a disposable Safe transaction with operation 1 targeting DelegateMutation. Do not use a production Safe.",
  },
  {
    title: "Hidden nested transfer",
    detail:
      "Put sendNative inside multicall(bytes[]) and confirm the nested batch is presented for review.",
  },
  {
    title: "Proxy implementation change",
    detail:
      "Call upgradeToAndCall on the training proxy and verify the address is not treated as trusted after code changes.",
  },
] as const;

export default function ApothemAttackLabPage() {
  return (
    <main className="workspace shell attack-lab">
      <header className="workspace-header">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>Safe Inspector</span>
        </Link>
        <span className="read-only-pill">
          <i aria-hidden="true" /> Apothem testnet · No real funds
        </span>
      </header>

      <article className="transaction-detail">
        <Link className="dashboard-back" href="/demo/malicious-transaction">
          ← Dummy attack examples
        </Link>

        <header className="attack-lab-hero">
          <div>
            <p className="eyebrow">XDC Apothem · Chain ID 51</p>
            <h1>Malicious transaction testnet lab</h1>
            <p>
              Inspect real Apothem transaction evidence without exposing a
              production Safe, signer, asset, or private key.
            </p>
          </div>
          <dl>
            <div>
              <dt>Network</dt>
              <dd>Apothem</dd>
            </div>
            <div>
              <dt>Real funds</dt>
              <dd>Never</dd>
            </div>
            <div>
              <dt>Signing</dt>
              <dd>Outside app</dd>
            </div>
          </dl>
        </header>

        <div className="malicious-demo-notice" role="note">
          <strong>Strict testnet boundary</strong>
          <p>
            Use a disposable wallet and faucet TXDC. Never enter a private key
            here, reuse a production signer, or fund the training contracts
            with real assets. Safe Inspector remains read-only and does not sign
            or broadcast transactions.
          </p>
        </div>

        <ApothemAttackLabInspector />

        <section className="telegram-alerts-card" aria-labelledby="apothem-scenarios">
          <div className="telegram-alerts-heading">
            <div>
              <p className="eyebrow">Controlled attack fixtures</p>
              <h2 id="apothem-scenarios">Scenarios to exercise</h2>
              <p>
                Each fixture is intentionally suspicious and restricted to
                chain 51. A successful execution is expected and does not mean
                the action is safe.
              </p>
            </div>
          </div>
          <div className="attack-lab-index">
            {SCENARIOS.map((scenario) => (
              <article key={scenario.title}>
                <span>Apothem training</span>
                <strong>{scenario.title}</strong>
                <p>{scenario.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="telegram-alerts-card">
          <h2>Testnet resources</h2>
          <div className="telegram-alert-controls">
            <a
              className="button button-secondary"
              href="https://faucet.apothem.network"
              rel="noreferrer"
              target="_blank"
            >
              Get faucet TXDC
            </a>
            <a
              className="button-link"
              href="https://testnet.xdcscan.com"
              rel="noreferrer"
              target="_blank"
            >
              XDCScan Testnet
            </a>
            <a
              className="button-link"
              href="https://docs.xdc.network/learn/xdc-architecture/"
              rel="noreferrer"
              target="_blank"
            >
              Official network parameters
            </a>
          </div>
        </section>
      </article>
    </main>
  );
}
