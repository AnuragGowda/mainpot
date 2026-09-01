# Mainpot

An open-source, realtime ledger for home poker games. Track buy-ins and rebuys, reconcile the bank, and calculate a clean settlement without a spreadsheet.

## What it does

- Live multiplayer rooms with account-free QR, link, or code joining
- Host approval and correction of buy-ins
- Rebuys fronted by another player without changing chip accounting
- Cash-out reconciliation and minimum-transfer settlement
- Optional Venmo and Zelle shortcuts for completing settlements
- Friends, direct table invitations, game history, and player statistics
- Host handoff, audit log, and one-click rematches
- Installable PWA with a branded offline shell

## Stack

Next.js, React, TypeScript, Tailwind CSS, Supabase, and Lucide.

## Local self-hosting with Docker

Mainpot can run entirely on your machine. The local Supabase stack provides
PostgreSQL, authentication, the REST API, Realtime, and a development email
inbox; no Supabase account or external authentication provider is required.

Prerequisites:

- Node.js 22+
- OrbStack on macOS, or another Docker-compatible runtime on other platforms

Clone the repository, then run:

```bash
npm install
npm run dev
```

On the first run, the pinned Supabase CLI downloads its Docker images, creates
the local database, and applies every migration. Later starts reuse the same
containers and persisted data. The launcher prints all local URLs, including:

- Mainpot: [http://localhost:3000](http://localhost:3000)
- Supabase Studio: [http://127.0.0.1:54323](http://127.0.0.1:54323)
- Local email inbox: [http://127.0.0.1:54324](http://127.0.0.1:54324)

Password accounts work immediately. Magic-link messages are captured by the
local email inbox instead of being sent externally. Google and other OAuth
providers are disabled. Mainpot also enables anonymous Supabase users because
account-free game participants need an identity for database authorization.

Useful database commands:

```bash
npm run db:status  # Show local service URLs and status
npm run db:stop    # Stop containers without deleting data
npm run db:start   # Start the Supabase containers only
npm run db:reset   # Delete local data and replay all migrations
```

To run only the Next.js app in private, single-browser `localStorage` mode,
without starting Docker, use `npm run dev:app` with no Supabase variables.

See `SETUP.md` when connecting Mainpot to a hosted Supabase project or deploying
the application outside this local development stack. The Supabase CLI stack is
intended for local development, not as a hardened internet-facing deployment.

## Verification

```bash
npm run lint
npm test
npm run build
```

## Optional Product Ops telemetry

Mainpot never requires analytics or a central service. The Product Ops integration is disabled by default and remains a no-op unless `NEXT_PUBLIC_PRODUCT_OPS_ENABLED=true`, Supabase is configured, and the server-only `PRODUCT_OPS_ACTOR_SALT` is present. The route appends only a short allowlisted event name, separate HMAC-derived actor/session/journey IDs, and safe controlled values to `public.product_ops_outbox`. It never sends player names, room codes, raw game IDs, game contents, payment handles, auth data, or feedback text. A duplicate is a no-op; another storage failure returns `503`, so the request is not represented as durably stored, while the browser intentionally keeps telemetry separate from game play.

The dashboard receives the game-completion funnel (`created → second player → settling → finalized`), optional feedback score/presence, a repeat-host signal, and two distinct acquisition signals: browser/referrer attribution (`direct`, `github`, `documentation`, `self_hosted`, `other`) and an optional in-product self-report (`personal_invite`, `poker_group`, `search`, `other`). Funnel stages and self-reports share a pseudonymous game journey so conversion is counted by game even when different players emit events. Actor metrics represent pseudonymous browsers or accounts, not guaranteed unique people. Configure the public opt-in flag and private HMAC salt only in the Mainpot deployment environment.

A private collector pulls `GET /api/product-ops/events?after=<sequence>&limit=<1-500>` with `Authorization: Bearer <PRODUCT_OPS_COLLECTOR_KEY>`. The token must be a random secret of at least 32 characters. The response is `{ events: [...] }`, ordered by ascending `sequence`, and contains only the projected, already-pseudonymized outbox columns. The route never caches responses. The collector token is app-scoped; the broad Supabase server key remains only in Mainpot. The outbox has RLS enabled and grants only `SELECT`/`INSERT` plus identity-sequence usage to the interim Supabase server-role credential; browser roles cannot read or write it, and no role receives `UPDATE`/`DELETE`. A product-scoped database credential remains a roadmap hardening task. Vercel previews are stored as `staging`, production as `production`, and local development as `development`. A Vercel deployment therefore never needs inbound tailnet access or a public Product Ops ingestion endpoint.

The hosted-Supabase `pg_cron` job `purge-expired-product-ops-outbox` runs daily and removes outbox rows after 90 days. Its cleanup function is not callable by browser roles.

For a deeper check than public reachability, a monitor with the separate 32+ character `MAINPOT_CANARY_KEY` can `POST /api/health/canary`. It uses only the protected `product_ops_canary` table to verify a database insert/delete and its Realtime publication; it never touches a customer game, player, or payment record.

## Contributing

Feature requests and reproducible bug reports are welcome through GitHub Issues. Please avoid including private game, account, or payment details in screenshots and logs.

## License

MIT
