# Mainpot UI/UX and release readiness

Assessed October 2, 2026. This is a bounded source and headless-browser review, with synthetic tables and separate production public-page checks. Scores are engineering judgments about the evidence collected, not measured user satisfaction. The reference revision is `f1296515833dcd8921d586e75a3168ab346f69d2`; this report accompanies a subsequent small recovery/copy patch.

## Scores and decision

| Aspect | /10 | Reason and remaining evidence |
| --- | ---: | --- |
| Visual design | 8.5 | Consistent spacing, restrained color, clear forms and strong public presentation. Authenticated failure states still need physical-device acceptance. |
| Core game and settlement correctness | 8.5 | Substantial lifecycle, authority, rounding and persisted-payment coverage. Passing bounded scenarios cannot establish absence of bugs. |
| Automated verification | 9 | Five required CI jobs passed for `f129651`, including 165 realtime cases, database/restore assurance and confirmed-email tests. New changes need their own exact-commit CI. |
| Responsive layout | 8 | Sampled production public screens at 1440, 390 and 320px had no document overflow. Local eight-seat and short-height states extend that sample; physical keyboards, landscape and installed apps remain unproved. |
| Recovery UX | 7.5 | Payment uncertainty and retry paths are explicit. This pass found and corrected a notice covering game identity and a false local reconnecting state. Real background/resume recovery remains a gate. |
| First-time host clarity | 7 | Setup explains deferred settlement, but unfamiliar hosts have not freshly demonstrated unaided completion. Task density and recovery action priority deserve observation. |
| Accessibility | 6.5 | Keyboard/focus regressions exist and sampled axe checks are useful. No complete screen-reader, zoom, contrast or physical touch audit has been accepted. This score reflects incomplete assurance, not a measured WCAG failure rate. |
| Maintainability | 7.5 | Explicit domain logic, migrations and meaningful regression coverage. Some unused UI and changing terminology remain; the temporary Playwright prerelease workaround needs a stable-version follow-up. |
| Controlled beta readiness | 7 | Suitable for a small supported cohort once the migration and frontend are released and production journeys accepted. |
| Broad release readiness | 6 | Hosted recovery, provider/device acceptance, operational receipts and independent repeat use are incomplete. |
| Adoption and retention | Unrated | Synthetic accounts and successful tests do not show that outside hosts will adopt or return. |

**Overall:** about **8/10 for polish**, **7/10 for a controlled beta**, and **6/10 for a broad release**. The highest-value next investment is task-based usability and real-device/operations acceptance, followed by observing three independent hosts over two game nights each. A decorative redesign or additional features are not yet justified by the evidence.

## Findings and disposition

| ID / severity | Evidence and impact | Disposition / acceptance |
| --- | --- | --- |
| UX-101 / P2 | At 390px, the offline notice occupies y=12–74 while the room title occupies y=32–64, hiding the table identity. [Before capture](evidence/offline-host-390.png). The same fixed component is shared by active and settlement views. | Changed the notice to occupy normal document flow. Hosted disconnect/recovery passed on all five configured profiles with an assertion that the notice ends above the heading. [After, emulated iPhone WebKit](evidence/hosted-offline-after-mobile-safari.png); this uses the isolated local Supabase stack, not production. |
| UX-102 / P2 | A local-only table listens to global network events. After offline → online, it displays “Reconnecting to live updates…” indefinitely despite having no remote subscription to reconnect. | Local mode no longer installs remote connectivity listeners. Regression performs an offline local player addition, reconnects and reloads to check persistence and absence of false warnings. |
| UX-103 / P2 | Reachable landing and cash-out views say “Verified” while the roster says “Host-confirmed.” This can suggest that the application verified receipt of money. | Reachable labels now say “Host-confirmed.” Internal data names are preserved. Confirm comprehension with unfamiliar hosts; application bookkeeping is not independent receipt verification. |
| UX-107 / P2 | The local-mode account limitation text on sign-in has 2.6:1 contrast against white at 12px; axe reports a serious contrast violation. [Before capture](evidence/public-signin-320.png). | Changed reachable supporting text from gray-400 to gray-600. The rebuilt 320×568 page has zero axe violations or incomplete checks. [After capture](evidence/public-signin-after-320.png), [scan](evidence/signin-contrast-after.json). This is local-mode evidence, not a scan of the hosted authentication form. |
| UX-104 / P2 investigation | Eight seats produce a long host page with the complete activity history. [Full-page capture](evidence/host-eight-seats-390.png). Important controls are distributed between header, roster and bottom actions. Automated journeys remain usable. | Observe invite, add-seat, approval, correction, rebuy and settlement task time/errors before deciding to regroup controls or collapse history. Page length alone does not prove a usability failure. |
| UX-105 / P2 investigation | The unavailable-payment state places “Start another table” before recovery controls. Earlier readiness evidence records the state. | Have payer/recipient users locate retry and explain why they should wait before sending money. Change priority only if this task check establishes confusion. |
| UX-106 / P3 | Sign-in uses the signup-style “At least 6 characters” password placeholder. Setup introduces the two-unfinished-table policy before the form. | Minor copy hypotheses; no demonstrated abandonment or authentication failure. Evaluate during the first-time-host session. |

The earlier source review mentioned contrast in `PlayerCard.tsx`; that component is not imported or rendered by the current application. It is excluded from confirmed findings. The screenshot named `manage-player-dialog-390.png` depicts the player-management dialog, not an expanded financial-entry view.

## Verification and limits

- Reference CI: [run 37053860868](https://github.com/AnuragGowda/mainpot/actions/runs/37053860868), all five required jobs succeeded. Realtime: 165 passes, zero retry attempts. Local reference acceptance: 295 unit tests, 165 realtime cases, 107 smoke/entry cases and three expected WebKit offline-PWA skips. These counts precede this UI patch.
- Production public sample: five routes at three widths, 15 HTTP 200 responses, no document overflow or uncaught page errors. See [prior structured checks](../readiness/evidence/public-checks.json). No production game or account was created during that sample.
- This patch: 295 unit tests passed, lint passed with the existing single focus-cleanup warning, production build passed. Focused browser outcomes and exact-commit CI are recorded in the subsequent verification receipt below.
- Axe scans cover selected synthetic states and report incomplete checks separately. Zero violations in a sample is not WCAG certification. No physical iPhone/Android, installed-app background/eviction/update, screen-reader session or unaided host study was completed here.
- [Before checks](evidence/browser-checks-before.json): nine rendered states, no horizontal overflow. One sign-in supporting-text contrast issue was confirmed and fixed. The create-page button was sampled during disabled pre-hydration loading; inactive controls are exempt from text contrast and this is excluded from confirmed defects. The [ready create-page scan](evidence/create-ready-checks.json) has zero violations or incomplete checks. Other scans include contrast/ARIA checks requiring manual review. Escape returned focus to the player-management trigger at 320×568.
- Screenshot review caught the longer landing label clipping at 320px during implementation. Smaller narrow-screen gaps and wrapping correct it; all four rendered demo rows and labels fit their boxes in the final sample. [Final demo capture](evidence/landing-demo-after-320.png). [Stable eight-seat ended-table capture](evidence/eight-seat-settlement-stable-390.png).

## Release and operational boundary

The current production database lacks migration `20261001210118_bound_discrepancy_rounding.sql`. Preflight found zero incompatible rounding records and zero saved allocations. Applying the migration is waiting for Supabase CLI authentication; `SETUP.md` requires the CLI migration path. Production has not been updated by this pass. Database first, then a clean exact pushed revision with all required CI jobs passing via `npm run release:production`, then independent host/player production acceptance.

The hosted project reports PostgreSQL 17.6.1.166. Supabase has announced [17.11 minor security fixes and compatibility considerations](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes). Schedule a separate compatibility/maintenance review; this UI patch does not upgrade the database engine.

Before broader release, collect receipts for a retained hosted backup restore in isolation, delivered alerts and an accountable responder, production auth/email/OAuth recovery, representative capacity, and physical iPhone/Android journeys. Synthetic local restore and Mailpit acceptance are useful but do not replace those receipts.

## Verification receipt

Local acceptance: **295 unit tests**, lint with **zero errors / one existing warning**, production build, **112 smoke/entry cases across five browser profiles** with **three expected WebKit offline-PWA skips**, and **five hosted disconnect/recovery cases** on an isolated Supabase stack. The hosted suite also passed its locked-payment-plan security precheck. The sign-in contrast change was separately scanned after the final rebuild. Screenshots and selected keyboard checks support this bounded audit.

The accompanying commit still requires its own terminal CI result; check [GitHub CI](https://github.com/AnuragGowda/mainpot/actions/workflows/ci.yml) for the exact pushed SHA. The earlier green run is reference evidence, not acceptance of later code. Production migration, deployment and physical-device acceptance remain uncompleted unless separately recorded.
