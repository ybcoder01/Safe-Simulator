import type {
  AddressTrustAssessment,
  EvidenceVerdict,
} from "@/core/analysis/trust/evidence-verdict";
import type { Address, Finding, FindingSeverity } from "@/core/domain";

interface UserFacingFindingInput {
  readonly evidence: EvidenceVerdict;
  readonly identifiedAddresses: readonly Address[];
  readonly protocolLabel: string | null;
  readonly targetKnown: boolean;
  readonly targetVerified: boolean;
}

const CONTROL_CHANGE_CODES = new Set([
  "safe-owner-change",
  "safe-threshold-change",
  "safe-module-change",
  "safe-guard-change",
  "safe-fallback-handler-change",
  "safe-implementation-change",
]);

const UNLIMITED_PERMISSION_CODES = new Set([
  "infinite-allowance",
  "requested-infinite-allowance",
  "requested-operator-all",
  "maximum-permit2-signature-transfer",
]);

const BOUNDED_PERMISSION_CODES = new Set([
  "new-approval-spender",
  "permit2-signature-transfer",
  "spender-trust-unresolved",
]);

const PROTOCOL_PATH_CODES = new Set([
  "internal-delegatecall",
  "internal-call-trust-unresolved",
  "movement-trust-unresolved",
  "signature-only-decode",
  "raw-calldata",
]);

const CONSUMED_CODES = new Set([
  ...CONTROL_CHANGE_CODES,
  ...UNLIMITED_PERMISSION_CODES,
  ...BOUNDED_PERMISSION_CODES,
  ...PROTOCOL_PATH_CODES,
  "explicitly-flagged-address",
  "unverified-target",
]);

function key(address: string): string {
  return address.toLowerCase();
}

function unresolvedByRole(
  addresses: readonly AddressTrustAssessment[],
  role: AddressTrustAssessment["roles"][number],
): readonly Address[] {
  return addresses
    .filter(
      (assessment) =>
        assessment.status === "unverified" && assessment.roles.includes(role),
    )
    .map((assessment) => assessment.address);
}

function unique(addresses: readonly Address[]): readonly Address[] {
  return [
    ...new Map(addresses.map((address) => [key(address), address])).values(),
  ];
}

function finding(
  code: string,
  severity: FindingSeverity,
  title: string,
  detail: string,
  addresses: readonly Address[] = [],
): Finding {
  return { code, severity, title, detail, addresses: unique(addresses) };
}

/**
 * Converts engine evidence into a short signer-facing checklist. Raw findings
 * remain available in the technical disclosure. This layer never upgrades an
 * unknown address to trusted: it only removes duplicate explanations of the
 * same uncertainty and applies effective source-verification evidence.
 */
export function resolveUserFacingFindings(
  input: UserFacingFindingInput,
): readonly Finding[] {
  const result: Finding[] = [];
  const findings = input.evidence.findings.filter(
    (item) => item.severity !== "info",
  );
  const identified = new Set(input.identifiedAddresses.map(key));

  const flagged = findings.filter(
    (item) => item.code === "explicitly-flagged-address",
  );
  if (flagged.length > 0) {
    result.push(
      finding(
        "flagged-address-involved",
        "critical",
        "A flagged address is involved",
        "One or more addresses were previously marked as dangerous. Stop and verify the full address with the other signers.",
        flagged.flatMap((item) => item.addresses),
      ),
    );
  }

  const controlChanges = findings.filter((item) =>
    CONTROL_CHANGE_CODES.has(item.code),
  );
  if (controlChanges.length > 0) {
    result.push(
      finding(
        "safe-control-change",
        "critical",
        "This changes who can control the Safe",
        "The owner list, approval threshold, module, guard, fallback handler, or Safe implementation changes. Every signer should verify the exact before-and-after setting.",
        controlChanges.flatMap((item) => item.addresses),
      ),
    );
  }

  const unlimitedPermissions = findings.filter((item) =>
    UNLIMITED_PERMISSION_CODES.has(item.code),
  );
  if (unlimitedPermissions.length > 0) {
    result.push(
      finding(
        "unlimited-spending-access",
        "critical",
        "Unlimited token access is requested",
        "A contract or operator could spend the maximum supported amount. Confirm the full spender address and reduce the amount unless unlimited access is intentional.",
        unlimitedPermissions.flatMap((item) => item.addresses),
      ),
    );
  }

  const unknownRecipients = unresolvedByRole(
    input.evidence.addresses,
    "movement-recipient",
  );
  if (unknownRecipients.length > 0) {
    result.push(
      finding(
        "recipient-address-unconfirmed",
        "warning",
        "The recipient address could not be confirmed",
        "This does not prove address injection, but the destination may have been replaced. Compare the complete recipient address with the original request before the final approval.",
        unknownRecipients,
      ),
    );
  }

  const permissionFindings = findings.filter((item) =>
    BOUNDED_PERMISSION_CODES.has(item.code),
  );
  const unknownSpenders = unresolvedByRole(
    input.evidence.addresses,
    "approval-spender",
  );
  if (permissionFindings.length > 0) {
    result.push(
      finding(
        "spender-address-check",
        "warning",
        unknownSpenders.length > 0
          ? "A token spender could not be confirmed"
          : "A contract is receiving token spending access",
        unknownSpenders.length > 0
          ? "The spender is not matched to a reviewed project contract. Compare its complete address and the exact allowance with the action you intended."
          : "This permission may be expected for the action, but confirm the spender and amount before the final approval.",
        unique([
          ...unknownSpenders,
          ...permissionFindings.flatMap((item) => item.addresses),
        ]),
      ),
    );
  }

  const targetFinding = findings.find(
    (item) => item.code === "unverified-target",
  );
  if (targetFinding && !input.targetVerified) {
    result.push(
      finding(
        "target-address-unconfirmed",
        "warning",
        "The main contract could not be independently verified",
        "Confirm the complete destination address in the project's official deployment documentation before approving.",
        targetFinding.addresses,
      ),
    );
  }

  const pathFindings = findings.filter((item) =>
    PROTOCOL_PATH_CODES.has(item.code),
  );
  const unknownRecipientKeys = new Set(unknownRecipients.map(key));
  const pathAddresses = unique(
    pathFindings.flatMap((item) => item.addresses),
  ).filter((address) => !unknownRecipientKeys.has(key(address)));
  const unconfirmedPathAddresses = pathAddresses.filter(
    (address) => !identified.has(key(address)),
  );
  const effectivePathFindings = pathFindings.filter(
    (item) =>
      !(
        input.targetVerified &&
        (item.code === "signature-only-decode" || item.code === "raw-calldata")
      ),
  );
  const hasDelegateCall = effectivePathFindings.some(
    (item) => item.code === "internal-delegatecall",
  );
  if (
    effectivePathFindings.length > 0 &&
    (unconfirmedPathAddresses.length > 0 ||
      !input.targetKnown ||
      !input.targetVerified ||
      hasDelegateCall)
  ) {
    const recognizedEntrypoint = input.targetKnown && input.targetVerified;
    const severity: FindingSeverity =
      hasDelegateCall && !recognizedEntrypoint ? "critical" : "warning";
    const project = input.protocolLabel ?? "The selected project";
    result.push(
      finding(
        "protocol-path-unconfirmed",
        severity,
        recognizedEntrypoint
          ? `Part of the ${project} route needs verification`
          : "Part of the contract route needs verification",
        recognizedEntrypoint
          ? unconfirmedPathAddresses.length > 0
            ? `${project}'s main contract is recognized, but ${unconfirmedPathAddresses.length} internal contract ${unconfirmedPathAddresses.length === 1 ? "address was" : "addresses were"} not independently matched to reviewed deployment or source records. This is one route-level uncertainty, not proof of multiple separate attacks.`
            : `${project}'s internal contracts are identified, but a code-sharing boundary was not independently explained. This is one route-level uncertainty, not proof of multiple separate attacks.`
          : "The transaction entered contract code that could not be tied to a reviewed project route. Verify the complete destination and internal route before approving.",
        unconfirmedPathAddresses,
      ),
    );
  }

  const remaining = findings.filter((item) => !CONSUMED_CODES.has(item.code));
  if (remaining.length > 0) {
    const severity: FindingSeverity = remaining.some(
      (item) => item.severity === "critical",
    )
      ? "critical"
      : "warning";
    result.push(
      finding(
        "additional-evidence-check",
        severity,
        "One additional check needs attention",
        "Open the technical evidence if you need the underlying engine details. This item could not be reduced without losing an important uncertainty.",
        remaining.flatMap((item) => item.addresses),
      ),
    );
  }

  return result.slice(0, 4);
}
