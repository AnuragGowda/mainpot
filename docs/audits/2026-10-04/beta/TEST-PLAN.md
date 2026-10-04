# Mainpot beta acceptance kit

October 4, 2026. This is a runnable protocol and blank receipt sheet, not a claim that human, physical-device, or hosted operations testing has passed.

## Before a hosted session

Record the deployed commit, migration version, test URL, host, two players, device models, OS/browser versions, and whether each browser is installed as a PWA. Use fictional names and disposable games for rehearsals. Never paste tokens, email links, real balances, or unredacted account exports into the public repository.

Production is still waiting on Supabase CLI authentication and the committed rounding migration. Apply migrations through the documented CLI path; require all five CI jobs for the exact pushed commit, a clean main checkout, and `npm run release:production`. Main pushes do not deploy. Collect hosted receipts only after that gate and deployment complete.

## First-visit comprehension

Ask five people unfamiliar with Mainpot to view the landing page for ten seconds without coaching. Ask: “What does this do?”, “What would you click to join?”, and “Does Mainpot send the money?” Record their own words before explaining anything.

Acceptance target: at least four of five understand it is a home-poker ledger, find the correct join action, and know payments happen separately. Treat this as an early signal from a small sample, not proof of general usability. Any belief that Mainpot takes wagers, holds a pot, or automatically sends money is a copy issue to investigate.

## Physical host/player journey

Use a real iPhone and Android phone, with one hosting and the other joining. Repeat with roles reversed. A desktop may provide a third seat. Independently record expected amounts before touching Mainpot.

| Task | Pass condition |
| --- | --- |
| Create and invite | Host names the game, chooses a $20 opening buy-in, understands the host-playing checkbox, and shares a link or QR. |
| Join | Player sees host/game/$20 before joining; exactly one pending buy-in appears, including after reload. |
| Approve and rebuy | Host approves the opening entry; player records a $10 rebuy; all devices agree after approval. |
| Correct an entry | Host corrects one deliberate error; corrected amount and activity history agree across devices. |
| Early departure | A player records an early cash-out; host reviews/locks it; reload preserves the exited seat and its obligations. |
| Enter final stacks | Participants enter chip values rather than profit; remaining buy-ins/cash-outs and the early exit reconcile with the independent worksheet. |
| Review a difference | In a separate disposable game, introduce a $1 mismatch; users find the bad entry or explicitly agree an adjustment, understand its effect, and avoid double counting. |
| Lock settlement | Host understands that locking makes cash-outs final; every device shows the same amounts and recipients. |
| Record a payment | Payer marks a synthetic payment sent; other participants see the recorded status. Nobody interprets it as Mainpot verifying receipt. Do not send real money for this rehearsal. |
| Account recovery | On the original guest browser, create/sign in to an account, follow a real delivered email if required, and confirm ownership/history across a second browser. |

For each task, record completion, duration, whether the participant needed help, exact confusion, screenshot reference, and agreement with the independent amounts. A successful automated equivalent does not fill this receipt.

## Installed app and accessibility

On both physical phones: install Mainpot; open the existing game; background it for five minutes; switch Wi-Fi/cellular; return and verify the same seat and amounts. Test airplane-mode notices, reconnect, and a release update on an existing installed app. Record an actual version transition. Do not clear browser/site storage as a recovery shortcut.

Check portrait, landscape, the open keyboard, native 200% text/zoom, and 400% reflow where the browser supports it. Use VoiceOver/TalkBack to complete create/join, hear form errors and saving failures, navigate cash-outs, and close dialogs with focus returned to the opener. Record tool/device details and assistance; axe or WebKit emulation does not close these items.

## Unaided game nights

Recruit three independent hosts for two nights each, with realistic 8–10-seat tables where possible. Have each host use their usual records alongside Mainpot and reconcile final results. Observe without guiding them until they request help. Record entry mistakes, corrections, support questions, time to finish settlement, ledger agreement, and whether they voluntarily return for the second night. Obtain participants directly; this kit has not sent invitations or contacted anyone.

Gate: no lost/duplicated entries, wrong recipients, ownership failures, unexplained financial difference, or blocked settlement. Investigate every critical issue before expanding the beta. A table that balances only after coaching is a usability finding.

## Hosted operations receipts

| Check | Concrete next action | Acceptance receipt | Status |
| --- | --- | --- | --- |
| Retained backup | Identify an actual backup, its age, owner, and a separate isolated restore destination before exporting/restoring production data. | Recovery point/time plus ledger totals, identities, RLS, grants, and function integrity; owner can repeat the recovery. | Pending access/target. Local synthetic restore is not this receipt. |
| Alerts | Identify the real monitor and delivery destination; trigger an agreed synthetic error and controlled uptime failure. | Timestamp, delivered alert, responder acknowledgment, and recovery event. | Pending destination. No messages sent. |
| Capacity | Agree concurrent tables/seats, duration, isolated hosted target, and acceptable latency/error budget before generating load. | Join/mutation/reconnect latency and error rates, no lost/duplicate writes, financial consistency, and resource measurements. | Pending target and load budget. No production load generated. |
| Providers | Confirm real auth email, OAuth return, and push notification opening the existing private room. | Delivery/return on physical devices and preserved ownership. | Pending hosted release and devices. Mailpit proves local behavior only. |

## Blank session receipt

Copy one receipt per participant/session. Keep private evidence outside the public repository.

- Date / observer / participant alias:
- Test URL / deployed commit / migrated schema:
- Host or player / device / OS / browser / PWA version:
- Task / expected amounts / actual amounts:
- Result: **NOT RUN** / pass / fail / blocked:
- Duration / assistance needed / participant’s words:
- Screenshot or private evidence reference:
- Severity / issue / owner / retest result:

Current human and hosted receipts: **NOT RUN**. Start with first-visit comprehension and the two-phone rehearsal; those most directly answer whether the new text is quick to understand.
