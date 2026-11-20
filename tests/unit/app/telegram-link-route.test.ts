import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authSessionFromRequest: vi.fn(),
  bookmarkSafe: vi.fn(),
  checkRequestRateLimit: vi.fn(),
  createTelegramLink: vi.fn(),
  isSafeAvailableToSession: vi.fn(),
  telegramBotUsername: vi.fn(),
}));

vi.mock("@/adapters/telegram-bot/client", () => ({
  telegramBotUsername: mocks.telegramBotUsername,
}));
vi.mock("@/container", () => ({
  getPersistencePort: () => ({ bookmarkSafe: mocks.bookmarkSafe }),
  getRateLimitPort: () => ({}),
}));
vi.mock("@/lib/auth/session", () => ({
  authSessionFromRequest: mocks.authSessionFromRequest,
}));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRequestRateLimit: mocks.checkRequestRateLimit,
  rateLimitHeaders: vi.fn(() => ({})),
  TELEGRAM_LINK_RATE_LIMIT: {},
}));
vi.mock("@/lib/api/sync-refresh", () => ({
  isSafeAvailableToSession: mocks.isSafeAvailableToSession,
}));
vi.mock("@/lib/api/telegram-link", () => ({
  createTelegramLink: mocks.createTelegramLink,
}));

import { POST } from "@/app/api/v1/safes/[chainId]/[address]/telegram-link/route";

const safe = {
  chainId: 50,
  address: "0x1111111111111111111111111111111111111111",
};

function request() {
  return new NextRequest(
    `https://safe.example/api/v1/safes/${safe.chainId}/${safe.address}/telegram-link`,
    { method: "POST" },
  );
}

function context() {
  return {
    params: Promise.resolve({
      chainId: String(safe.chainId),
      address: safe.address,
    }),
  };
}

describe("Telegram link route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSessionFromRequest.mockReturnValue({
      profileId: "profile",
      walletAddress: "0x2222222222222222222222222222222222222222",
    });
    mocks.checkRequestRateLimit.mockResolvedValue({
      allowed: true,
      degraded: false,
    });
    mocks.isSafeAvailableToSession.mockResolvedValue(true);
    mocks.bookmarkSafe.mockResolvedValue(undefined);
    mocks.telegramBotUsername.mockReturnValue("safe_bot");
    mocks.createTelegramLink.mockResolvedValue({
      url: "https://t.me/safe_bot?start=token",
      expiresAt: 1_000,
    });
  });

  it("bookmarks an owner-visible Safe before creating its Telegram token", async () => {
    const response = await POST(request(), context());

    expect(response.status).toBe(201);
    expect(mocks.bookmarkSafe).toHaveBeenCalledWith("profile", safe);
    expect(mocks.bookmarkSafe.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.createTelegramLink.mock.invocationCallOrder[0]!,
    );
  });

  it("does not misreport persistence failures as missing configuration", async () => {
    mocks.bookmarkSafe.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toEqual({
      code: "telegram_unavailable",
      message: "Telegram linking is temporarily unavailable. Try again.",
    });
  });
});
