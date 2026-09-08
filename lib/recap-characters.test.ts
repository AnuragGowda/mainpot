import { describe, expect, it } from 'vitest';
import { characterMoney, getRecapCharacter, getRecapSubject, recapCents } from './recap-characters';
import { defaultRecapPrivacy, type RecapData } from './recap';

const fixture: RecapData = {
  gameId: 'example-2', gameName: 'SECRET TABLE', playedAt: '2026-09-08', playerCount: 8,
  totalBuyIn: 900, rebuyCount: 2, settlementPaymentCount: 7, highlights: [], durationMinutes: 275,
  players: [{ id: 'subject', displayName: 'SECRET NAME', net: 245, rank: 1, rebuyCount: 2 }],
};
const patchPlayer = (net: number, rebuyCount = 2): RecapData => ({ ...fixture, players: [{ ...fixture.players[0], net, rebuyCount }] });
const seeds = Array.from({ length: 100 }, (_, i) => `example-${i}`);

describe('automatic Felt Society assignment', () => {
  it('has fixed examples for all seven characters, without overrides', () => {
    const scenarios = [
      ['example-2', 245, 0, 95, true, 'mayor'], ['example-6', -120, 0, 95, true, 'sponsor'],
      ['example-4', 0, 0, 95, true, 'baron'], ['example-6', 40, 1, 95, false, 'encore'],
      ['example-4', 40, 0, 275, false, 'marathoner'], ['example-1', 40, 0, 95, false, 'social'],
      ['example-0', 40, 0, 95, false, 'correspondent'],
    ] as const;
    for (const [gameId, net, rebuys, durationMinutes, showResult, kind] of scenarios) {
      expect(getRecapCharacter({ ...patchPlayer(net, rebuys), gameId, durationMinutes }, { ...defaultRecapPrivacy, showResult }, 'subject').kind).toBe(kind);
    }
  });

  it('is stable across input order, names, ranks, unrelated players, and repeated renders', () => {
    const other = { id: 'aaa', displayName: 'Another name', net: 10000, rank: 1, rebuyCount: 20 };
    const before = JSON.stringify(fixture);
    for (const gameId of seeds) {
      const data = { ...fixture, gameId };
      const expected = getRecapCharacter(data, defaultRecapPrivacy, 'subject');
      expect(getRecapCharacter({ ...data, players: [other, { ...fixture.players[0], rank: 99, displayName: 'Changed' }] }, defaultRecapPrivacy, 'subject')).toEqual(expected);
      expect(getRecapCharacter({ ...data, players: [...data.players].reverse() }, defaultRecapPrivacy, 'subject')).toEqual(expected);
      expect(getRecapCharacter(data, defaultRecapPrivacy, 'subject')).toEqual(expected);
    }
    expect(JSON.stringify(fixture)).toBe(before);
    expect(getRecapSubject({ ...fixture, players: [fixture.players[0], other] })?.id).toBe('aaa');
    expect(getRecapSubject({ ...fixture, players: [other, fixture.players[0]] })?.id).toBe('aaa');
  });

  it('diversifies positive finishes without rewarding money magnitude or rebuy count', () => {
    const kinds = new Set<string>();
    for (const gameId of seeds) {
      const regular = getRecapCharacter({ ...patchPlayer(10, 1), gameId }, defaultRecapPrivacy, 'subject');
      const larger = getRecapCharacter({ ...patchPlayer(50000, 99), gameId, totalBuyIn: 1e6 }, defaultRecapPrivacy, 'subject');
      expect(larger.kind).toBe(regular.kind);
      kinds.add(regular.kind);
    }
    expect(kinds).toEqual(new Set(['social', 'correspondent', 'mayor', 'encore', 'marathoner']));
  });

  it('does not invent another player when the requested ID is missing', () => {
    const unknown = getRecapCharacter(fixture, defaultRecapPrivacy, 'missing');
    expect(unknown.result).toBeUndefined();
    expect(['social', 'correspondent', 'marathoner']).toContain(unknown.kind);
    expect(getRecapCharacter({ ...fixture, players: [] }, defaultRecapPrivacy, 'subject').result).toBeUndefined();
    expect(getRecapCharacter(patchPlayer(NaN), defaultRecapPrivacy, 'subject').result).toBeUndefined();
  });
});

describe('privacy before assignment', () => {
  it('hidden results cannot affect titles, artwork kind, evidence, or captions', () => {
    for (const gameId of seeds) for (const patch of [{ showResult: false }, { showDollarAmounts: false }, { hiddenPlayerIds: ['subject'] }]) {
      const privacy = { ...defaultRecapPrivacy, ...patch };
      const variants = [245, -120, 0, NaN].map(net => getRecapCharacter({ ...patchPlayer(net), gameId }, privacy, 'subject'));
      variants.forEach(persona => expect(persona).toEqual(variants[0]));
      expect(variants[0].result).toBeUndefined();
    }
  });

  it('hidden duration and rebuy values cannot change assignment, including absent data', () => {
    for (const gameId of seeds) {
      const privacy = { ...defaultRecapPrivacy, showDuration: false, showRebuys: false };
      const expected = getRecapCharacter({ ...patchPlayer(245, 0), gameId, durationMinutes: undefined }, privacy, 'subject');
      expect(getRecapCharacter({ ...patchPlayer(245, 99), gameId, durationMinutes: 900 }, privacy, 'subject')).toEqual(expected);
    }
  });

  it('hides half-cent losses consistently and never renders names', () => {
    for (const gameId of seeds) {
      const privacy = { ...defaultRecapPrivacy, showLosses: false, showPlayerNames: true };
      const a = getRecapCharacter({ ...patchPlayer(-0.005), gameId }, privacy, 'subject');
      const b = getRecapCharacter({ ...patchPlayer(-999), gameId }, privacy, 'subject');
      expect(a).toEqual(b);
      expect(a.result).toBeUndefined();
      expect(JSON.stringify(a)).not.toContain('SECRET');
    }
  });

  it('uses only neutral identities with all stats hidden, irrespective of the ledger', () => {
    const privacy = { ...defaultRecapPrivacy, showResult: false, showDollarAmounts: false, showDuration: false, showRebuys: false, showPlayerCount: false };
    for (const gameId of seeds) {
      const a = getRecapCharacter({ ...fixture, gameId }, privacy, 'subject');
      const b = getRecapCharacter({ ...patchPlayer(-900, 99), gameId, durationMinutes: undefined, playerCount: 2, totalBuyIn: 1 }, privacy, 'subject');
      expect(a).toEqual(b);
      expect(['social', 'correspondent']).toContain(a.kind);
    }
  });

  it('withdraws unsupported identities, and restoring privacy restores the original', () => {
    const encore = { ...patchPlayer(40, 1), gameId: 'example-6', durationMinutes: 95 };
    const privacy = { ...defaultRecapPrivacy, showResult: false };
    expect(getRecapCharacter(encore, privacy, 'subject').kind).toBe('encore');
    expect(getRecapCharacter(encore, { ...privacy, showRebuys: false }, 'subject').kind).not.toBe('encore');
    expect(getRecapCharacter(encore, { ...privacy, hiddenPlayerIds: ['subject'] }, 'subject').kind).not.toBe('encore');
    expect(getRecapCharacter(encore, privacy, 'subject').kind).toBe('encore');
    const long = { ...patchPlayer(0, 0), gameId: 'example-4' };
    expect(getRecapCharacter(long, privacy, 'subject').kind).toBe('marathoner');
    expect(getRecapCharacter(long, privacy, 'subject').evidence).toContain('Game lasted');
    for (const durationMinutes of [undefined, NaN, Infinity, -10, 239, 239.9]) {
      expect(getRecapCharacter({ ...long, durationMinutes }, privacy, 'subject').kind).not.toBe('marathoner');
    }
  });
});

describe('currency precision', () => {
  it('uses exact cents for signs, break-even eligibility and output', () => {
    for (const [net, cents, text] of [[0.004, 0, '$0'], [-0.004, 0, '$0'], [0.005, 1, '+$0.01'], [-0.005, -1, '−$0.01'], [1.005, 101, '+$1.01'], [-1.005, -101, '−$1.01'], [12345.67, 1234567, '+$12,345.67']] as const) {
      expect(recapCents(net)).toBe(cents);
      expect(characterMoney(net, true)).toBe(text);
      expect(getRecapCharacter(patchPlayer(net), defaultRecapPrivacy, 'subject').result).toBe(cents / 100);
    }
    for (const net of [NaN, Infinity, Number.MAX_VALUE]) {
      expect(characterMoney(net)).toBe('—');
      expect(getRecapCharacter(patchPlayer(net), defaultRecapPrivacy, 'subject').result).toBeUndefined();
    }
  });
});
