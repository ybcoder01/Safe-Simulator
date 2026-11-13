export function safeAddressBookPath(chainId: number, address: string) {
  return `/safe/${chainId}/${address.toLowerCase()}/address-book`;
}
