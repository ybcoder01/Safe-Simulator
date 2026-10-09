import { describe, expect, it } from "vitest";

import type { Finding } from "../../../src/core/domain";
import {
  buildTransactionBrief,
  type TransactionBriefInput,
} from "../../../src/lib/transaction-brief";

const safe = "0x1111111111111111111111111111111111111111";
const market = "0x2222222222222222222222222222222222222222";
const zero = "0x0000000000000000000000000000000000000000";

function finding(
  code: string,
  severity: Finding["severity"],
  title = code,
): Finding {
  return { code, severity, title, detail: `${title} detail`, addresses: [] };
}

function input(
  overrides: Partial<TransactionBriefInput> = {},
): TransactionBriefInput {
  return {
    signal: "clear",
    signalDetail: "Detail",
    status: "pending",
    safeAddress: safe,
    movements: [],
    infiniteApproval: false,
    approvalChangeCount: 0,
    configChangeCount: 0,
    findings: [],
    evidenceFindings: [],
    routeChecks: [],
    treasuryChecks: [],
    ...overrides,
  };
}

const withdrawal = [
  {
    direction: "inbound" as const,
    from: market,
    to: safe,
    amount: "1,200",
    symbol: "USDC",
  },
  {
    direction: "outbound" as const,
    from: safe,
    to: zero,
    amount: "1,198",
    symbol: "sUSDC",
  },
];

describe("buildTransactionBrief", () => {
  it("describes what the Safe receives and turns in, in one sentence", () => {
    const brief = buildTransactionBrief(input({ movements: withdrawal }));

    expect(brief.sentence).toBe(
      "Your Safe receives 1,200 USDC and turns in 1,198 sUSDC.",
    );
    expect(brief.effects).toContain("No spending permissions change.");
    expect(brief.effects).toContain(
      "Owners and security settings stay the same.",
    );
  });

  it("uses the past tense once the transaction has executed", () => {
    const brief = buildTransactionBrief(
      input({ movements: withdrawal, status: "executed" }),
    );

    expect(brief.sentence).toBe(
      "Your Safe received 1,200 USDC and turned in 1,198 sUSDC.",
    );
    expect(brief.verdict.label).toBe("Went through as expected");
  });

  it("says plainly when nothing moves", () => {
    expect(buildTransactionBrief(input()).sentence).toBe(
      "No tokens move in or out of your Safe.",
    );
  });

  it("ignores movements between other contracts in the headline", () => {
    const brief = buildTransactionBrief(
      input({
        movements: [
          {
            direction: "external",
            from: market,
            to: "0x3333333333333333333333333333333333333333",
            amount: "5",
            symbol: "WXDC",
          },
        ],
      }),
    );

    expect(brief.sentence).toBe("No tokens move in or out of your Safe.");
  });

  it("flags unlimited permissions and Safe control changes", () => {
    const brief = buildTransactionBrief(
      input({ infiniteApproval: true, configChangeCount: 2 }),
    );

    expect(brief.effects).toContain(
      "A contract gets unlimited permission to spend your tokens.",
    );
    expect(brief.effects).toContain(
      "Changes who controls your Safe (2 settings).",
    );
  });

  it("maps each safety signal to one of the plain verdicts", () => {
    expect(buildTransactionBrief(input()).verdict.label).toBe(
      "Matches what you'd expect",
    );
    expect(
      buildTransactionBrief(
        input({
          signal: "review",
          findings: [finding("silo-permissionless-market", "warning")],
        }),
      ).verdict,
    ).toMatchObject({ id: "check", label: "Needs a check" });
    expect(
      buildTransactionBrief(
        input({
          signal: "blocked",
          findings: [finding("safe-control-change", "critical", "Control")],
        }),
      ).verdict,
    ).toMatchObject({ id: "stop", label: "Do not sign yet" });
    expect(buildTransactionBrief(input({ signal: "unknown" })).verdict.id).toBe(
      "unverified",
    );
  });

  it("softens the stop wording for a transaction that already ran", () => {
    const brief = buildTransactionBrief(
      input({
        signal: "blocked",
        status: "executed",
        findings: [finding("safe-control-change", "critical")],
      }),
    );

    expect(brief.verdict.label).toBe("Went through, investigate now");
  });

  it("lists critical checks first with one short action each", () => {
    const brief = buildTransactionBrief(
      input({
        signal: "blocked",
        findings: [
          finding("silo-permissionless-market", "warning"),
          finding("safe-control-change", "critical"),
        ],
      }),
    );

    expect(brief.checks.map((item) => item.key)).toEqual([
      "safe-control-change",
      "silo-permissionless-market",
    ]);
    expect(brief.checks[1]?.action).toContain("your team chose this");
  });

  it("separates harmless notes and drops duplicates", () => {
    const brief = buildTransactionBrief(
      input({
        evidenceFindings: [
          finding("expected-safe-proxy-delegation", "info"),
          finding("expected-internal-proxy-delegation", "info"),
          finding("expected-target-proxy-delegation", "info"),
          finding("something-unknown", "info", "Custom note"),
          finding("silo-permissionless-market", "warning"),
        ],
      }),
    );

    expect(brief.notes.map((note) => note.title)).toEqual([
      "Normal Safe wallet behavior",
      "Normal upgradeable-contract behavior",
      "Custom note",
    ]);
  });

  it("puts unconfirmed items before confirmed ones", () => {
    const brief = buildTransactionBrief(
      input({
        routeChecks: [
          { key: "destination", status: "pass", title: "Router", detail: "ok" },
          { key: "route", status: "review", title: "Route", detail: "open" },
        ],
      }),
    );

    expect(brief.confirmations.map((row) => row.confirmed)).toEqual([
      false,
      true,
    ]);
  });
});
