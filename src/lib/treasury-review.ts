import type { TransactionActivity } from "@/core/analysis/decoding/activity";
import type {
  Address,
  AddressBookEntry,
  Finding,
  SafeTransaction,
  TransferRecord,
} from "@/core/domain";
import type { ExecutionInsight } from "@/lib/api/execution-insight";

export type TreasuryCheckStatus =
  | "pass"
  | "new"
  | "review"
  | "block"
  | "unknown";

export interface TreasuryReviewCheck {
  readonly key:
    | "identity"
    | "history"
    | "recipient"
    | "permissions"
    | "simulation";
  readonly label: string;
  readonly status: TreasuryCheckStatus;
  readonly title: string;
  readonly detail: string;
}

interface TreasuryReviewInput {
  readonly activity: TransactionActivity;
  readonly addressBook: readonly Pick<
    AddressBookEntry,
    "address" | "label" | "trust"
  >[];
  readonly execution: Pick<ExecutionInsight, "success" | "tokenMovements">;
  readonly findings: readonly Finding[];
  readonly historyLoaded: boolean;
  readonly previousTransactions: readonly SafeTransaction[];
  readonly previousTransfers: readonly TransferRecord[];
  readonly protocolLabel: string | null;
  readonly targetAccountType: "contract" | "wallet" | "unavailable";
  readonly targetKnown: boolean;
  readonly targetVerified: boolean;
  readonly transferHistoryLoaded: boolean;
  readonly transaction: SafeTransaction;
}

function addressKey(value: string): string {
  return value.toLowerCase();
}

function isLookalike(left: string, right: string): boolean {
  const a = addressKey(left);
  const b = addressKey(right);
  return (
    a !== b && a.slice(0, 6) === b.slice(0, 6) && a.slice(-4) === b.slice(-4)
  );
}

function formatHistoryDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000));
}

function findingCodes(findings: readonly Finding[]): Set<string> {
  return new Set(findings.map((finding) => finding.code));
}

function trustedAddress(
  addressBook: TreasuryReviewInput["addressBook"],
  address: string,
): TreasuryReviewInput["addressBook"][number] | null {
  return (
    addressBook.find(
      (entry) => addressKey(entry.address) === addressKey(address),
    ) ?? null
  );
}

function destinationHistory(input: TreasuryReviewInput) {
  const matches = input.previousTransactions
    .filter(
      (item) =>
        item.status === "executed" &&
        addressKey(item.safeTxHash) !==
          addressKey(input.transaction.safeTxHash) &&
        addressKey(item.to) === addressKey(input.transaction.to),
    )
    .sort((left, right) => (right.executedAt ?? 0) - (left.executedAt ?? 0));
  return {
    count: matches.length,
    lastUsedAt: matches[0]?.executedAt ?? null,
  };
}

function transferRecipients(input: TreasuryReviewInput): readonly Address[] {
  if (input.activity.type !== "transfer") return [];
  if (input.transaction.data === "0x") return [input.transaction.to];

  const safe = addressKey(input.transaction.safe.address);
  return [
    ...new Map(
      input.execution.tokenMovements
        .filter(
          (movement) =>
            addressKey(movement.from) === safe &&
            addressKey(movement.to) !== safe,
        )
        .map((movement) => [addressKey(movement.to), movement.to as Address]),
    ).values(),
  ];
}

function identityCheck(input: TreasuryReviewInput): TreasuryReviewCheck {
  const codes = findingCodes(input.findings);
  const saved = trustedAddress(input.addressBook, input.transaction.to);
  if (saved?.trust === "flagged") {
    return {
      key: "identity",
      label: "Destination identity",
      status: "block",
      title: "Your team flagged this address",
      detail: `${saved.label} is marked as dangerous in this Safe's address book.`,
    };
  }
  if (input.targetAccountType === "wallet") {
    if (saved?.trust === "trusted") {
      return {
        key: "identity",
        label: "Destination identity",
        status: "pass",
        title: saved.label,
        detail: "This exact wallet is approved in this Safe's address book.",
      };
    }
    return {
      key: "identity",
      label: "Destination identity",
      status: "review",
      title: "Wallet address",
      detail:
        "This destination is a wallet. Confirm its complete address with the intended recipient.",
    };
  }
  if (input.targetKnown && input.targetVerified) {
    if (codes.has("protocol-path-unconfirmed")) {
      return {
        key: "identity",
        label: "Project identity",
        status: "review",
        title: `${input.protocolLabel ?? "Project"} recognized; route needs review`,
        detail:
          "The main contract matches reviewed records, but part of the internal contract route is not independently confirmed yet.",
      };
    }
    return {
      key: "identity",
      label: "Project identity",
      status: "pass",
      title: input.protocolLabel ?? "Reviewed project contract",
      detail:
        "The destination matches the reviewed project registry and its current published contract evidence.",
    };
  }
  if (input.targetVerified) {
    return {
      key: "identity",
      label: "Project identity",
      status: "review",
      title: "Verified code, unknown project address",
      detail:
        "Published source exists, but this address is not in the reviewed project deployment registry.",
    };
  }
  return {
    key: "identity",
    label: "Project identity",
    status: "unknown",
    title: "Contract identity not confirmed",
    detail:
      "Safe Inspector could not match both the project deployment and current published contract evidence.",
  };
}

function historyCheck(input: TreasuryReviewInput): TreasuryReviewCheck {
  if (!input.historyLoaded) {
    return {
      key: "history",
      label: "Previous interaction",
      status: "unknown",
      title: "Interaction history unavailable",
      detail:
        "Safe Inspector could not load enough history to determine whether this exact destination was used before.",
    };
  }
  const history = destinationHistory(input);
  if (history.count === 0) {
    const lookalike = input.previousTransactions.some(
      (item) =>
        item.status === "executed" &&
        isLookalike(item.to, input.transaction.to),
    );
    if (lookalike) {
      return {
        key: "history",
        label: "Previous interaction",
        status: "block",
        title: "Possible lookalike address",
        detail:
          "This new destination shares the same beginning and ending as a previously used address but differs in the middle. Verify every character from an independent source.",
      };
    }
    return {
      key: "history",
      label: "Previous interaction",
      status: "new",
      title: "Not previously used by this Safe",
      detail:
        "This exact destination does not appear in the loaded successful transaction history. New does not mean malicious, but every signer should verify it.",
    };
  }
  return {
    key: "history",
    label: "Previous interaction",
    status: "pass",
    title: `Used successfully ${history.count} time${history.count === 1 ? "" : "s"}`,
    detail:
      history.lastUsedAt === null
        ? "This exact destination appears in this Safe's successful history."
        : `Most recent successful use: ${formatHistoryDate(history.lastUsedAt)}. Previous use is context, not a safety guarantee.`,
  };
}

function recipientCheck(input: TreasuryReviewInput): TreasuryReviewCheck {
  const codes = findingCodes(input.findings);
  const recipients = transferRecipients(input);
  if (input.activity.type === "transfer" && recipients.length === 0) {
    return {
      key: "recipient",
      label: "Asset recipient",
      status: "unknown",
      title: "Recipient evidence unavailable",
      detail:
        "The transfer recipient could not be reconstructed from the available execution evidence.",
    };
  }

  if (recipients.length > 0) {
    const flagged = recipients.find(
      (address) =>
        trustedAddress(input.addressBook, address)?.trust === "flagged",
    );
    if (flagged) {
      return {
        key: "recipient",
        label: "Asset recipient",
        status: "block",
        title: "A flagged wallet receives assets",
        detail: "Do not approve until the recipient is corrected and verified.",
      };
    }
    const previous = new Set(
      input.previousTransfers
        .filter(
          (transfer) =>
            addressKey(transfer.transactionHash) !==
            addressKey(input.transaction.executedTxHash ?? ""),
        )
        .map((transfer) => addressKey(transfer.to)),
    );
    const lookalike = recipients.find((address) =>
      input.previousTransfers.some((transfer) =>
        isLookalike(transfer.to, address),
      ),
    );
    if (lookalike) {
      return {
        key: "recipient",
        label: "Asset recipient",
        status: "block",
        title: "Possible recipient-address poisoning",
        detail:
          "The new recipient resembles one from the transfer history but differs in the middle. Verify the complete address from an independent source.",
      };
    }
    const unfamiliar = recipients.filter(
      (address) =>
        trustedAddress(input.addressBook, address)?.trust !== "trusted" &&
        !previous.has(addressKey(address)),
    );
    if (unfamiliar.length > 0) {
      if (!input.transferHistoryLoaded) {
        return {
          key: "recipient",
          label: "Asset recipient",
          status: "unknown",
          title: "Recipient history unavailable",
          detail:
            "The exact recipient is not approved in the address book, and Safe Inspector could not load transfer history for comparison.",
        };
      }
      return {
        key: "recipient",
        label: "Asset recipient",
        status: codes.has("recipient-address-unconfirmed") ? "review" : "new",
        title: codes.has("recipient-address-unconfirmed")
          ? "Recipient needs confirmation"
          : "New recipient wallet",
        detail:
          "This exact recipient is not approved in the address book and does not appear in the loaded transfer history.",
      };
    }
    return {
      key: "recipient",
      label: "Asset recipient",
      status: "pass",
      title: "Recipient was previously verified or used",
      detail:
        "The exact recipient is approved in the address book or appears in this Safe's transfer history.",
    };
  }

  if (codes.has("recipient-address-unconfirmed")) {
    return {
      key: "recipient",
      label: "Asset recipient",
      status: "review",
      title: "Recipient needs confirmation",
      detail:
        "At least one asset destination could not be independently confirmed. Compare the complete address before approval.",
    };
  }

  return {
    key: "recipient",
    label: "Asset recipient",
    status: "pass",
    title: "No unexpected recipient found",
    detail:
      "The analyzed evidence did not identify an unconfirmed asset recipient.",
  };
}

function permissionCheck(input: TreasuryReviewInput): TreasuryReviewCheck {
  const codes = findingCodes(input.findings);
  if (codes.has("safe-control-change")) {
    return {
      key: "permissions",
      label: "Authority and permissions",
      status: "block",
      title: "This changes who can control the Safe",
      detail:
        "An owner, approval threshold, module, guard, handler, or implementation is changing. Every signer should verify the exact before-and-after setting.",
    };
  }
  if (
    codes.has("unlimited-spending-access") ||
    codes.has("flagged-address-involved")
  ) {
    return {
      key: "permissions",
      label: "Authority and permissions",
      status: "block",
      title: "Dangerous permission needs attention",
      detail:
        "Unlimited access or a flagged permission address was detected. Do not approve until it is removed or independently justified.",
    };
  }
  if (codes.has("spender-address-check")) {
    return {
      key: "permissions",
      label: "Authority and permissions",
      status: "review",
      title: "A spender needs confirmation",
      detail:
        "Confirm the complete spender address and allowance amount before the final approval.",
    };
  }
  return {
    key: "permissions",
    label: "Authority and permissions",
    status: "pass",
    title: "No unexpected permission found",
    detail:
      "No material token-spending permission warning was found in the available evidence.",
  };
}

function simulationCheck(input: TreasuryReviewInput): TreasuryReviewCheck {
  if (input.execution.success === false) {
    return {
      key: "simulation",
      label: "Simulation",
      status: "block",
      title: "The transaction failed in simulation",
      detail:
        "Do not approve a transaction that does not complete as expected.",
    };
  }
  if (input.execution.success === null) {
    return {
      key: "simulation",
      label: "Simulation",
      status: "unknown",
      title: "Simulation result unavailable",
      detail:
        "Retry the analysis or verify with another independent simulator.",
    };
  }
  return {
    key: "simulation",
    label: "Simulation",
    status: "pass",
    title: "Transaction completed in simulation",
    detail:
      "The simulated call completed. Confirm the displayed amounts and recipients still match your intent.",
  };
}

export function treasuryReviewFocus(
  activity: TransactionActivity["type"],
): string {
  switch (activity) {
    case "transfer":
      return "Confirm the asset, amount, and complete recipient address.";
    case "swap":
      return "Confirm the asset sold, asset received, minimum return, route, and final recipient.";
    case "liquidity":
      return "Confirm the pool, deposited or withdrawn assets, minimum returns, and who receives the liquidity position.";
    case "approval":
      return "Confirm the token, spender, exact allowance, and whether this permission is required.";
    case "safe-configuration":
      return "Confirm every owner, threshold, module, guard, handler, or implementation change with all signers.";
    case "batch":
      return "Review every operation in the batch; one familiar action must not hide another permission or transfer.";
    case "lending":
      return "Confirm the market, supplied or borrowed asset, amount, beneficiary, and any new spending permission.";
    case "bridge":
      return "Confirm the source and destination chains, bridge contracts, token, amount, and destination wallet.";
    case "delegatecall":
      return "Do not approve until the delegated code and its authority over the Safe are independently explained.";
    default:
      return "Confirm the full destination, method, amounts, recipients, and permissions.";
  }
}

export function resolveTreasuryReviewChecks(
  input: TreasuryReviewInput,
): readonly TreasuryReviewCheck[] {
  return [
    identityCheck(input),
    historyCheck(input),
    recipientCheck(input),
    permissionCheck(input),
    simulationCheck(input),
  ];
}
