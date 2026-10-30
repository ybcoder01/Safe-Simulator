import type { Metadata } from "next";
import Link from "next/link";

import {
  TransactionBriefPanel,
  type BriefFlowRow,
} from "@/components/safes/transaction-brief";
import type { AlertStage } from "@/lib/alert-stage";
import type { TransactionBrief } from "@/lib/transaction-brief";

export const metadata: Metadata = {
  title: "Dummy malicious transactions",
  description:
    "A Safe Inspector training lab with synthetic transactions for common treasury attack patterns.",
  robots: { index: false, follow: false },
};

const SAFE_ADDRESS = "0x000000000000000000000000000000000000d000";

const pendingStage: AlertStage = {
  id: "collecting-signatures",
  label: "Dummy · Waiting for signatures",
  detail: "This is a static training example. It cannot be signed or executed.",
  open: true,
};

type AttackCategory =
  | "Recipient"
  | "Permission"
  | "Safe control"
  | "Contract identity"
  | "Trading"
  | "Signature"
  | "Bridge"
  | "Token behavior";

interface AttackScenario {
  readonly id: string;
  readonly nonce: number;
  readonly category: AttackCategory;
  readonly title: string;
  readonly method: string;
  readonly summary: string;
  readonly identity: string;
  readonly recipient: string;
  readonly permissions: string;
  readonly simulation: string;
  readonly effects: readonly string[];
  readonly checkTitle: string;
  readonly why: string;
  readonly action: string;
  readonly target: string;
  readonly targetLabel: string;
  readonly flow?: BriefFlowRow;
}

function dummyAddress(id: number): string {
  return `0x${id.toString(16).padStart(40, "0")}`;
}

const ATTACKS: readonly AttackScenario[] = [
  {
    id: "recipient-injection",
    nonce: 301,
    category: "Recipient",
    title: "Recipient address was silently replaced",
    method: "Address poisoning / wallet injection",
    summary:
      "This transfer sends 825,000 USDC to a new wallet instead of the supplier address approved by your team.",
    identity:
      "The transfer contract is standard, but that does not verify the recipient.",
    recipient:
      "The full recipient differs from the approved address, despite a similar prefix and suffix.",
    permissions: "No new token permission is requested.",
    simulation:
      "The transfer succeeds and the new wallet receives 825,000 USDC.",
    effects: [
      "Transfers 825,000 USDC to a newly seen wallet.",
      "Leaves no automatic way to reverse the payment.",
    ],
    checkTitle: "The payment destination was injected",
    why: "The calldata recipient does not match the independently approved treasury request. A lookalike address can survive a shortened-address visual check.",
    action: "Reject it and verify the full recipient through a second channel.",
    target: dummyAddress(0xd101),
    targetLabel: "USDC token (dummy)",
    flow: {
      key: "recipient-injection-flow",
      direction: "outbound",
      amount: "825,000",
      symbol: "USDC",
      from: SAFE_ADDRESS,
      to: dummyAddress(0xd102),
    },
  },
  {
    id: "unlimited-approval",
    nonce: 302,
    category: "Permission",
    title: "Unknown spender receives unlimited token access",
    method: "Unlimited ERC-20 approval",
    summary:
      "This transaction lets an unknown contract pull any amount of USDC from the Safe now or later.",
    identity:
      "The spender is not an official deployment of the named protocol.",
    recipient:
      "No tokens move during this approval, which can make the request look harmless.",
    permissions:
      "The allowance is unlimited and remains active after this transaction.",
    simulation:
      "The approval succeeds; a later call can drain the Safe without another approval.",
    effects: [
      "Sets the USDC allowance to the maximum possible value.",
      "Applies to future USDC deposited into the Safe as well.",
    ],
    checkTitle: "Unlimited spending access is being granted",
    why: "The new spender can use transferFrom later, so a successful simulation with no immediate loss does not make the approval safe.",
    action:
      "Use the exact amount and verify the spender against official records.",
    target: dummyAddress(0xd201),
    targetLabel: "Unknown spender (dummy)",
  },
  {
    id: "malicious-module",
    nonce: 303,
    category: "Safe control",
    title: "A module can bypass normal owner approvals",
    method: "Malicious Safe module",
    summary:
      "This transaction enables an unknown Safe module that could execute future transfers outside the normal signature flow.",
    identity:
      "The module is newly deployed and is not on the team’s approved module list.",
    recipient:
      "No immediate recipient appears because the module creates a future execution path.",
    permissions:
      "The module receives authority to execute transactions from the Safe.",
    simulation:
      "The module becomes enabled even though the Safe balance does not change yet.",
    effects: [
      "Adds an unknown address to the Safe module list.",
      "Creates a path that may bypass the current owner threshold.",
    ],
    checkTitle: "An unapproved module is taking control",
    why: "Enabled modules can have powerful execution rights. The danger is persistent and may only become visible in a later transaction.",
    action:
      "Only enable modules approved by the required Safe owners and matched by code hash.",
    target: dummyAddress(0xd301),
    targetLabel: "Unknown Safe module (dummy)",
  },
  {
    id: "threshold-takeover",
    nonce: 304,
    category: "Safe control",
    title: "Signing policy changes from 2-of-3 to 1-of-3",
    method: "Owner and threshold takeover",
    summary:
      "This transaction adds a new owner and reduces the Safe threshold, allowing one wallet to control the treasury.",
    identity:
      "The call targets the Safe itself through a batched configuration change.",
    recipient: "The newly added owner has never signed for this Safe.",
    permissions: "One signer would gain unilateral transaction authority.",
    simulation:
      "The owner set changes and the required signatures fall from two to one.",
    effects: [
      "Adds a new Safe owner.",
      "Changes the signing threshold from 2-of-3 to 1-of-3.",
    ],
    checkTitle: "The Safe can be controlled by one wallet",
    why: "The transaction changes governance rather than merely moving funds. After execution, the new owner could drain the Safe alone.",
    action: "Reject any unexpected owner or threshold change.",
    target: SAFE_ADDRESS,
    targetLabel: "Your Safe (dummy)",
  },
  {
    id: "delegatecall-takeover",
    nonce: 305,
    category: "Safe control",
    title: "Unknown code runs inside the Safe",
    method: "Delegatecall / storage takeover",
    summary:
      "This transaction runs unverified code in the Safe’s storage context, where it can rewrite security settings.",
    identity:
      "The delegated implementation does not match the reviewed library.",
    recipient:
      "A hidden native-token transfer is embedded in the delegated execution.",
    permissions:
      "The code can alter owners, modules, guards, allowances, or storage directly.",
    simulation:
      "The call succeeds while changing the owner slot and sending 175 XDC away.",
    effects: [
      "Executes unknown bytecode with delegatecall.",
      "Writes to Safe storage and sends 175 XDC to a new wallet.",
    ],
    checkTitle: "Delegatecall gives unknown code the Safe’s authority",
    why: "Delegatecall executes foreign code against the caller’s storage. A harmless-looking method name cannot constrain what the code changes.",
    action:
      "Require the exact implementation and expected storage changes to be independently verified.",
    target: dummyAddress(0xd501),
    targetLabel: "Unverified library (dummy)",
    flow: {
      key: "delegatecall-flow",
      direction: "outbound",
      amount: "175",
      symbol: "XDC",
      from: SAFE_ADDRESS,
      to: dummyAddress(0xd502),
    },
  },
  {
    id: "proxy-upgrade",
    nonce: 306,
    category: "Contract identity",
    title: "A familiar proxy now runs different code",
    method: "Malicious proxy implementation upgrade",
    summary:
      "The contract address is familiar, but its implementation changed after your team trusted it.",
    identity:
      "The proxy address matches history; the implementation and runtime code hash do not.",
    recipient:
      "Funds would enter a contract whose new withdrawal logic is unknown.",
    permissions:
      "Existing approvals to the proxy may now be usable by the upgraded code.",
    simulation:
      "The deposit succeeds, but the new implementation can redirect later withdrawals.",
    effects: [
      "Uses a previously seen proxy with a new implementation.",
      "Reuses permissions granted before the code changed.",
    ],
    checkTitle: "Trusted address, untrusted implementation",
    why: "Proxy upgrades preserve the public address while changing the code that actually runs. Address history alone is insufficient.",
    action:
      "Require a fresh review whenever the implementation or runtime hash changes.",
    target: dummyAddress(0xd601),
    targetLabel: "Upgraded vault proxy (dummy)",
  },
  {
    id: "permit-replay",
    nonce: 307,
    category: "Signature",
    title: "A signed permit can be replayed on the wrong domain",
    method: "Permit / EIP-712 replay",
    summary:
      "This permission references the wrong verifying contract and has no safe expiry, making reuse possible.",
    identity:
      "The typed-data domain does not match the contract receiving the permit.",
    recipient: "The permit names a spender your team did not approve.",
    permissions:
      "The signature grants token access without a normal on-chain approval transaction.",
    simulation:
      "The permit is accepted and the spender immediately pulls 400,000 USDC.",
    effects: [
      "Consumes a signature under a mismatched domain.",
      "Transfers 400,000 USDC through permit-based authority.",
    ],
    checkTitle: "The signature scope does not match this request",
    why: "Chain, verifying contract, nonce, spender, amount, and deadline must bind the permission to one intended use.",
    action:
      "Reject the signature and recreate it with the correct domain and a short expiry.",
    target: dummyAddress(0xd701),
    targetLabel: "Permit spender (dummy)",
    flow: {
      key: "permit-flow",
      direction: "outbound",
      amount: "400,000",
      symbol: "USDC",
      from: SAFE_ADDRESS,
      to: dummyAddress(0xd702),
    },
  },
  {
    id: "price-manipulation",
    nonce: 308,
    category: "Trading",
    title: "The swap accepts almost any price",
    method: "Slippage / oracle manipulation",
    summary:
      "This swap sends 1,000,000 USDC through a low-liquidity pool with zero effective minimum output.",
    identity:
      "The router is known, but the selected pool and price source are not approved.",
    recipient:
      "Swap proceeds return to the Safe, but at a potentially manipulated rate.",
    permissions: "The router receives a bounded allowance for this trade.",
    simulation:
      "The swap succeeds while returning assets worth only about 410,000 USDC.",
    effects: [
      "Trades 1,000,000 USDC through a thin pool.",
      "Accepts output approximately 59% below the reference value.",
    ],
    checkTitle: "The trade has no meaningful price protection",
    why: "A zero or excessively low minimum output lets a manipulated pool, stale oracle, or sandwich attack produce a severe loss while still succeeding.",
    action:
      "Set a bounded minimum return and verify liquidity and price freshness.",
    target: dummyAddress(0xd801),
    targetLabel: "Thin liquidity pool (dummy)",
    flow: {
      key: "slippage-flow",
      direction: "outbound",
      amount: "1,000,000",
      symbol: "USDC",
      worth: { amount: "410,000", symbol: "USDC" },
      from: SAFE_ADDRESS,
      to: dummyAddress(0xd801),
    },
  },
  {
    id: "route-injection",
    nonce: 309,
    category: "Contract identity",
    title: "One internal call leaves the real protocol",
    method: "Counterfeit market / route injection",
    summary:
      "The main router is genuine, but one nested call reaches a lookalike market outside the official factory.",
    identity:
      "The entry contract is official; the injected internal market is not part of its approved deployment graph.",
    recipient: "The counterfeit market receives the deposited asset.",
    permissions:
      "The legitimate router forwards the Safe’s tokens into the injected route.",
    simulation:
      "The batch completes and 600,000 USDC remains in the counterfeit market.",
    effects: [
      "Calls an official router.",
      "Routes 600,000 USDC to an unrelated contract with a copied market name.",
    ],
    checkTitle: "A legitimate entry point hides a malicious internal target",
    why: "Checking only the top-level destination misses injected pools, hooks, markets, adapters, and callback targets.",
    action:
      "Verify every value-carrying internal target against the protocol’s on-chain relationships.",
    target: dummyAddress(0xd901),
    targetLabel: "Counterfeit market (dummy)",
    flow: {
      key: "route-flow",
      direction: "outbound",
      amount: "600,000",
      symbol: "USDC",
      from: SAFE_ADDRESS,
      to: dummyAddress(0xd901),
    },
  },
  {
    id: "bridge-mismatch",
    nonce: 310,
    category: "Bridge",
    title: "Bridge funds go to the wrong chain and receiver",
    method: "Cross-chain destination injection",
    summary:
      "This bridge request encodes a different destination network and receiver than the treasury instruction.",
    identity:
      "The bridge is genuine, but the encoded destination data is not the approved route.",
    recipient: "The destination-chain receiver is an unrelated wallet.",
    permissions: "The bridge receives exactly 300,000 USDC for this transfer.",
    simulation:
      "The source-chain deposit succeeds; local simulation cannot recover funds from the wrong destination.",
    effects: [
      "Locks 300,000 USDC on the source chain.",
      "Creates a message for the wrong destination chain and receiver.",
    ],
    checkTitle: "The cross-chain destination was replaced",
    why: "A correct source-chain contract does not prove the destination chain, token mapping, receiver, or minimum amount received.",
    action:
      "Verify all destination fields and the expected destination asset before signing.",
    target: dummyAddress(0xda01),
    targetLabel: "Bridge endpoint (dummy)",
    flow: {
      key: "bridge-flow",
      direction: "outbound",
      amount: "300,000",
      symbol: "USDC",
      from: SAFE_ADDRESS,
      to: dummyAddress(0xda01),
    },
  },
  {
    id: "guard-fallback-removal",
    nonce: 311,
    category: "Safe control",
    title: "The guard is removed and fallback logic replaced",
    method: "Guard / fallback-handler takeover",
    summary:
      "This batch disables the current transaction guard and installs an unknown fallback handler.",
    identity:
      "The replacement handler is unverified and has not been used by this Safe.",
    recipient:
      "There is no immediate transfer; the attack weakens future transaction enforcement.",
    permissions:
      "Protective checks are removed and new fallback behavior is introduced.",
    simulation:
      "The transaction succeeds and future calls no longer pass through the expected guard.",
    effects: [
      "Removes the Safe transaction guard.",
      "Replaces the fallback handler with an unknown contract.",
    ],
    checkTitle: "The Safe’s enforcement layer is being replaced",
    why: "Removing a guard or changing fallback behavior can disable policy checks or expose new callable behavior without moving funds immediately.",
    action:
      "Require explicit owner approval for every Safe security-component change.",
    target: dummyAddress(0xdb01),
    targetLabel: "Unknown fallback handler (dummy)",
  },
  {
    id: "token-hook",
    nonce: 312,
    category: "Token behavior",
    title: "A token callback creates an unexpected second transfer",
    method: "Token hook / reentrancy",
    summary:
      "The token invokes external code during transfer, causing a second asset movement not described by the request.",
    identity:
      "The token uses callback behavior that differs from a standard ERC-20 transfer.",
    recipient:
      "The intended recipient gets the token, while a callback sends WETH to another wallet.",
    permissions:
      "A previously granted allowance is consumed during the callback.",
    simulation:
      "The visible transfer succeeds and the callback also removes 90 WETH from the Safe.",
    effects: [
      "Transfers the requested token.",
      "Invokes a callback that transfers an additional 90 WETH.",
    ],
    checkTitle: "Token behavior triggers an unexpected external call",
    why: "Hooked, fee-on-transfer, rebasing, or malicious tokens can make event amounts and final balance changes diverge from a normal transfer.",
    action:
      "Compare complete balance and state deltas with the requested action.",
    target: dummyAddress(0xdc01),
    targetLabel: "Hooked token (dummy)",
    flow: {
      key: "hook-flow",
      direction: "outbound",
      amount: "90",
      symbol: "WETH",
      from: SAFE_ADDRESS,
      to: dummyAddress(0xdc02),
    },
  },
  {
    id: "nonce-reordering",
    nonce: 313,
    category: "Signature",
    title: "A conflicting nonce changes the reviewed outcome",
    method: "Nonce collision / transaction reordering",
    summary:
      "This transaction depends on another proposal executing first, but both compete for the same Safe nonce.",
    identity: "Both proposals are individually valid Safe transactions.",
    recipient:
      "Execution order determines which recipient and allowance state actually applies.",
    permissions:
      "A long-lived approval can survive after the expected companion transaction is replaced.",
    simulation:
      "The isolated simulation passes, but the real result changes when the conflicting proposal wins.",
    effects: [
      "Competes with another transaction at the same Safe nonce.",
      "Can execute against a different allowance and balance state than reviewed.",
    ],
    checkTitle: "The proposal was reviewed under the wrong ordering assumption",
    why: "Pending Safe transactions are state-dependent. Replacement, cancellation, or reordering can invalidate the reviewed simulation.",
    action:
      "Resolve nonce conflicts and re-simulate against the final intended order.",
    target: dummyAddress(0xdd01),
    targetLabel: "Order-dependent router (dummy)",
  },
  {
    id: "counterfeit-token",
    nonce: 314,
    category: "Token behavior",
    title: "A fake token copies a trusted symbol",
    method: "Counterfeit asset / decimal spoofing",
    summary:
      "This swap receives a newly deployed token named USDC with different code and decimals from the genuine asset.",
    identity:
      "The symbol and logo are familiar, but the token address and runtime code are not.",
    recipient:
      "The Safe receives the counterfeit token while sending genuine WETH away.",
    permissions:
      "The fake asset can mint, pause, blacklist, or report misleading balances.",
    simulation:
      "The swap succeeds and displays a large token count with almost no redeemable value.",
    effects: [
      "Sends 120 WETH to a new pool.",
      "Receives a counterfeit token using the USDC symbol and unusual decimals.",
    ],
    checkTitle: "The asset label is real-looking; the contract is not",
    why: "Names, symbols, logos, and formatted amounts are not unique identifiers. Decimal spoofing can also make a worthless amount look valuable.",
    action: "Identify every token by chain and full contract address.",
    target: dummyAddress(0xde01),
    targetLabel: "Counterfeit USDC (dummy)",
    flow: {
      key: "counterfeit-flow",
      direction: "outbound",
      amount: "120",
      symbol: "WETH",
      from: SAFE_ADDRESS,
      to: dummyAddress(0xde02),
    },
  },
  {
    id: "hidden-native-value",
    nonce: 315,
    category: "Recipient",
    title: "A normal contract call hides a native-token payment",
    method: "Calldata / native-value mismatch",
    summary:
      "The method looks like a read or token operation, but the transaction also sends 75,000 XDC to the target.",
    identity:
      "The target has no documented reason to receive native value for this method.",
    recipient:
      "The contract itself receives 75,000 XDC in addition to the visible token action.",
    permissions: "No lasting approval is created.",
    simulation:
      "The call succeeds and the Safe’s native balance falls by 75,000 XDC.",
    effects: [
      "Calls a method presented as a token claim.",
      "Attaches an unexpected 75,000 XDC native payment.",
    ],
    checkTitle: "The transaction value contradicts the described action",
    why: "Interfaces can emphasize calldata while hiding or minimizing the native value attached to the call.",
    action:
      "Compare the native value and all balance deltas with the written request.",
    target: dummyAddress(0xdf01),
    targetLabel: "Value-collecting contract (dummy)",
    flow: {
      key: "native-value-flow",
      direction: "outbound",
      amount: "75,000",
      symbol: "XDC",
      from: SAFE_ADDRESS,
      to: dummyAddress(0xdf01),
    },
  },
] as const;

function scenarioBrief(scenario: AttackScenario): TransactionBrief {
  return {
    verdict: {
      id: "stop",
      label: "Stop. Don’t sign this",
      reason: scenario.checkTitle,
    },
    sentence: scenario.summary,
    rows: [
      {
        key: "identity",
        status: "stop",
        label: "Who you’re dealing with",
        text: scenario.identity,
      },
      {
        key: "recipient",
        status: "stop",
        label: "Who gets the money",
        text: scenario.recipient,
      },
      {
        key: "permissions",
        status: "stop",
        label: "What it can access",
        text: scenario.permissions,
      },
      {
        key: "simulation",
        status: "stop",
        label: "Test run",
        text: scenario.simulation,
      },
    ],
    todo: [
      "Reject this dummy proposal and do not provide another signature.",
      scenario.action,
    ],
    effects: scenario.effects,
    checks: [
      {
        key: scenario.id,
        severity: "critical",
        title: scenario.checkTitle,
        why: scenario.why,
        action: scenario.action,
      },
    ],
    notes: [
      {
        key: `${scenario.id}-simulation-note`,
        normal: false,
        title: "A successful simulation does not mean safe",
        text: "Malicious transactions are usually designed to execute successfully. The resulting asset, permission, and control changes must also match your team’s intent.",
      },
    ],
    confirmations: [
      {
        key: `${scenario.id}-intent`,
        confirmed: false,
        label: "Matches the treasury request",
        text: "The simulated result does not match the independently approved action.",
      },
    ],
  };
}

function ScenarioPanel({ scenario }: { readonly scenario: AttackScenario }) {
  const flow = scenario.flow ? [scenario.flow] : [];
  const labels: Record<string, string> = {
    [scenario.target.toLowerCase()]: scenario.targetLabel,
  };
  if (scenario.flow) {
    labels[scenario.flow.to.toLowerCase()] =
      scenario.flow.to === scenario.target
        ? scenario.targetLabel
        : "Injected destination (dummy)";
  }

  return (
    <details className="attack-scenario" id={scenario.id}>
      <summary>
        <span className="attack-scenario-number">
          {String(scenario.nonce - 300).padStart(2, "0")}
        </span>
        <span>
          <small>{scenario.category}</small>
          <strong>{scenario.title}</strong>
          <em>{scenario.method}</em>
        </span>
        <span className="attack-scenario-status">Dummy · Block</span>
      </summary>
      <div className="attack-scenario-body">
        <header className="transaction-title attack-transaction-title">
          <div>
            <p className="eyebrow">
              Dummy Safe transaction · Nonce {scenario.nonce}
            </p>
            <h2>{scenario.title}</h2>
          </div>
          <div className="transaction-title-actions">
            <div className="transaction-title-labels">
              <span className="tx-activity">Training fixture</span>
              <span className="tx-status tx-pending">Never executable</span>
            </div>
          </div>
        </header>

        <TransactionBriefPanel
          addressBook={[]}
          brief={scenarioBrief(scenario)}
          chainId={50}
          executed={false}
          flow={flow}
          knownLabels={labels}
          safeAddress={SAFE_ADDRESS}
          stage={pendingStage}
          totalMovements={flow.length}
        />
      </div>
    </details>
  );
}

export default function MaliciousTransactionDemoPage() {
  const categories = new Set(ATTACKS.map((scenario) => scenario.category)).size;

  return (
    <main className="workspace shell attack-lab">
      <header className="workspace-header">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>Safe Inspector</span>
        </Link>
        <span className="read-only-pill">
          <i aria-hidden="true" /> Dummy data only · No signing
        </span>
      </header>

      <article className="transaction-detail">
        <Link className="dashboard-back" href="/">
          ← Safe Inspector home
        </Link>

        <header className="attack-lab-hero">
          <div>
            <p className="eyebrow">Safe Inspector attack lab</p>
            <h1>Dummy malicious transactions</h1>
            <p>
              See how the platform explains one attack at a time, in plain
              language, before an owner signs.
            </p>
          </div>
          <dl>
            <div>
              <dt>Examples</dt>
              <dd>{ATTACKS.length}</dd>
            </div>
            <div>
              <dt>Risk groups</dt>
              <dd>{categories}</dd>
            </div>
            <div>
              <dt>Real transactions</dt>
              <dd>0</dd>
            </div>
          </dl>
        </header>

        <div className="malicious-demo-notice" role="note">
          <strong>Ready for a real testnet transaction?</strong>
          <p>
            The <Link href="/demo/apothem-attack-lab">XDC Apothem attack lab</Link>{" "}
            reads actual chain-51 transaction evidence using test assets only.
            It never signs or broadcasts from Safe Inspector.
          </p>
        </div>

        <div className="malicious-demo-notice" role="note">
          <strong>Training environment</strong>
          <p>
            Every address, nonce, balance, result, and protocol identity below
            is fictional. These examples are static UI fixtures: they are not
            stored as Safe activity, cannot trigger alerts, and cannot be
            signed, submitted, or refreshed.
          </p>
        </div>

        <nav aria-label="Dummy transaction index" className="attack-lab-index">
          {ATTACKS.map((scenario) => (
            <a href={`#${scenario.id}`} key={scenario.id}>
              <span>{scenario.category}</span>
              <strong>{scenario.title}</strong>
            </a>
          ))}
        </nav>

        <section
          aria-label="Dummy malicious transactions"
          className="attack-list"
        >
          {ATTACKS.map((scenario) => (
            <ScenarioPanel key={scenario.id} scenario={scenario} />
          ))}
        </section>
      </article>
    </main>
  );
}
