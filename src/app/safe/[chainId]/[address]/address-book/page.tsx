import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AddressBookEditor } from "@/components/safes/address-book-editor";
import { AddressIdentity } from "@/components/shared/address-identity";
import { getPersistencePort } from "@/container";
import { contractRegistryEntriesForChain } from "@/core/analysis/trust/contract-registry";
import { parseProfileId, PROFILE_COOKIE } from "@/lib/api/profile";
import { safeRouteParamsSchema } from "@/lib/api/safe-details";

interface PageProps {
  readonly params: Promise<{ chainId: string; address: string }>;
}

const protocolLabels: Readonly<Record<string, string>> = {
  curve: "Curve",
  fathom: "Fathom",
  morpho: "Morpho",
  "oku-uniswap": "Uniswap via Oku",
  reservoir: "Reservoir",
  silo: "Silo",
  stargate: "Stargate",
  xswap: "XSwap",
  yieldnest: "YieldNest",
};

export default async function AddressBookPage({ params }: PageProps) {
  const parsed = safeRouteParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();

  const persistence = getPersistencePort();
  const safe = await persistence.findSafe(parsed.data);
  if (!safe) notFound();

  const cookieStore = await cookies();
  const profileId = parseProfileId(cookieStore.get(PROFILE_COOKIE)?.value);
  const personalEntries = profileId
    ? await persistence.listAddressBookEntries(profileId, safe)
    : [];

  const protocolEntries = contractRegistryEntriesForChain(safe.chainId)
    .filter((entry) => entry.category === "protocol")
    .sort(
      (left, right) =>
        left.protocol.localeCompare(right.protocol) ||
        left.label.localeCompare(right.label),
    );
  const groups = new Map<string, (typeof protocolEntries)[number][]>();
  for (const entry of protocolEntries) {
    groups.set(entry.protocol, [...(groups.get(entry.protocol) ?? []), entry]);
  }
  const safePath = `/safe/${safe.chainId}/${safe.address}`;

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

      <article className="transaction-detail address-book-page">
        <Link className="dashboard-back" href={safePath}>
          ← Safe overview
        </Link>

        <header className="transaction-title">
          <div>
            <p className="eyebrow">Identity controls</p>
            <h1>Address book</h1>
            <p className="address-book-intro">
              Personal classifications override the reviewed protocol directory
              for this browser profile and Safe.
            </p>
          </div>
          <span className="verified-pill">
            {personalEntries.length} personal · {protocolEntries.length}{" "}
            protocol
          </span>
        </header>

        {profileId ? (
          <AddressBookEditor
            chainId={safe.chainId}
            initialEntries={personalEntries}
            safeAddress={safe.address}
            suggestions={[]}
          />
        ) : (
          <section className="detail-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Personal classifications</p>
                <h2>Unavailable</h2>
              </div>
            </div>
            <div className="panel-empty">
              Return to the watchlist to initialize this browser profile.
            </div>
          </section>
        )}

        <section className="detail-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Reviewed directory</p>
              <h2>Protocol addresses</h2>
            </div>
            <span>{protocolEntries.length} entries</span>
          </div>
          <p className="trust-copy">
            These source-controlled records identify publisher-documented XDC
            deployments. A green check is limited to active entries approved by
            the registry policy. Known, internal, and deprecated identities do
            not receive that check.
          </p>

          <div className="protocol-directory">
            {[...groups.entries()].map(([protocol, entries]) => {
              const whitelisted = entries.filter(
                (entry) =>
                  entry.trustPolicy === "protocol-whitelist" &&
                  entry.lifecycle === "active",
              ).length;

              return (
                <details className="protocol-group" key={protocol}>
                  <summary>
                    <span>{protocolLabels[protocol] ?? protocol}</span>
                    <small>
                      {entries.length} addresses · {whitelisted} whitelisted
                    </small>
                  </summary>
                  <div className="protocol-entry-list">
                    {entries.map((entry) => (
                      <article
                        className="protocol-entry"
                        key={entry.address.toLowerCase()}
                      >
                        <div>
                          <strong>{entry.label}</strong>
                          <span>
                            {entry.role.replaceAll("-", " ")} ·{" "}
                            {entry.lifecycle}
                          </span>
                        </div>
                        <AddressIdentity
                          address={entry.address}
                          chainId={safe.chainId}
                        />
                        <a
                          className="text-link protocol-source-link"
                          href={entry.reference}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Publisher source ↗
                        </a>
                      </article>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      </article>

      <footer className="workspace-footer">
        <Link className="text-link" href={safePath}>
          Return to Safe overview
        </Link>
        <span>Public data only · No signing capability</span>
      </footer>
    </main>
  );
}
