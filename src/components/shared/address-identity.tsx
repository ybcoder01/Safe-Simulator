import type { AddressBookView } from "@/lib/api/address-book";
import { resolveAddressDisplay } from "@/lib/api/address-book";
import { explorerAddressUrl } from "@/lib/explorer-links";

interface Props {
  readonly chainId: number;
  readonly address: string;
  readonly addressBook?: readonly AddressBookView[];
  readonly compact?: boolean;
}

export function AddressIdentity({
  chainId,
  address,
  addressBook = [],
  compact = false,
}: Props) {
  const display = resolveAddressDisplay(chainId, address, addressBook);
  const explorerUrl = explorerAddressUrl(chainId, address);
  const status =
    display?.trust === "flagged"
      ? "Flagged"
      : display?.whitelist
        ? "✓ Whitelisted"
        : display
          ? "Known identity"
          : null;
  const statusClass =
    display?.trust === "flagged"
      ? "address-identity-flagged"
      : display?.whitelist
        ? "address-identity-whitelisted"
        : "address-identity-known";

  return (
    <span className="address-identity">
      {display ? (
        <span className="address-identity-label">{display.label}</span>
      ) : null}
      {explorerUrl ? (
        <a
          className="address-identity-link"
          href={explorerUrl}
          rel="noreferrer"
          target="_blank"
          title="Open address in the network explorer"
        >
          <code>{compact ? shorten(address) : address}</code>
          <span aria-hidden="true">↗</span>
        </a>
      ) : (
        <code>{compact ? shorten(address) : address}</code>
      )}
      {status ? (
        <span className={`address-identity-status ${statusClass}`}>
          {status}
        </span>
      ) : null}
    </span>
  );
}

function shorten(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}
