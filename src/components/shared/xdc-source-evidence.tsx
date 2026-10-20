"use client";

import { useEffect, useState } from "react";

import { AddressIdentity } from "@/components/shared/address-identity";
import type { AddressBookView } from "@/lib/api/address-book";
import {
  MAX_SOURCE_EVIDENCE_ADDRESSES,
  sourceEvidenceRequestBody,
} from "@/lib/api/xdc-source-evidence-request";
import type { XdcContractVerificationResult } from "@/lib/api/xdcscan-verification";

interface Props {
  readonly addressBook: readonly AddressBookView[];
  readonly chainId: number;
  readonly references: readonly string[];
}

type State =
  | { readonly phase: "loading" }
  | { readonly phase: "failed" }
  | {
      readonly phase: "ready";
      readonly verification: XdcContractVerificationResult;
    };

function Heading({ detail }: { readonly detail: string }) {
  return (
    <div className="panel-heading">
      <div>
        <p className="eyebrow">XDCScan source evidence</p>
        <h2>Referenced contract verification</h2>
      </div>
      <span>{detail}</span>
    </div>
  );
}

export function XdcSourceEvidence({ addressBook, chainId, references }: Props) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (references.length === 0) return;
    const controller = new AbortController();
    fetch("/api/v1/xdc-source-evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: sourceEvidenceRequestBody(references),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Source evidence request failed.");
        const payload = (await response.json()) as {
          data: XdcContractVerificationResult;
        };
        setState({ phase: "ready", verification: payload.data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ phase: "failed" });
      });
    return () => controller.abort();
  }, [attempt, references]);

  const retry = () => {
    setState({ phase: "loading" });
    setAttempt((value) => value + 1);
  };

  if (references.length === 0) {
    return (
      <section className="detail-panel" id="source-evidence">
        <Heading detail="Nothing to check" />
        <div className="panel-empty">
          No valid contract references were available for an XDCScan source
          lookup.
        </div>
      </section>
    );
  }

  if (state.phase === "loading") {
    return (
      <section className="detail-panel" id="source-evidence" aria-busy="true">
        <Heading detail="Loading separately" />
        <div className="panel-empty">
          The safety report above is ready. This supplementary explorer check is
          loading without delaying it.
        </div>
      </section>
    );
  }

  if (state.phase === "failed") {
    return (
      <section className="detail-panel" id="source-evidence">
        <Heading detail="Unavailable" />
        <div className="source-evidence-retry">
          <p>
            The explorer check could not be completed. The safety report above
            does not depend on it, and no trust status is inferred from a failed
            lookup.
          </p>
          <button
            className="button button-small button-secondary"
            onClick={retry}
            type="button"
          >
            Retry source lookup
          </button>
        </div>
      </section>
    );
  }

  const { verification } = state;
  return (
    <section className="detail-panel" id="source-evidence">
      <Heading
        detail={`${verification.items.filter((item) => item.status === "verified").length} verified · ${verification.items.length} checked`}
      />
      {verification.items.length === 0 ? (
        <div className="panel-empty">
          No valid contract references were available for an XDCScan source
          lookup.
        </div>
      ) : (
        <div className="verification-list">
          {verification.items.map((item) => (
            <div
              className={
                "calldata verification-card verification-" + item.status
              }
              key={"xdcscan-verification-" + item.address}
            >
              <span>
                {item.status === "verified"
                  ? "Verified source"
                  : item.status === "unverified"
                    ? "No verified source"
                    : "Lookup unavailable"}
                {item.isProxy === true
                  ? " · proxy"
                  : item.isProxy === false
                    ? " · contract"
                    : ""}
              </span>
              <AddressIdentity
                address={item.address}
                addressBook={addressBook}
                chainId={chainId}
              />
              {item.contractName || item.compilerVersion ? (
                <code>
                  {item.contractName ?? "Unnamed contract"}
                  {item.compilerVersion ? " · " + item.compilerVersion : ""}
                </code>
              ) : null}
              {item.implementation ? (
                <div className="approval-party">
                  <span>Proxy implementation reference</span>
                  <AddressIdentity
                    address={item.implementation}
                    addressBook={addressBook}
                    chainId={chainId}
                  />
                </div>
              ) : null}
              {item.warning ? <code>{item.warning}</code> : null}
            </div>
          ))}
        </div>
      )}
      {references.length > MAX_SOURCE_EVIDENCE_ADDRESSES ? (
        <div className="panel-empty">
          Source evidence covers the first {MAX_SOURCE_EVIDENCE_ADDRESSES} of{" "}
          {references.length} referenced contracts.
        </div>
      ) : null}
      {verification.warnings.map((warning) => (
        <div className="panel-empty" key={warning}>
          {warning}
        </div>
      ))}
      {verification.items.some((item) => item.status === "unavailable") ? (
        <div className="source-evidence-retry">
          <p>
            Registry and Sourcify evidence remain visible while the explorer is
            unavailable. No trust status is inferred from a failed lookup.
          </p>
          <button
            className="button button-small button-secondary"
            onClick={retry}
            type="button"
          >
            Retry source lookup
          </button>
        </div>
      ) : null}
    </section>
  );
}
