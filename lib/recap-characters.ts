import { formatDuration, type RecapData, type RecapPrivacy } from './recap';

export type CharacterKind = 'mayor' | 'sponsor' | 'baron' | 'social' | 'encore' | 'marathoner' | 'correspondent';
export type CharacterDirection = 'society' | 'pocket';
export interface RecapCharacter {
  kind: CharacterKind;
  title: string[];
  line: string;
  evidence: string;
  result?: number;
}

/** Missing explicit IDs never fall through to someone else's money. */
export function getRecapSubject(data: RecapData, playerId?: string) {
  return playerId !== undefined ? data.players.find(p => p.id === playerId)
    : [...data.players].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0];
}

/** Match the displayed USD precision, including symmetric half-cent rounding. */
export function recapCents(value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const magnitude = Math.abs(value) * 100;
  const cents = Math.round(magnitude + Number.EPSILON * magnitude);
  if (!Number.isSafeInteger(cents)) return undefined;
  return cents === 0 ? 0 : Math.sign(value) * cents;
}

export function recordedDuration(minutes?: number): number | undefined {
  return minutes !== undefined && Number.isSafeInteger(Math.floor(minutes)) && minutes >= 1 ? Math.floor(minutes) : undefined;
}

function visibleResult(data: RecapData, privacy: RecapPrivacy, playerId?: string) {
  const player = getRecapSubject(data, playerId);
  const cents = player ? recapCents(player.net) : undefined;
  if (!player || cents === undefined || privacy.showResult === false
    || !privacy.showDollarAmounts || privacy.hiddenPlayerIds.includes(player.id)
    || (!privacy.showLosses && cents < 0)) return undefined;
  return cents / 100;
}

// FNV-1a over UTF-16 code units, unsigned 32 bit. Never include names or stats.
function stableScore(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/**
 * All eligible identities have equal standing. A game/player-derived total order
 * chooses one; lexical kind order breaks hash ties. Privacy is applied BEFORE
 * ranking. Hidden facts cannot affect either eligibility or the seed.
 */
export function getRecapCharacter(data: RecapData, privacy: RecapPrivacy, playerId?: string): RecapCharacter {
  const player = getRecapSubject(data, playerId);
  const result = visibleResult(data, privacy, playerId);
  const kinds: CharacterKind[] = ['social', 'correspondent'];
  if (result !== undefined) kinds.push(result === 0 ? 'baron' : result > 0 ? 'mayor' : 'sponsor');
  if (player && !privacy.hiddenPlayerIds.includes(player.id) && privacy.showRebuys !== false
    && Number.isSafeInteger(player.rebuyCount) && player.rebuyCount > 0) kinds.push('encore');
  const duration = recordedDuration(data.durationMinutes);
  if (privacy.showDuration !== false && duration !== undefined && duration >= 240) kinds.push('marathoner');
  const seed = JSON.stringify(['felt-society-v1', data.gameId, playerId ?? player?.id ?? null]);
  const kind = kinds.sort((a, b) => stableScore(seed + a) - stableScore(seed + b) || (a < b ? -1 : a > b ? 1 : 0))[0];
  switch (kind) {
    case 'encore': return {
      kind, title: ['The Encore', 'Artist'], line: 'Made a second entrance.',
      evidence: 'A recorded rebuy in this game.', result,
    };
    case 'marathoner': return {
      kind, title: ['The Felt', 'Marathoner'], line: 'This meeting could not have been an email.',
      evidence: `Game lasted ${formatDuration(duration!)}. A full-length feature.`, result,
    };
    case 'correspondent': return {
      kind, title: ['The Group Chat', 'Correspondent'], line: 'The recap is going to need a voice note.',
      evidence: 'Names withheld. Story developing.', result,
    };
    case 'social': return {
      kind, title: ['The Table', 'Celebrity'], line: 'My poker face has a fan club.',
      evidence: 'A little mystery looks good on me.', result,
    };
    case 'baron': return {
      kind, title: ['The Break-Even', 'Baron'], line: 'A round trip for my money.',
      evidence: 'Same bottom line, to the cent.', result,
    };
    case 'mayor': return {
      kind, title: ['Mayor of', 'Value Town'], line: 'My chips have a new zip code.',
      evidence: 'Clocked out with more than I clocked in.', result,
    };
    case 'sponsor': return {
      kind, title: ['The Table', 'Sponsor'], line: 'Apparently, this was a funded event.',
      evidence: 'Left a little of my buy-in with the table.', result,
    };
  }
}

export function characterMoney(value: number, signed = false) {
  const cents = recapCents(value);
  if (cents === undefined) return '—';
  const sign = signed && cents !== 0 ? cents > 0 ? '+' : '−' : '';
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2,
  }).format(Math.abs(cents) / 100);
  return `${sign}$${formatted}`;
}
