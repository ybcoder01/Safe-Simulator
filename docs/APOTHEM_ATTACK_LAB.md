# XDC Apothem malicious-transaction lab

This lab is exclusively for XDC Apothem testnet (chain ID `51`). It creates
valueless contracts whose call shapes resemble common treasury attacks. It must
never be deployed to XDC mainnet or funded with real assets.

## Safety boundary

- The deployment workflow aborts unless the RPC reports chain ID `51`.
- Use a new test-only deployer. Never add a production signer or treasury key.
- Use TXDC from the official faucet and the included training token only.
- Do not import production Safe owners, addresses, allowlists, or secrets.
- Every UI surface must say **Apothem testnet** and **no real funds**.
- A successful transaction or simulation is not evidence that a transaction is safe.

Official network parameters:

- RPC: `https://rpc.apothem.network`
- Explorer: `https://testnet.xdcscan.com`
- Faucet: `https://faucet.apothem.network`

## Contracts and scenarios

| Contract                  | Test                                                    |
| ------------------------- | ------------------------------------------------------- |
| `TrainingToken`           | bounded and unlimited ERC-20 approvals                  |
| `UnknownSpender`          | delayed `transferFrom` after an approval                |
| `InjectedRecipientRouter` | recipient substitution in calldata                      |
| `DelegateMutation`        | delegatecall into code that writes caller storage       |
| `HiddenMulticall`         | a value transfer hidden inside a nested batch           |
| `ProxyUpgradeTrap`        | implementation replacement and delegated initialization |
| `SafeDelegatecallHarness` | Safe-shaped delegatecall into external training code      |
| `SafeControlTrap`         | module, guard, handler, owner, and threshold changes       |

The contracts enforce `block.chainid == 51` on state-changing training
functions. They are deliberately unaudited test fixtures, not reusable protocol
components.

## Deploy from GitHub

1. Create a GitHub environment named `apothem-testnet`.
2. Add environment secrets:
   - `APOTHEM_RPC_URL`
   - `APOTHEM_DEPLOYER_PRIVATE_KEY`
3. Protect the environment with a required reviewer.
4. Fund the disposable deployer with faucet TXDC.
5. Run **Deploy Apothem attack lab** and type `APOTHEM` when prompted.
6. Download the public deployment-manifest artifact.

The private key is consumed only by the GitHub runner and must never be placed
in Vercel, source code, workflow inputs, logs, or a browser.

## Generate clickable demo transactions

After the same disposable deployer is funded, run **Generate Apothem attack
demos** and type `APOTHEM`. The workflow deploys fresh fixtures and broadcasts
six test-only transactions: unlimited approval, injected recipient, hidden
multicall, proxy upgrade, Safe-shaped delegatecall, and Safe security-control
change.

The job summary and downloadable `demo-transactions.json` artifact contain a
separate inspector link for every transaction. Each link supplies only a public
transaction hash; the page loads the corresponding chain-51 evidence
automatically. The artifact contains no private key.

Generated contracts and hashes are disposable training evidence. Do not label
or reuse them as official protocol deployments.

## Safe limitation on Apothem

Safe publishes XDC mainnet support, but Apothem does not have a confirmed hosted
Safe Transaction Service. Pending Safe proposals therefore cannot be treated as
available through the XDC mainnet service. The testnet application reads direct
RPC evidence and analyzes explicitly supplied Apothem transaction hashes. It
must display unavailable evidence as unavailable rather than silently borrowing
mainnet data.
