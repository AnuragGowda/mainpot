# Mainpot account and return-use UX review

> Follow-up: [UX fixes and verification](ux-fix-verification.md) records the subsequent implementation, checks, and remaining release/device boundaries. This assessment describes the earlier inspected revision.

September 26, 2026; source revision `19fae9e`. A separate independent reviewer inspected the account-only journeys. Root checked the highest-impact source findings. This is **source-based evidence**, not a fresh signed-in browser run. The local UI inspection used single-browser mode, and the production browser inspection used signed-out public pages. No account was created, no account profile was modified, and no private account data was exported.

The [earlier reliability report](report.md) contains specific disposable-backend regression results for account recovery and dashboard failures. Those results do not prove every usability concern below is closed, nor do they establish current production account behavior.

## Route and state coverage

| Flow | Reviewed states | Assessment and runtime boundary |
| --- | --- | --- |
| Password sign-in | Validation, bounded auth request, transferred guest ownership, auth succeeded/recovery failed | Current source provides explicit retry/continue recovery states. Real hosted credentials and ownership continuity were not exercised in this pass. |
| Sign-up | Display name, password account, immediate session vs email confirmation, existing guest ownership | Confirmation-required branch misses the recovery caveat shown by magic-link sign-in. A ten-minute guest proof can expire before confirmation. |
| Magic link | Email request deadline, confirmation screen, same-browser recovery | Copy acknowledges same-browser recovery. Delivery, spam filtering, browser handoff, and expiry were not physically tested. |
| Google OAuth and callback | Preparing guest proof, provider redirect, callback exchange, safe return route, failed claim | External redirect targets are constrained in source. Actual consent/provider/email identity conflict and platform browser handoff remain unverified. |
| Dashboard initialization | Required auth, optional section reads, deadlines, failed auth, partial failure, refresh | Source now distinguishes unavailable sections from true empty data and retains loaded content on retry. Signed-out live navigation redirects correctly. |
| Resume | Hosted/joined active or settling tables, expiry filtering, account vs device identity | Local source addresses active table discovery. Ended-but-unpaid games are not in the resume query. Actual fresh-device account resume is prior regression evidence, not fresh production evidence. |
| History and stats | First use, finalized participation, recent results, rematch | Locked game results and completed real payments are distinct. History does not expose the latter's progress. |
| Profile and payment handles | Validation, editable profile, usernames, optional bio/payment shortcuts | Optional money shortcuts are disclosed. Actual payment-app deep links and external receipt verification were not tested. |
| Friends and game invitations | Search, empty state, requests, invitation rendering, send/accept/decline error paths | Findability assumes an existing account/profile. Game-invite friend loading has a concrete false-empty branch. No two-account browser interaction was driven here. |
| Recurring templates | Create/select, buy-in/name prefilling, preferred roster | Roster reminder is captured without being shown when using a template. No edit/delete UI was found. |
| Export | Export RPC and download contents | Includes selected account/history resources, not a complete related financial ledger. A downloaded real export was not obtained. |
| Deletion | Request confirmation, pending/processing/completed/cancelled rendering, support contact | Staff processing is disclosed. No pending cancellation action or fulfillment timeframe is provided. No deletion request was sent. |

## Findings, priorities, and acceptance scenarios

### AC-01 — delayed email confirmation can outlive guest recovery proof

**P1; source-confirmed expiry and missing instructions; full delayed-confirmation journey not browser reproduced.**

The guest-transfer migration creates a proof valid for ten minutes and rejects an unclaimed expired proof (`supabase/migrations/20260926054911_account_transfer_tokens.sql`, mint/claim functions). Password sign-up prepares that proof. If email confirmation is required, `app/signin/page.tsx` shows its email screen but does not set `recoveryPending`, unlike magic-link sign-in. Callback/retry code attempts to consume the proof; after the guest identity is replaced, it does not demonstrate a safe means to mint a fresh proof for the old identity.

**Impact:** a host who waits to confirm email can successfully get an account yet fail to recover the guest ledger. A retry action may keep retrying a proof that is no longer valid. This needs verification with the actual confirmation configuration; it is not a claim that every sign-up loses games.

**Minimal correction:** explain the same-browser requirement in every relevant confirmation state; design a recovery window and reissue path that cover ordinary confirmation delays without weakening proof-of-ownership, expiry, replay, or destination-email protections. Simply extending all bearer proofs indefinitely would be an unsafe response.

**Acceptance:** start a guest game, start sign-up, confirm after more than ten minutes, and recover ownership from the supported browser flow. Wrong-email, foreign caller, expired/replayed proof, and conflicting-seat cases must continue to fail safely. If recovery requires a new action, the error must offer one that can actually succeed.

### AC-02 — history gives no remaining-payment cue

**P1 for returning players; source-confirmed omission.**

Participant results are captured when the game becomes `ended`; `settlement_payments` has its own state. `lib/stats.ts` reads participation for results/history, and `app/dashboard/page.tsx` renders date, player count, buy-in and profit/loss under “Your settled results.” It does not display a payment-progress state. `getUnfinishedGames` only returns active/settling games.

**Impact:** a person returning to pay or collect can misread a locked game's “settled” result as completion, or have to inspect old game links to find the action.

**Minimal correction:** distinguish final ledger results from payment completion, show remaining self-reported transfer progress, and link directly to the outstanding action. Never imply that marking sent means Mainpot verified a bank transfer.

**Acceptance:** a locked game with two transfers reads 0/2, then 1/2 and complete as state changes. Payer and recipient can reach their remaining action from the dashboard after reload.

### AC-03 — failed friend fetch looks like no saved friends

**P2; concrete source error branch.**

`components/GameRoom/FriendInviteList.tsx` has a `loadFailed` state, but the inner `getFriends` catch only empties `friends`. That error therefore renders “Add friends to build your regular table.” The outer catch covers other failures and cannot distinguish this already-caught fetch error.

**Impact:** an existing host sees their saved contacts disappear and is sent toward adding friends rather than retrying a failed read.

**Minimal correction:** set the failure state on the failed fetch, preserve any previously loaded contacts where appropriate, and offer a viable retry.

**Acceptance:** failed fetch shows unavailable/retry; successful empty result shows the real empty state; a successful retry restores contacts.

### AC-04 — preferred roster reminder disappears when using a template

**P2; source-confirmed display gap.**

Selecting a template in `app/create/page.tsx` populates `preferredRoster`. The roster field is displayed within the optional save-template form, but a selected existing template with saving unchecked does not show that reminder or use it to create a host checklist.

**Impact:** a host entering regulars into a reusable setting expects to see them next time. The promised reminder has no visible payoff in that common use state.

**Minimal correction:** show a host-only reminder when the template is selected, or remove the roster capture until it has a supported purpose. It should not silently create guest seats.

**Acceptance:** select a template with three names and see a clearly labelled reminder; guests do not receive private roster notes, and no duplicate seats are created.

### AC-05 — export promise exceeds its current financial contents

**P2; source-confirmed scope; exported runtime file not inspected.**

The dashboard offers to “Download the information tied to your account.” The export function in `supabase/migrations/20260831010000_account_controls_and_templates.sql` includes profile, templates, hosted game rows, participation results, friendships, invitations, and feedback. It does not include related players, buy-ins, cash-outs, or settlement-payment rows as a complete ledger export.

**Impact:** a user trying to preserve or inspect their financial history can receive a record with results but without the detailed transactions behind them.

**Minimal correction:** either describe exactly what this export includes or add the caller-authorized ledger details. Permission boundaries matter: do not export unrelated players' private profile or payment-handle data merely because they shared a table.

**Acceptance:** a fixture with one hosted and one joined game exports the user's own appropriate seat, ledger entries and payment state, with versioned field descriptions and no unrelated private profile data.

### AC-06 — social discovery depends on another account

**P2 opportunity; intended constraint, not a malfunction.**

`app/friends/page.tsx` and `lib/friends.ts` search saved profiles by name/username. Saved invitations require permanent accounts. A host cannot find an unregistered regular by their ordinary real-world identity.

**Minimal correction:** keep direct code/link guest invitations primary and make that fallback clear when search finds nobody. Do not force every player to register in order for a host to obtain the core value.

**Acceptance:** a host with no matching saved friend can still share an obvious guest invitation and complete the game without a new social graph.

### AC-07 — reusable templates lack maintenance controls

**P3; source-confirmed feature gap.**

Creation/selection APIs and UI exist in `lib/account-data.ts` and `app/create/page.tsx`, but no edit/delete controls were found. The table permits owner management through its policies, so this is missing product functionality rather than an inherent data restriction.

**Minimal correction:** add a small owner-only manager if genuine returning hosts use templates. Defer broader template features until then.

**Acceptance:** change a stale buy-in or reminder and remove a template; cancel leaves it intact; other users cannot modify it.

### AC-08 — deletion depends on support with no visible cancellation/time expectation

**P3; disclosed operational limitation, not a hidden immediate-delete promise.**

Dashboard copy correctly describes a support request and shows status/contact information. There is no pending-cancellation action or stated service expectation. Schema support for a `cancelled` state does not by itself create a user action.

**Minimal correction:** offer cancellation while pending and set a real support expectation if the app will support outside accounts. Avoid inventing an SLA that nobody can meet.

**Acceptance:** pending requests can be cancelled before processing; status changes are clear; users understand what has and has not been deleted.

## Overall judgment on the account surface

Current dashboard error isolation and unfinished-game discovery are materially better designed than the old live experience. The account surface still needs its matching release and honest hosted verification. Prioritize guest ownership continuity and outstanding-payment discovery before adding friend/social features, profile fields, or template variations. Most first-night participants should be able to get the core value without interacting with this surface at all.
