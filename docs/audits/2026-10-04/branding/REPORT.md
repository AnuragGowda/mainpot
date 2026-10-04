# Mainpot branding and copy pass

October 4, 2026. The goal is to help a first-time visitor understand the product, find the next action, and read financial instructions without guessing.

## Editorial decisions

Mainpot remains the product name, with its existing typography, restrained colors, and poker-suit identity. The lead message is **“One clear record for poker night.”** The supporting sentence immediately explains buy-ins, rebuys, final stacks, and who owes whom. Mainpot records the game and suggests payments; players send money separately.

Use “game” for the saved session and “table” for the people joining it. “Start a game” opens setup; “Create game” commits the form. Joining must explain the opening buy-in before recording it. Retain recognizable poker terms such as buy-in and cash-out, and explain cash-out as final chip value rather than profit. Use “Totals match” for reconciliation and “Direct payments” for the player-to-player plan. A payment marked sent is a recorded status, not verified receipt.

Headings describe the task or content before adding personality. Keep explanations short, put critical money/ownership limits beside the relevant action, and move optional limits into a disclosure. Technical detail belongs in the self-hosting guide. Internal CSS, storage keys, database identifiers, and financial calculations retain their existing contracts.

## Page and state coverage

| Surface | Review and change |
| --- | --- |
| Landing, animated example, FAQ, footer, social preview | Clear product description; shorter action; explicit external payments; example labeled as an example; plain mismatch explanation; shared footer identifies a poker ledger; matching social-image headline and metadata. |
| Create | Explain opening buy-in and invite; hide optional guest-limit explanation behind a labeled disclosure; “Save as a game template”; preserve the warning that cash-pot payouts differ from end-game wins/losses. |
| Join and room join dialog | Explain preview before joining; “View table details”; retain host/game/amount review, the explicit recorded buy-in, and pending approval. Simplify the one-browser setup notice. |
| Sign-in, signup, email-link and recovery states | Clear account benefit and local-mode limitation; preserve same-browser recovery instructions, retry paths, and confirmed-email behavior. Add a descriptive route title. |
| Dashboard and account data | Replace “All-time P&L” with “Total result”; distinguish game results from outstanding payments; label the friends ranking; split export/deletion scope into two paragraphs while retaining all exclusions and manual deletion limits. |
| Friends, requests, empty/error states | Use “Friends” as the page title; explain invites/results; “Add friend”; explicit friend requests; add an accessible cancellation label naming the recipient. Wrap long names and move request actions onto their own row on narrow screens. |
| Active game, approval, cash-out, difference, review, locked settlement and payment status | Review the shared host/player instructions; clarify approval checks and “Totals match”; explain who pays whom, direct payments, and collection through one player. Preserve the upfront-cash-pot limitation, final locking, advances, stale-status cautions, and recorded-payment meaning. |
| Calculator and walkthrough | Define cash-out, explain suggested payments and external transfer, make the cash-pot model visible near the top, and use check/calculate/payment-list instructions. Preserve example arithmetic and adjustment options. |
| Self-host | Describe the practical effects of each setup before its implementation; retain the Supabase connection condition and technical production guide. |
| Feedback | Keep direct email/bug/feature paths; remove the unsupported roadmap promise. |
| Privacy and terms | Clarify suggested payments and recorded status in privacy; review the terms and retain their existing legal provisions. This pass does not establish legal/provider approval. |
| Missing page, loading failure, offline and app recovery | Name the problem and give a recovery action; say that refreshing app files does not clear game/login records, without guaranteeing successful recovery. Retain the clear offline/reconnect instruction. |

Client routes now have distinct server-provided document titles for create, join, sign-in, dashboard, friends, and game room. The `/recap-lab` route is a development fixture, not an onboarding page; existing recap personality and export artwork were reviewed without a redesign. API routes, authentication callbacks, and machine-readable files are not user-facing copy pages.

Examples: “Keep the money exact” → “One clear record for poker night”; “Bank reconciled” → “Totals match”; “Review the net settlement” → “Review who pays whom”; “Route net settlement through a player” → “Payments through one player”; “Your poker circle” → “Friends”.

## Issues found in the expanded settlement view

Opening the full plan exposed an invalid `aria-readonly` on a generic div and insufficient contrast in the inactive tab and positive result. The [before receipt](evidence/expanded-before.json) records the failures: inactive tab 4.39:1 and positive result 3.65:1, both below the 4.5:1 requirement for that text size. Removed the unsupported attribute; actual controls retain their disabled state when locked. Darkened the tab and positive/zero results, and let the tab row and host-view heading wrap with enlarged text. The audit now opens this panel at normal and doubled text sizes and measures its result amounts.

The doubled-text review also exposed a payment-method fieldset extending to 338px on a 320px viewport. The [reflow receipt](evidence/expanded-reflow-before.json) records that failure. Giving the fieldset and label text a zero minimum width, explicitly defining its grid column, allowing words to wrap, and keeping radio controls from shrinking lets the card stay within the available width. The expanded view also needed wrapping totals, payment/result rows, and summary text instead of nested columns that squeezed or overflowed their contents. Text-container diagnostics identified those boundaries; the narrow-profile regression passed after the fixes. Copied/shared results use the same plain terms and suggested-payment distinction.

## Verification

Pre-commit local results and browser evidence are recorded here after the pass. Existing end-to-end role/text locators are updated to the actual copy while preserving amount, access, ownership, recovery, and payment assertions. Optional account-audit receipts are collected only from synthetic local test accounts.

The public audit covers twelve routes on six headless profiles: Chromium desktop, 320px Chromium, Pixel 5 emulation, iPhone WebKit portrait/landscape, and desktop WebKit. It also exercises keyboard setup, nine-seat settlement, the expanded plan at normal/doubled text, player-dialog focus return, maximum valid amounts, and Chromium service-worker recovery. Public screenshots reset scrolling after footer focus checks so they capture the opening message. Account/dashboard/friend/review receipts come from separate isolated Supabase journeys, rather than local mode where accounts are unavailable.

The final public/room pass completed **126 axe/reflow scans and one Chromium service-worker recovery receipt**: zero detected axe violations, document overflows, clipped checked financial text, or uncaught page errors. The configured support fixture passed URL, new-tab relationship, and keyboard-focus checks in **42 scans**. There are **711 incomplete node checks** across repeated scans: 663 contrast/background checks, six unsupported-label reviews on a `pre`, and 42 references to conditionally mounted controls. These are recorded separately and are not certified passes. Screenshots were inspected for the landing, create form, narrow expanded settlement, and account states as available. A separate headless CLI capture checks the landing at 1440px.

The final isolated account run completed **20 flows across five device profiles, with no retries**, and **40 additional axe/reflow/readable-name receipts**. These cover signup, dashboard first use/history, account data, empty/sent/incoming friend requests, and payment review. There were zero detected violations, document overflows, or clipped checked friend names. Its 26 incomplete node checks (16 contrast checks, ten conditional dialog references) remain separate from passing checks. Screenshot review found a long incoming friend name overlapping its action buttons before the layout fix; the [before image](evidence/friend-name-before.png) and [updated mobile image](evidence/accounts/mobile-chrome-friends-incoming-request.png) show the difference.

An earlier account run had 19 passes and one tablet-WebKit bank-flow failure: a zero draft appeared empty before blur. Input-event diagnostics were absent in that run, so its cause is unconfirmed. Read-only review found no ordinary snapshot-reset mechanism in `CashOutEntry`; no financial input logic was changed. Five focused repetitions then passed without retries, recording all five Taylor zero-input events and no disconnected/replaced input nodes ([receipt](evidence/tablet-bank-repeats.json)). The final 20-flow run also passed that tablet case. This is an intermittent observation to monitor, not a proven bug fix or a guarantee it cannot recur.

Final unit tests: **311 passed in 46 files**. Lint: **zero errors and one existing ref-cleanup warning** in `EarlyCashOutButton.tsx`. The final build and **23 desktop smoke tests** passed. Dependency policy passed with zero production vulnerabilities; the existing lint-only `braces` advisory exception expires October 17 and remains unpatched upstream. A prior smoke failure was a stale “Final net” text assertion; it was updated to “Final results” without removing the amount assertion. Exact pushed-commit CI and the release gate are checked separately. Earlier green CI does not verify this change; the final handoff identifies the exact commit/run.

## Readiness and remaining gaps

The editorial assessment is that branding and copy are clearer and more consistent. Reading speed and unaided comprehension remain unmeasured. The prior controlled-beta **7/10** and broad-release **6/10** assessments remain provisional: copy changes alone do not close physical-device, participant, backup, alert, capacity, or provider-delivery evidence gaps.

Use the [beta acceptance kit](../beta/TEST-PLAN.md) to collect a ten-second comprehension check, physical host/player journeys, installed-app recovery, screen-reader results, and three hosts over two nights each. It includes a blank receipt and pass criteria. No participants were contacted and no physical-phone result is claimed.

Production is unchanged. The repository's CLI migration path still needs Supabase authentication and the pending committed rounding migration. Main pushes do not deploy; routine production uses `npm run release:production` after exact-commit CI passes. The optional support link remains inactive until the owner supplies a real `NEXT_PUBLIC_SUPPORT_URL`; screenshot links use an example.com fixture only.
