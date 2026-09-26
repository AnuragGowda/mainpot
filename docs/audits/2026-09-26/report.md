# Mainpot reliability and UX audit — September 26, 2026

Status: audit, fixes, and independent verifier/refix loop completed locally. Baseline: `2360a44`, clean checkout, 138 unit tests passed. This report distinguishes code findings, browser reproduction, database verification, and physical-device limitations. No production release was performed.

All reported concerns have implemented fixes: unfinished-game recovery and safe new creation, account dashboard Resume prompts, bounded host edits with retained drafts, automatic opening buy-ins, immediate host approval, and a persisted host/player bank option. The broader pass also addressed guest-account recovery, settlement races, stale-read prevention, cash-out draft loss, and PWA/navigation errors. Final results are 155 unit tests, 110 integrated realtime checks, 72 smoke/PWA checks, six database assurance scripts, and ten hosted follow-up checks passed. Three WebKit service-worker-control cases are explicitly skipped. Physical installation and OS lifecycle checks remain unverified.

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
| A10 | Medium | Cold local data requests occasionally reject a valid session | Handle the precise pre-execution auth rejection safely without replacing identity or duplicating financial writes. |

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

| Item | Implemented behavior | Regression evidence |
| --- | --- | --- |
| A01 | Guests may host two unexpired unfinished tables; setup explains this and offers separate Resume cards plus Start another game. Device recovery keeps three recent room codes, preserving the legacy single key. No ledger is silently ended. Creation uses a persistent operation/code so retrying an unknown outcome returns the original table; limit failures remain visible beside recovery actions. | Committed response lost, then safe replay; concurrent server create/replay; second-table creation, both recovery cards, third-table limit and first-ledger preservation; session compatibility unit cases. |
| A02 | Required auth and section reads have deadlines. Each optional section settles independently with an unavailable message; profile/history remain usable when deletion status fails. Retry retains the loaded page. | Injected optional endpoint failure and retry, bounded-read units, desktop/mobile dashboard screenshots. |
| A03 | Dashboard discovers hosted and joined active/settling tables, removes expired/ended tables, deduplicates seats, and puts Resume above statistics. Membership queries name the correct foreign key now that games also reference a banker. | Fresh browser sign-in and same-seat host controls; unfinished card disappears after finalized settlement. |
| A04 | Correction editor awaits completion, disables only its busy controls, keeps the entered draft and visible retry error on timeout. Correction writes carry an operation key; unchanged retries reuse it and a changed amount gets a new key. Auth initialization also has a bounded fallback. Failed auth verification cannot silently replace the existing browser identity with a fresh anonymous account. | A request held for 20 seconds releases the editor at its 15-second deadline; the retained draft can be changed and saved as exactly one entry. Database checks cover idempotent replay and unauthorized correction. |
| A05 | A new join transaction creates a seat, one configured opening buy-in, and its audit trail. Player openings remain pending. Existing/rejoining seats receive no additional entry. A committed join with failed refresh offers recovery. | Two-player realtime joins, reload/rejoin without duplication, guarded database writes. A previously left seat is returned unchanged; rejoining does not reverse its recorded departure. |
| A06 | Host correction validates amount, verifies the entry, and records the edit atomically. Direct unaudited amount changes are rejected. Host-created rebuys retain immediate approval. | Corrected guest entry leaves Needs approval and updates the pot; ordinary guest entries still require approval. |
| A07 | Host chooses Fewest payments or a named active banker before locking. The immutable shared choice drives all personal/shared transfers, totals, payment keys, and reloads. Banker sees outgoing payouts and incoming collections independently. | Three separate sessions plus a managed fourth player; partial completion after reload and shared final completion. Database denies non-host, cross-game, active-phase, and finalized plan rewrites. |
| A08 | Offline retry preserves the intended room path/query/hash. Reconnect update failures are caught. Acquisition and post-game feedback sit below core actions. Financial settlement gates are enforced at the database as well as in the UI. | Real Chromium worker offline/reload/online navigation; manifest/cache checks; multi-width smoke, keyboard/validation dialogs, and captured screenshots. |
| A09 | Before guest auth is replaced, mint a ten-minute hashed capability. Permanent auth claims it transactionally, transfers seats/host ownership, clears guest expiry and preserves finalized history. Same claimant can retry a lost response; different claimants, expired tokens, wrong email, and conflicting seats are rejected. Token stays in same-browser storage/cookie, never callback URLs. | Guest signup then fresh-browser account recovery; dedicated token authorization/expiry/conflict/replay/history checks. Real Google OAuth/email delivery are outside disposable-provider verification. |
| A10 | Retry a data request once after the exact HTTP 401 / PGRST303 / “JWT issued at future” rejection. Preserve the same body, operation key, identity, and abort signal. No retry for other failures or unknown write outcomes. Live data GET/HEAD requests bypass the browser cache. | Nine fetch-policy unit cases plus an injected creation rejection on every device project verify identical replay, finite retry, other-error handling, abort, method precedence, and unchanged writes. |

### Independent verifier and refix loop

Separate agents handled lifecycle fixes, bank/account work, and independent PWA/integration review in isolated worktrees. Root integrated each batch and owned final verification. The reviewer and integrated tests prompted these additional corrections:

1. Banker incoming payments were hidden whenever outgoing payments existed; render both directions and keep the remaining collection visible after payouts.
2. Dashboard retry briefly removed loaded content; retain the page during refresh.
3. Unsafe end transitions could bypass pending entries, cash-outs, or stale discrepancy allocation. Add authoritative phase, completeness, allocation-capacity, and finalized-immutability checks.
4. Financial writes could race the end transition. Serialize on the game row; keep observer-host automatic zero cash-outs compatible with the phase guard.
5. Early-exit requests could race active-to-settling and leave an unresolvable request. Serialize early-exit status changes with the same game transition.
6. A new banker foreign key made the dashboard membership query ambiguous; specify the seat-to-game relationship explicitly.
7. Correction drafts reused a key after the amount changed; keep the key only for the same request payload.
8. Recovery tokens initially appeared in callback parameters and retries could be mistaken for account-creation failures; keep same-browser proof, email binding, bounded calls, and an authenticated recovery-retry state.
9. Creation could commit without returning its room code, then retry as a second game. Reserve one owned operation with the full payload and retain it through the client deadline. Concurrent requests and a committed-but-lost response now have regression coverage.
10. Auth read errors used to be treated like absent sessions and could trigger a new anonymous identity. Only a genuinely missing session may create a guest account.
11. Browser helpers could mistake a join-dialog heading for a completed join; wait for the committed seat. Multi-session contexts now inherit device settings instead of silently using desktop defaults.
12. Cold requests on the disposable PostgREST 16.1 stack sporadically rejected a valid JWT. The [upstream changelog](https://github.com/PostgREST/postgrest/blob/main/CHANGELOG.md) records this bug as fixed in 16.3. The client now retries only that precise pre-execution rejection once, with the identical request. Token verification and server clock settings remain unchanged.
13. Rapid cash-out entry exposed a draft reconciliation race: after blur, the old snapshot could overwrite the amount while its save was pending. Preserve pending and failed drafts, use a synchronous draft ref, and retry unchanged failures. Independent follow-up review caught the same fallback after a successful save before its snapshot arrived; remove the fallback and explicitly hold the snapshot in the regression. Retain rapid multi-player entry coverage.
14. Local smoke assertions still expected the survey above core controls and a copy-only bank label in the rendered plan. Update them to assert the intended order and the actual locked banker control before and after reload; do not change the product to satisfy stale assertions.
15. WebKit recorded a push-config access-control error during full navigation. The existing promise catches ordinary rejection; unmount-only cleanup did not eliminate the error. Device-only games cannot receive server push notifications, confirmed by the server's configuration requirements. Skip that unsupported request entirely and abort hosted config requests on permanent page exit as well as unmount. Independent review also preserved requests when a page is retained in the browser's back-forward cache, so restoring it does not leave push controls disabled. Tests assert zero local-mode config requests and retain the uncaught-browser-error check. The exact browser-internal error cause is not proven.
16. The account-recovery test reloaded immediately after submitting deletion, cancelling an unacknowledged request on WebKit. Wait for the confirmed pending state before asserting persistence after reload. This changes test sequencing, not account deletion behavior.
17. Repeated tablet testing exposed intermittent lost input under parallel load. Nine serial traced tablet checks and 45 repeated parallel checks across all five profiles passed, including native input/DOM identity diagnostics. Snapshot GET responses had no explicit cache control; force live PostgREST GET/HEAD reads to `no-store`, preserve write options, and verify the entered value before moving to the next field. HTTP caching is a plausible contributor, not a proven cause. The final integrated run follows these changes.
18. The delayed-snapshot regression passed its product assertions but initially failed while unregistering a still-running request handler. Drain released handlers before cleanup, then rerun the same assertions; the repeated 45-case run passed with that repair.

### Release and verification boundary

All changes are local commits on this checkout. The disposable database receives migrations for testing; the developer database and hosted production database have not received these migrations. No push, CI run, hosted deployment, or independent production verification is implied. The UI requires its matching migrations before a release, especially the automatic join, correction RPC, banker columns, and ownership transfer.

Apply the six new migrations together, in filename order, through the normal release workflow:

- `20260926000000_lock_settlement_plan.sql`
- `20260926054008_lifecycle_buy_in_reliability.sql`
- `20260926054911_account_transfer_tokens.sql`
- `20260926060000_serialize_ledger_phase.sql`
- `20260926061504_game_creation_idempotency.sql`
- `20260926070000_serialize_early_cash_out_phase.sql`

The guest limit of two unfinished tables is an explicit policy retained in the UI and database; account hosts can recover their tables through dashboard membership. Timeout errors describe an uncertain outcome when appropriate: a client deadline does not prove a server write rolled back. Creation and host correction therefore use owned idempotency keys rather than treating timeout as permission to issue a different financial write.

### Visual assessment

The 390px iPhone-sized captures show the account Resume action above statistics, full-width reconnect controls, readable amount/recipient rows, and no horizontal overflow in the dashboard or bank result. Banker instructions show both directions before the recap/share card; optional feedback now follows the payment ledger. Desktop and tablet captures are checked separately rather than treating mobile screenshots as proof of larger layouts. The screenshot names contain the actual CSS viewport width, while device-scale raster dimensions can be larger.

- [iPhone-sized dashboard reconnect](evidence/dashboard-resume-390.png)
- [Android-sized dashboard reconnect](evidence/dashboard-resume-393.png)
- [iPhone-sized banker payout and collection](evidence/mobile-safari-bank-390.png)
- [Android-sized banker payout and collection](evidence/mobile-chrome-bank-393.png)
- [Desktop banker payout and collection](evidence/chromium-bank-1280.png)
- [Tablet banker payout and collection](evidence/tablet-safari-bank-768.png)
- [Tablet dashboard reconnect](evidence/dashboard-resume-768.png)

### Physical-device acceptance boundary

Playwright emulation establishes browser rendering, touch viewport behavior, network interruption/reload, and application/data flow. It does not establish installation from Safari's Share sheet, Android's native install UI, OS process eviction, real keyboard placement, standalone safe-area behavior on hardware, or push delivery. No physical phone was available to the audit. The disposable-stack auth anomaly and its precise bounded retry are documented as A10; they are not evidence of a production clock problem.

For an actual-device release check, install from the target browser, create/join and approve a table, background/kill/reopen the installed app, recover the same seat, toggle airplane mode while the room is open, reconnect and reload, then finish cash-outs and confirm the persisted payment plan. Check the installed app again after deploying an update. Financial writes are deliberately not queued offline and private ledgers are deliberately not cached in the service worker.

### Final test matrix

| Check | Result / boundary |
| --- | --- |
| Unit tests | 155 passed across 24 files. |
| Disposable database assurance | All six scripts passed: lifecycle/ledger rules, audit authorization, settlement allocation/immutability, account transfer security, early-exit phase concurrency, and concurrent creation/replay. |
| ESLint | Passed after the final product fixes. |
| TypeScript / production build | Final production build and `tsc --noEmit` passed after the last product change. |
| Realtime browser flows | 110 passed across all five profiles in one final integrated run (4.1 minutes, three workers, zero retries). |
| Hosted follow-up | Ten account-recovery/navigation and shared-bank checks passed across all five profiles after optional push setup cleanup (35.1 seconds). The subsequent back-forward-cache guard received review and final build/type checks; actual cached-page restoration remains a manual platform check. |
| Local-mode smoke / PWA | 72 passed, three explicitly skipped WebKit worker-control cases (31.6 seconds, three workers, zero retries). Actual Chromium worker offline/recovery passed on desktop and mobile. |
| Independent review | Lifecycle, bank/account, PWA, database-phase integration, exact JWT retry, fresh-read policy, and final cash-out refix reviewed by separate agents. No remaining actionable blockers reported. |
| Production | Not pushed or deployed; no hosted migrations applied or live production validation performed. |
| Physical devices | Not available; installed-app lifecycle acceptance remains a release check. |

Both browser suites use these projects: desktop Chromium (1280px), Pixel 5 Chromium (393px), iPhone 13 WebKit (390px), desktop WebKit (1440px), and iPad Mini WebKit (768px). The smoke suite also forces 320px layouts, checks dialog placement and keyboard focus, validates amount errors, and exercises the complete local game journey. “Safari” project names refer to Playwright WebKit emulation, not an installed Safari app or physical Apple device. Native install prompts are simulated in browser tests; the offline navigation test uses an actual Chromium service worker.

Browser fault-injection contexts block service workers so Playwright can intercept requests consistently in WebKit; the separate PWA test enables a real worker and exercises its offline navigation behavior. Early WebKit failure-injection misses were test interception failures: the actual correction succeeded normally, and the optional dashboard endpoint responded normally. They were rerun with deterministic interception rather than counted as successful injected-failure coverage.

Reproduce locally:

```sh
npm test
npm run lint
npx tsc --noEmit
npm run test:db:assurance:isolated
PLAYWRIGHT_ALL_DEVICES=1 npm run test:e2e:realtime -- --workers=3
NEXT_PUBLIC_SUPABASE_URL='' NEXT_PUBLIC_SUPABASE_ANON_KEY='' PLAYWRIGHT_ALL_DEVICES=1 npm run test:e2e -- --workers=3
git diff --check
```

Run the database and browser commands serially. The realtime harness uses the isolated `mainpot-e2e` project, API port 55321, app port 3110, and a separate build directory; it resets only that disposable database. The final local-mode suite builds and serves the production application on port 3100 with hosted credentials cleared. Ensure port 3100 is free before running it, because the default smoke configuration permits reusing an existing developer server.

The full realtime run verified application revision `20d3844`; the successful local-mode and hosted follow-ups verified `223eb17`. Final production revision `536dda9` adds only the reviewed cached-history preservation guard and passed production build, type checks, and lint. These revisions are recorded so browser evidence is not silently attributed to an untested native cache-restoration path. See [verification record](verification.json) for commands, counts, environment, and boundaries. Raw browser traces are kept out of the committed report because they can contain temporary auth credentials; the committed evidence consists of screenshots and this summarized record.
