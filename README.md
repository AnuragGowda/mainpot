# Mainpot

An open-source, real-time ledger for home poker games. Track buy-ins and
rebuys, reconcile the bank, then settle up without a spreadsheet.

## Highlights

- Join a live room by QR code, link, or room code — no account required
- Let the host approve and correct buy-ins, rebuys, and cash-outs
- Reconcile the bank and generate minimum-transfer settlements
- Share Venmo or Zelle payment shortcuts
- Keep friends, invitations, game history, player stats, audit logs, rematches,
  host handoff, and an installable offline-capable PWA in one place

Built with Next.js, React, TypeScript, Tailwind CSS, and Supabase.

## Run locally

**Requires:** Node.js 22+ and a Docker-compatible runtime (OrbStack works on
macOS).

```bash
npm install
npm run dev
```

The development launcher starts local Supabase, applies migrations, and prints
the app, Studio, and local email-inbox URLs. Password accounts work out of the
box; magic links arrive in that inbox. To run only the app in single-browser
`localStorage` mode, use `npm run dev:app`.

Useful commands:

```bash
npm run db:status
npm run db:stop
npm run db:start
npm run db:reset # Deletes local data and reapplies migrations
```

## Verify changes

```bash
npm run lint
npm test
npm run build
```

For browser, realtime, database-assurance, mobile, soak, and Product Ops
canary checks, see the available scripts in `package.json` and the release
checklist in [SETUP.md](SETUP.md).

## Deploy or self-host

The local Supabase stack is for development, not an internet-facing deployment.
For hosted Supabase, environment variables, authentication, Vercel, PWA
behavior, telemetry, and the production launch checklist, follow
[SETUP.md](SETUP.md).

## Contributing

Feature requests and reproducible bug reports are welcome through GitHub
Issues. Please do not include private game, account, or payment details in
screenshots or logs.

## License

[MIT](LICENSE)
