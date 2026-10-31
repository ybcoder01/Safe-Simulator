import type {
  Address,
  DecodedCall,
  Finding,
  Hex,
  SafeTransaction,
} from "../../domain";

const MAX_CALLS = 64;
const MAX_DEPTH = 8;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

interface HighRiskIntent {
  readonly code:
    | "safe-owner-change"
    | "safe-threshold-change"
    | "safe-module-change"
    | "safe-guard-change"
    | "safe-fallback-handler-change"
    | "safe-implementation-change"
    | "proxy-implementation-change"
    | "proxy-admin-change";
  readonly title: string;
  readonly detail: string;
}

const HIGH_RISK_SELECTORS: Readonly<Record<string, HighRiskIntent>> = {
  // Safe account authority changes.
  "0x0d582f13": {
    code: "safe-owner-change",
    title: "The Safe owner list will change",
    detail:
      "The calldata requests adding an owner. Verify the complete owner address and resulting threshold with every signer.",
  },
  "0xf8dc5dd9": {
    code: "safe-owner-change",
    title: "The Safe owner list will change",
    detail:
      "The calldata requests removing an owner. Verify the owner and resulting threshold with every signer.",
  },
  "0xe318b52b": {
    code: "safe-owner-change",
    title: "The Safe owner list will change",
    detail:
      "The calldata requests replacing an owner. Verify both complete owner addresses with every signer.",
  },
  "0x694e80c3": {
    code: "safe-threshold-change",
    title: "The Safe signing threshold will change",
    detail:
      "The calldata requests a new approval threshold. Confirm that it preserves the intended signer policy.",
  },
  "0x610b5925": {
    code: "safe-module-change",
    title: "A Safe module will be enabled",
    detail:
      "An enabled module can execute transactions without the normal signer flow. Verify its exact address and code.",
  },
  "0xe009cfde": {
    code: "safe-module-change",
    title: "A Safe module will be disabled",
    detail:
      "The calldata changes module authority. Verify the module being removed and the resulting control path.",
  },
  "0xe19a9dd9": {
    code: "safe-guard-change",
    title: "The Safe guard will change",
    detail:
      "The guard controls transaction checks. Verify the complete guard address and its published code.",
  },
  "0xf08a0323": {
    code: "safe-fallback-handler-change",
    title: "The Safe fallback handler will change",
    detail:
      "The fallback handler can affect signature and callback behavior. Verify the complete handler address.",
  },
  "0x7de7edef": {
    code: "safe-implementation-change",
    title: "The Safe implementation will change",
    detail:
      "The calldata requests replacing the Safe singleton implementation. Do not approve without independent deployment verification.",
  },

  // Common EVM proxy and diamond control surfaces.
  "0x3659cfe6": {
    code: "proxy-implementation-change",
    title: "A proxy implementation will change",
    detail:
      "upgradeTo replaces the code executed by a proxy. Verify the new implementation from an independent official source.",
  },
  "0x4f1ef286": {
    code: "proxy-implementation-change",
    title: "A proxy implementation will change and run setup calldata",
    detail:
      "upgradeToAndCall replaces proxy code and immediately executes additional calldata. Verify both the implementation and setup action.",
  },
  "0x1f931c1c": {
    code: "proxy-implementation-change",
    title: "Diamond proxy facets will change",
    detail:
      "diamondCut can add, replace, or remove executable functions. Review every facet and selector before approval.",
  },
  "0x8f283970": {
    code: "proxy-admin-change",
    title: "A proxy administrator will change",
    detail:
      "The new administrator can control future upgrades. Verify the complete admin address and governance process.",
  },
};

function selector(data: Hex): string {
  return data.length >= 10
    ? data.slice(0, 10).toLowerCase()
    : data.toLowerCase();
}

function address(value: string | null | undefined): Address | null {
  return value && ADDRESS_PATTERN.test(value) ? (value as Address) : null;
}

function nestedCalls(call: DecodedCall): readonly DecodedCall[] {
  return call.parameters.flatMap((parameter) => parameter.nestedCalls);
}

/**
 * Detects authority-changing intent directly from calldata. This is deliberately
 * independent of simulation and receipt evidence so a missing trace cannot hide
 * a pending Safe, proxy, or diamond control change.
 */
export function detectHighRiskCallIntents(
  transaction: Pick<SafeTransaction, "to" | "data">,
  decoded: DecodedCall | null,
): readonly Finding[] {
  const findings = new Map<string, Finding>();
  let visited = 0;

  function inspect(data: Hex, target: Address, depth: number) {
    if (depth > MAX_DEPTH || visited >= MAX_CALLS) return;
    visited += 1;
    const intent = HIGH_RISK_SELECTORS[selector(data)];
    if (!intent) return;

    const key = `${intent.code}:${target.toLowerCase()}`;
    findings.set(key, {
      code: intent.code,
      severity: "critical",
      title: intent.title,
      detail: intent.detail,
      addresses: [target],
    });
  }

  function visit(call: DecodedCall, depth: number) {
    if (depth > MAX_DEPTH || visited >= MAX_CALLS) return;
    const target = address(call.to);
    if (target && call.data) inspect(call.data, target, depth);
    for (const child of nestedCalls(call)) visit(child, depth + 1);
  }

  inspect(transaction.data, transaction.to, 0);
  if (decoded) {
    for (const child of nestedCalls(decoded)) visit(child, 1);
  }

  return [...findings.values()];
}
