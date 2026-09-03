# XDC protocol registry

Registry version: `2026-09-03.2`  
Review date: 2026-09-03  
Network: XDC mainnet, chain ID 50

## Trust boundary

A registry match establishes a reviewed identity. It does not establish a safe
transaction, an immutable contract, or an appropriate approval amount.
Critical execution evidence always takes precedence.

The registry deliberately separates:

- `protocol-whitelist`: active, publisher-documented contracts intended for
  user interaction
- `identity-only`: implementations, libraries, administrative infrastructure,
  data providers, or retired contracts that should be named but must not receive
  the protocol whitelist signal

Only active entries can use `protocol-whitelist`. Explorer labels, name
similarity, symbols, and a matching address on another chain are insufficient
by themselves.

## Included publisher records

The source-controlled manifest contains 171 unique XDC protocol identities.

| Publisher or protocol                           | Entries | Protocol whitelist | Identity only | Evidence                                                                                                                                                |
| ----------------------------------------------- | ------: | -----------------: | ------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| XSwap                                           |       8 |                  8 |             0 | [Publisher evidence](https://docs.xspswap.finance/xswap-protocol/contracts/xswap-protocol-contracts)                                                    |
| Curve                                           |      26 |                  8 |            18 | [Publisher evidence](https://github.com/curvefi/curve-core/blob/fdcddede6c0564bb48eba8bbdfff72da8f650024/deployments/prod/xdc.yaml)                     |
| Silo                                            |      37 |                  9 |            28 | [Publisher evidence](https://github.com/silo-finance/silo-contracts-v3/tree/31b98b3b899494ebfbd6306d17f50666480967bd/silo-core/deployments/xdc)         |
| Morpho                                          |       8 |                  6 |             2 | [Publisher evidence](https://docs.morpho.org/developers/contracts/addresses/#morpho-blue/xdc)                                                           |
| Fathom | 62 | 12 | 50 | [Publisher evidence](https://docs.fathom.fi/lending/deployments/xdc-network) |
| Uniswap-compatible deployment documented by Oku |      17 |                  9 |             8 | [Publisher evidence](https://docs.oku.trade/home/extra-information/deployed-contracts#xdc)                                                              |
| Stargate                                        |      11 |                  5 |             6 | [Publisher evidence](https://docs.stargate.finance/resources/contracts/mainnet-contracts#xdc-endpointid-30365)                                          |
| YieldNest                                       |       1 |                  1 |             0 | [Publisher evidence](https://github.com/yieldnest/yieldnest-cross-chain/blob/e5c2bac18da7cf1c89767f385ebc15513b995540/deployments/ynRWAx-1-v0.0.1.json) |
| Reservoir                                       |       1 |                  1 |             0 | [Publisher evidence](https://github.com/reservoir-protocol/srusd/blob/cc34c9ecb30eaf13d567df42f6d9bd165e4c2914/FIXED_DEPLOYMENT_GUIDE.md)               |

Silo records are pinned to commit
`31b98b3b899494ebfbd6306d17f50666480967bd`. Curve records are pinned to the
reviewed XDC deployment manifest. Morpho records include Blue, Vault V2, and
Bundler contracts explicitly listed for XDC. Oku records use the XDC section of
its deployment page; the registry labels the deployment as Oku-documented and
does not claim governance by Uniswap Labs.

Fathom is recorded as Fathom, not Aave. Its architecture is Aave-derived, but
the official Aave deployment catalogue does not establish an Aave deployment
on XDC.

## Requested token identities

- YieldNest RWA MAX (`ynRWAx`):
  `0x7054f74d6cB418e987b73c9f3c23e5cEc18217b2`, confirmed by YieldNest's
  chain-50 deployment manifest.
- Wrapped Savings rUSD (`wsrUSD`):
  `0x4809010926aec940b550D34a46A52739f996D75D`, confirmed by Reservoir's
  source repository and corroborated for XDC by Silo's pinned address manifest.

Both report 18 decimals. Their registry identities do not suppress approval,
spender, delegate-call, or state-change warnings.

## On-chain verification

Every included chain-50 protocol address returned non-empty deployed bytecode
during the review. The documented Curve administrative account
`0xabc336d4C71ad275695744d32DdB1d8266Db1cbF` returned no bytecode and is
therefore documented as an authority but excluded from the contract registry.

Duplicate appearances across publisher documents are stored once per chain and
address. This prevents conflicting trust results for a single contract.

## Exclusion

Aave remains excluded because its official active-deployment material does not
identify XDC mainnet. A future addition requires an official chain-50
deployment record and a fresh bytecode review.

## Token fallbacks

Unknown token contracts use the deterministic `fallback-token` logo key.
Tokens positively identified as liquidity positions but lacking reviewed
artwork use `fallback-lp`. A symbol containing “LP” is not sufficient on its
own to classify an address as a liquidity position.
