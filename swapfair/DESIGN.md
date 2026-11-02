# SwapFair design specification

SwapFair is a peer-to-peer barter product for the UAE and India. People exchange items or services without a one-for-one requirement. Every listing has an estimated value. A proposal compares both sides and shows the difference. Users can add an item, remove an item, add a cash adjustment, change an estimate where the owner allowed it, accept an unequal trade, or send a counteroffer.

The clickable prototype in this folder is the high-fidelity reference. This document is the implementation spec.

## 1. UX principles

1. The product should be understandable in a few seconds. The landing example (console AED 900, tablet AED 650, cash AED 250, difference AED 0) is the explanation.
2. A listing takes one item or one clearly bounded service, and should be publishable in a few minutes.
3. Wants are explicit: preferred, would consider, not interested, specific item, categories, service, bundle, item plus cash, or open to offers.
4. Discovery is grouped by intent: matches, nearby, wanted, categories, saved searches, recently viewed. It is not an endless feed.
5. The proposal is a two-sided picture, not a form buried in chat.
6. The value difference is visible before send, with a named state.
7. Negotiation keeps every version. Nothing is edited in place.
8. Completion is two independent confirmations, after inspection.
9. Trust is several facts (verification, accuracy, communication, reliability, cancellation), each with a limit.
10. Prohibited items are stopped before publish, including when they are requested rather than offered.

Visual tone: trustworthy, friendly, practical, contemporary. Not a trading terminal, not a classifieds site, not a game. Spacious cards, real hierarchy, one clay brand color. Green only for confirmed or positive states. Amber for warnings and value gaps. Red only for destructive, prohibited, or high-risk states.

## 2. Personas

- **Layla Al Mazrouei**, 29, Dubai Marina. Designer trading an iPad Air (AED 1,800) and a Kindle (AED 280, unlisted) for camera gear. She needs the gap to be obvious and the meetup to stay public.
- **Rohan Iyer**, 33, Business Bay. Photographer with a Fujifilm X-T30 II (AED 2,100) and a strap (AED 180). He counters instead of editing Layla’s version.
- **Priya Sharma**, 27, Indiranagar. Offers a MacBook Air M1 (₹62,000) and wants a camera body. Hindi and English. Large gaps are normal and must be acknowledged, not scolded.
- **Huda Al Suwaidi**, moderator. Needs the offered item, the requested item, the policy, prior violations, and an audit log. An automated signal is never the decision.

## 3. Journeys

Main story, in order:

1. Register (18+ required).
2. Choose UAE or India, then a city.
3. Radius, “I have”, “I want”.
4. Verify email or mobile. Identity is optional.
5. Accept Terms, Privacy, and the Prohibited Listings Policy. Optional profile steps can be skipped.
6. Create one listing and state what would be accepted.
7. See an explained match.
8. Open the listing.
9. Build a multi-item proposal.
10. Add a cash adjustment until the sides meet, or acknowledge a gap.
11. Send version 1.
12. Receive version 2 (Kindle removed, strap added, camera estimate changed, cash changed, meetup moved).
13. Compare the versions with labels, not color alone.
14. Accept and lock.
15. Schedule a public meetup.
16. Check in, with a timer and a trusted contact.
17. Both people confirm.
18. Leave a double-blind review.

Exception journeys:

- Medicine in a listing: prohibited, with the medicines message and an appeal.
- Blood-pressure monitor: saved for review, without accusing the member.
- Counteroffer asks for whisky: blocked, including when the offered item is ordinary.
- PlayStation already in an accepted trade: propose is disabled.
- iPad versus camera plus strap with no cash: significant difference, acknowledgement required.
- Sports watch described like a famous model: counterfeit report `SF-48219`.
- Meetup cancelled: terms stay locked; suggest a new time or close.
- Dispute: no refund promise. Case `SF-19042`.

## 4. Sitemap

- Arrive: landing, sign up / sign in, country, onboarding, contact verification, identity.
- Discover: home, search, map, category, listing, matches, favorites, saved searches.
- List: create (8 steps), manage.
- Negotiate: proposal builder, offer review, version compare, messages, thread.
- Exchange: trades list, workspace, scheduler, check-in, completion, review.
- Trust: profile, notifications, settings, Safety Center, policy, report, dispute.
- Staff: moderation queue and case file.
- Reference: design spec, state gallery.

## 5. Navigation

Mobile bottom bar: Home, Discover, Create, Trades, Profile.

Desktop bar: logo, search, Discover, Matches, Trades, Messages, Favorites, Create listing, notifications, profile.

Trades and messages are separate. A conversation is talk. A trade is items, values, cash, and status.

Admin is not in the consumer navigation.

## 6. Design tokens

Light:

- Background `#F3EEE6`, surface `#FFFCF8`, ink `#1C1915`, muted `#5C564E`, line `#E3D9CC`.
- Primary clay `#8C3A22` on `#FFF8F4`.
- Positive `#0E6A3C` on `#E6F5EC`.
- Warning `#8A5600` on `#FBF1DC`.
- Risk `#9B1C1C` on `#FDECEC`.

Dark inverts the surfaces and lifts clay to `#E7A888` with dark text `#2A140E` so buttons keep contrast.

Type: Fraunces for titles, Outfit for UI, 17px body. Arabic: Noto Naskh Arabic for titles, Noto Sans Arabic for UI. Hindi: Noto Sans Devanagari. Radius 18px on cards, 14px on controls. Minimum target 44px, buttons 48px. Shadow is a soft paper lift, not a glow.

## 7. Components

- Listing card: image, title, estimate, condition, area, time, rating, verification, wants, cash and bundle labels, match label with reasons, save.
- Balance bar: your side, their side, difference sentence, state pill, proportional meter marked decorative.
- Proposal columns: your offer, their offer, sticky summary.
- Version compare rows: Added, Removed, Changed, Unchanged, each with previous and current text.
- Notices: info, positive, warning, risk. Policy notice is reused wherever publication can be blocked.
- Status pills for the trade lifecycle.
- Empty states name what happened and offer a next action.
- Moderator case: queue, signals, policy, recommendation, violations, note, audit, actions.

Match labels are Strong, Good, or Possible, plus reasons such as “Matches your wish list” and “Wants something you have”. There is no compatibility percentage.

## 8. Interaction rules

### Estimates

Store the owner’s estimate separately from any cash adjustment. Show: “The listed value is the owner’s estimate. SwapFair does not guarantee market value.” Publishing requires that acknowledgement.

### Balance

```
yourTotal = sum(your item values) + your cash
theirTotal = sum(their item values) + their cash
diff = abs(yourTotal - theirTotal)
larger = max(yourTotal, theirTotal, 1)
```

- diff = 0 → Balanced.
- User has accepted an unequal trade → Accepted difference.
- diff / larger > 0.15, or diff > AED 400 / ₹10,000 → Significant difference. Require an explicit acknowledgement before send.
- Otherwise → Small difference. Show it. Do not call it unfair.

Suggested actions are mechanical: add the gap as your cash, ask them to add the gap, remove something on your side, or continue with the difference. Unequal trades are allowed when both people accept them.

### Versions

Sending creates an immutable version: number, sender, time, items added and removed, value edits, cash, meetup, and the difference. Accepting locks that version. A later change is a new version and needs both people. A listing may sit in several pending proposals and in only one accepted active trade.

### Listing flow

1. Item or service.
2. Photos. Physical items need one original photo. Stock or duplicate images block continue. Services may skip the photo.
3. Category, title, description, condition, attributes, age, defects, ownership confirmation.
4. Amount, currency from the country, fixed or negotiable, estimate acknowledgement.
5. What they would accept, ranked.
6. Meetup, pickup, delivery, shipping, radius, availability. Shipping requires who pays, and states that delivery is not guaranteed. UAE–India shipping is off.
7. Policy scan of title, description, wishes, and requested items.
8. Preview as others will see it, then publish.

### Moderation outcomes

- **Allowed** — publish now.
- **Needs review** — save, explain that review is pending, give an expected window, notify later. Do not accuse.
- **Prohibited** — do not publish. Name the category, say what to change, link the policy, offer an appeal when appropriate.

Medicine copy, when that category matches:

“This listing appears to include an item that is not permitted on SwapFair. Medicines and prescription products cannot be offered or requested through the platform. Remove the item to continue.”

Always show: the examples are not exhaustive. SwapFair may restrict listings that are illegal, unsafe, fraudulent, regulated, or inconsistent with community safety even when the item is not named.

The same scan covers offers, requests, wish lists, added items, counteroffers, profile text, and messages. A prohibited request cannot be attached to a proposal. Scam patterns (off-platform, advance payment, identity documents, suspicious links) warn the sender without describing the detector. They do not silently delete the conversation.

### Trade statuses

Proposed, countered, accepted, scheduling, scheduled, in progress, awaiting confirmation, completed, cancelled, disputed, declined, withdrawn.

After acceptance the workspace shows the locked items, values, cash, version, people, meetup, checklist, conversation, safety tools, cancellation, dispute, and a timeline. Cancelling a meetup does not rewrite the accepted terms.

### Meetings

Recommend public places. Hide home addresses. Share the precise plan only after acceptance. Check-in timer, trusted contact, emergency link (999 in the UAE, 112 in India), inspect-before-confirm, do not carry extra cash. Shipping shows who pays and does not promise delivery.

### Reviews and reports

After both confirmations, collect listing accuracy, communication, reliability, condition, and overall experience in private. Publish when both have submitted, or when 14 days pass. No edits after the review is visible.

Reports keep a snapshot, ask a focused question, and return a case number. Disputes distinguish not-as-described, not received, no-show, cash disagreement, damage, counterfeit, safety, and other. Never promise a refund.

### Business rules

- 18 or older.
- One listing, one item or one defined service.
- Bundles are built in proposals.
- Cross-border trading is off.
- Exact addresses and identity documents stay private.
- Restricted categories stay unavailable until verification for them exists.
- The product does not guarantee valuation, authenticity, condition, payment, or completion.

## 9. States

Every empty, waiting, and failure state says what happened and offers a next step: nothing nearby, no matches, nothing to offer, no proposals, no messages, under review, rejected, offer expired, item committed elsewhere, person unavailable, offline, upload failed, location denied, verification pending, trade cancelled, account restricted.

Account restriction blocks new proposals and publishing. Reading messages stays available.

## 10. Accessibility

Target WCAG 2.2 AA. One h1 per screen. Labels on icon buttons. Status is icon or text plus color. Balance updates in a polite live region. Focus rings use the clay focus color. Form errors use `role="alert"`. Dialogs are named and close on Escape and backdrop. `prefers-reduced-motion` removes shimmer and motion. `prefers-color-scheme` sets the initial theme.

## 11. Arabic, Hindi, currency

`lang` and `dir` follow the locale. Layout uses logical properties so navigation, cards, and columns mirror. Currency and phone numbers stay in an isolated left-to-right run. Hindi and Arabic use their own type stacks and a slightly looser line height. Money formatting uses `ar-AE` with Latin digits, `hi-IN`, or `en-AE` / `en-IN`.

## 12. Screen inventory

The prototype implements the marketing page, account creation, country and city, onboarding, contact and identity verification, home, search, map and grid, categories, listing details, the eight-step create flow, manage listing, matches, profiles, favorites, saved searches, the proposal builder, offer review, counteroffers, version compare, messages, the trade workspace, scheduling, check-in, completion, reviews, report, dispute, notifications, settings, Safety Center, the policy, and the moderation desk, plus a state gallery and this spec inside the product.

Sample content uses Dubai, Abu Dhabi, Sharjah, Bengaluru, Mumbai, Pune, Jaipur, and Kochi, with AED and INR, and names from both regions. Ahmed and Sara’s AED 900 / 650 / 250 trade is labeled as an example on the landing page. Ahmed’s console listing is already in an accepted trade so the “committed item” rule is visible.
