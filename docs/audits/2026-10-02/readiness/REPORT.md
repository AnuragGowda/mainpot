# Mainpot polish, beta readiness, and next work

Assessment date: October 2, 2026. Baseline `main` revision: `8f1fdd6d4972e49142b3ba300a878ebb86aeb826`, with settlement/lifecycle implementation commit `b3ee680` assessed separately from the currently deployed application. This is a bounded readiness assessment, not a completed detailed usability audit. The findings distinguish observed screens, source inspection, automated acceptance, historical evidence, and checks still needed.

## Decision

**Mainpot is a visually polished, technically substantial beta candidate. A controlled beta is reasonable after the current migration and frontend release are accepted on production. A broad general-release claim is premature.**

A detailed UI/UX pass is worthwhile. Focus it on first-time host comprehension, speed of common game-night tasks, financial-language consistency, payment recovery, and installed-phone behavior. Preserve the existing design language: the current spacing, hierarchy, restrained colors, and clear forms already provide a good foundation.

The highest-value sequence is:

1. Finish the current release: push, exact-commit CI, hosted migration, gated frontend deployment, then independent production host/player acceptance.
2. Complete a bounded task-based UI/UX pass with physical iPhone and Android coverage. Fix confirmed high-impact comprehension, focus, accessibility, and recovery problems.
3. Observe three independent recurring hosts over two nights each. Use their unaided completion and voluntary return to decide further investment.

Additional features should be justified by those observations. More automated test cases or decorative refinement cannot establish that unfamiliar hosts understand and prefer the workflow.

## Current quality by dimension

| Dimension | Assessment | Evidence and practical limit |
| --- | --- | --- |
| Visual polish | Strong; close to release quality on sampled public screens | Fresh production desktop/390px/320px captures; clear primary actions and readable forms. Selected current local room/payment captures inspected. This is not visual acceptance of every authenticated state. |
| Core financial/lifecycle implementation | Strong beta foundation | 295 unit tests, 17 database assurance suites, 165 complete five-profile realtime cases, and focused repetitions passed. New cents allocation preserves historical payment keys. Tests cover bounded synthetic scenarios. |
| First-time task clarity | Good foundation; detailed validation needed | Setup describes deferred net settlement and manual join previews the table. Some financial labels still differ between surfaces; no fresh observed unaided host study. |
| Failure/recovery UX | Materially improved; needs real-device acceptance | Unknown payment status blocks confident send-again instructions; retry and recovery are tested. A delayed focus-stealing bug was found and fixed during the full browser pass. Physical background/eviction/update recovery remains unproved. |
| Production release assurance | Incomplete for this patch at report drafting | Existing main CI is green; the new migration and frontend are not yet live. Pushing to main does not deploy. CI, migration read-back, deployment identity, and actual production journeys are separate evidence. |
| Operations and capacity | Partial evidence | Synthetic restore and concurrency checks exist. Historical hosted backup restoration, delivered alerts, representative load, and controlled real-provider acceptance need current receipts. |
| Demand and repeat use | Unestablished | Prior aggregate identities/game counts did not identify genuine outside customers. No fresh cohort, retention, willingness-to-pay, or business assessment was performed. |

These are qualitative judgments, not a measured satisfaction score or security certification. The interface has moved beyond an early prototype; beta status reflects the remaining acceptance and customer evidence.

## Evidence collected for this assessment

- **Fresh production public check:** five routes (`/`, `/create`, `/join`, `/signin`, calculator) at 1440, 390, and 320 CSS pixels, headless Chromium: **15/15 HTTP 200**, **zero document overflow**, **zero uncaught page errors**. Reduced motion was used. No production game, account, payment, or message was created. [Structured checks](evidence/public-checks.json).
- **Visual inspection:** desktop/mobile landing, mobile create and sign-in, narrow join, calculator entry, and the current local host early-cash-out/payment-unavailable captures. The very long calculator full-page capture is not a usable substitute for viewport inspection; a separate first-screen capture is retained.
- **Current local acceptance:** **295 unit tests in 45 files**, **17 database/security suites**, **165 realtime browser cases across five profiles**, **107 public/local smoke cases with three expected WebKit offline-PWA skips**, **30 settlement/payment/lobby repetitions**, and **10 early-cash-out repetitions** passed. Lint, production build, and whitespace checks passed. See [the fix verification](../../2026-10-01/rounding-fix-verification.md).
- **Prior release context:** September 26 reports and release receipts establish earlier deployed fixes and prior tests. Their provider, operations, and adoption observations are historical pointers, not newly verified production facts. No old customer counts are used as current metrics.
- **Scope limits:** no fresh authenticated production visual walkthrough, physical-device acceptance, full keyboard/screen-reader/contrast audit, production email/OAuth delivery, hosted restore, alert acknowledgment, or real-user study occurred here.

Selected captures: [desktop landing](evidence/landing-1440.png), [mobile setup](evidence/create-390.png), [narrow join](evidence/join-320.png), [mobile payment recovery](evidence/local-payment-status-unavailable-mobile.png), [host early cash-outs](evidence/local-host-early-cash-outs.png), and [calculator entry viewport](evidence/calculator-first-screen-390.png).

## Concrete UI/UX gaps and review candidates

The priorities below are work priorities for the detailed pass. They do not label every hypothesis a confirmed defect.

| ID / priority | Evidence | Gap or concern | Acceptance for the next pass |
| --- | --- | --- | --- |
| UX-01 / P2 | Fresh landing capture + current source | Financial vocabulary remains inconsistent. The landing demo says **Verified** (`HeroGameDemo.tsx:138`), expanded entries say **Verified/Unverified** (`PlayerCard.tsx:212-218`), early cash-out says **Verified buy-ins** (`EarlyCashOutButton.tsx:165`), while the roster says **Host-confirmed entries** (`PlayerList.tsx:49`). These describe host bookkeeping, not verified receipt of funds. | Align user-facing terms and have unfamiliar hosts explain what the host confirmed, what money was actually received, and what marking a payment sent means. Inspect expanded-label contrast in the actual rendered state. |
| UX-02 / P2 candidate | Current local payment-unavailable and early-exit captures + source | The fixed sync notice overlaps the room heading in these captured states (`app/game/[code]/page.tsx:129-145`). The payment-unavailable view also leads with a prominent **Start another table** action before the retry panel (`SettlementScreen.tsx:450-463`). Recovery information is correct, but action priority and persistent overlay geometry deserve task testing. | At phone widths and 200% zoom, retain visible game identity and reach every action with keyboard/touch. In a failed payment read, users find retry and understand they must wait before sending money. Check actual viewports; full-page fixed-element placement alone is not proof an action is unreachable. |
| UX-03 / P2 candidate | Current host capture + `ActivityFeed.tsx:200-206` | The activity feed renders the complete event list and dominates a long host page. Common host actions are split between header, roster, and fixed action bar. It remains usable in tested flows, but a busy game could demand substantial scrolling. | An unfamiliar host can invite, add a managed seat, approve, rebuy, correct, and start settlement unaided. Observe task time/errors at 8–10 seats and a representative event history before deciding whether to collapse or paginate activity or regroup controls. |
| UX-04 / P3 candidate | Fresh mobile create/sign-in captures + `app/signin/page.tsx:298` | New-host setup leads with the two-unfinished-table policy; sign-in uses the signup-style **At least 6 characters** placeholder. These are minor clarity opportunities, not demonstrated abandonment or broken auth. | Check whether policy copy helps first-time hosts at that point; present password guidance appropriate to sign-in versus account creation. Keep changes small and verify comprehension. |
| UX-05 / P2 evidence gap | Browser tests + historical device boundaries | Emulation cannot establish keyboard occlusion, native safe areas, installed-PWA background/resume, process eviction, browser-to-app return, push, share, or payment-app handoff. These directly affect use during game night. | Perform the physical matrix below and attach device/OS/build, screenshots, and observed outcomes. Treat a failed ledger recovery or misleading money instruction as a release blocker. |

The current setup and settlement already explain deferred net settlement. The lack of gross cashier payouts is an explicit product scope limit, not a newly discovered broken calculation. Test understanding with a cash-upfront host before deciding to support that model.

## Release and beta-expansion gaps

| Priority | Gap / current boundary | Required evidence |
| --- | --- | --- |
| P1 before releasing this fix | Migration `20261001210118_bound_discrepancy_rounding.sql` and frontend must roll out together in order | All five required CI jobs pass for the exact pushed source; apply the hosted migration first, read back the validator/version constraint, deploy via `npm run release:production`, then host/player settlement and persisted payment acceptance on production. Preserve existing ledgers. |
| P1 before broad beta expansion | Production authentication and real-device recovery | Controlled password signup/login, email/magic-link delivery, OAuth return, cross-device ownership recovery, installed iPhone/Android reconnect and reload. Local Mailpit/Playwright evidence does not replace provider acceptance. |
| P1 before broad beta expansion | Hosted recovery and incident response | Restore a retained hosted Mainpot backup into an isolated target; check financial/auth/RLS/privilege integrity and record recovery point/time/owner. Trigger real uptime and app-error alerts and confirm human receipt. |
| P2 investigation | Hosted dependency/cold-start consistency and capacity | Repeat production dependency probes and independent join/reconnect observations. September cold-canary failures are historical and need rechecking. Complete bounded rate-limit/capacity review and representative multi-table load; keep polling authoritative. |
| P2 product gate | No current independent-host adoption evidence | Three genuine recurring hosts, two actual nights each, unaided completion, reconciliation against their own records, support questions, and voluntary return. Separate synthetic tests from human users. |
| Separate infrastructure/configuration work | Historical backup/DNS/alert-link findings and password-security advisor | Resolve ownership and current state before applying infrastructure changes. Prior reports mention a changing-file backup failure, Product Ops DNS, alert links, and disabled leaked-password protection; none was freshly reproduced or changed here. |

The production checklist in [SETUP.md](../../../../SETUP.md#8-production-launch-checklist) already calls for backups, real alert acknowledgment, production auth, and device smoke evidence. The detailed pass should close those receipts, rather than manufacture a new checklist with different standards.

## Proposed detailed pass

Use one bounded session for each role, with synthetic isolated data for failure injection and controlled production identities only for provider/device acceptance. Keep screenshots and severity tied to the exact build.

1. **New host:** landing → setup → invite → managed seat → approvals/rebuys/correction → early exit → reconciliation/discrepancy → payment review/lock → reload/history → start another table. Ask the host to explain the deferred-money model and every irreversible action before proceeding.
2. **New player and payer/recipient:** direct link and manual code → table/amount consent → pending approval → rebuy/advance → leave/return/seat claim → early cash-out → payment mark/reopen → stale/unavailable status → retry. Confirm each person understands their own remaining obligation.
3. **Returning account owner:** signup/sign-in/link/OAuth → dashboard resume → a second device → history/payment progress → friend invitation/template → data export/deletion request/cancel. Inspect empty, loading, delayed, denied, and unavailable states.
4. **Physical devices and accessibility:** iPhone Safari + installed PWA; Android Chrome + installed PWA; desktop Chrome/Safari; keyboard-only, 200% zoom, reduced motion, screen-reader names/status announcements, contrast, 320px width, landscape/short height, virtual keyboard, background/resume/offline/update. Do not convert emulated browser success into physical-device acceptance.
5. **Deliverables:** severity-ranked findings with reproduction, screenshot, role/state, exact revision, recommended change, and acceptance; resolved/unresolved ledger; confirmed production and manual boundaries. Fix observed P1/P2 problems before spending time on P3 presentation ideas.

**Done criteria:** no known financial/durability/authority blocker in the audited journeys; required release/provider/device/recovery receipts present; hosts can complete and reconcile unaided. A reasonable product continuation signal is at least two of three independent hosts completing two games and choosing to return. This is a proposed decision gate, not a claim that demand exists or a statistically representative study.

## Git and deployment boundary

The implementation is committed as `b3ee680`; this report follows in a documentation commit. The user authorized pushing both to main. This assessment was drafted before the new push CI completed. The exact push and terminal CI result are reported in the chat and visible in [GitHub CI](https://github.com/AnuragGowda/mainpot/actions/workflows/ci.yml). CI retries, if any, must be reported separately from a first-attempt clean run.

No production migration, deployment, infrastructure change, provider message, or user outreach is authorized or performed by this readiness assessment. A push to main intentionally does not auto-deploy Mainpot.
