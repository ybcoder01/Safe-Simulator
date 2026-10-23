import type { Address, AddressBookReview } from "@/core/domain";

export interface AddressBookOwnerVote {
  readonly profileId: string;
  readonly address: Address;
  readonly label: string;
  readonly purpose: string | null;
  readonly trust: "trusted" | "flagged";
  readonly updatedAt: number;
}

export function buildAddressBookConsensus(
  votes: readonly AddressBookOwnerVote[],
  requiredApprovals: number,
  currentProfileId: string,
): readonly AddressBookReview[] {
  const groups = new Map<string, AddressBookOwnerVote[]>();
  for (const vote of votes) {
    const key = vote.address.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), vote]);
  }

  return [...groups.values()].map((addressVotes) => {
    const current = addressVotes.find(
      (vote) => vote.profileId === currentProfileId,
    );
    const trusted = addressVotes.filter((vote) => vote.trust === "trusted");
    const flagged = addressVotes.filter((vote) => vote.trust === "flagged");
    const display = current ?? flagged[0] ?? trusted[0]!;
    return {
      address: display.address,
      label: display.label,
      purpose: display.purpose,
      status:
        flagged.length > 0
          ? "flagged"
          : trusted.length >= requiredApprovals
            ? "trusted"
            : "pending",
      trustedApprovals: trusted.length,
      flaggedApprovals: flagged.length,
      requiredApprovals,
      currentUserDecision: current?.trust ?? null,
      updatedAt: Math.max(...addressVotes.map((vote) => vote.updatedAt)),
    } satisfies AddressBookReview;
  });
}
