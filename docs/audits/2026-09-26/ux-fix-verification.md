# Mainpot UX fixes and verification

September 26, 2026. Follow-up to [the product assessment](product-assessment.md), [independent UX inspection](independent-ux-inspection.md), and [account review](account-ux-review.md). These documents describe the experience before this fix pass. This report records the subsequent implementation and its evidence; local fixes do not establish that production has received them.

## Why the earlier rating was 6/10

The rating asked whether an unfamiliar host could independently complete a real game and return to unfinished work. Visual presentation was assessed at 8/10, entry at 7/10, core task clarity at 6/10, financial interpretation at 5/10, and recovery/release confidence at 4/10. This was a subjective assessment, not a customer satisfaction measurement or arithmetic average. The dashboard outage, missing-value ambiguity, hidden early-exit obligation, and unclear physical money assumptions carried more weight than attractive recap screens.

Few registered users do not prove poor application quality. They leave demand unestablished. Reliability fixes can make a trial fair; they cannot establish voluntary repeat use. The existing recommendation remains a focused release followed by a bounded trial with independent hosts.

## Implementation inventory

| Finding | Change | Evidence or remaining boundary |
| --- | --- | --- |
| UX-02: manual code join commits an amount before preview | Resolve and display game, host, opening amount, pending approval, and explicit final join action; code edits invalidate the preview | Five device profiles exercise preview, editing, confirmation, and the pending entry |
| UX-04 / P03: calculator treats missing stack as zero | Require every money-in and final-stack value to be explicit; zero remains valid | Missing stack blocks balanced/payment output; explicit zero permits the expected payment |
| P08 / UX-05: early exits absent from personal instructions | Personal summary combines separately keyed early-exit and final-plan obligations; shared ledger appears before recap | Zero remaining final net still shows an unpaid early-exit obligation, with mark/reopen and synchronization |
| UX-01 / P02: banker funding assumptions unclear | Setup and payment review explicitly support deferred net settlement; bank choice routes those net obligations through an active player | Gross payouts from a pot already funded with buy-ins are not implemented. Do not use these net instructions as cashier payouts |
| UX-03 / P04: “verified” can imply receipt | Host-confirmed entry language, explicit pending confirmation, and recipient reminder to check actual funds | Bookkeeping acknowledgment remains self-reported; Mainpot does not move or verify money |
| UX-06: early-exit request lacks context | Show confirmed invested amount, final chips, signed net, and counterparty before requesting host review | Separate irreversible Confirm & lock step retained |
| AC-01: guest proof expires before email confirmation | Email-bound proof and cookie last up to one hour; unbound proof stays ten minutes; database enforces both maxima | Database tests cover wrong email, expiration, replay, and delayed bound claim; real email delivery/provider handoff remains unverified |
| AC-01: terminal expiry can trap account | Clear expired proof, hide retry, replace retry instructions with expiry explanation, retain account continuation | Browser regression starts at failed recovery, retries expired proof, and continues to usable dashboard |
| AC-02 / P05: locked history appears fully paid | Compute expected immutable payment keys, including early exits, show sent/total and direct ledger link | Missing status rows count outstanding; stale rows ignored; failed progress read displays unavailable |
| AC-03: failed friend read looks empty | Separate loading, successful empty, and error states; bound reads and offer Retry friends | Slow/failing read regression verifies loading and retry before an actual invite |
| AC-04: template roster reminder disappears | Show reminder when selecting saved template; explain it does not create seats | Browser selection and reload checks |
| AC-05: export promise exceeds payload | Describe existing account-summary resources and explicitly exclude detailed financial ledgers | No expanded export or automatic deletion claim |
| AC-06: friend search requires account | Explain guest joining and link to starting a table when search has no account match | Actual guest play remains account-optional |
| AC-07: templates cannot be maintained | Collapsed edit/remove controls, validated amounts/names, retryable errors, persisted updates | Browser edit, reload, confirmed removal, reload checks |
| AC-08: pending deletion cannot be cancelled | Owner-only pending cancellation, idempotent repeat, processing/completed requests cannot be reset | Database security probes plus browser request/cancel/re-request persistence |
| Routine toast obstruction | Coalesce duplicate “Table updated” success messages | Source review; important errors still remain visible |

The prior reliability pass already implemented account-wide unfinished-game discovery, resume cards, two unfinished guest tables, automatic opening buy-in on join, host auto-approval, mutation deadlines, retained drafts, and a shared immutable bank selection. This pass adds clearer consent, payment interpretation, account maintenance, and regression evidence to those changes.

## Verifier and refix loop

Independent workers reviewed entry/payment and recovery/account changes. The root integrated isolated commits and ran the combined checks. Verification caught and corrected a hardcoded retry paragraph that hid the computed expiry status, a false empty friend state during loading, and test assertions aimed at old wording or host-only controls.

A financial API review additionally found that finalized payment acknowledgments could contain amounts outside the locked plan. The database change constrains acknowledgments to the actual plan and revokes direct-table writes that could bypass the RPC. Final and early-exit payment authorization now requires the authenticated host or payment party; visible session IDs no longer confer authority. A fresh unrelated anonymous identity cannot recover payment-editing authority from a copied browser ID. Signed-in account recovery and transfer capabilities remain the supported ownership paths. The same ownership rule now protects early cash-out requests and cancellations; observer tests with ordinary room access reject forged requests and cancellations using a copied player session. Exact parity with the application's initial-sort greedy algorithm matters; recomputing the largest remaining debt after every transfer would produce a different plan.

## Verification record

- Final serial repository gates: 161 unit tests across 26 files passed, followed by lint and production build; TypeScript and whitespace checks also passed.
- Local browser suite: 87 passed across desktop Chromium, Pixel Chrome, iPhone WebKit, desktop WebKit, and iPad WebKit. Three service-worker cases skipped in WebKit because the automation environment cannot control that lifecycle.
- Focused entry/calculator rerun with fresh screenshots: 15 passed across the same five profiles.
- All seven isolated database assurance suites passed after the latest early-request/cancellation ownership migration. The final-payment script also passed before browser reruns, including early-exit roll-forward, exact locked-plan enforcement, copied-session denial, and rejection of a duplicated final obligation.
- Hosted-style multi-user browser suite: 119 passed and one failed across the five profiles. The failed account-resume case then passed unchanged on all five profiles (5/5); five additional serial iPad repetitions with field-value checkpoints and tracing also passed (5/5). The original iPad failure showed a blank game-name field after automated filling; it is an unresolved intermittent input failure, not a confirmed fixed product defect. Read-only inspection found no explicit field-clearing path. Do not report this as a clean 120/120 run.

Fresh captures include [iPhone join preview](evidence/join-preview-mobile-safari.png), [desktop incomplete calculator](evidence/calculator-incomplete-chromium.png), and [iPhone incomplete calculator](evidence/calculator-incomplete-mobile-safari.png). The root inspected desktop/mobile captures for legibility, overflow, and action hierarchy.

## Release and physical-device boundary

A fresh read-only live migration inventory records the two September 26 dashboard-inbox repairs but does not record this pass's recovery, cancellation, or payment-plan versions.

Changes in this pass are local commits. They are not pushed, deployed, or applied as production schema changes. Two previously documented dashboard-inbox hotfixes are already live; they do not constitute release of this broader work.

The intermittent iPad create-form input loss remains open for input-event/DOM tracing if reproduced. Gross cashier payouts remain outside the implemented deferred-net model. These are explicit limits of this pass, not completed fixes.

Browser device profiles are emulation, not physical-device tests. Real iPhone/Android installation, standalone process eviction and resume, provider/email browser handoff, native share/payment links, and human comprehension of money instructions remain a release/pilot checklist. Outside adoption remains unverified. No production account or game was created or changed during this fix pass.
