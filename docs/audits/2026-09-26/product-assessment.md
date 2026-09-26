# Mainpot: product quality, usability, and whether to continue

Assessment date: September 26, 2026. Local revision inspected: `19fae9e`. This is a fresh product assessment, separate from the earlier reliability fix report. Independent reviewers were asked to question the experience rather than accept passing tests as proof of usability. No product implementation changes were made, and no production game or account data was written during this assessment.

## Recommendation

Keep Mainpot, but stop open-ended feature development. Bring the existing core workflow to a coherent release, resolve the financial-model ambiguity described below, then give three independent home-game hosts a bounded trial. Continue substantial development only if hosts complete real games and choose to use it again without being pushed. If they do not, retain a stable demo and the engineering case study while redirecting active development time.

The project is already substantial enough to support a portfolio narrative. It has not yet earned a claim of product-market fit, demand, or a viable business. Lack of registered strangers is a reason to test demand, not a reason to erase useful engineering work. Adding more recap styles, social functionality, notification options, or infrastructure cannot establish whether hosts prefer this to their existing method.

My provisional overall rating is **6/10 as a product someone can adopt today**. The interface is stronger than that number suggests; operational consistency, financial-language clarity, and unproven repeat use lower the assessment. This is a subjective judgment, not a measured customer-satisfaction score. The independent detailed inspection provides its own rubric and distinguishes browser observations from source-based concerns.

| Dimension | Provisional rating | Basis and limitation |
| --- | --- | --- |
| Visual presentation | 8/10 | Fresh public desktop/mobile captures show clear hierarchy, restrained styling, useful spacing, and no horizontal overflow. Screenshots do not prove usability during a real night. |
| First-time entry | 7/10 | No installation or player account is required. Link/code entry and compact setup are approachable. Manual join needs a clearer preview of the table and opening amount. |
| Core host task clarity | 6/10 | A real shared ledger, approvals, reconciliation, and payment instructions exist. The host also encounters multiple phases, entry types, and exception paths. |
| Financial interpretation | 5/10 | The netting math is coherent for deferred settlement, but already-funded cash pots require a different interpretation. Calculator missing-input treatment is too permissive for a novice. |
| Recovery and release confidence | 4/10 | A missing live RPC broke the user's dashboard despite extensive local checks. The narrow RPC repair is live; many broader fixes remain unreleased. Physical PWA lifecycle and real auth journeys remain unverified. |
| Engineering case-study value | 8/10 | Authentication boundaries, shared state, concurrency, auditability, financial idempotency, and browser regression evidence provide substantial material. Describe actual evidence and limitations honestly. |
| Demand / commercial viability | Unestablished | Account totals, feature breadth, and competitors' marketing do not establish retention, referrals, willingness to pay, or meaningful acquisition. |

## What the usage evidence actually says

Read-only aggregate queries against the live Mainpot database found:

| Metric | Observed count | What it does not prove |
| --- | --- | --- |
| Registered accounts | 2 | Both carry the sign-in name Anurag Gowda; no independently confirmed outside registered account. |
| Anonymous auth identities | 82 | Not 82 distinct people. Tests, browser/device changes, and repeated sessions can create identities. |
| Game records | 12 | Not 12 genuine customer games. Two names match an obvious test/demo pattern, but absence of such a name does not identify genuine usage. |
| Ended game records | 9 | Does not prove payments completed, participants were external users, or anyone returned voluntarily. |
| Active / settling records | 3 / 0 | Does not establish current human activity. |
| Player seats | 46 | A person can occupy seats across multiple games; test seats are included. |
| Distinct seated auth identities | 33 | Does not establish 33 people. One additional seat has no linked auth identity. |

These observations justify saying **outside adoption is unverified**. They do not justify saying nobody has ever used the app. Mainpot explicitly supports guest play, so registered-account count is an incomplete adoption measure. A game's ended status also means its ledger has been locked; payment status is a separate workflow.

No visitor counts, genuine-host cohorts, support interviews, voluntary repeat-use rates, completed-payment rates, or acquisition conversion rates were established in this assessment. The source includes opt-in Product Ops events for creation, a second player joining, settlement, and host return, but their existence is not evidence that the production collection pipeline is complete or that a cohort represents real customers.

## Fresh evidence and scope

- **Production browser observations:** 20 public route/viewport checks: `/`, `/create`, `/join`, `/signin`, `/dashboard`, `/friends`, `/poker-settlement-calculator`, `/self-host`, `/privacy`, `/terms`, each at 1440px and 390px using headless Chromium. All returned HTTP 200, no uncaught page errors, and no document-level horizontal overflow. Signed-out Dashboard and Friends correctly redirected to sign-in with a return route. These are public navigation checks, not signed-in acceptance testing.
- **Fresh visual review:** production mobile setup, join, and sign-in captures were inspected. They look clean and readable. A passing screenshot cannot establish hosted creation, synchronization, account recovery, or payment correctness.
- **Local calculator reproduction:** cleared the example, entered Alice buy-in $20 / final stack $40 and Bob buy-in $20 / final stack blank. The app declared the bank balanced and proposed Bob paying Alice $20. This is directly observed; the financial-model implications below are conditional reasoning.
- **Independent local review:** see [the detailed flow inspection](independent-ux-inspection.md), including its role-specific journeys, findings, captures, and unverified boundaries.
- **Independent account source review:** see [the account and return-use review](account-ux-review.md), covering authentication variants, recovery, dashboard, history, social invitations, templates, export, and deletion. Its findings are source-based and include acceptance scenarios; they are not mislabelled as fresh hosted reproductions.
- **Prior regression evidence:** [the reliability report](report.md) documents substantial local multi-session and emulated-device coverage. Those earlier results support specific fixed behavior, but were not rerun or silently converted into new production or physical-device evidence here.
- **Production release boundary:** the checkout is 53 local commits ahead of `origin/main` at intake. The recent inbox RPC repair is applied in the hosted database. The broader audit feature and reliability changes have not been pushed/deployed in this task. Vercel inspection previously returned 403 for the connected integration's team scope; no current application release SHA is claimed.

Evidence: [public route snapshots](evidence/product-review/production-public-pages.json), [calculator reproduction](evidence/product-review/calculator-financial-model.json), [calculator detail](evidence/product-review/calculator-unentered-zero-netting-detail.png), [mobile setup](evidence/product-review/production-390-create.png), [mobile join](evidence/product-review/production-390-join.png), [mobile sign-in](evidence/product-review/production-390-signin.png).

## Highest-value pain points

### P01 — customers experience the deployed product, not local fixes

**Priority: high. Evidence: live database diagnosis, user report, release state.**

The user's dashboard attempted to call an inbox RPC absent from production. That single optional resource could fail the older dashboard as a whole. The local app now isolates section errors and provides resume cards, but unreleased code cannot improve the live experience. Other local changes require corresponding backend migrations, making a frontend-only release unsafe.

The inbox function was repaired in production in the previous follow-up. The remaining action is a coordinated release using the actual live schema as the starting point. Migration histories contain older version/name differences, so do not blindly treat the local filename list as an exact production checklist. Verify hosted account resume, guest-to-account recovery, host correction, joining, and the shared settlement plan after release.

**Acceptance:** an optional inbox failure leaves resume/history usable; new financial RPCs exist in the deployed target; one genuine host and two independent players complete a fresh game and recover it after reload. None of those hosted acceptance claims is implied by this assessment.

### P02 — net settlement and an already-funded cash pot are different workflows

**Priority: high before asking a cash-upfront group to rely on the app. Evidence: source-confirmed algorithm and observed calculator behavior; conditional usability risk.**

`calculateBankSettlement` in `lib/settlement.ts` routes each player's **net result** through the selected banker. It does not model gross payouts from a pot that already collected every player's buy-in. Current copy uses phrases such as “money in,” “bank,” and “cash-out,” which can sound like an already-funded cash box. The bank choice describes one person paying and collecting final payments without establishing what money has already moved.

Consider two players who each receive $20 of chips. Alice finishes with $40; Bob finishes with $0. In a game played on credit and settled at the end, Bob pays Alice $20: the netting result is correct. If both already handed $20 to a banker, the banker holds $40 and must return $40 to Alice. Asking Bob to pay Alice another $20 would be an incorrect interpretation of that already-funded game.

This is **not a demonstrated arithmetic defect** in the intended netting model. It is an insufficiently explicit contract with hosts about supported funding assumptions. The present bank option must not be presented as proof of supporting every real-world cashier workflow.

**Smallest improvement:** explicitly describe the supported settle-at-end model at setup and payment review, including what to do when buy-ins have already been collected. If real pilot hosts want upfront cashier accounting, scope collected-money and gross-payout tracking as a deliberate separate capability. Do not attempt to solve this merely by renaming the bank tab.

**Acceptance:** a novice host explains correctly who holds money at each stage; the two-player deferred and prepaid examples produce appropriate, unambiguous instructions for the chosen supported workflow.

### P03 — a missing final stack can look like a confirmed zero

**Priority: medium; high if users treat the standalone calculator as payment-ready. Evidence: fresh browser reproduction.**

The standalone calculator explicitly says blank amounts count as $0. It can therefore show “Bank balanced” and a payment list while Bob's final stack has never been entered. The explanation further down the page says not to treat a blank as zero unless the player actually busted. A novice may miss that distinction, especially on a long mobile page. The full game flow has stronger completeness gates; this finding is about the separate calculator.

**Smallest improvement:** require explicit final-stack entries before describing a payment list as ready, or mark it provisional until blanks are confirmed. A clear zero/busted action is easier to trust than a placeholder that resembles an entered amount.

**Acceptance:** with one unentered stack, the calculator asks for it even when other numbers happen to balance; entering an explicit zero permits the intended result.

### P04 — record validation is not proof that money arrived

**Priority: medium. Evidence: source-based interpretation; user comprehension untested.**

Approvals use “Approve,” player entries can be “Verified,” and the table total is described as a bank. Settlement payments are manually marked sent by an involved player or host. The product does distinguish a bookkeeping record from moving money in policy/help copy and some payment instructions, but the distinction needs to hold at the moment users act.

**Smallest improvement:** keep approval language tied to the entry being correct. Keep payment state explicitly self-reported and make the recipient's need to check their payment app clear. Avoid implying automatic payment verification or a bank balance measured from real funds.

**Acceptance:** new participants can explain what a verified buy-in and a marked-sent payment each establish; no one treats either as automatic evidence of receipt.

### P05 — a locked game can still have money outstanding

**Priority: medium. Evidence: source-confirmed separate ledger/payment lifecycles; account UI concern requires hosted follow-up.**

The account resume list targets active/settling games, while ended games appear under “Your settled results.” Payments become trackable after locking the ledger. A returning person looking for an outstanding payment may assume an ended/settled game is fully paid when it is only financially fixed.

**Smallest improvement:** display outstanding payment progress on relevant history rows, distinguish “Ledger locked” from “Payments complete,” and provide a direct route to the participant's remaining action. Do not reopen or rewrite a finalized ledger merely to surface unpaid transfers.

**Acceptance:** after a game is locked but one transfer remains, payer and recipient can find it from the dashboard without remembering a room code or scrolling through unrelated results.

### P06 — account growth is secondary to one host's successful night

**Priority: product focus, not a defect. Evidence: route/component inventory.**

Friends, invitations, statistics, templates, profile payment handles, recap stories, push notifications, exports, and self-hosting each have potential value. Each also adds states, instructions, support obligations, and testing. A new host mainly needs to start, seat people, record chips issued, reconcile final stacks, and understand payments.

**Smallest improvement:** make those five tasks the pilot's scope. Keep optional features available where they help existing users, but do not require them for first use or spend the next development cycle expanding them. Improve the single largest pain point witnessed at real tables rather than speculative feature requests.

**Acceptance:** three first-time hosts finish the core journey without signing up every guest, finding friends, installing the PWA, configuring notifications, or reading developer-oriented documentation.

### P07 — guest recovery has a confirmation-delay edge case

**Priority: high to reproduce before an account-focused pilot. Evidence: source-confirmed ten-minute expiry and confirmation copy gap; delayed email flow not browser reproduced.**

The current guest ownership proof expires after ten minutes. A password sign-up requiring email confirmation does not show the same recovery warning as magic-link sign-in. Once authentication has replaced the guest identity, the retry path only attempts the existing proof and does not establish a safe reissue path. A person confirming email later can therefore face an account-ready but guest-recovery-failed state whose retry cannot repair an expired proof.

The account review documents this as AC-01, including the ownership protections that must survive any fix. Test real delayed confirmation rather than just immediate disposable sign-up. Keep wrong-account, replay, expiry, and conflicting-seat safeguards; do not trade account security for a long unrestricted bearer-token lifetime.

### P08 — early-exit payments can contradict the personal summary

**Priority: high for an early-exit pilot. Evidence: inspected fresh local browser capture plus current component inputs.**

The independent postgame capture shows the host's summary as “You're even. No payment needed.” while the shared payment ledger shows an outstanding early-exit transfer of $5 from Taylor to the host Casey. The summary receives the final-plan transfers, while early-exit payments are displayed separately below the large recap. Being even on the remaining game is different from having no outstanding payment obligations or collections.

**Smallest improvement:** include relevant early-exit transfers in the participant's complete payment summary, or explicitly label the summary as final-game netting only and show early-exit tasks immediately beside it. Keep every locked obligation counted exactly once. Put the operational ledger ahead of the recap.

**Acceptance:** with zero remaining-game net and one unpaid early-exit receivable, the host sees “Collect $5 from Taylor,” never an unqualified no-payment-needed state. The reciprocal payer sees the same outstanding obligation; marking it sent updates both after reload.

## Market context

This is a real but competitive product category. [Felt's own product page](https://playfelt.com/) advertises home-game ledgers, minimum-transfer settlement, a host-bank option, payment-app handoffs, and repeated-game records. [Cash Out's own site](https://www.cashoutpoker.net/) advertises buy-in/cash-out tracking and code/QR joining. These establish that similar products exist, not their active usage, quality, or commercial success. They were inspected as current marketing descriptions, not exhaustively play-tested competitors.

Mainpot's plausible advantages are a browser link with no guest installation/account requirement, a shared auditable record, free/open-source availability, and a good mismatch workflow. Those advantages need to win an actual host's choice against the host's current method—paper, spreadsheet, group chat, a calculator, or another app. More feature parity alone does not create a compelling reason to switch.

The appropriate customer is the recurring home **cash-game host**, not every poker player. Each acquired host can invite a whole table, so registered individual accounts are the wrong primary success metric. The unit of value is a correctly recorded and comfortably settled poker night, followed by another one the host chooses to run.

## A bounded decision experiment

Use the next four weeks, or two naturally scheduled game nights for weekly/biweekly groups. This is a proposed decision rule, not a statistically conclusive sample or an automation already scheduled.

1. Recruit **three independent hosts** who already run home cash games and currently keep records another way. They should be interested in solving their own problem, not only doing a favor or testing software. No outreach has been sent in this task.
2. Before the first night, ask how they handle chip purchases, whether buy-ins are prepaid or deferred, who holds money, how people leave early, and what was annoying at the last game. Verify that Mainpot supports their actual funding model.
3. Observe the first game quietly. Let the host start, invite/add players, record a rebuy, enter final stacks including one true zero, reconcile, and find the payment instructions. Intervene to prevent a financial mistake; record every intervention rather than counting a coached success as independent completion.
4. Keep the current method as a temporary reconciliation cross-check during the pilot. Compare the final records and payment expectations. This is a bounded pilot measure, not a permanent requirement that customers maintain two ledgers.
5. Ask the host to choose what to use for their next scheduled night. A voluntary second use is stronger evidence than praise, registrations, or a promise to try it someday.

Measure per genuine host: completed first-night core journey, number of interventions, incorrect/missing entries, confidence in the final instructions, outstanding payments discoverability, voluntary second-game start/completion, and a concrete reason they would miss the app. Track guest participation separately from registered-account conversion. Keep test/demo records excluded by a verified cohort definition; a name-pattern filter alone is insufficient.

**Continue** if at least two of the three hosts complete two real games, use it again by choice, and identify a concrete benefit such as fewer missing rebuys, faster reconciliation, clearer payments, or less coordination. A host inviting another host is a useful additional signal. Spend the next cycle on the biggest observed friction point, not broad new features.

**Pause major development** if the app needs repeated coaching, groups prefer their old method, or no host voluntarily returns despite having another game scheduled. Resolve any dangerous correctness issue, preserve the project and its evidence as a portfolio/public tool, and redirect active time. If recruitment fails, that is a distribution/reach signal; it does not prove that users tried the product and rejected it. Try one materially different recruiting channel before declaring the underlying need absent.

**Business decision:** even a successful small repeat-use pilot supports usefulness, not willingness to pay. Only explore pricing after hosts repeatedly rely on the workflow and can discuss what they currently spend or would commit to. Do not build paid tiers to manufacture that evidence.

## What to do next, in order

1. Decide and explain the supported money-flow model; do not let a cashier group unknowingly use credit-game payment instructions.
2. Reconcile the live schema and publish the already-built reliability improvements as one verified release. This assessment does not perform that release.
3. Close the small number of high-impact findings in the [independent flow inspection](independent-ux-inspection.md), especially first-time join clarity, cash-out completeness, task order, and recovery that blocks a real night.
4. Run the three-host trial. Stop decorative and speculative expansion during it.
5. Use voluntary repeat use to choose whether Mainpot becomes an actively developed utility or a maintained portfolio project.

For an engineering portfolio, preserve a short demonstration of the complete host/player journey, an architecture explanation, one financial-concurrency failure and its repair, and the honest browser/database/release evidence. Avoid claiming registered growth or production acceptance that has not been demonstrated. This makes the existing work useful even if the product experiment does not justify further investment.
