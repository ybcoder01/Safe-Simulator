import { describe, expect, it } from "vitest";

import {
  applicationUrl,
  toQStashDeduplicationId,
} from "../../../../src/adapters/queue-qstash/queue";

describe("applicationUrl", () => {
  it("uses the public project URL for production callbacks", () => {
    expect(
      applicationUrl({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "safe-simulator.vercel.app",
        VERCEL_URL:
          "safe-simulator-eqr6bt91y-mohits-projects-8b971b93.vercel.app",
      }),
    ).toBe("https://safe-simulator.vercel.app");
  });

  it("uses the deployment URL for preview callbacks", () => {
    expect(
      applicationUrl({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        VERCEL_PROJECT_PRODUCTION_URL: "safe-simulator.vercel.app",
        VERCEL_URL: "safe-simulator-preview.vercel.app",
      }),
    ).toBe("https://safe-simulator-preview.vercel.app");
  });

  it("does not let an explicit production URL override Preview isolation", () => {
    expect(
      applicationUrl({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        APP_BASE_URL: "https://safe-simulator.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "safe-simulator.vercel.app",
        VERCEL_URL: "safe-simulator-preview.vercel.app",
      }),
    ).toBe("https://safe-simulator-preview.vercel.app");
  });

  it("uses a deployment URL only when the project URL is unavailable", () => {
    expect(
      applicationUrl({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        VERCEL_URL: "safe-simulator-preview.vercel.app",
      }),
    ).toBe("https://safe-simulator-preview.vercel.app");
  });
});

describe("toQStashDeduplicationId", () => {
  it("converts application idempotency keys into deterministic QStash-safe IDs", async () => {
    const value =
      "sync:import:50:0xc8bae80ca5c2c9ec3bd4ac16c422220a33b6b173:multisig";

    await expect(toQStashDeduplicationId(value)).resolves.toBe(
      "a603354acab855ef9e9824bbbae0a026a3421a5de904a45416f3c667ecafb447",
    );
  });

  it("keeps distinct application keys distinct", async () => {
    const first = await toQStashDeduplicationId("sync:import:50:first");
    const second = await toQStashDeduplicationId("sync:import:50:second");

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
  });
});
