# XDC protocol registry

Registry version: `2026-09-03.1`  
Review date: 2026-09-03  
Network: XDC mainnet, chain ID 50

## Trust boundary

A registry match establishes a known identity. It does not establish that a
transaction is safe, that a contract is immutable, or that an approval is
appropriate. Critical execution evidence always takes precedence over a
registry match.

Protocol entries are accepted only when an official publisher identifies an
exact chain-50 address and bytecode is present at that address. Explorer labels,
third-party lists, name similarity, and deterministic cross-chain addresses are
not sufficient by themselves.

## Included XSwap deployments

The publisher reference is the
[XSwap contract list](https://docs.xspswap.finance/xswap-protocol/contracts/xswap-protocol-contracts).
Bytecode presence was independently checked through an XDC mainnet JSON-RPC
endpoint at the review date.

| Role | Address | Bytecode |
| --- | --- | ---: |
| V2 Factory | `0x347D14b13a68457186b2450bb2a6c2Fd7B38352f` | 11,057 bytes |
| V2 Router | `0xf9c5E4f6E627201aB2d6FB6391239738Cf4bDcf9` | 17,908 bytes |
| V3 Universal Router | `0xe1bcb1c502a545ee85a1881b95cdd46d394d2b2e` | 13,961 bytes |
| V3 SwapRouter02 | `0x3b9edecc4286ba33ea6e27119c2a4db99829839d` | 20,238 bytes |
| V3 Router | `0xecf4ea7907e779b8a7d0f90cb95fe06f43b610fb` | 9,880 bytes |
| XSP Token | `0x36726235dAdbdb4658D33E62a249dCA7c4B2bC68` | 4,559 bytes |
| XSwap Treasury Token | `0x17476dc3eda45aD916cEAdDeA325B240A7FB259D` | 3,619 bytes |
| Wrapped XDC | `0x951857744785E80e2De051c32EE7b25f9c458C42` | 3,449 bytes |

Token names, symbols, decimals, and logo keys for WXDC, XSP, and XTT are pinned
to commit `b476bed4d722d51e151ab719e2458cfe0db23a00` of the official
[XSwap XDC token list](https://github.com/XSwapProtocol/xdc-token-list).

## Requested protocols not included

| Protocol | Result |
| --- | --- |
| Curve | No official XDC mainnet deployment was found in the publisher's deployment material reviewed on 2026-09-03. |
| Silo | Official documentation described XDC as forthcoming rather than live when reviewed. |
| Morpho | The official address catalogue did not identify an XDC mainnet deployment when reviewed. |
| Aave | XDC was absent from the official list of active Aave deployments when reviewed. |
| Uniswap through Oku | No official Uniswap chain-50 deployment manifest was found. An interface listing alone is not sufficient registry evidence. |

These rows are deliberate exclusions, not claims that compatible forks or
third-party deployments do not exist. A future registry update must provide an
official deployment reference, exact addresses, contract roles, and a fresh
on-chain bytecode check.

## Token fallbacks

Unknown token contracts use the deterministic `fallback-token` logo key.
Tokens positively identified as liquidity positions but lacking reviewed
artwork use `fallback-lp`. A symbol containing “LP” is not sufficient on its
own to classify an address as a liquidity position.
