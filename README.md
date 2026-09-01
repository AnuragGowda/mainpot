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

Mainpot never requires analytics or a central service. The Product Ops integration is disabled by default and remains a no-op unless `NEXT_PUBLIC_PRODUCT_OPS_ENABLED=true` plus all three server-only `PRODUCT_OPS_*` variables are configured. Mainpot forwards only a short allowlisted event name, a HMAC-derived anonymous actor/session ID, and safe controlled values. It never sends player names, room codes, game contents, payment handles, auth data, or feedback text. Telemetry failures are ignored.

The dashboard receives acquisition, the game-completion funnel (`created → second player → settling → finalized`), optional feedback score/presence, and a repeat-host signal. Its core measures are active and new users, returning users and returning-user rate (the share of users active in the selected period whose first recorded activity predates that period), funnel conversion, acquisition source, and feedback distribution. Configure the endpoint, an ingestion key created for the `mainpot` app, and a private HMAC salt only in the Mainpot deployment environment.

## Contributing

Feature requests and reproducible bug reports are welcome through GitHub Issues. Please avoid including private game, account, or payment details in screenshots and logs.

## License

MIT
