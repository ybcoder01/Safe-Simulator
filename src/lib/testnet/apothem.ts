import {
  decodeFunctionData,
  formatEther,
  getAddress,
  maxUint256,
  toFunctionSelector,
  type Address,
  type Hex,
} from "viem";

export const APOTHEM_CHAIN_ID = 51;
export const APOTHEM_EXPLORER_URL = "https://testnet.xdcscan.com";
export const APOTHEM_FAUCET_URL = "https://faucet.apothem.network";
export const APOTHEM_PUBLIC_RPC_URLS = [
  "https://rpc.apothem.network",
  "https://apothem.xdcrpc.com",
  "https://erpc.apothem.network",
] as const;

const SAFE_EXEC_TRANSACTION_ABI = [
  {
    type: "function",
    name: "execTransaction",
    stateMutability: "payable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
      { name: "safeTxGas", type: "uint256" },
      { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" },
      { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" },
      { name: "signatures", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

const SELECTORS = {
  approve: toFunctionSelector("approve(address,uint256)"),
  route: toFunctionSelector("route(address,address,uint256)"),
  multicall: toFunctionSelector("multicall(bytes[])"),
  upgradeTo: toFunctionSelector("upgradeTo(address)"),
  upgradeToAndCall: toFunctionSelector("upgradeToAndCall(address,bytes)"),
  enableModule: toFunctionSelector("enableModule(address)"),
  setGuard: toFunctionSelector("setGuard(address)"),
  setFallbackHandler: toFunctionSelector("setFallbackHandler(address)"),
  addOwnerWithThreshold: toFunctionSelector(
    "addOwnerWithThreshold(address,uint256)",
  ),
  changeThreshold: toFunctionSelector("changeThreshold(uint256)"),
  swapOwner: toFunctionSelector("swapOwner(address,address,address)"),
  removeOwner: toFunctionSelector(
    "removeOwner(address,address,uint256)",
  ),
} as const;

export type ApothemSeverity = "warning" | "critical";

export interface ApothemFinding {
  readonly code: string;
  readonly severity: ApothemSeverity;
  readonly title: string;
  readonly explanation: string;
}

export interface EffectiveApothemCall {
  readonly target: Address;
  readonly value: bigint;
  readonly data: Hex;
  readonly operation: "call" | "delegatecall";
  readonly wrappedBySafe: boolean;
}

export interface ApothemInspection {
  readonly network: "XDC Apothem";
  readonly chainId: 51;
  readonly transactionHash: Hex;
  readonly explorerUrl: string;
  readonly status: "pending" | "success" | "reverted";
  readonly blockNumber: string | null;
  readonly sender: Address;
  readonly outerTarget: Address | null;
  readonly effectiveCall: {
    readonly target: Address;
    readonly value: string;
    readonly valueTxdc: string;
    readonly operation: "call" | "delegatecall";
    readonly selector: Hex;
    readonly wrappedBySafe: boolean;
  };
  readonly verdict: "review" | "stop";
  readonly findings: readonly ApothemFinding[];
}

function word(data: Hex, index: number): string | null {
  const start = 10 + index * 64;
  const value = data.slice(start, start + 64);
  return value.length === 64 ? value : null;
}

function wordAddress(data: Hex, index: number): Address | null {
  const value = word(data, index);
  if (!value) return null;
  try {
    return getAddress(`0x${value.slice(24)}`);
  } catch {
    return null;
  }
}

function wordUint(data: Hex, index: number): bigint | null {
  const value = word(data, index);
  return value ? BigInt(`0x${value}`) : null;
}

export function unwrapSafeExecution(
  outerTarget: Address,
  outerValue: bigint,
  input: Hex,
): EffectiveApothemCall {
  try {
    const decoded = decodeFunctionData({
      abi: SAFE_EXEC_TRANSACTION_ABI,
      data: input,
    });
    if (decoded.functionName === "execTransaction") {
      const [target, value, data, operation] = decoded.args;
      return {
        target: getAddress(target),
        value,
        data,
        operation: operation === 1 ? "delegatecall" : "call",
        wrappedBySafe: true,
      };
    }
  } catch {
    // A normal contract call is expected to fail Safe execTransaction decoding.
  }

  return {
    target: outerTarget,
    value: outerValue,
    data: input,
    operation: "call",
    wrappedBySafe: false,
  };
}

function safeControlFinding(selector: Hex): ApothemFinding | null {
  const controlSelectors = new Set<Hex>([
    SELECTORS.enableModule,
    SELECTORS.setGuard,
    SELECTORS.setFallbackHandler,
    SELECTORS.addOwnerWithThreshold,
    SELECTORS.changeThreshold,
    SELECTORS.swapOwner,
    SELECTORS.removeOwner,
  ]);
  if (!controlSelectors.has(selector)) return null;
  return {
    code: "safe-control-change",
    severity: "critical",
    title: "Safe ownership or security controls are changing",
    explanation:
      "The call can change owners, threshold, modules, guard, or fallback behavior. Confirm the exact new configuration with every required signer.",
  };
}

export function classifyApothemCall(
  call: EffectiveApothemCall,
): readonly ApothemFinding[] {
  const findings: ApothemFinding[] = [];
  const selector = call.data.length >= 10 ? (call.data.slice(0, 10) as Hex) : "0x";

  if (call.operation === "delegatecall") {
    findings.push({
      code: "delegatecall-operation",
      severity: "critical",
      title: "External code would run with the Safe’s authority",
      explanation:
        "Delegatecall executes another contract in the caller’s storage context. Unexpected delegated code can change owners, modules, guards, or other security state.",
    });
  }

  if (selector === SELECTORS.approve) {
    const spender = wordAddress(call.data, 0);
    const amount = wordUint(call.data, 1);
    findings.push({
      code:
        amount === maxUint256
          ? "unlimited-token-approval"
          : "token-approval",
      severity: amount === maxUint256 ? "critical" : "warning",
      title:
        amount === maxUint256
          ? "Unlimited token spending access is being granted"
          : "Token spending access is being granted",
      explanation:
        amount === maxUint256
          ? `${spender ?? "The spender"} could pull the token balance now and in the future without another approval.`
          : `Confirm ${spender ?? "the spender"} and the exact allowance before approving.`,
    });
  }

  if (selector === SELECTORS.route) {
    const recipient = wordAddress(call.data, 1);
    findings.push({
      code: "recipient-in-calldata",
      severity: "critical",
      title: "A recipient is supplied inside router calldata",
      explanation: `The effective recipient is ${recipient ?? "not decodable"}. Compare the full address with the independently approved treasury instruction.`,
    });
  }

  if (selector === SELECTORS.multicall) {
    findings.push({
      code: "nested-multicall",
      severity: "warning",
      title: "The transaction contains nested calls",
      explanation:
        "Review every subcall, value, recipient, approval, callback, and route target. A safe-looking outer contract does not make every nested action safe.",
    });
  }

  if (
    selector === SELECTORS.upgradeTo ||
    selector === SELECTORS.upgradeToAndCall
  ) {
    findings.push({
      code: "proxy-implementation-change",
      severity: "critical",
      title: "The contract implementation is being replaced",
      explanation:
        "A proxy keeps the same address while changing the code that runs. Existing address trust and token approvals must not carry over without a new code review.",
    });
  }

  const controlFinding = safeControlFinding(selector);
  if (controlFinding) findings.push(controlFinding);

  if (call.value > 0n) {
    findings.push({
      code: "native-value-transfer",
      severity: "warning",
      title: "The call also sends native TXDC",
      explanation: `${formatEther(call.value)} TXDC is attached to the call. Confirm that the written request explicitly includes this payment.`,
    });
  }

  if (findings.length === 0) {
    findings.push({
      code: "unrecognized-testnet-call",
      severity: "warning",
      title: "The call is not one of the recognized training patterns",
      explanation:
        "No critical training signature matched. This is not a safety clearance; verify target identity, calldata, recipients, permissions, and final balance changes.",
    });
  }

  return findings;
}

export function apothemSelector(data: Hex): Hex {
  return data.length >= 10 ? (data.slice(0, 10) as Hex) : "0x";
}
