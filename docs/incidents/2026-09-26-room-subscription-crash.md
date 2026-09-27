# Room crash after a second early cash-out

## Cause and impact

Two locked early cash-outs rendered two payment cards. Each card created its
own payment-status reader using the same game-based Realtime channel topic.
The installed Supabase client returns an existing channel for a repeated
topic. Adding a PostgreSQL callback after the first card subscribed threw:

`cannot add postgres_changes callbacks ... after subscribe()`

React's route error boundary replaced the room with “Mainpot hit a snag.”
The approved cash-outs and ledger entries had already committed. This was a
client screen failure; no ledger rollback was necessary. The callback setup
came from commit `bc77b98`, which guarded payment-status reads but did not
account for multiple standalone early-exit cards.

## Detection and recovery limits

The existing early-exit browser test covered one departing player. Local-mode
tests also cannot reproduce Supabase channel deduplication. Passing unit tests,
builds, and a fresh-browser check did not prove recovery of an existing user's
app session. The first recovery report overstated that evidence.

The original deployed bundle reproduced this exact crash against a privately
captured, read-only saved room snapshot. Commit `fcd98c3` separated reader
channel topics. The deployed fix rendered both cash-outs in Chrome and WebKit
with intercepted auth and data reads; this was not a production authentication
or two-device realtime verification. A subsequent device failure was reported;
its exact cause was not established. Stale app files were a hypothesis, not a
confirmed diagnosis. Commit `8ddd676` added cache recovery that preserves
session cookies and local ledger storage. Device recovery remains unconfirmed
until the user reports the room works.

## Preventive controls

- Early-exit cards share one payment-status reader per rendered section.
- Every subscription attempt receives a unique topic, including restarts
  while prior cleanup is pending.
- Room and payment subscription setup/cleanup errors are contained. Existing
  authoritative polling continues; confirmed payment state is not invented.
- Database-backed tests cover two departures, opposite payment directions,
  payment changes, repeated reloads, and final settlement. The same scenario
  runs with the host's Realtime transport deliberately failing at setup.
- Tests fail on both uncaught browser errors and React-reported effect errors.
- Error screens expose only a finite support category and build identifier.
- Git pushes to `main` do not trigger production deployment. The production
  release command requires a clean pushed commit and all jobs in the latest
  push CI run for that exact commit to pass. Only committed source is uploaded.

Direct Vercel deploy/promote commands remain an administrator bypass for a
documented outage. This gate does not make the app immune to crashes. Every
release still needs the affected production journey checked, and physical
installed-app recovery must be identified separately from headless verification.

## Local validation

The two-departure scenario passed all 10 runs across desktop Chrome, mobile
Chrome, mobile Safari, desktop Safari, and tablet Safari, with normal and
deliberately failed Realtime setup. These runs used an isolated disposable
Supabase database, including real guarded payment writes and final settlement.
All 271 unit tests in 42 files passed, followed serially by lint, the production
build, and `git diff --check`. This is local evidence; CI, deployment, and the
affected user's installed-app recovery remain separate checks.
