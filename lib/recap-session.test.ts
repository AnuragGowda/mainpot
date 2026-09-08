import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultRecapPrivacy } from './recap';

afterEach(() => vi.unstubAllGlobals());
const storage = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) };
};

describe('recap session memory', () => {
  it('remembers reveal entry across remounts and reloads, separately per game/player', async () => {
    vi.stubGlobal('sessionStorage', storage());
    vi.resetModules();
    let session = await import('./recap-session');
    const key = session.recapSessionKey('game', 'p');
    expect(session.hasSeenRecap(key)).toBe(false);
    session.rememberRecap(key);
    expect(session.hasSeenRecap(key)).toBe(true);
    vi.resetModules(); session = await import('./recap-session');
    expect(session.hasSeenRecap(key)).toBe(true);
    expect(session.hasSeenRecap(session.recapSessionKey('game', 'other'))).toBe(false);
    expect(session.hasSeenRecap(session.recapSessionKey('other', 'p'))).toBe(false);
  });

  it('restores privacy before rendering, always keeps names hidden, and tolerates corrupt storage', async () => {
    const store = storage(); vi.stubGlobal('sessionStorage', store); vi.resetModules();
    let session = await import('./recap-session');
    const privacy = { ...defaultRecapPrivacy, showResult: false, showDollarAmounts: false, showPlayerNames: true, hiddenPlayerIds: ['p'] };
    session.rememberRecapPrivacy('private', privacy);
    vi.resetModules(); session = await import('./recap-session');
    expect(session.readRecapPrivacy('private')).toMatchObject({ showResult: false, showDollarAmounts: false, showPlayerNames: false, hiddenPlayerIds: ['p'] });
    store.setItem('mainpot:recap-privacy:v1:corrupt', '{');
    expect(session.readRecapPrivacy('corrupt')).toEqual(defaultRecapPrivacy);
    store.setItem('mainpot:recap-privacy:v1:invalid', '{"showResult":"yes", "hiddenPlayerIds":[4,"p"]}');
    expect(session.readRecapPrivacy('invalid')).toMatchObject({ hiddenPlayerIds: ['p'], showPlayerNames: false });
  });

  it('keeps session behavior when browser storage is blocked', async () => {
    vi.stubGlobal('sessionStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
    vi.resetModules(); const session = await import('./recap-session');
    expect(session.hasSeenRecap('blocked')).toBe(false);
    session.rememberRecap('blocked');
    session.rememberRecapPrivacy('blocked', { ...defaultRecapPrivacy, showResult: false });
    expect(session.hasSeenRecap('blocked')).toBe(true);
    expect(session.readRecapPrivacy('blocked').showResult).toBe(false);
  });
});
