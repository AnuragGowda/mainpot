import type { GameSnapshot } from '@/lib/types';
import type { PlayerNet } from '@/lib/settlement';

const startedAt = '2026-09-08T18:00:00.000Z';
export const editorSnapshot: GameSnapshot = {
  game: {
    id: 'fixture', code: 'ABCDEF', name: 'NEVER_RENDER_TABLE_NAME',
    host_user_id: null, host_session_id: 'subject', host_name: 'NEVER_RENDER_HOST_NAME',
    buy_in_amount: 100, status: 'ended', host_is_anonymous: true, expires_at: null,
    created_at: startedAt, ended_at: '2026-09-08T22:35:00.000Z',
  },
  players: Array.from({ length: 8 }, (_, index) => ({
    id: index === 0 ? 'subject' : `player-${index}`, game_id: 'fixture',
    session_id: `session-${index}`, user_id: null, name: `NEVER_RENDER_PLAYER_${index}`,
    is_host: index === 0, joined_at: startedAt, left_at: null,
  })),
  buyIns: [
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `buy-in-${index}`, game_id: 'fixture', player_id: index === 0 ? 'subject' : `player-${index}`,
      amount: 100, type: 'buy_in' as const, fronted_by_player_id: null, verified: true, created_at: startedAt,
    })),
    ...Array.from({ length: 2 }, (_, index) => ({
      id: `rebuy-${index}`, game_id: 'fixture', player_id: 'subject', amount: 50,
      type: 'rebuy' as const, fronted_by_player_id: null, verified: true, created_at: startedAt,
    })),
  ],
  earlyCashOuts: [], cashOuts: [], events: [],
};
export const editorNets: PlayerNet[] = editorSnapshot.players.map((player, index) => ({
  playerId: player.id, name: player.name, net: index === 0 ? 245 : -35,
}));
