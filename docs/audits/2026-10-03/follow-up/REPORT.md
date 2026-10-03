# Mainpot support link and follow-up acceptance

October 3, 2026. This report separates automated browser evidence from checks that need physical devices, outside hosts, or access to hosted operations. The earlier [scorecard](../../2026-10-02/ui-ux/REPORT.md) remains provisional.

## Changes

- Added an optional “Support Mainpot” link to the shared public-page footer. It uses a plain external HTTPS link, a small coffee icon, keyboard focus styling, and an accessible new-tab label. No payment widget or provider script is loaded. Game payments and support payments remain separate.
- Configure `NEXT_PUBLIC_SUPPORT_URL` with your own support page and rebuild. A missing or invalid URL hides the link. The screenshots use `https://example.com/mainpot-support` as a test fixture; that URL is not a real payment destination or a committed deployment setting. Activation is waiting for the owner's real URL.
- The expanded axe scan found five low-contrast labels in the rendered landing demo: Friday night, Bank, Buy-in, Players, and Room code. Their measured ratios were approximately 3.1–4.0:1. Changed the dark-panel labels from gray-400 to gray-300. Also gave the named room-sharing container an explicit group role. [Before results](evidence/contrast-before.json) and [after capture](evidence/landing-demo-contrast-after.png).
- At 320px with root text doubled, room actions overflowed horizontally and the fixed three-column totals and player rows clipped names and amounts. Actions now wrap, totals use available space and text size to choose their columns, and player rows wrap with space reserved for names. The acceptance pass checks both page overflow and clipping of ledger names/amounts. [Overflow before](evidence/reflow-before.json) and [financial text before](evidence/financial-text-before.png).
- A later boundary check found the maximum allowed amount, **$99,999,999.99**, clipping inside a player card at doubled text size even with zero page overflow. The amount column now stays within its card and wraps the number when needed. The reusable pass includes ordinary and doubled-text maximum-amount states on every profile. [Measured clipping before](evidence/maximum-amount-before.json) and [amount after](evidence/maximum-amount-after.png).
- In emulated iPhone WebKit, closing player management failed to return focus to its opener. WebKit does not consistently focus a button on pointer activation, so player-sheet openers now explicitly take focus before the sheet records its return target. [Failing focus assertion](evidence/focus-before.json).
- Extended account-recovery failure diagnostics to record focus, selection, DOM-node changes, and a classification of the known synthetic name. Raw names, auth fields, storage, and response bodies remain excluded. The test's financial and recovery assertions remain intact.

## Provider choice

Mainpot records a home game's ledger and settlement obligations; it does not take wagers or process those game payments. Creator support funds software development and hosting. That distinction supports describing it as software support, but does not establish a provider's approval.

[Buy Me a Coffee](https://help.buymeacoffee.com/en/articles/3364212-what-do-we-restrict-on-buy-me-a-coffee) prohibits gambling content, tips, and systems. [Ko-fi](https://help.ko-fi.com/hc/en-us/articles/360007937553-Ko-fi-Content-Guidelines) has gambling-related and payment-provider restrictions, so switching providers does not itself establish eligibility. Another poker-related page using a service is not evidence of approval for Mainpot.

[GitHub Sponsors](https://docs.github.com/en/sponsors/receiving-sponsorships-through-github-sponsors/about-github-sponsors-for-open-source-contributors) is designed for supporting open-source contributions and is a reasonable first option for this MIT-licensed project, subject to account eligibility and activation. The integration accepts any valid HTTPS support page; the owner chooses the provider and supplies the real URL.

## Automated acceptance

The mobile and desktop WebKit account-recovery flow passed **10 local repeats without retries**. This does not reproduce or explain the earlier Linux CI name-fill failure (`CaseyCasey`); the added diagnostics address its evidence gap.

The preceding exact revision `0463dad03ca9dfe8b6775a8d2624f0db6b442392` passed all five jobs in [CI run 37140410221](https://github.com/AnuragGowda/mainpot/actions/runs/37140410221) and the read-only release gate. Realtime reported **164 first-attempt passes and one flaky pass after a retry**. The panel-isolation setup fix passed on its first attempt. Those results precede this follow-up and are not verification of the new changes.

Current browser acceptance results are in [browser-checks.json](evidence/browser-checks.json). The reusable `npm run test:ui:acceptance` pass exercises local-storage mode on desktop Chromium, 320px Chromium, emulated Android Chromium, emulated iPhone WebKit in portrait and landscape, and desktop WebKit. It covers public screens, the configured support link, keyboard game setup, a nine-seat table, player-management focus return, 200% root-font scaling, maximum valid amounts, reconciliation, settlement review/lock, and Chromium service-worker offline recovery. Root-font scaling is a text/reflow simulation, not proof of native browser zoom. Axe incomplete checks remain separate from violations.

Run against a local server built with both public Supabase variables empty. Set `MAINPOT_AUDIT_BASE_URL` if using a port other than 3125 and `MAINPOT_EXPECT_SUPPORT_URL` to the URL used for the local build. Without that expectation, receipts explicitly mark the support-link check as `not-requested`. The script refuses a non-local origin and verifies local-mode account UI before creating synthetic data. Evidence goes to `MAINPOT_AUDIT_OUTPUT`, defaulting to this report's evidence folder. Scans wait for finite entry animations to finish, and leave infinite decorative animations running. A public-mode sweep is not a screen-reader certification or evidence of unaided host usability.

Final local results: **311 unit tests in 46 files passed**; lint reported **zero errors and one existing ref-cleanup warning**; the production build passed; dependency policy passed; **seven support-URL configuration cases passed**. Production dependency audit reported zero vulnerabilities. The reviewed lint-only `braces` advisory remains unpatched and its scoped exception expires **October 17, 2026**; a policy pass is not a zero-finding full dependency audit.

The six-profile browser pass completed **78 scans and one service-worker recovery receipt**, with **zero detected axe violations, page overflows, clipped ledger names/amounts, or uncaught page errors**. The configured fixture link passed URL, safe new-tab relationship, and focus checks in **18 public-page scans**. There are **446 incomplete node checks** across repeated scans: 416 contrast checks where axe cannot determine the background (including gradients), and 30 checks referencing closed, conditionally mounted dialogs. These are preserved with targets in the JSON for manual review; they are not certified passes. Screenshots were inspected for the landing demo, narrow footer, and enlarged player row.

These are pre-commit local receipts. The new revision must independently pass all five required CI jobs after push before production release. The exact-commit CI result is separate from both these screenshots and the earlier run.

## Remaining acceptance

| Check | Required receipt | Current limit |
| --- | --- | --- |
| Physical iPhone and Android | A host and player complete invite/join, buy-in approval, rebuy, correction, early cash-out, reconciliation, settlement, and account recovery on real phones. Record device, OS/browser, app version, failures, and final ledger agreement. | No device access established; emulation does not close this item. |
| Installed PWA recovery | On both phones, install the app, background it during an active game, return after a network change, test reload/offline recovery, and verify an app update preserves the existing game/session. Check the on-screen keyboard and portrait/landscape controls. | Chromium automation covers service-worker recovery only; native installation, suspension, eviction and updates remain unrun. |
| Screen reader and zoom | Complete create/join and settlement with VoiceOver or TalkBack; confirm meaningful headings, form errors, live notices, dialog focus and return focus. Test native 200% text/zoom and 400% reflow. | Automated axe, keyboard checks and font simulation are bounded evidence. |
| Unaided hosts | Three independent hosts complete two real game nights each, including 8–10 seats and realistic activity. Record task errors, support questions, reconciliation against their records, and voluntary return. | A script can test actions, but cannot supply human understanding or retention evidence. No outreach was sent. |
| Retained hosted backup restore | Restore an actual retained backup to a named isolated destination. Record backup age/recovery point, restore time, responsible owner, and financial/auth/RLS/privilege integrity. | The organization reports **Free**. [Supabase recommends regular CLI exports and off-site backups for Free projects](https://supabase.com/docs/guides/platform/backups); paid automatic backup/PITR coverage cannot be assumed. No production backup was exported or restored. |
| Alert delivery | Trigger a controlled uptime failure and app-error event, then record destination, timestamp and human acknowledgment. | Monitor/responder access and delivery target are not established. No real alerts or messages were sent. |
| Representative capacity | Agree on a bounded concurrent-table/user target; exercise independent joins, mutations, polling and reconnects with seeded disposable data while recording latency/error rates. | Local database churn and canaries do not prove hosted concurrent capacity. No production load was generated. |
| Production provider acceptance | Verify real delivered auth email, OAuth return, cross-device ownership, and push opening the private room after release. | Local Mailpit/browser tests do not prove provider delivery or recovery on an existing installed app. |

## Production boundary

Read-only checks still report Mainpot's hosted project healthy, on PostgreSQL 17.6.1.166, with 57 migrations. `20261001210118_bound_discrepancy_rounding.sql` remains absent. CLI authentication is still required for the repository's migration path. No production schema, paid plan, auth settings, deployment, or live game was changed by this follow-up.

Next sequence: authenticate the Supabase CLI, review/apply the pending committed migration through the CLI, require a clean exact pushed revision with all five CI jobs green, use `npm run release:production`, then collect production host/player and physical/provider receipts. The support URL also needs to be configured before its link can appear on production.
