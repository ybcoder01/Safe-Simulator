import { explorerAddressUrl } from "@/lib/explorer-links";
import { resolveTokenPresentation } from "@/lib/api/token-presentation";

interface Props {
  readonly amount?: string | null;
  readonly chainId: number;
  readonly symbol?: string | null;
  readonly token: string | null;
}

const logoText = {
  wxdc: "X",
  xsp: "XSP",
  xtt: "XTT",
  ynrwax: "YN",
  wsrusd: "SR",
  "fallback-lp": "LP",
  "fallback-token": "?",
} as const;

export function TokenIdentity({
  amount = null,
  chainId,
  symbol = null,
  token,
}: Props) {
  const identity = resolveTokenPresentation(chainId, token, symbol);
  const explorerUrl =
    identity.token === null
      ? null
      : explorerAddressUrl(chainId, identity.token);
  const classification = identity.known
    ? "Reviewed token"
    : identity.kind === "liquidity-position"
      ? "LP fallback"
      : "Unknown token fallback";

  return (
    <span className="token-identity">
      <span
        aria-label={`${identity.name} logo`}
        className={`token-logo token-logo-${identity.logoKey}`}
        role="img"
      >
        {logoText[identity.logoKey]}
      </span>
      <span className="token-identity-copy">
        <strong>
          {amount ? `${amount} ` : ""}
          {identity.symbol}
        </strong>
        <span>
          {identity.name} · {classification}
        </span>
        {explorerUrl ? (
          <a
            className="token-address-link"
            href={explorerUrl}
            rel="noreferrer"
            target="_blank"
            title="Open token in the network explorer"
          >
            <code>{identity.token}</code>
            <span aria-hidden="true">↗</span>
          </a>
        ) : (
          <span className="token-native-label">Native asset</span>
        )}
      </span>
    </span>
  );
}
