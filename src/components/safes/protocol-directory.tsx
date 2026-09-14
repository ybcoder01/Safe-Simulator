"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import { AddressIdentity } from "@/components/shared/address-identity";
import { CopyIdentifierButton } from "@/components/shared/copy-identifier-button";
import {
  filterProtocolDirectory,
  type ProtocolDirectoryEntry,
  type ProtocolDirectoryFilter,
} from "@/lib/protocol-directory";

interface Props {
  readonly chainId: number;
  readonly entries: readonly ProtocolDirectoryEntry[];
}

const protocolLogoPaths: Readonly<Record<string, string>> = {
  curve: "/protocol-logos/curve.png",
  fathom: "/protocol-logos/fathom.svg",
  morpho: "/protocol-logos/morpho.svg",
  oku: "/protocol-logos/oku.svg",
  reservoir: "/protocol-logos/reservoir.png",
  silo: "/protocol-logos/silo.svg",
  stargate: "/protocol-logos/stargate.svg",
  xswap: "/protocol-logos/xswap.png",
  yieldnest: "/protocol-logos/yieldnest.svg",
};

export function ProtocolDirectory({ chainId, entries }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProtocolDirectoryFilter>("all");
  const groups = useMemo(
    () => filterProtocolDirectory(entries, query, filter),
    [entries, filter, query],
  );
  const visibleEntryCount = groups.reduce(
    (total, group) => total + group.entries.length,
    0,
  );
  const isFiltering = query.trim().length > 0 || filter !== "all";

  return (
    <>
      <div className="protocol-directory-controls">
        <label className="protocol-search-field">
          <span>Search protocol directory</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Protocol, contract, role, or 0x address"
            type="search"
            value={query}
          />
        </label>
        <label className="protocol-filter-field">
          <span>Status</span>
          <select
            onChange={(event) =>
              setFilter(event.target.value as ProtocolDirectoryFilter)
            }
            value={filter}
          >
            <option value="all">All records</option>
            <option value="whitelisted">Whitelisted</option>
            <option value="identity-only">Identity only</option>
            <option value="deprecated">Deprecated</option>
          </select>
        </label>
      </div>

      <div className="protocol-directory-results" aria-live="polite">
        <span>
          Showing {visibleEntryCount} of {entries.length} entries across{" "}
          {groups.length} {groups.length === 1 ? "protocol" : "protocols"}
        </span>
        {isFiltering ? (
          <button
            className="text-button"
            onClick={() => {
              setFilter("all");
              setQuery("");
            }}
            type="button"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {groups.length > 0 ? (
        <div className="protocol-directory">
          {groups.map(({ protocol, label, entries: groupEntries }) => {
            const whitelisted = groupEntries.filter(
              (entry) =>
                entry.trustPolicy === "protocol-whitelist" &&
                entry.lifecycle === "active",
            ).length;
            const logoKey = groupEntries[0]?.logoKey ?? protocol;
            const logoPath = logoKey ? protocolLogoPaths[logoKey] : undefined;

            return (
              <details
                className="protocol-group"
                key={`${protocol}-${isFiltering ? "filtered" : "all"}`}
                open={isFiltering || undefined}
              >
                <summary>
                  <span className="protocol-group-name">
                    <span
                      aria-label={`${label} logo`}
                      className={`protocol-logo protocol-logo-${logoKey ?? protocol}`}
                      role="img"
                    >
                      {logoPath ? (
                        <Image
                          alt=""
                          height={34}
                          src={logoPath}
                          style={{
                            height: "100%",
                            objectFit: "contain",
                            width: "100%",
                          }}
                          unoptimized
                          width={34}
                        />
                      ) : (
                        label.slice(0, 2).toUpperCase()
                      )}
                    </span>
                    <span>{label}</span>
                  </span>
                  <small>
                    {groupEntries.length} addresses · {whitelisted} whitelisted
                  </small>
                </summary>
                <div className="protocol-entry-list">
                  {groupEntries.map((entry) => (
                    <article
                      className="protocol-entry"
                      key={entry.address.toLowerCase()}
                    >
                      <div>
                        <strong>{entry.label}</strong>
                        <span>
                          {entry.role.replaceAll("-", " ")} · {entry.lifecycle}
                        </span>
                      </div>
                      <span className="protocol-address-cell">
                        <AddressIdentity
                          address={entry.address}
                          chainId={chainId}
                        />
                        <CopyIdentifierButton
                          label={`Copy ${entry.label} address`}
                          value={entry.address}
                        />
                      </span>
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
      ) : (
        <div className="protocol-directory-empty">
          <strong>No matching protocol addresses</strong>
          <span>
            Try a protocol name, contract label, role, or full address.
          </span>
        </div>
      )}
    </>
  );
}
