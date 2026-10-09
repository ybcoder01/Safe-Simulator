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

export interface BriefNote {
  readonly key: string;
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
  readonly checks: readonly BriefCheckItem[];
  readonly notes: readonly BriefNote[];
  readonly confirmations: readonly BriefConfirmation[];
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_LISTED_AMOUNTS = 3;

const PENDING_LABELS: Readonly<Record<BriefVerdictId, string>> = {
  expected: "Matches what you'd expect",
  check: "Needs a check",
  stop: "Do not sign yet",
  unverified: "Couldn't be checked yet",
};

const EXECUTED_LABELS: Readonly<Record<BriefVerdictId, string>> = {
  expected: "Went through as expected",
  check: "Went through, but worth a check",
  stop: "Went through, investigate now",
  unverified: "Went through, couldn't be fully checked",
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
        reason: executed
          ? "The checks we could run found no known risks. Compare the amounts and recipients below with what your team intended."
          : "The checks we could run found no known risks. Still compare the amount and recipient with the original request.",
      };
    case "blocked": {
      const critical = checks.find((item) => item.severity === "critical");
      return {
        id: "stop",
        label: labels.stop,
        reason: critical
          ? `${critical.title}. ${critical.action}`
          : input.signalDetail,
      };
    }
    case "review": {
      const count = checks.length;
      return {
        id: "check",
        label: labels.check,
        reason:
          count > 0
            ? `${count} ${plural(count, "thing", "things")} to confirm${executed ? "" : " before you sign"}. ${plural(count, "It is a check", "These are checks")} we could not finish, not ${plural(count, "a sign", "signs")} that funds are lost.`
            : input.signalDetail,
      };
    }
    case "unknown":
      return {
        id: "unverified",
        label: labels.unverified,
        reason: input.signalDetail,
      };
  }
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
  if (money.length > 0) {
    effects.push(...money.map((item) => `Your Safe ${item}.`));
  } else {
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
          return [note.title, { key: finding.code, ...note }] as const;
        }),
    ).values(),
  ];

  return {
    verdict: resolveVerdict(input, checks),
    ...describeEffects(input),
    checks,
    notes,
    confirmations: buildConfirmations(input.routeChecks, input.treasuryChecks),
  };
}
