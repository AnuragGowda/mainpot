# Mainpot reliability and UX audit — September 26, 2026

Status: initial audit; implementation and independent verification pending. Baseline: `2360a44`, clean checkout, 138 unit tests passed. This report distinguishes code findings, browser reproduction, database verification, and physical-device limitations. No production release is implied.

## Scope and acceptance criteria

Audit complete host/player journeys: account sign-in, dashboard, existing unfinished tables, creation of another table, joining/rejoining, initial buy-in, host correction/approval, cash-outs, settlement, payment status, reload, network interruption, and PWA launch/update/offline recovery. Exercise desktop Chromium, Android-sized Chromium, iPhone-sized WebKit, and 320px layouts. Browser emulation cannot establish physical iOS installation, OS suspend/resume, native keyboard behavior, notification delivery, or actual Android installation.

| ID | Priority | Finding / user concern | Required outcome |
| --- | --- | --- | --- |
| A01 | High | Existing unfinished game and new creation produce confusing errors | Old ledger remains recoverable; opening a new game is explicit, permitted within documented limits, and does not overwrite the old ledger or duplicate writes on retry. |
| A02 | High | Dashboard loads profile, statistics, history, friends, invites, and deletion status in one `Promise.all`, after account-link work | Optional failures cannot blank the dashboard. Show precise section errors and retries without representing missing data as confirmed zero. Bound stalled loading. |
| A03 | High | Dashboard only queries finalized `game_participants`; no unfinished-table prompt | Discover all current account-linked active/settling tables on a fresh device. Put Resume actions above statistics; retain device recovery for guests. |
| A04 | High | Reported frozen buy-in edit | Reproduce or identify concrete failure path; bound stalled operations, keep recovery available, prevent duplicate financial mutations and distinguish committed writes from failed refresh/audit side effects. |
| A05 | Medium | Joining requires a separate initial buy-in action | Initial configured buy-in created atomically with a new seat, visible in join copy, pending host approval for guest entries; retries/rejoins never create another initial buy-in. |
| A06 | High | Host edits appear in approval queue | A host's authorized amount correction verifies the entry atomically. Guest-created entries remain pending; guest permissions stay enforced by database rules. |
| A07 | Medium | Bank settlement choice ineffective | Existing bank calculation is only a preview: `SettlementScreen` forces finalized mode to `min`. Host must choose Fewest payments or named banker before lock; save shared immutable choice and use it consistently for all player instructions, counts, ledger, summaries, and payment status after reload. |
| A08 | Medium | General polish and mobile/PWA recovery | Test focus, validation, dialogs, loading/error escape paths, narrow-screen overflow, reload and offline recovery with captured evidence. Address concrete defects; document platform limitations. |
| A09 | High | Guest games can be lost from account recovery after sign-in/sign-up | Preserve proven guest ownership through authentication; never allow an arbitrary browser-session value to claim another user's ledger. Verify account-wide resume after transfer and reject token replay/expiry/conflicting seats. |

## Initial evidence

- Dashboard failure coupling: `app/dashboard/page.tsx`, `load`; finalized-only history: `lib/stats.ts`, `getUserGames`.
- Device recovery exists in `components/ResumeBanner.tsx` and setup, but stores only one `ante_active_game` code and has no account-wide unfinished-table discovery.
- Bank preview exists in `components/Settlement/SettlementScreen.tsx`, yet `displayedTab` unconditionally becomes `min` when ended and `handleFinalize` saves only the status.
- Service worker uses network-first navigation with a dedicated offline page and avoids caching private ledger/API data. Manifest declares standalone display and maskable icons. These are useful safeguards, not evidence of physical-device installation correctness.
- Local Docker context verified as OrbStack. Runtime started for disposable database testing. Initial database browser run blocked by missing Supabase CLI executable in the installed platform package; repairing local tooling before testing.

## Root causes and UX consequences

### A01 — unfinished tables and new creation

The create form offers a device-only Resume card but still accepts a new creation request. `create_game_guarded` rejects anonymous hosts who already have any active/settling table; account hosts have a different rule. This surfaces only after submitting the form. A stale unfinished table therefore feels like a broken Create button. One saved room code is overwritten by the next create/join, further hiding earlier unfinished tables. Never silently finalize a financial ledger to resolve this: preserve it and let the host explicitly resume or start another within an explained limit.

### A02/A03 — dashboard and reconnect discovery

The dashboard's initial account linking can fail before any content is loaded. Its subsequent six-request batch fails as a whole when one optional resource fails. History is derived from finalized participation records, so an active table is absent even for an authenticated returning host. The correction needs both failure isolation and account-wide table discovery, including a fresh browser that has no local room key. Missing statistics/history must be presented as unavailable rather than a false zero or “No settled games.”

### A04/A06 — host corrections and stuck operations

`PendingApprovals` and `ActivityFeed` accept a `void` edit callback, invoke an asynchronous room handler, then close the editor immediately. A rejected operation loses the visible draft; a slow operation gives no reliable progress or recovery. The data path updates the amount and then writes an audit event separately, so an event failure can be reported as a save failure even when the ledger changed. Host correction also updates only the amount and does not approve an entry. Implement an authoritative atomic correction with amount validation, host authorization, verification, and audit; await it in the UI, preserve the entered value on failure, and test a genuinely stalled request. The reported freeze's exact historical session cannot be reconstructed; these are confirmed failure paths, not a claim to have captured that occurrence.

### A05 — joining and opening buy-in

The join RPC inserts a player and a join event without a buy-in. The user then needs a second “Buy in” confirmation despite already agreeing to the table's configured amount. Make join copy explicit about that amount and record exactly one initial pending entry in the same transaction as a new seat. Returning seats must not create more entries, including when a response is lost or when two joins race. A post-join snapshot failure must offer reconnect rather than imply that membership failed.

### A07 — settlement method and banker

The existing Bank tab looks like a payment method but is only a temporary view: lock saves the game's ended status and then forces the minimum-transfer plan. A working banker option must persist before lock, survive reload, and be shared by every player. Personal “you owe” instructions, payment counts, status keys, shared ledger, recap, and summary must all use that same plan. Legacy games should default to minimum transfers. Early cash-outs already locked against a host must retain their recorded obligations and be rolled forward exactly once.

### A08 — PWA and polish

PWA navigation falls back to a dedicated offline page, but its retry link used to go home and lose the game context. The service worker's update promise was unhandled on reconnect. Both are addressed in the first fix commit. Private room/API responses deliberately remain uncached; the app is not an offline financial-write queue. This behavior should stay explicit. Screenshot review also found the optional acquisition survey above the room header and invitation controls; core game actions should take visual priority.

Identity initialization currently depends exclusively on an auth callback; if it never arrives, room loading cannot start. Bound that initialization and give a recoverable error instead of a permanent spinner. Device testing must distinguish Playwright's viewport/user-agent/touch emulation from OS-level PWA lifecycle behavior.

### A09 — guest-to-account transition

Guarded guest creation/join assigns a real anonymous auth UID to seats and hosted games. `linkSessionToUser` only queries `user_id IS NULL`, so it misses those rows after sign-in or sign-up changes the auth UID. The dashboard can then show no unfinished tables even though the device played one. This is a separate ownership problem from a stale room key. Preserve an authenticated proof of guest ownership before switching identities, consume it once after successful account authentication, and transfer the ledger references transactionally. Supabase distinguishes anonymous users from the unauthenticated API role and documents identity conversion/conflict handling in its [anonymous authentication guide](https://supabase.com/docs/guides/auth/auth-anonymous).

## Test coverage gaps found during the audit

The original realtime suite explicitly expected manual initial buy-ins and corrections that remain pending. Its green results therefore did not establish the desired behavior. New regressions need automatic join/rejoin idempotency, host-edit atomicity and stalled-request recovery, multiple saved unfinished tables, bank-plan reload/shared payment status, and dashboard partial failures. A new dashboard failure injection initially used HTTP 503; the SDK retries transient failures, so the immediate-failure test is changed to deterministic HTTP 400. Stalled-read behavior is checked separately with a bounded-read test.

## Initial browser evidence

Before integrating the lifecycle/bank batches, the local-mode smoke suite passed 15 desktop checks and 29 mobile checks (Android-sized Chromium plus iPhone-sized WebKit). One WebKit service-worker test was explicitly skipped because Playwright does not expose the needed worker control. Real Chromium service-worker offline/online route recovery passed on desktop and mobile. These are initial results, not final integrated validation.

- [Desktop offline fallback](evidence/chromium-pwa-offline.png)
- [Desktop room after recovery](evidence/chromium-pwa-recovered.png)
- [Mobile offline fallback](evidence/mobile-chrome-pwa-offline.png)
- [Mobile room after recovery](evidence/mobile-chrome-pwa-recovered.png)

## Verification plan

Run baseline and regression unit coverage, database migrations/authorization checks on a disposable Supabase instance, full host/player realtime browser journeys, independent fix review, then targeted regression reruns for any verifier findings. Inspect desktop/mobile screenshots and exercise a real service worker offline/online. Record tests and unresolved limits below; do not claim production fixed without deployment and exact live-route verification.

## Implementation and verification record

Pending.
