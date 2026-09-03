import { findContractRegistryEntry } from "../trust/contract-registry";
import type { SafeTransaction } from "../../domain";

export type TransactionActivityType =
  | "approval"
  | "transfer"
  | "swap"
  | "lending"
  | "bridge"
  | "safe-configuration"
  | "batch"
  | "liquidity"
  | "delegatecall"
  | "contract-call";

export interface TransactionActivity {
  readonly type: TransactionActivityType;
  readonly label: string;
  readonly basis:
    | "selector"
    | "reviewed-target"
    | "native-value"
    | "operation"
    | "fallback";
}

const selectorActivities: Readonly<
  Record<string, Pick<TransactionActivity, "type" | "label">>
> = {
  "0x095ea7b3": { type: "approval", label: "Token approval" },
  "0xa22cb465": { type: "approval", label: "Operator approval" },
  "0x39509351": { type: "approval", label: "Increase allowance" },
  "0xa457c2d7": { type: "approval", label: "Decrease allowance" },
  "0xd505accf": { type: "approval", label: "Permit approval" },
  "0xa9059cbb": { type: "transfer", label: "Token transfer" },
  "0x23b872dd": { type: "transfer", label: "Delegated token transfer" },
  "0x42842e0e": { type: "transfer", label: "NFT transfer" },
  "0xb88d4fde": { type: "transfer", label: "NFT transfer with data" },
  "0x8d80ff0a": { type: "batch", label: "Safe batch" },
  "0x3593564c": { type: "batch", label: "Routed command batch" },
  "0x610b5925": { type: "safe-configuration", label: "Enable Safe module" },
  "0xe009cfde": { type: "safe-configuration", label: "Disable Safe module" },
  "0xe19a9dd9": { type: "safe-configuration", label: "Change Safe guard" },
  "0x694e80c3": { type: "safe-configuration", label: "Change threshold" },
  "0xe318b52b": { type: "safe-configuration", label: "Replace owner" },
  "0x0d582f13": { type: "safe-configuration", label: "Add owner" },
  "0xf8dc5dd9": { type: "safe-configuration", label: "Remove owner" },
  "0x414bf389": { type: "swap", label: "Exact-input swap" },
  "0xc04b8d59": { type: "swap", label: "Exact-input routed swap" },
  "0xdb3e2198": { type: "swap", label: "Exact-output swap" },
  "0xf28c0498": { type: "swap", label: "Exact-output routed swap" },
  "0x38ed1739": { type: "swap", label: "Exact-input token swap" },
  "0x8803dbee": { type: "swap", label: "Exact-output token swap" },
  "0x7ff36ab5": { type: "swap", label: "Native-to-token swap" },
  "0x18cbafe5": { type: "swap", label: "Token-to-native swap" },
  "0x617ba037": { type: "lending", label: "Supply to lending market" },
  "0xe8eda9df": { type: "lending", label: "Deposit to lending market" },
  "0x69328dec": { type: "lending", label: "Withdraw from lending market" },
  "0xa415bcad": { type: "lending", label: "Borrow from lending market" },
  "0x573ade81": { type: "lending", label: "Repay lending position" },
};

const lendingRoles = new Set([
  "lending-pool",
  "lending-router",
  "lending-configurator",
  "liquidation-helper",
]);

const bridgeRoles = new Set([
  "bridge-messaging",
  "bridge-token",
  "bridge-wrapper",
]);

const dexRoles = new Set(["dex-router"]);

const liquidityRoles = new Set(["position-manager", "vault", "staking", "zap"]);

export function classifyTransactionActivity(
  transaction: Pick<
    SafeTransaction,
    "safe" | "to" | "data" | "operation" | "value"
  >,
): TransactionActivity {
  const selector = transaction.data.slice(0, 10).toLowerCase();
  const selected = selectorActivities[selector];
  if (selected) return { ...selected, basis: "selector" };

  if (transaction.data === "0x" && transaction.value > 0n) {
    return {
      type: "transfer",
      label: "Native asset transfer",
      basis: "native-value",
    };
  }

  const target = findContractRegistryEntry(
    transaction.safe.chainId,
    transaction.to,
  );
  if (target) {
    if (lendingRoles.has(target.role)) {
      return {
        type: "lending",
        label: "Lending protocol interaction",
        basis: "reviewed-target",
      };
    }
    if (bridgeRoles.has(target.role)) {
      return {
        type: "bridge",
        label: "Bridge interaction",
        basis: "reviewed-target",
      };
    }
    if (dexRoles.has(target.role)) {
      return {
        type: "swap",
        label: "DEX router interaction",
        basis: "reviewed-target",
      };
    }
    if (liquidityRoles.has(target.role)) {
      return {
        type: "liquidity",
        label: "Liquidity position interaction",
        basis: "reviewed-target",
      };
    }
  }

  if (transaction.operation === "delegatecall") {
    return {
      type: "delegatecall",
      label: "Delegate call",
      basis: "operation",
    };
  }

  return {
    type: "contract-call",
    label: transaction.data === "0x" ? "Empty contract call" : "Contract call",
    basis: "fallback",
  };
}
