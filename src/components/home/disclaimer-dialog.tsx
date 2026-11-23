"use client";

import { useEffect, useRef } from "react";

const ACKNOWLEDGEMENT_KEY = "safe-inspector:disclaimer:v3";

export function DisclaimerDialog() {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(ACKNOWLEDGEMENT_KEY) === "accepted") {
        return;
      }
    } catch {
      // If storage is unavailable, still show the disclaimer for this visit.
    }

    dialog.current?.showModal();
  }, []);

  function acknowledge() {
    try {
      window.localStorage.setItem(ACKNOWLEDGEMENT_KEY, "accepted");
    } catch {
      // Closing the dialog should not depend on browser storage access.
    }

    dialog.current?.close();
  }

  return (
    <dialog
      aria-describedby="homepage-disclaimer-copy"
      aria-labelledby="homepage-disclaimer-title"
      className="homepage-disclaimer"
      onCancel={(event) => event.preventDefault()}
      ref={dialog}
    >
      <div className="homepage-disclaimer-card">
        <p className="eyebrow">Before you continue</p>
        <h2 id="homepage-disclaimer-title">Important disclaimer</h2>
        <p id="homepage-disclaimer-copy">
          Safe Inspector is a pre-signature transaction analysis tool for dApps
          on the XDC Network. It reviews transaction data, contract information,
          simulations, third-party sources, and other available evidence. Safe
          Inspector’s analysis reflects the data and evidence available at the
          time of review and is designed to support your verification before
          signing. AI-generated explanations are provided for convenience and
          should not be treated as financial, legal, or security advice. Safe
          Inspector does not hold, request, or access your private keys and
          cannot sign or execute transactions. Signing, final confirmation, and
          transaction execution take place through Safe Global. Because on-chain
          conditions can change, always confirm the final transaction details in
          Safe Global. You remain responsible for your signing decisions and any
          resulting loss or damage.
        </p>
        <button className="button" onClick={acknowledge} type="button">
          I understand
        </button>
      </div>
    </dialog>
  );
}
