"use client";

import { useEffect, useMemo, useState } from "react";

import type { AddressBookView } from "@/lib/api/address-book";
import { AddressIdentity } from "@/components/shared/address-identity";
import type { BriefFlowRow } from "@/components/safes/transaction-brief";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_FLOW_ROWS = 4;

export interface SiloShareLookup {
  readonly chainId: number;
  readonly markets: readonly string[];
  readonly movements: readonly {
    readonly logIndex: number;
    readonly token: string;
    readonly amount: string;
  }[];
  readonly blockNumber: string | null;
}

interface Props {
  readonly addressBook: readonly AddressBookView[];
  readonly chainId: number;
  readonly flow: readonly BriefFlowRow[];
  readonly effects: readonly string[];
  readonly knownLabels: Readonly<Record<string, string>>;
  readonly safeAddress: string;
  readonly siloShareLookup?: SiloShareLookup | null;
  readonly totalMovements: number;
}

function FlowNode({
  address,
  addressBook,
  chainId,
  knownLabels,
  role,
  safeAddress,
}: {
  readonly role: "from" | "to";
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
    return role === "from" ? (
      <div className="brief-node brief-node-mint">
        <strong>Newly created</strong>
        <span>Issued by the token itself</span>
      </div>
    ) : (
      <div className="brief-node brief-node-burn">
        <strong>Removed</strong>
        <span>Taken out of circulation</span>
      </div>
    );
  }
  const label = knownLabels[key] ?? null;
  return (
    <div className="brief-node">
      {label ? <strong>{label}</strong> : null}
      <AddressIdentity
        address={address}
        addressBook={addressBook}
        chainId={chainId}
        compact
      />
    </div>
  );
}

export function ProgressiveBriefFlow({
  addressBook,
  chainId,
  effects,
  flow,
  knownLabels,
  safeAddress,
  siloShareLookup,
  totalMovements,
}: Props) {
  const [shareValues, setShareValues] = useState<
    Readonly<
      Record<number, { readonly amount: string; readonly symbol: string }>
    >
  >({});

  useEffect(() => {
    if (
      !siloShareLookup ||
      siloShareLookup.markets.length === 0 ||
      siloShareLookup.movements.length === 0
    ) {
      return;
    }

    const controller = new AbortController();
    void fetch("/api/v1/silo-share-values", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(siloShareLookup),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          readonly data?: {
            readonly items?: readonly {
              readonly logIndex: number;
              readonly amount: string;
              readonly symbol: string;
            }[];
          };
        };
      })
      .then((payload) => {
        if (!payload?.data?.items) return;
        const next: Record<
          number,
          { readonly amount: string; readonly symbol: string }
        > = {};
        for (const item of payload.data.items) {
          next[item.logIndex] = {
            amount: item.amount,
            symbol: item.symbol,
          };
        }
        setShareValues(next);
      })
      .catch(() => {
        // This enrichment is optional. The deterministic report remains usable.
      });

    return () => controller.abort();
  }, [siloShareLookup]);

  const shownFlow = useMemo(
    () =>
      flow.slice(0, MAX_FLOW_ROWS).map((row) => ({
        ...row,
        worth:
          row.logIndex === undefined
            ? (row.worth ?? null)
            : (shareValues[row.logIndex] ?? row.worth ?? null),
      })),
    [flow, shareValues],
  );

  if (shownFlow.length === 0) return null;

  return (
    <div className="brief-group">
      <h3>Where the money goes</h3>
      <div className="brief-flow">
        {shownFlow.map((row) => (
          <div
            className={`brief-flow-row brief-flow-${row.direction}`}
            key={row.key}
          >
            <FlowNode
              role="from"
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
              {row.worth ? (
                <small>
                  {row.direction === "outbound" ? "Worth" : "Redeemable for"}{" "}
                  {row.worth.amount} {row.worth.symbol}
                </small>
              ) : null}
              <span aria-hidden="true">→</span>
            </div>
            <FlowNode
              role="to"
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
      {effects.length > 0 ? (
        <ul className="brief-effects">
          {effects.map((effect) => (
            <li key={effect}>{effect}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
