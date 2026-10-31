# Attack-vector coverage

Last reviewed: 2026-10-31

This document separates production detection from demonstrations and planned
research. The Apothem attack lab is a testnet training surface; a lab scenario
is not production coverage unless the production engine is listed below.

Safe Inspector is advisory and read-only. A successful simulation is not proof
that a transaction is safe. A green result means no configured signal was found
within the evidence that was actually available.

## Live production coverage

These controls apply to supported XDC Network and EVM Safe transactions through
the chain-neutral analysis engine.

| Area | Live checks | Important boundary |
| --- | --- | --- |
| ERC-20 approvals | Direct and nested approval intent, new spenders, bounded and maximum allowances, increase/decrease allowance, emitted allowance changes | Non-standard token semantics can still require manual review |
| NFT/operator approvals | Detects enabled `setApprovalForAll` and treats full operator access as critical | Proprietary operator systems require protocol-specific support |
| Permit2 | Single and batch allowances, signature transfers, maximum amounts, owner/token/spender/expiry where decodable, bounded recursion and item limits | Caller-dependent spenders and unavailable parameters remain explicit warnings |
| Delegatecall | Direct Safe delegatecall and unexplained internal delegatecalls are critical; known Safe batch, proxy, and documented protocol boundaries are narrowly exempted | Requires trace data for internal delegatecalls |
| Safe authority | Owner, threshold, module, guard, fallback handler, and Safe implementation changes are critical; high-risk selectors are checked even when simulation evidence is incomplete | Custom Safe extensions may need additional selectors |
| Proxy authority | Common EIP-1967/UUPS `upgradeTo`, `upgradeToAndCall`, proxy admin changes, and diamond cuts are critical | Non-standard upgrade interfaces require protocol-specific support |
| Recipient trust | Flagged addresses, new recipients, recently trusted recipients, prior exact use, and beginning/ending lookalike poisoning checks | Prior use is context, not proof of safety |
| Contract identity | Reviewed registry, verified source, proxy implementation chains, internal targets, and profile-specific trust records | Verified source establishes identity, never user trust |
| Asset movement | Receipt token movements and successful traced native transfers are checked against recipients and trust records | Missing or truncated traces reduce coverage |
| Safe simulation | Failed calls block; unavailable simulation remains unknown | Success proves execution, not business intent |
| Evidence completeness | A contract transaction with an incomplete internal trace cannot receive a green/known clearance solely because its target is recognized | Providers can still limit trace and storage detail |
| Silo markets | Official factory membership, live market configuration, dependency code identities, and team approval fingerprints | Anyone can create a Silo market; each exact market still needs approval |

## Live testnet demonstrations

The XDC Apothem lab currently demonstrates:

1. Unlimited token approval.
2. Injected recipient.
3. Hidden multicall.
4. Proxy implementation replacement.
5. Safe-shaped delegatecall.
6. Safe security-control change.

Testnet lab: <https://safe-simulator.vercel.app/demo/apothem-attack-lab>

The hidden-multicall demonstration is useful for checking whether decoded nested
calls and trace-derived effects remain visible. Unknown/custom batch encodings
can still produce partial coverage and must not be treated as cleared.

## Planned after the demo

### Economic and market manipulation

- Minimum-output and slippage validation against the signer’s stated intent.
- Low-liquidity route warnings.
- Independent oracle freshness, deviation, and manipulation checks.
- Flash-loan-assisted price and collateral manipulation.
- Sandwich and other MEV exposure.

### Token behavior

- Fee-on-transfer, rebasing, reflection, and callback-token classification.
- Explicit reentrancy/callback causality rather than only unexpected calls and
  balance changes.
- Counterfeit symbol/name detection across canonical token registries.
- Decimal and denomination mismatch checks.

### Contract lifecycle and code identity

- CREATE2 counterfactual destinations.
- Metamorphic contracts and same-address code replacement.
- Broader beacon, diamond, and proprietary proxy interfaces.
- Destructive lifecycle behavior and redeployment monitoring.

### Signatures, replay, and ordering

- Full EIP-712 domain and chain binding checks.
- Off-chain signature replay and expiry analysis.
- Safe nonce replacement and conflicting proposal explanations.
- Same-block state races and approval front-running.

### Cross-chain execution

- Destination-chain receiver and asset verification.
- Bridge message replay and destination execution monitoring.
- Canonical bridge and wrapped-asset lineage.
- Source-success/destination-failure reconciliation.

### Protocol-specific policy

- Expected method, recipient, asset, and limit templates for each reviewed
  protocol.
- Governance and timelock policy checks.
- Protocol-specific hook, callback, and extension registries.

## Release rule

A new vector moves into **Live production coverage** only when all of the
following exist:

1. Deterministic production-engine logic, not only demo copy.
2. Unit or regression tests for positive and negative cases.
3. A signer-facing explanation and recommended action.
4. A defined fail-safe behavior when evidence is unavailable.
5. A live supported-chain transaction or fixture used for verification.
