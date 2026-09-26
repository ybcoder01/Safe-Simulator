# Telegram alert threat model

Telegram alerts are an independent second screen for Safe signers. They read the
canonical Safe Transaction Service payload and local simulation results; they do
not trust the transaction description shown by a signing website.

## Alert events

- A new proposal receives its first signature.
- Another owner signs, with the complete signer list preserved in the signed
  report.
- The signature threshold is reached and the transaction can be executed.
- A proposal executes, fails, or is replaced.

Alerts are idempotent per subscriber and exact signer/status state. A delayed or
retried queue message cannot produce the same alert twice.

The Telegram preview is deliberately a short decision card: transaction state,
plain-language action, approval progress, up to three reasons for concern, and
one next step. Complete addresses, hashes, calldata, and signed receipt details
remain on the official verification report. Executed alerts never tell the user
not to sign; they state that execution already happened and direct the user to
review or incident-response actions instead.

## Scenarios

| Scenario                                                            | Alert behavior                                                                                                                                                                             | Coverage                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Compromised signing UI shows benign details for a malicious payload | Show an independent plain-language result, with canonical target, operation, and signer addresses in the signed report                                                                     | Included                                   |
| A new or substituted wallet becomes an ERC-20 spender               | Explain that a new spender is involved; preserve the exact token and spender in the signed report                                                                                          | Included                                   |
| Unlimited ERC-20 or Permit2 approval                                | Critical warning in the preview with exact involved addresses in the signed report                                                                                                         | Included                                   |
| NFT `setApprovalForAll`                                             | Critical warning that all present and future compatible tokens are exposed                                                                                                                 | Included                                   |
| Permit2 signature transfer                                          | Warn about the caller-dependent spender and require review of amount, recipient, nonce, and deadline                                                                                       | Included where decoded                     |
| Recipient substitution or address poisoning                         | Warn when a transfer recipient is unknown or profile-flagged                                                                                                                               | Included                                   |
| Wallet address used where a contract was expected                   | State plainly whether the target is a wallet, verified contract, unverified contract, or unavailable                                                                                       | Included                                   |
| Malicious `delegatecall`                                            | Critical warning because code can modify Safe-owned storage                                                                                                                                | Included                                   |
| Owner added/removed or signing threshold changed                    | Critical Safe-control warning                                                                                                                                                              | Included                                   |
| Module enabled/disabled                                             | Critical warning because modules may execute without normal owner confirmations                                                                                                            | Included                                   |
| Guard, fallback handler, or implementation changed                  | Critical Safe-control warning                                                                                                                                                              | Included                                   |
| Malicious action hidden inside a batch                              | Inspect inner calls, approvals, transfers, delegatecalls, and storage changes                                                                                                              | Included when trace coverage is available  |
| Unknown internal target or storage mutation                         | Warn about unresolved internal calls and unrecognized storage changes                                                                                                                      | Included                                   |
| Undecodable calldata or ambiguous signature-only decode             | Explicitly state that the action could not be independently decoded                                                                                                                        | Included                                   |
| Reverting simulation or incomplete provider evidence                | Do not show a green result; explain the evidence limitation                                                                                                                                | Included                                   |
| Competing transaction at the same nonce                             | Alert when the tracked proposal becomes replaced                                                                                                                                           | Included when reported by the Safe service |
| Unexpected refund receiver, gas token, or high-value policy breach  | Compare against organization-specific policy                                                                                                                                               | Planned; requires policy configuration     |
| Malicious module execution that bypasses proposals                  | Dedicated immediate module-execution Telegram alert                                                                                                                                        | Planned follow-up                          |
| Telegram bot token is stolen                                        | Attacker can impersonate the bot and send persuasive fake alerts; require independent verification of a server-issued, separately signed alert receipt on the bookmarked production domain | Implemented locally; deployment pending    |

## Security boundary

A Safe signature commits to the transaction fields, so an attacker cannot change
the target or spender under the same Safe transaction hash without invalidating
the signature. The practical attack is to trick a signer into approving a
malicious payload while the compromised interface displays something else. The
bot reduces that risk by fetching and explaining the signed payload through a
separate channel. It cannot prove the signer's original intent, protect a fully
compromised Telegram account, or replace hardware-wallet verification.

The Telegram bot token is a transport credential, not an alert-authentication
root. If it is stolen, an attacker can send messages that appear to come from
the legitimate bot even though the attacker still cannot create Safe owner
signatures. The webhook secret only authenticates inbound Telegram webhooks and
does not prevent forged outbound messages made with the bot token.

Signers must therefore treat Telegram as a prompt to perform an independent
review. They must open the official signed report, a bookmarked Safe Inspector,
or their Safe wallet and compare the chain, Safe, nonce, Safe transaction hash,
target, operation, value, spender, and calldata. Each alert has a high-entropy
verification ID and an Ed25519 receipt signed with a key that is separate from
the Telegram bot token. The official-domain verification page verifies that
receipt and deliberately provides no transaction-signing action. The feature,
database migration, and signing identity are deployed in Production.

Historical motivation includes the Radiant Capital incident, where compromised
developer devices displayed legitimate-looking Safe data while a malicious
transaction was signed, and the Bybit/Safe incident, where compromised Safe
infrastructure deceived signers. Safe itself warns that unexpected delegatecalls
can modify implementation, owner, or threshold state.
