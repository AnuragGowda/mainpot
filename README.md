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

## Stack

Next.js, React, TypeScript, Tailwind CSS, Supabase, and Lucide.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app falls back to private, single-browser storage when Supabase environment variables are absent. See `SETUP.md` for the hosted Supabase setup and migrations.

## Verification

```bash
npm run lint
npm test
npm run build
```

## Contributing

Feature requests and reproducible bug reports are welcome through GitHub Issues. Please avoid including private game, account, or payment details in screenshots and logs.

## License

MIT
