# Settlement rounding review and fix

## Finding and change

The previous proportional allocation rounded each share independently and gave
the remainder to the last player. Splitting a $0.02 shortage between four $1.00
losses produced adjustments of $0.01, $0.01, $0.01, and **-$0.01**. This increased
one player's loss instead of reducing it.

New decisions use exact largest-remainder allocation in integer cents. The same
example now produces $0.01, $0.01, $0.00, and $0.00. Ties follow the existing
player order (`joined_at`, then `id`) in both the browser and PostgreSQL.
BigInt quota products retain precision across the supported ledger range.

Saved decisions include `rounding_version: 2`. Historical decisions without a
version, and explicit v1 decisions, retain their original payment amounts and
acknowledgement keys. The migration does not rewrite historical ledgers.

Results reconstruct the complete saved decision, including decisions changed
in another host tab. Saving an edited decision requires a successful snapshot
refresh before entering review. Failed refreshes keep the editor open and offer
a retry. Error-boundary retries also retain their fallback until refresh succeeds.

The database rejects unknown or malformed rounding versions. Numeric JSON `2`
and `2.0` select the same version. Payment acknowledgements still require an
exact tuple from the locked plan and existing ownership checks.

Browser fault injection uses the existing context helper to block service-worker
interception. Payment-read failures use direct synthetic responses with CORS
headers, avoiding an unnecessary upstream fetch during reload. The assertions
for recovery and absence of uncaught errors remain enabled. Navigation timeout
diagnostics now identify pending requests without recording queries or tokens.
Late realtime callbacks after unsubscribe no longer start snapshot/auth reads;
a focused lifecycle regression checks both disposed and active subscriptions.

The full browser run also exposed competing focus owners in the early cash-out
sheet: input autofocus followed by a delayed Cancel focus could interrupt initial
entry in WebKit. Its focus/scroll lifecycle now follows opening and closing only;
busy-state changes only update the keyboard listener. Closing restores trigger
focus unless the dialog has already reopened. A browser regression waits for
opening frames and verifies the amount input remains focused before entry.

## Navigation diagnostics

Reload diagnostics captured native WebKit fetch messages from the departing
document immediately before `pagehide`, without a DOM error or unhandled
rejection. The installed Supabase Auth and PostgREST clients catch transport
rejections; the payment hook also reports failed reads as unavailable. Playwright's
WebKit adapter converts JavaScript console errors, including native fetch
messages, into `pageerror` events.

The harness retains every raw error. A narrow classification covers only auth
and payment GET/HEAD reads with the exact native signature, a matching TypeError
fetch rejection during active navigation, imminent `pagehide` in the same
document, a different-document `pageshow`, a successful read of the same path in
the replacement document, and no DOM errors or unhandled rejections. All other
errors remain failures. Financial recovery assertions still run. This establishes
a handled navigation-associated transport rejection; it does not establish the
underlying transport cause. The final run retained three such handled native
messages across two Safari payment-recovery cases; their raw errors and lifecycle
evidence are saved in `navigation-diagnostics.json`.

Creation now persists both resume storage keys while skipping the departing
create page's notification. That notification previously woke mounted resume
cards immediately before document navigation, starting unused lookups. Native
cross-tab storage events and normal callers' notifications still work; the new
document revalidates saved tables on mount.

A main-frame binding identifies each actual document by `performance.timeOrigin`.
New-document fetches await binding acknowledgement before starting. The tracker
can retire only main-frame read fetches tagged with the previous known document:
GET/HEAD or the read-only `get_game_by_code` RPC. It preserves retirement evidence.
Current/unknown-document requests, financial writes, XHR, child-frame requests,
and route handlers remain tracked. Same-document frame navigation never retires
reads. Unit regressions enforce these boundaries.

## Verification

Review started October 1 and final verification continued October 2. Commands
run serially against disposable local Supabase and headless browsers:

- Unit tests: **295 passed in 45 files**.
- Lint and production build: **passed**.
- Public/local browser smoke: **107 passed**, with **3 expected WebKit offline-PWA skips**.
- Focused settlement/payment/lobby browser repetitions: **30 passed** across five profiles.
- Early cash-out focus and complete payment lifecycle repetitions: **10 passed** across five profiles.
- Database migrations/RLS/security: **17 assurance suites passed** against the disposable stack.
- Full realtime browser suite: **165 passed** across Chromium, mobile Chrome, mobile WebKit, desktop WebKit, and tablet WebKit (10.9 minutes).

```sh
MAINPOT_DB_ASSURANCE_BEFORE_BROWSER=1 PLAYWRIGHT_ALL_DEVICES=1 npm run test:e2e:realtime -- --workers=2
NEXT_PUBLIC_SUPABASE_URL='' NEXT_PUBLIC_SUPABASE_ANON_KEY='' NEXT_E2E_DIST_DIR=.next-e2e PLAYWRIGHT_ALL_DEVICES=1 PLAYWRIGHT_PORT=3120 npm run test:e2e -- --workers=2
npm test
npm run lint
npm run build
PLAYWRIGHT_ALL_DEVICES=1 npm run test:e2e:realtime -- --grep 'locks an early cash-out against the host' --repeat-each=2 --workers=2
PLAYWRIGHT_ALL_DEVICES=1 npm run test:e2e:realtime -- --workers=2
git diff --check
```

New regressions cover both discrepancy signs, proportional and selected
allocation, unequal remainders, legacy payment keys, malformed versions, large
numeric values, and rejection of one-cent payment drift. Browser regressions
cover preview, failed refresh and retry, locking, acknowledgement, and reload.

Final source review found no further actionable issues in the patch.
`git diff --check` passed. Test-generated replacements of historical screenshots
were restored; source changes and this report remain available for review.

## Git, CI, and production boundaries

At the end of this local verification, the changes were uncommitted. The
subsequent commit/push and readiness assessment are tracked in the
[October 2 report](../2026-10-02/readiness/REPORT.md). The baseline main **CI** workflow run was
[36298902474](https://github.com/AnuragGowda/mainpot/actions/runs/36298902474),
successful for `8f1fdd6d4972e49142b3ba300a878ebb86aeb826`. That run does not
validate this patch.

Migration `20261001210118_bound_discrepancy_rounding.sql` has been exercised
locally. It has not been applied to hosted Supabase, and the frontend has not
been deployed. A production release still requires the exact pushed commit,
all required CI jobs passing, and `npm run release:production`.
Apply the hosted database migration before releasing the frontend: new v2
decisions require the matching server-side payment validator. Older decisions
and clients can continue saving v1 plans during that rollout.

Automated browser profiles do not establish recovery on physical devices or an
existing installed PWA. Confirmed-email/provider flows, the operational soak,
and production migration/deployment verification are outside this local rerun.
Passing these checks and review does not prove the absence of every possible bug.
