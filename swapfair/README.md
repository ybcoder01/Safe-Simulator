# SwapFair prototype

Clickable UI prototype for a peer-to-peer barter marketplace in the UAE and India. It is a front end only: estimates, proposals, and moderation decisions are simulated in the browser.

This folder does not change the Safe Inspector application.

## Run

```bash
cd swapfair
pnpm install --ignore-workspace
pnpm dev
```

Open the local URL Vite prints. The dark bar at the top is prototype chrome, not the product.

- **Next in story** walks the main trade: register, list, match, multi-item proposal, cash adjustment, counteroffer, compare, accept, public meetup, check-in, confirm, review.
- **Exceptions** open prohibited listings, a prohibited counteroffer, an unavailable item, a significant value gap, a counterfeit report, a cancelled meetup, and a dispute.
- **Language** switches English, Arabic (right-to-left), and Hindi.
- **UAE · AED / India · INR** switches the signed-in market. Cross-border trades stay off.
- Deep links: `?journey=8` opens the proposal step. `?screen=admin` opens moderation. `?lang=ar` and `?theme=dark` apply too.

## What the interface insists on

- Listed values are the owner’s estimates, never guaranteed market prices.
- Cash adjustments are separate from items. Cash is not a listing.
- Each counteroffer is a new version. Accepted terms lock.
- A significant gap (more than 15% of the higher side, or more than AED 400 / ₹10,000) must be acknowledged before send.
- Prohibited items are blocked in listings, wishes, counteroffers, profiles, and messages. Uncertain cases are saved for review without accusing the member.
- Chat cannot change items, values, or cash.
- Both people confirm completion. Reviews stay hidden until both submit, or 14 days pass.
- The product does not promise refunds or escrow.

Design notes for implementation live in `DESIGN.md` and inside the prototype under **Screens → Design spec**.
