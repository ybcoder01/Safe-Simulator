"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function EvidenceRefreshButton() {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();

  return (
    <button
      className="button button-small button-secondary"
      disabled={refreshing}
      onClick={() => {
        startTransition(() => router.refresh());
      }}
      type="button"
    >
      {refreshing ? "Retrying…" : "Retry source lookup"}
    </button>
  );
}
