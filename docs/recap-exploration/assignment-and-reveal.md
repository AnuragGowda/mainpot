# Felt Society: automatic assignment and reveal

The finalized-game entry point, share editor, and exported image use the same Felt Society character model. The editor adds a short reveal and remembers privacy preferences for the tab session.

## Assignment contract (felt-society-v1)

`lib/recap-characters.ts` is the sole production source for title, illustration kind, evidence, displayed result and share caption. There is no production character override or caption index. The card, editor and share sheet resolve the same model synchronously from the same data and privacy settings.

Priority has two stages:

1. Remove every identity whose supporting fact is missing or hidden.
2. Among eligible identities, choose the first in a stable game/player-derived order. All candidates have equal standing; there are no rarity levels, performance scores or spending weights.

| Identity | Required visible recorded fact |
| --- | --- |
| Mayor of Value Town | Personal net is positive at USD cent precision |
| Table Sponsor | Personal net is negative at USD cent precision |
| Break-Even Baron | Personal net is zero at USD cent precision |
| Encore Artist | Featured player has at least one recorded rebuy and personal rebuy evidence is visible |
| Felt Marathoner | Recorded game duration is at least 240 whole minutes, with duration visible |
| Table Celebrity | Always eligible; neutral identity |
| Group Chat Correspondent | Always eligible; neutral identity |

The total order uses unsigned 32-bit FNV-1a (UTF-16 code units) on `JSON.stringify(['felt-society-v1', gameId, requestedPlayerId ?? resolvedPlayerId ?? null]) + kind`. Lowest score wins; lexical character-kind order breaks hash collisions. This explicitly fixed version is a compatibility contract. It never uses input position, names, ranks, money magnitude, rebuy count, date formatting, current time or browser randomness. Increasing spending/rebuys does not improve a score or add extra chances. Neutral identities participate for visible cards too, so winners do not all become the Mayor.

Without a requested player, choose the lexically smallest player ID. If an explicit player ID is missing, do not substitute another player's result/rebuys. The finalized settlement entry point may supply its existing featured/top-player ID; tied settlement results now sort by immutable IDs. Reordering snapshots, reopening, and rerendering cannot change the assignment for the same game, player and privacy settings. Hiding an irrelevant stat cannot change an already eligible winner. Hiding the chosen identity's support produces a deterministic safe fallback; restoring the same visibility restores the same original assignment.

## Privacy and data boundaries

- `showResult: false`, hidden dollar amounts, a hidden featured player, missing/nonfinite result, or a negative cent-rounded result with losses hidden suppresses the personal result and all outcome identities before rendering.
- Hidden rebuys never affect identity or evidence. Hidden players cannot supply personal rebuy evidence. Encore copy acknowledges a recorded rebuy without praising quantity or spending.
- Hidden/unknown/invalid/short duration cannot support the Marathoner. Duration is **game duration**, never a claim about personal attendance. Whole minutes are floored so 3h 59m 50s does not qualify as four hours.
- Entirely private cards use only the two neutral identities, independent of hidden results and statistics. Artwork, accessible labels, live announcements and captions share that same safe model. The face-down art/animation is identical for every identity.
- Player/table names, room codes and Payments never appear in the production SVG or share text, even if legacy `showPlayerNames` is true. No hand-history, bluff, luck or skill claims are inferred.
- Aggregate buy-in/rebuy totals are suppressed when players or losses are hidden, avoiding disclosure through table totals. Explicitly visible player count and game duration remain table-level facts. Invalid counts/amounts/duration show an em dash.
- Dollars use symmetric cent rounding (including ±0.005 and ±1.005). Exact cents are retained for large values; net text scales down when necessary. Amounts beyond safe cent precision are unknown rather than rounded into an identity.
- Editor privacy is persisted per game/player in session storage, with an in-memory fallback. Saved preferences are read before the editor first renders, including on reopen/reload. No raw ledger values or names are stored. Switching game/player remounts editor state atomically.

## Reveal and export

`RecapReveal` mounts after hydration, resolves the session/reduced-motion preference before any character is shown, then performs a 1.2-second face-down turn. Its button supports keyboard activation and immediately transfers focus to the card when dismissed. A live region announces the resolved title after completion. Reduced motion skips the animation; switching to reduced motion while it is playing also completes it.

The reveal is consumed on editor entry, including an early Escape/close, and stored per game/player for the tab session. Stat changes, rerenders, exports, reopens and reloads do not replay it. The lab uses a separate session namespace so previewing a fixture does not consume its actual editor reveal.

Animation and card-back markup live outside the SVG. The referenced SVG always contains the completed, current privacy-safe card. Share/download calls immediately finish the reveal, synchronously clone the completed SVG, and lock controls until completion. Captions are captured from the same render as the SVG. PNG creation embeds `/fonts/inter-latin.woff2` and rasterizes at **2160 × 3840**. Duplicate export requests are guarded. Web Share success and cancellation are respected; unsupported/failed sharing downloads the PNG.

The modal keeps Escape, document-level Tab trapping, scroll lock and focus restoration. Hidden breakpoint-specific buttons are excluded from the trap, including while export controls are disabled.

## Preview and regression verification

Run `npm ci`, then `npm run dev:app -- --port 3211`; open [the lab](http://localhost:3211/recap-lab). The route is available only in development and returns 404 in production. Its dashed **Lab fixtures · Review only** panel supplies fictional ledger scenarios; it does not override the assignment algorithm. “Preview game editor” opens the real production component. It starts with product defaults, then remembers that editor's own privacy settings. All earlier design references remain in the collapsed section; historical copy there is not the production model.

Run:

```sh
npx vitest run lib/recap-characters.test.ts lib/recap-session.test.ts lib/recap.test.ts
node scripts/verify-felt-society.mjs
npm test
npm run lint
npm run build
git diff --check
```

`RECAP_LAB_URL` overrides the browser test URL. The browser test exercises actual downloads/canvas/font embedding and mocked native Web Share boundaries. Artifacts and a structured report are written to `test-results/recap-assignment-reveal/`. It covers twelve lab fixtures, seven characters, production editor fixtures, 320/390/768/1440 widths, cent/unknown/hidden-player/hidden-loss states, frozen-time reveal, skip/focus, early dismissal, reduced motion, reopen/reload, mid-reveal exports, cancellation and download fallback.

Real iOS/Android share-sheet delivery and live database finalization are not claimed by fixture/browser verification. This work changes only presentation; collections, group portraits and seasonal outfits remain out of scope.
