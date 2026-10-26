import { PrivyClient } from "@privy-io/node";
import { getAddress, isAddress, type Address } from "viem";

let client: PrivyClient | null = null;

function getPrivyClient(): PrivyClient {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("Privy authentication is not configured.");
  }
  client ??= new PrivyClient({ appId, appSecret });
  return client;
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim() || null;
}

export async function verifyPrivyWallet(
  request: Request,
  requestedWallet: string,
): Promise<{ readonly privyUserId: string; readonly walletAddress: Address }> {
  const token = bearerToken(request);
  if (!token) throw new Error("A Privy access token is required.");
  if (!isAddress(requestedWallet)) {
    throw new Error("A valid Ethereum wallet is required.");
  }

  const privy = getPrivyClient();
  const claims = await privy.utils().auth().verifyAccessToken(token);
  const user = await privy.users()._get(claims.user_id);
  const normalized = getAddress(requestedWallet).toLowerCase() as Address;
  const linked = user.linked_accounts.some(
    (account) =>
      account.type === "wallet" &&
      account.chain_type === "ethereum" &&
      account.address.toLowerCase() === normalized &&
      account.connector_type !== "embedded" &&
      account.wallet_client_type !== "privy",
  );
  if (!linked) {
    throw new Error(
      "The requested external wallet is not linked to this login.",
    );
  }

  return { privyUserId: claims.user_id, walletAddress: normalized };
}
