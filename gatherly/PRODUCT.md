# Gatherly

**Find your people by doing something together.**

Gatherly helps locals, newcomers, travelers, and hosts find small activities nearby. It is not a dating app and not a feed. The activity is the object. The product is the journey around that activity: the room before, the optional tools during, and the private follow-up after.

## 1. Architecture

The app is a Next.js App Router client, TypeScript, and Tailwind. All product rules live in a pure reducer (`src/lib/reducer.ts`) over a relational state object. Screens only dispatch and read. That keeps join, waitlist, privacy, and mutual connections testable without a browser.

The browser persists that state in `localStorage` so a refresh keeps RSVPs, chats, and connections. There is no server account in this prototype. The same entities are written as Postgres in `db/schema.sql` so a later Supabase project can replace the reducer without renaming the product.

What is intentionally local:

- Email and phone codes are the demo code `246810`. Nothing is sent.
- Identity review can be marked pending, with an explicit demo control for the badge.
- Chat, polls, and pulses update in the tab. Supabase Realtime would subscribe to `messages`, `poll_votes`, and `pulse_votes`.
- The map is a schematic of central Dubai projected from real lat/lng. Mapbox can use the same coordinates. Private doors are never the public pin.
- Reminders are notices created when someone joins, not a push worker. The notification row is the push payload.
- Moderation stores a report. It does not publish it.

Success is offline: check-in rate, completion, mutual connections per event, a second event within 30 days, repeat hosts, waitlist conversion, safety incidents, and reported belonging. The interface does not rank people or optimize for time in the app.

## 2. Information architecture

Five primary items: Discover, Map, Create, Messages, Profile.

| Screen | Route | Job |
| --- | --- | --- |
| Welcome and code | `/` | Enter as Maya or start a new profile |
| Onboarding | `/onboarding` | Name, neighborhood, interests, size, pace, language, access, agreements |
| Discover | `/discover` | Today, fit, small circles, communities, last-minute openings, your next plan |
| Search | `/search` | Date, distance, type, size, price, language, access, pace, women-only |
| Map | `/map` | Same filters, neighborhood pins, far plans listed under the map |
| Activity | `/activity/[id]` | Fit, host, capacity, hidden address, join or waitlist |
| Room | `/activity/[id]/room` | Chat, prompts, polls, board, checklist, on my way |
| Live | `/activity/[id]/live` | Check-in code, cards, bingo, timer, vote, anonymous pulse, safety |
| After | `/activity/[id]/after` | Mutual connections, album, private feedback, follow-up |
| Create | `/create` | Nine-step host flow, including edit and repeat |
| Host | `/host`, `/host/[id]` | RSVPs, approvals, announcements, polls, arrivals, feedback |
| Messages | `/messages` | Plan rooms, circle chats, and mutual direct messages |
| Community | `/community/[id]` | Upcoming, people, past, chat. Attendance does not require membership |
| Profile | `/profile` | Journal, people you actually connected with, saved plans |
| Person | `/people/[id]` | Prompts, hosted plans, report, block. No follower count |
| Safety | `/safety` | 999 / 998, trusted contact, reports, blocks, women-only opt-in |
| Notices | `/notifications` | Reminders, waitlist, mutual yes |
| Settings | `/settings` | Verification, reminders, preferences, reset |

## 3. Data model

Entities match the brief: User, UserPreference, Verification, Activity, Venue, RSVP, WaitlistEntry, Community, CommunityMember, Conversation, Message, Poll, PollOption, PollVote, CheckIn, PromptCard, ConnectionRequest, MutualConnection, EventMedia, Review, SafetyReport, Notification. The prototype also stores blocks, location-share consent, checklist items, suggestion-board lines, game marks, and anonymous pulse votes. Interactive session state is those marks, the pulse, and the live poll rather than a separate score.

Compatibility uses interests, pace, preferred group size, language, price, access needs, and whether the plan welcomes newcomers. It does not read gender, age, or anything about appearance. Women-only is an access rule the person opts into, not a match feature.

Exact addresses for private, approval, and women-only plans stay hidden until the person is confirmed. Early cancellation promotes the oldest waitlist entry and tells them privately. A no-show is the reliability signal. Cancelling in the app is not.

A connection request is invisible to the other person. Both people get a conversation only when the wish is mutual. Safety notes on feedback become reports and are left out of the host's summary.

## 4. Principal flows

**Newcomer.** Welcome, code, onboarding, Discover. Open a plan, read why it fits, join. Confirmation offers a calendar file and the room. Answer a prompt, vote, mark the checklist, or say you are on the way. Cancel if needed. The first waiting person moves in.

**During.** From the home card, enter event mode. Show the check-in code or tap I'm here. The host can type the code or mark the roster. Cards, bingo, and the pair timer are optional. The pulse is Great, Okay, or Need host. Need host notifies the host without a name. Safety offers 999, a trusted contact, report, and block.

**After.** People you attended with can be saved privately. If Hana already chose Maya, Maya's yes becomes a mutual conversation immediately. Otherwise Maya only sees "Saved privately." Feedback is private. A safety checkbox files a report. Follow-up opens the create flow. Hosts can repeat the plan a week later.

**Host.** Picnic dashboard shows the roster, waitlist, announcements, a live poll, arrival codes, pulse counts, and unnamed feedback. Approval plans confirm or decline in private. Cancelling notifies everyone involved.

**Trust.** Report from a plan or a profile. Block hides that person and does not tell them. Private dinner for Maya shows Downtown until she accepts. Yoga stays visible and refuses join until she opts in.

## 5. Visual system

Warm sand background `#f3eee6`, cream cards `#fffdf9`, coral `#e15d32` for the action, deep navy `#1a2744` for text and the event-mode panels, teal for verification and calm confirmation. Fraunces for titles, Outfit for interface text. Cards and buttons are heavily rounded. Photography is of places and activities. People are illustrated portraits so the product does not become a wall of faces. Energy is a small pill: Relaxed, Lively, Focused. Empty states are a small drawing and a sentence. Motion is a short rise, and it turns off when the person asks for reduced motion.

The tone is a host who has saved you a chair. It should not feel like a brand campaign or a swipe deck.
