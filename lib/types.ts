export type GameStatus = 'active' | 'settling' | 'ended';

export interface Game {
  id: string;
  code: string;
  name: string;
  host_user_id: string | null;
  host_session_id: string;
  host_name: string;
  buy_in_amount: number;
  status: GameStatus;
  host_is_anonymous: boolean;
  expires_at: string | null;
  created_at: string;
  ended_at: string | null;
  acquisition_source?: AcquisitionSource | null;
  discrepancy_allocation?: DiscrepancyAllocationRecord | null;
}

export interface DiscrepancyAllocationRecord {
  method: "proportional" | "selected" | "custom";
  player_ids: string[];
  amount: number;
  player_allocations?: Array<{
    player_id: string;
    amount: number;
  }>;
}

export type AcquisitionSource = "personal_invite" | "poker_group" | "search" | "other";

export interface GameFeedback {
  id: string;
  game_id: string;
  player_id: string | null;
  score: number;
  confusing: string | null;
  created_at: string;
}

export interface Player {
  id: string;
  game_id: string;
  session_id: string;
  user_id: string | null;
  name: string;
  is_host: boolean;
  joined_at: string;
  left_at: string | null;
}

export type BuyInType = 'buy_in' | 'rebuy';

export interface BuyIn {
  id: string;
  game_id: string;
  player_id: string;
  amount: number;
  type: BuyInType;
  /** Another player who advanced this buy-in and is still owed; affects settlement, not the pot. */
  fronted_by_player_id: string | null;
  verified: boolean;
  created_at: string;
  /** Client-generated key used to make retried ledger entries idempotent. */
  operation_key?: string | null;
}

export interface CashOut {
  id: string;
  game_id: string;
  player_id: string;
  amount: number;
  created_at: string;
}

export type GameEventType =
  | "game_created"
  | "player_joined"
  | "buy_in_added"
  | "buy_in_updated"
  | "buy_in_advance_repaid"
  | "buy_in_removed"
  | "buy_in_verified"
  | "player_left"
  | "player_removed"
  | "host_transferred"
  | "cash_out_updated"
  | "game_settling"
  | "game_finalized"
  | "discrepancy_allocated"
  | "host_returned_to_create";

export interface GameEventMetadata {
  player_name?: string;
  buy_in_id?: string;
  buy_in_type?: BuyInType;
  previous_amount?: number;
  fronted_by_name?: string;
  [key: string]: string | number | boolean | null | undefined;
}

/** Immutable audit entry for activity that happened during a game. */
export interface GameEvent {
  id: string;
  game_id: string;
  event_type: GameEventType;
  actor_player_id: string | null;
  subject_player_id: string | null;
  amount: number | null;
  metadata: GameEventMetadata;
  created_at: string;
}

export interface GameSnapshot {
  game: Game;
  players: Player[];
  buyIns: BuyIn[];
  cashOuts: CashOut[];
  events: GameEvent[];
}

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  venmo_handle: string | null;
  zelle_handle: string | null;
  bio: string | null;
  plan: "free" | "supporter";
  supporter_until: string | null;
  created_at: string;
  updated_at: string;
}

export type FriendshipStatus = 'pending' | 'accepted' | 'declined';

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  responded_at: string | null;
}

export interface GameParticipant {
  id: string;
  game_id: string;
  user_id: string;
  player_id: string;
  net_result: number;
  created_at: string;
}

export interface GameHistory {
  gameId: string;
  gameName: string;
  date: Date;
  netResult: number;
  buyInAmount: number;
  playerCount: number;
}

export interface UserStats {
  gamesPlayed: number;
  totalPL: number;
  avgPL: number;
  biggestWin: number;
  biggestLoss: number;
  winRate: number;
}

export interface FriendStats {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  totalPL: number;
  gamesPlayed: number;
}

export type GameInviteStatus = "pending" | "accepted" | "declined";

export interface GameInvite {
  id: string;
  game_id: string;
  inviter_id: string;
  invitee_id: string;
  status: GameInviteStatus;
  created_at: string;
  responded_at: string | null;
}

export interface IncomingGameInvite extends GameInvite {
  game: Pick<Game, "id" | "code" | "name" | "buy_in_amount" | "host_name" | "status">;
  inviter: Pick<Profile, "id" | "username" | "display_name" | "avatar_url"> | null;
}
