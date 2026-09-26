# Independent Mainpot UX inspection — 2026-09-26

## Scope and evidence boundary

This is a read-only, independent usability inspection of `19fae9e`, not a repeat of the main release report. I used a fresh, isolated production build at `127.0.0.1:3125` with both public Supabase variables empty. That intentionally activated Mainpot's single-browser local-storage mode; no accounts, hosted game rows, invitations, or payment data were created.

Evidence labels used below:

- **Browser observed**: driven in a fresh headless WebKit browser on this exact build, with screenshots in [`evidence/independent-ux`](evidence/independent-ux).
- **Code inferred**: traced in the current UI/data code, but could not be authenticated or multi-device tested without a disposable Supabase stack.
- **Unverified**: needs a real hosted or physical-device session. It is not treated as passing merely because code or earlier tests exist.

The route sweep loaded every user-facing route below at 1440px and 390px: all returned 200, had no page errors, and had no horizontal overflow. The raw result is [`route-sweep.json`](evidence/independent-ux/route-sweep.json). A separate 320px creation check also reported `scrollWidth === clientWidth === 320`.

## Product judgment

**Continue, but only as a deliberately facilitated five-game pilot after resolving the settlement-model and join-consent blockers. Do not spend on broad acquisition yet.**

There is a real core here: a host can create a table, add phone-free players, track entries, settle an early departure, enter stacks, see an auditable transfer ledger, and make a privacy-aware recap. The visual system is restrained and legible. The product is most credible when a host is physically running a friendly cash game and can explain the workflow.

It is not yet self-explanatory enough to make money handling trustworthy for a cold host. The product currently mixes three concepts—ledger entry, cash actually received, and an outstanding personal advance—without declaring the one physical cash-flow model assumed by its final transfers. The manual-code join path also records a specific buy-in without displaying the amount first. These are pilot-stopping comprehension issues, not claims that the settlement arithmetic is wrong for the deferred/netted model.

No known external registered users means there is no independent signal of repeat value. That does **not** prove there have been no real guest games: guest and owner/test activity cannot be separated from the aggregate counts available to this inspection. Treat the next five completed games with at least three returning hosts as a learning gate, not as a scale-up launch.

## Experience scorecard

| Dimension | Score | Why |
| --- | ---: | --- |
| First-visit clarity | 7/10 | Landing explains the job, the two primary actions are clear, and local mode is explicit after entering a room. It does not establish the physical cash model. |
| Host setup and active table | 7/10 | Fast setup, readable amount cards, host-managed seats, and clear persistent actions. “Verified” is not explained as a ledger assertion rather than proof of payment. |
| Joining and consent | 3/10 | Direct invite-room join shows the game, host, and amount; manual code join does not show any of those before committing the opening entry. |
| Cash-out and settlement | 4/10 | Good staged reconciliation and a strong “no money moves in Mainpot” disclosure. The bank option and cash-flow assumptions remain dangerously under-specified. |
| Early exit and advances | 5/10 | The final locked row states who pays whom, but the first early-exit review only accepts a final stack, leaving the user to infer the resulting obligation. |
| Payment completion and recap | 5/10 | Payment ledger is readable, but it sits below a dominant game-card reveal at the moment people need to settle. |
| Mobile/responsive quality | 8/10 | 390px and 320px inspected layouts had no overflow; mobile hierarchy and fields remained usable. |
| Accounts, return use, social graph | — | Hosted-only. Local mode correctly says these are unavailable; durable account recovery, dashboard, friends, templates, invitations, export/deletion, and cross-device continuity remain unverified here. |
| PWA resilience | — | Manifest/local pages render, but install, browser eviction, offline recovery, update handoff, and push need physical-device validation. |

## Current issue inventory

| ID | Severity | Evidence | Pain point and impact for a novice | Minimal improvement | Confidence |
| --- | --- | --- | --- | --- | --- |
| UX-01 | **P0 pilot blocker, conditional on target cash model** | Browser observed settlement copy and calculator behavior; code inferred transfer routing | “Table bank” says one person “pays and collects every final payment,” while the calculator and settlement logic produce **net** obligations. For two $20 entrants with final stacks $40/$0, it routes $20 from the loser to the winner. That is correct if no cash was collected during play and people settle at the end. If the host already holds both $20 buy-ins, a novice can read “bank” as cashier mode, then create an extra $20 transfer instead of paying the winner $40 from the held pot. The current UI says “No money moves in Mainpot” but never asks whether the buy-ins were already collected or labels bank as a net-routing mode. | At setup, require one explicit funding model: **settle net at the end** or **cash held by banker**. In the current feature, rename the option to “Route net settlement through a player,” add the assumption immediately beside it, and block/redirect cashier-mode users until gross-payout accounting exists. | High |
| UX-02 | **P1** | Browser observed | Manual join with a valid code `NU3HYZ` showed only name and code; it did not fetch/display the game name, host, or $37 buy-in. Clicking **Join game** immediately created a pending $37 opening entry. The user sees the amount only after being added. The direct room `JoinPrompt` is materially better because it displays host, game, and buy-in before submit. | Resolve the code first, then show the same confirmation card used by direct room links: game name, host, opening amount, “pending host approval,” and a final **Join and record $37 buy-in** button. | High |
| UX-03 | **P1** | Browser observed plus code inferred | “Verified buy-ins” and activity text such as “Player bought in for $37” appear even while the player’s row says `$37 pending` and the UI has no receipt or cash-received record. A first-time host can reasonably read verified as Mainpot having verified cash, or read “bought in” as payment completed. “Someone else paid and I still owe them” adds a third money state without a brief model explanation. | Use precise state language everywhere: **requested entry**, **host-confirmed chips/cash**, **advance still owed**. Add one persistent one-line ledger key near the table and an explanatory first-use tooltip. | High |
| UX-04 | **P1** | Browser observed | In the calculator, clearing the example, entering player 1 `money in=$20`, `final stack=$40`, player 2 `money in=$20`, and leaving player 2’s final stack blank yields “Bank balanced” and a $20 payment from player 2 to player 1. An accidental missing final stack can silently become a $0 cash-out. This is especially risky because the calculator describes itself as a settlement aid. | Treat an empty final stack as incomplete and prevent “Bank balanced” / payment output until every added player has an explicit value, with an intentional **zero stack** entry still allowed. | High |
| UX-05 | **P1** | Browser observed | Immediately after locking, the large “Your game card” reveal dominates the page while the operational **Payment ledger** is below it. In the inspected early-exit scenario, the only actual obligation (`Taylor → Casey $5`) sat below the recap. Celebration makes sense after payments are clear; it should not displace the action people opened the app to perform. | Put each person’s payment instruction and the shared ledger directly below the ended header; make recap a smaller card or a secondary “Share your game card” action after payment status. | High |
| UX-06 | **P2** | Browser observed first-step dialog; subsequent review source inspected | The first early cash-out dialog asks only for “Final stack” and does not preview buy-ins, calculated net, or counterparty. This step requests review; it is not the irreversible lock. The subsequent table review already displays the preview net and has a separate Confirm & lock action. Earlier explanation would reduce context switching for a host managing someone leaving. | Show live “Taylor bought in $10, final chips $5, expected net −$5” before requesting review; retain the separate table confirmation and its calculated obligation. | Medium-high |
| UX-07 | **P2** | Browser observed | Rapid normal operations produced a stack of duplicate “Table updated” toasts over the fixed bottom action and the activity feed. This will be worse with a real table making several entries, and obscures the meaningful early-cash-out/settlement feedback. | Coalesce ordinary sync toasts per short time window; retain only material state messages and give them a single stable region. | Medium |
| UX-08 | **P2, local/self-host scope** | Browser observed and code inferred | A new browser entered a valid local-mode game code and received “Game not found.” This is expected because local mode persists only one browser’s `localStorage`, but the join screen does not warn the user before they try. A host can invite a second phone in a local-only deployment and create an avoidable support moment. | On all local-mode invite/join surfaces, say “This table is saved only on the host’s browser; other devices cannot join until sync is configured,” and disable/share accordingly. | High for local mode; not a hosted-app finding |
| UX-09 | **P2** | Browser observed | The desktop host view is visually clean but behaves more like a long audit log than a compact game-night command surface. A fixed **Add a rebuy** bar is separated from player rows, the activity feed is tall, and the optional acquisition survey appears in the operational scroll path. The page stays workable, but fast host tasks require more eye travel than necessary. | Keep one compact, sticky “table controls” group (invite, add player, rebuy, end) near the summary; collapse activity by default once there are several events; move feedback/acquisition after settlement. | Medium |
| UX-10 | **P3** | Browser observed | `/recap-lab` is polished and clearly marked “lab fixtures,” but at 390px it is a very long, public-looking gallery with share/download controls and a fixture selector. It is not in primary navigation, yet direct-route discovery can make it appear like a second product whose example privacy switches differ from the production recap. | Keep it noindex and segregated; add a stronger non-production banner or move design inventory behind a development-only route before a broader pilot. | Medium |

## Flow matrix

| Journey / route | What was exercised or inspected | Result and key usability conclusion | Evidence |
| --- | --- | --- | --- |
| Landing `/` | Desktop 1440px; mobile 390px | Clear core proposition, primary start/join actions, calculator link, FAQ, footer. No overflow/page errors. The landing promises exactness more strongly than it explains the cash model. | Browser observed: `landing-1440.png`, `landing-390.png` |
| Create `/create` | 1440px filled/created; 390px and 320px layout | Inputs and opening-buy-in checkbox are clear. Host can elect not to play. The guest-two-active-games policy is exposed early, which is useful but adds policy before first value. | Browser observed: `create-filled-1440.png`, `create-390.png`, `create-320.png` |
| Active host room `/game/[code]` | Created host table, invited, added two managed seats, saw room state and activities | Core host flow is coherent, responsive, and auditable. Local-mode warning is clear after creation. The money-state vocabulary issue is material. | Browser observed: `active-host-first-look-1440.png`, `active-host-after-early-exit-1440.png` |
| Manual code join `/join` | Fresh browser invalid-local attempt; valid-code participant simulation within shared local store | Form normalization/error state works. Valid manual code had no pre-submit table or amount confirmation; actual entry became pending afterward. | Browser observed: `manual-join-before-submit-1440.png`, `manual-join-after-submit-1440.png`, `join-local-cross-device-390.png` |
| Direct invite room join | Component/read path reviewed | Direct room join provides the missing host, game, buy-in, and pending-review context; behavior needs real hosted multi-device validation. | Code inferred: `components/GameRoom/JoinPrompt.tsx` |
| Host approvals/edits/rebuys/advances | Host-added seats and host buy-ins exercised; approval/edit/advance surfaces inspected | Host-created local entries immediately show verified amounts. Guest pending approval, host correction, and an outstanding-advance lifecycle were not browser-proven against a server. | Browser observed + code inferred |
| Early exit | Host-managed Taylor: entered $5 final stack, reviewed, locked; later saw a Taylor → Casey $5 ledger row | The lifecycle works in local mode, but commitment clarity is incomplete before the lock. | Browser observed: `early-cashout-review-1440.png`, `active-host-after-early-exit-1440.png`, `settlement-complete-1440.png` |
| End/reconciliation/discrepancy | Ended a balanced table and entered cash-outs; discrepancy UI traced | Balanced reconciliation and review screen work. Explicit short/extra bank allocation was not independently driven in this pass. | Browser observed for balanced; unverified for discrepancy interaction |
| Settlement/bank/payments | Saw fewest-payments and table-bank choices, locked settlement, opened ledger; calculator scenario exercised | Net settlement is presented as payment routing. Its physical cash assumption is the pilot blocker described in UX-01. Ordinary two-sided payment acknowledgment and reload were not independently multi-session tested. | Browser observed: `settlement-review-1440.png`, `settlement-lock-warning-1440.png`, `settlement-complete-1440.png`, `calculator-blank-stack-1440.png` |
| Recap/share | Reached the post-game game-card state; recap route inspected | Recap visual quality is strong, but it is ordered ahead of settlement work. Native share/download and privacy persistence were not exercised in this independent run. | Browser observed: `settlement-complete-1440.png`, `recap-lab-390.png` |
| Calculator `/poker-settlement-calculator` | Desktop/mobile visual pass plus blank-stack scenario | Educational and responsive, but an empty final stack is interpreted as zero. | Browser observed: `calculator-1440.png`, `calculator-390.png`, `calculator-blank-stack-1440.png` |
| Sign in, dashboard, friends | `/signin`, `/dashboard`, `/friends` at 1440/390; code read | All show/redirect to the intentional local-mode limitation cleanly. Sign-up/sign-in, profile, dashboard resume, history, templates, saved friends, invitations, exports, deletion, and account recovery are **unverified** until hosted. | Browser observed: `accounts-unavailable-1440.png`; code inferred |
| Feedback, self-host, privacy, terms, not-found | Desktop/mobile route sweep | All rendered cleanly. Content links are not evidence that email/GitHub actions or self-host deployment work. | Browser observed: `route-sweep.json` |
| PWA | Manifest/public worker source and local entry routes inspected | The contextual install/recovery implementation exists, but actual install, offline reload, process eviction, standalone safe areas, and update recovery need device validation. | Code inferred / unverified |

## What is ready for a supervised pilot

1. One host on one device can run a known group, add absent players, record entries, and finish a straightforward net-settlement game.
2. Mobile setup and the host room are visually stable at the inspected widths.
3. The ledger preserves a useful event history, and early exits have a visible separate obligation after lock.

## Before inviting even a small outside group

1. Resolve and name the product’s cash-flow model (UX-01). Put the choice and consequences in setup and settlement, then playtest both models with an actual host who normally collects cash up front.
2. Fix manual join amount/table consent (UX-02) and empty calculator outputs (UX-04).
3. Reorder post-game UI so payments precede recap (UX-05), then validate one nonzero transfer with host, payer, and recipient in separate hosted browser contexts.
4. Run the pending-approval, correction, advance, early-exit, settlement-reload, dashboard-resume, invitation, and account-deletion paths on a disposable backend. Treat that as separate evidence from this local UI pass.
5. Use five concierge games: observe host setup time, whether anyone asks what “verified” means, whether any cash was already collected, whether recipients confirm payment status, and whether the same host creates another game unaided. Stop broad outreach if hosts cannot independently explain which money is held and which money is owed.

## Evidence inventory

The screenshots listed above plus `route-sweep.json` are in [`docs/audits/2026-09-26/evidence/independent-ux`](evidence/independent-ux). They contain no credentials or user data beyond generated local test names. No product code, database, service-worker cache, or hosted state was changed by this inspection.

## Root integration notes

Root inspected the join, early-cash-out, and complete-settlement captures and checked relevant source. The early-cash-out first step is a review request, not the irreversible financial commitment; UX-06 is qualified accordingly. Current participant payment instructions already appear above the recap for ordinary final-plan transfers, so UX-05 concerns the shared ledger and early-exit obligations rather than asserting that all personal payment instructions are below the recap.

The complete-settlement capture also exposes a stronger task-clarity concern: Casey sees “You're even. No payment needed.” while the ledger has an unpaid Taylor → Casey $5 early-exit collection. The personal summary receives final-plan transfers without those separately displayed early-exit obligations. See P08 in [the integrated assessment](product-assessment.md). This is a reproduced presentation mismatch, not a claim that the locked early-exit transfer was missing from the ledger.

The lab-gallery segregation suggestion is optional product cleanup, not a demonstrated abandonment or money-flow blocker. Account-only source findings and explicit hosted verification limits are in [the account review](account-ux-review.md). The root's decision recommendation is a three-host, two-night trial within roughly four weeks; the five-game suggestion above is an independent reviewer's similar small-pilot proposal, not a second required program.
