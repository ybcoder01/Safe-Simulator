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
    hash: "0xf453df6ede66cb11dfe33910c23817ec60b2f0d71aa14ce99857b1bcbb98de6e",
  },
  {
    title: "Injected recipient",
    detail:
      "Call the training router with a recipient that differs from the independently approved address.",
    hash: "0x54622599c56a6b2dcd31f995a5812eef030c49245514ea582ed7730fb1928f2a",
  },
  {
    title: "Delegatecall storage risk",
    detail:
      "Create a disposable Safe transaction with operation 1 targeting DelegateMutation. Do not use a production Safe.",
    hash: "0x5a533922d8084926f30d4f33589e66b6f7f5507f967446b61d9b93f0721cc60a",
  },
  {
    title: "Hidden nested transfer",
    detail:
      "Put sendNative inside multicall(bytes[]) and confirm the nested batch is presented for review.",
    hash: "0xc8db1e9fab6cd81090a07672f1da8e82bb870ae94dada20c39b86f8852987ed4",
  },
  {
    title: "Proxy implementation change",
    detail:
      "Call upgradeToAndCall on the training proxy and verify the address is not treated as trusted after code changes.",
    hash: "0x065c3279da0242dfdc77f958254913470bbd65fdadac962e42ee73ea47f77625",
  },
  {
    title: "Safe security-control change",
    detail:
      "Use a Safe security selector such as enableModule and confirm that a new execution path is treated as critical.",
    hash: "0xecd79f621da4cbb94ebb282ec67bb570bb05892f4570e9cb1dbeb0117575187a",
  },
] as const;

interface PageProps {
  readonly searchParams: Promise<{ readonly tx?: string | string[] }>;
}

const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;

export default async function ApothemAttackLabPage({
  searchParams,
}: PageProps) {
  const query = await searchParams;
  const suppliedHash = Array.isArray(query.tx) ? query.tx[0] : query.tx;
  const initialTransactionHash =
    suppliedHash && TRANSACTION_HASH.test(suppliedHash) ? suppliedHash : "";
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
            here, reuse a production signer, or fund the training contracts with
            real assets. Safe Inspector remains read-only and does not sign or
            broadcast transactions.
          </p>
        </div>

        <ApothemAttackLabInspector
          initialTransactionHash={initialTransactionHash}
        />

        <section
          className="telegram-alerts-card"
          aria-labelledby="apothem-scenarios"
        >
          <div className="telegram-alerts-heading">
            <div>
              <p className="eyebrow">Controlled attack fixtures</p>
              <h2 id="apothem-scenarios">Scenarios to exercise</h2>
              <p>
                Select any verified testnet transaction below to load its real
                chain-51 evidence. A successful execution is expected and does
                not mean the action is safe.
              </p>
            </div>
          </div>
          <div className="attack-lab-index">
            {SCENARIOS.map((scenario) => (
              <Link
                href={`/demo/apothem-attack-lab?tx=${scenario.hash}`}
                key={scenario.hash}
              >
                <span>Open testnet transaction</span>
                <strong>{scenario.title}</strong>
                <p>{scenario.detail}</p>
                <div className="transaction-hash-actions">
                  <code>{scenario.hash}</code>
                </div>
              </Link>
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
