import type { Finding, TransactionStatus } from "@/core/domain";
import { findingNote, findingQuickAction } from "@/lib/finding-guidance";
import type { ReviewSignal } from "@/lib/transaction-review-presentation";
import type { TreasuryReviewCheck } from "@/lib/treasury-review";

export type BriefVerdictId = "expected" | "check" | "stop" | "unverified";

export interface BriefVerdict {
  readonly id: BriefVerdictId;
  readonly label: string;
  readonly reason: string;
}

export interface BriefMovement {
  readonly direction: "inbound" | "outbound" | "self" | "external";
  readonly from: string;
  readonly to: string;
  readonly amount: string | null;
  readonly symbol: string | null;
}

export interface BriefCheckItem {
  readonly key: string;
  readonly severity: "critical" | "warning";
  readonly title: string;
  readonly why: string;
  readonly action: string;
}

export type BriefRowStatus = "ok" | "check" | "stop" | "unknown";

export interface BriefRow {
  readonly key: string;
  readonly status: BriefRowStatus;
  readonly label: string;
  readonly text: string;
}

export interface BriefNote {
  readonly key: string;
  readonly normal: boolean;
  readonly title: string;
  readonly text: string;
}

export interface BriefConfirmation {
  readonly key: string;
  readonly confirmed: boolean;
  readonly label: string;
  readonly text: string;
}

export interface BriefRouteCheck {
  readonly key: string;
  readonly status: "pass" | "review" | "fail";
  readonly title: string;
  readonly detail: string;
}

export interface TransactionBriefInput {
  readonly signal: ReviewSignal;
  readonly signalDetail: string;
  readonly status: TransactionStatus;
  readonly safeAddress: string;
  readonly movements: readonly BriefMovement[];
  readonly infiniteApproval: boolean;
  readonly approvalChangeCount: number;
  readonly configChangeCount: number;
  readonly findings: readonly Finding[];
  readonly evidenceFindings: readonly Finding[];
  readonly routeChecks: readonly BriefRouteCheck[];
  readonly treasuryChecks: readonly TreasuryReviewCheck[];
}

export interface TransactionBrief {
  readonly verdict: BriefVerdict;
  readonly sentence: string;
  readonly effects: readonly string[];
  readonly rows: readonly BriefRow[];
  readonly todo: readonly string[];
  readonly checks: readonly BriefCheckItem[];
  readonly notes: readonly BriefNote[];
  readonly confirmations: readonly BriefConfirmation[];
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_LISTED_AMOUNTS = 3;

const PENDING_LABELS: Readonly<Record<BriefVerdictId, string>> = {
  expected: "Looks normal",
  check: "Check before you sign",
  stop: "Stop. Don't sign yet",
  unverified: "We couldn't check this yet",
};

const EXECUTED_LABELS: Readonly<Record<BriefVerdictId, string>> = {
  expected: "Went through. Looks normal",
  check: "Went through. Worth a look",
  stop: "Went through. Look into this now",
  unverified: "Went through. We couldn't fully check it",
};

const MAX_TODO = 2;

const ROW_LABELS: Readonly<Record<string, string>> = {
  identity: "Who you're dealing with",
  recipient: "Who gets the money",
  permissions: "What it can access",
  simulation: "Test run",
};

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function amountText(movement: BriefMovement): string {
  const symbol = movement.symbol ?? "tokens";
  return movement.amount ? `${movement.amount} ${symbol}` : symbol;
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function listAmounts(movements: readonly BriefMovement[]): string {
  const shown = movements.slice(0, MAX_LISTED_AMOUNTS).map(amountText);
  const hidden = movements.length - shown.length;
  return joinList(
    hidden > 0
      ? [...shown, `${hidden} more ${plural(hidden, "asset", "assets")}`]
      : shown,
  );
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function resolveVerdict(
  input: TransactionBriefInput,
  checks: readonly BriefCheckItem[],
): BriefVerdict {
  const executed = input.status === "executed";
  const labels = executed ? EXECUTED_LABELS : PENDING_LABELS;

  switch (input.signal) {
    case "clear":
      return {
        id: "expected",
        label: labels.expected,
        reason: "We found nothing unusual.",
      };
    case "blocked": {
      const critical = checks.find((item) => item.severity === "critical");
      return {
        id: "stop",
        label: labels.stop,
        reason: critical ? `${critical.title}.` : input.signalDetail,
      };
    }
    case "review": {
      const count = checks.length;
      return {
        id: "check",
        label: labels.check,
        reason:
          count > 0
            ? `We couldn't confirm ${count} ${plural(count, "thing", "things")}.`
            : "We couldn't confirm everything.",
      };
    }
    case "unknown":
      return {
        id: "unverified",
        label: labels.unverified,
        reason: "We don't have enough information to check it.",
      };
  }
}

function buildRows(
  treasuryChecks: readonly TreasuryReviewCheck[],
): readonly BriefRow[] {
  return treasuryChecks
    .filter((check) => check.key in ROW_LABELS)
    .map((check) => ({
      key: check.key,
      label: ROW_LABELS[check.key] ?? check.label,
      text: check.title,
      status:
        check.status === "pass"
          ? ("ok" as const)
          : check.status === "block"
            ? ("stop" as const)
            : check.status === "unknown"
              ? ("unknown" as const)
              : ("check" as const),
    }));
}

function buildTodo(
  input: TransactionBriefInput,
  checks: readonly BriefCheckItem[],
): readonly string[] {
  if (checks.length === 0) {
    return [
      input.status === "executed"
        ? "Compare the amount and who got it with what your team intended."
        : "Compare the amount and who gets it with what was requested.",
    ];
  }
  return [...new Set(checks.map((item) => item.action))].slice(0, MAX_TODO);
}

function describeEffects(input: TransactionBriefInput): {
  readonly sentence: string;
  readonly effects: readonly string[];
} {
  const executed = input.status === "executed";
  const involved = input.movements.filter(
    (movement) =>
      movement.direction === "inbound" || movement.direction === "outbound",
  );
  const incoming = involved.filter((item) => item.direction === "inbound");
  const burned = involved.filter(
    (item) =>
      item.direction === "outbound" && sameAddress(item.to, ZERO_ADDRESS),
  );
  const sent = involved.filter(
    (item) =>
      item.direction === "outbound" && !sameAddress(item.to, ZERO_ADDRESS),
  );

  const money: string[] = [];
  if (incoming.length > 0) {
    money.push(
      `${executed ? "received" : "receives"} ${listAmounts(incoming)}`,
    );
  }
  if (sent.length > 0) {
    money.push(`${executed ? "sent" : "sends"} ${listAmounts(sent)}`);
  }
  if (burned.length > 0) {
    money.push(`${executed ? "turned in" : "turns in"} ${listAmounts(burned)}`);
  }

  const effects: string[] = [];
  if (money.length === 0) {
    effects.push(
      executed
        ? "No tokens moved in or out of your Safe."
        : "No tokens move in or out of your Safe.",
    );
  }

  if (input.infiniteApproval) {
    effects.push(
      executed
        ? "A contract was given unlimited permission to spend your tokens."
        : "A contract gets unlimited permission to spend your tokens.",
    );
  } else if (input.approvalChangeCount > 0) {
    effects.push(
      `${input.approvalChangeCount} spending ${plural(input.approvalChangeCount, "permission", "permissions")} ${executed ? "changed" : "change"}.`,
    );
  } else {
    effects.push("No spending permissions change.");
  }

  if (input.configChangeCount > 0) {
    effects.push(
      `${executed ? "Changed" : "Changes"} who controls your Safe (${input.configChangeCount} ${plural(input.configChangeCount, "setting", "settings")}).`,
    );
  } else {
    effects.push("Owners and security settings stay the same.");
  }

  const sentence =
    money.length > 0
      ? `Your Safe ${joinList(money)}.`
      : (effects[0] ?? "No tokens move in or out of your Safe.");

  return { sentence, effects };
}

function buildConfirmations(
  routeChecks: readonly BriefRouteCheck[],
  treasuryChecks: readonly TreasuryReviewCheck[],
): readonly BriefConfirmation[] {
  const rows: BriefConfirmation[] = [
    ...routeChecks.map((check) => ({
      key: `route:${check.key}`,
      confirmed: check.status === "pass",
      label: check.title,
      text: check.detail,
    })),
    ...treasuryChecks.map((check) => ({
      key: `treasury:${check.key}`,
      confirmed: check.status === "pass",
      label: check.label,
      text: check.title,
    })),
  ];

  return [
    ...rows.filter((row) => !row.confirmed),
    ...rows.filter((row) => row.confirmed),
  ];
}

/**
 * Re-expresses findings the engine already produced as a short decision brief.
 * It never changes severity or trust: it only reorders, groups, and rewords.
 */
export function buildTransactionBrief(
  input: TransactionBriefInput,
): TransactionBrief {
  const checks = input.findings
    .filter(
      (
        finding,
      ): finding is Finding & { readonly severity: "critical" | "warning" } =>
        finding.severity === "critical" || finding.severity === "warning",
    )
    .sort(
      (a, b) =>
        Number(b.severity === "critical") - Number(a.severity === "critical"),
    )
    .map((finding) => ({
      key: finding.code,
      severity: finding.severity,
      title: finding.title,
      why: finding.detail,
      action: findingQuickAction(finding),
    }));

  const notes = [
    ...new Map(
      input.evidenceFindings
        .filter((finding) => finding.severity === "info")
        .map((finding) => {
          const note = findingNote(finding);
          return [
            note.title,
            {
              key: finding.code,
              normal:
                finding.code.startsWith("expected-") ||
                finding.code === "silo-approved-market",
              ...note,
            },
          ] as const;
        }),
    ).values(),
  ];

  return {
    verdict: resolveVerdict(input, checks),
    ...describeEffects(input),
    rows: buildRows(input.treasuryChecks),
    todo: buildTodo(input, checks),
    checks,
    notes,
    confirmations: buildConfirmations(input.routeChecks, input.treasuryChecks),
  };
}
