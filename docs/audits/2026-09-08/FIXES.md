# Mainpot audit fixes and reassessment

September 8, 2026 · Local working tree · Original review preserved in REPORT.md

## Rating

**Reviewed baseline: 6.5/10. After these fixes: approximately 8/10.** These are expert product judgments, not measured user satisfaction scores. The original core game flow was already useful and coherent. The main deductions came from broken identity continuity, permission boundaries, missing invitations, ambiguous input handling, and accessibility defects.

The revised app is more trustworthy and easier to use. The estimated 8/10 remains conditional on deploying the matching application and database migration together and checking the hosted flows. A higher rating needs evidence from real players, physical phones, assistive technology, and production operation.

## Findings addressed

| Finding | Implementation | Verification |
| --- | --- | --- |
| F01 · Account seat recovery | Room, settlement, and audit actor lookups resolve account ownership before falling back to the guest browser session. Auth changes update the UI identity. | Two independent browser contexts; recovered host ends and finalizes the original game; history reopens that settlement. Unit checks cover guest auth rotation and null identities. |
| F02 · Cross-game audit writes | Event INSERT policy requires actor and subject to belong to the event's game, plus caller ownership or host authority. Direct event UPDATE/DELETE privileges are revoked. | Authenticated negative actor/subject probes, positive same-game host/player writes, and service-role checks of persisted state. |
| F03 · Friendship self-accept | Recipient-only response RPC; no direct friendship UPDATE; new rows must be pending and cannot reference the requester as recipient. | Sender and endpoint tampering rejected; recipient acceptance/decline, cancellation, removal, and terminal-state checks pass. |
| F04 · Calculator input | Explicit decimal validation rejects negatives, non-finite values, excess precision and out-of-range amounts. Invalid or wholly blank worksheets do not present a finished settlement. | Maintained desktop/mobile regression enters invalid values, confirms results are withheld, then corrects them. |
| F05 · Sub-cent creation | Shared currency validation runs before local/shared game creation and monetary data-layer mutations. Invalid text remains visible with an error. | Unit cent-boundary tests and browser checks confirm 0.001 never creates a game; valid cents persist. |
| F06 · Contrast | Supporting labels, activity timestamps, walkthrough states, self-host details, and Venmo background colors have readable contrast on their actual surfaces. | Follow-up axe scans and screenshot inspection. No accessibility conformance claim is made from automation alone. |
| F07 · Payment details | Payment rows explicitly say “Payment details”; accessible names describe the action, recipient, and amount. | Real shared-game payment sheet opens and dismisses correctly; its contrast scan passes. |
| F08 · Incoming names | Personal incoming rows say “From [payer]”; names wrap without truncation and amounts align separately below them. Full ledger wording remains intact. | Long payer name inspected at 320 and 393 pixels; no document overflow. |
| F09 · Deletion progress | Dashboard reads stored request status/date, retains export, suppresses duplicate pending requests, and shows a support contact. Cancelled requests can be submitted again. | Request, reload, pending-state assertion, hidden duplicate action and enabled export. |
| F10 · Keyboard code scrolling | Self-host quick-start code region has a keyboard tab stop and accessible label. | Follow-up accessibility scan and rendered inspection. |
| F11 · Calculator entry | Shorter title/description, a learning link, and immediate worksheet replace the repeated introductory sections and jump action. | First player field appears in the 320-pixel initial viewport; mobile browser checks pass. |
| F12 · Recap privacy | A persistent summary beside Share states names, amount and loss visibility. It updates with the existing controls. | Default/private states at 320×568; actual private PNG download inspected. |
| F13 · Saved-friend invitations | Invitee-scoped metadata RPC; acceptance atomically grants access and returns the room code. Direct invitation updates are closed. Declined invitations can be explicitly resent by the host. | Database access/transition probes plus full UI friend request, invitation delivery and room join. |
| F14 · History navigation | Recent-game titles link to their original room, with Rematch remaining a separate action. | Cross-browser history opens the finalized settlement without exposing active-game mutations. |

## Executed checks

- **137 unit tests in 21 files passed.**
- **14 desktop and 28 mobile browser tests passed**, including emulated mobile Chromium and WebKit.
- **15 shared-database browser scenarios passed across the initial and targeted follow-up runs.** The initial run stopped at an assertion expecting the old incoming-row wording. That assertion was updated to “From Jordan”; it and the four previously skipped scenarios then passed.
- Existing database assurance and new audit-security regressions passed against the final migration chain in a disposable local Supabase stack.
- Supabase's local security advisors reported no issues at warning/error level.
- Lint, TypeScript/production compilation, and whitespace checks passed. Both browser-only and shared-database production builds were exercised.
- **32 follow-up screen states had no reported axe violations, no document overflow, and no page errors in the account/public runs.** Coverage includes public forms, active/settled rooms, account states, payments, recap privacy, and long incoming names at 320/393 pixels. The JSON results and screenshots are in `fixes/`.

The regression checks are maintained in `lib/currency-input.test.ts`, `lib/player-identity.test.ts`, `lib/create-game.test.ts`, `tests/e2e/audit-fixes-flow.ts`, and `scripts/test-audit-security.mts`. The existing isolated database-assurance runner now also executes the audit-security script.

## Deployment and remaining work

The new migration is `supabase/migrations/20260909004759_audit_security_boundaries.sql`. Apply it with the matching app release: the revised friendship and invitation clients depend on its RPCs. Nothing was deployed or pushed by this task. Existing unrelated working-tree changes were preserved.

The friendship constraints use `NOT VALID` so historical malformed rows cannot block migration. PostgreSQL enforces them on new writes. Before validating historical data, inspect invalid status/self-reference rows and decide their disposition; this change does not silently delete or rewrite them.

The reproduced cross-game audit defect is fixed. **Broader audit transaction hardening remains follow-up work:** several legacy events are still appended by the client after the main mutation, so this change does not establish fully authoritative, atomic event generation for every operation. Moving those writes into guarded transactions and injecting event-write failures is a separate, larger migration.

The original report's hosted magic-link/origin investigation, Google OAuth, native push/share/payment handoff, physical-device checks, real-user study, and production reliability measurements remain unverified. The calculator and privacy layout improvements should still be tested with first-time players; their usability benefit is an expert hypothesis.

## Selected visual evidence

- `fixes/incoming-320.png` and `fixes/incoming-393.png`: complete long payer names with separately aligned amounts.
- `fixes/recap-public-320.png` and `fixes/recap-private-320.png`: persistent sharing privacy summary.
- `fixes/recap-private-export.png`: actual private export output.
- `fixes/account-evidence/payment-details-mobile.png`: explicit payment sheet and readable Venmo action.
- `fixes/calculator-393.png`: shortened calculator introduction and visible worksheet.

See `fixes/source-changes.json` for source files changed relative to the review snapshot. Original evidence remains under `evidence/`.
