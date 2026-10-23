import { describe, expect, it } from "vitest";

import type { Address } from "@/core/domain";
import { buildAddressBookConsensus } from "@/lib/api/address-book-consensus";

const address = "0x1111111111111111111111111111111111111111" as Address;

function vote(profileId: string, trust: "trusted" | "flagged") {
  return {
    profileId,
    address,
    label: "Treasury destination",
    purpose: "Vendor payment",
    trust,
    updatedAt: 1_700_000_000,
  } as const;
}

describe("address book owner consensus", () => {
  it("keeps one approval pending for a 2-of-3 Safe", () => {
    const [review] = buildAddressBookConsensus(
      [vote("owner-a", "trusted")],
      2,
      "owner-b",
    );

    expect(review).toMatchObject({
      status: "pending",
      trustedApprovals: 1,
      requiredApprovals: 2,
      currentUserDecision: null,
    });
  });

  it("activates trust only at the Safe threshold", () => {
    const [review] = buildAddressBookConsensus(
      [vote("owner-a", "trusted"), vote("owner-b", "trusted")],
      2,
      "owner-b",
    );

    expect(review).toMatchObject({
      status: "trusted",
      trustedApprovals: 2,
      requiredApprovals: 2,
      currentUserDecision: "trusted",
    });
  });

  it("fails closed when any current owner flags the address", () => {
    const [review] = buildAddressBookConsensus(
      [
        vote("owner-a", "trusted"),
        vote("owner-b", "trusted"),
        vote("owner-c", "flagged"),
      ],
      2,
      "owner-a",
    );

    expect(review).toMatchObject({
      status: "flagged",
      trustedApprovals: 2,
      flaggedApprovals: 1,
    });
  });

  it("requires four approvals for a 4-of-5 Safe", () => {
    const pending = buildAddressBookConsensus(
      [
        vote("owner-a", "trusted"),
        vote("owner-b", "trusted"),
        vote("owner-c", "trusted"),
      ],
      4,
      "owner-d",
    )[0];
    const trusted = buildAddressBookConsensus(
      [
        vote("owner-a", "trusted"),
        vote("owner-b", "trusted"),
        vote("owner-c", "trusted"),
        vote("owner-d", "trusted"),
      ],
      4,
      "owner-d",
    )[0];

    expect(pending?.status).toBe("pending");
    expect(trusted?.status).toBe("trusted");
  });
});
