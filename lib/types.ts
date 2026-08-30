export type GameStatus = 'active' | 'settling' | 'ended';

export interface Game {
  id: string;
  code: string;
  name: string;
  host_session_id: string;
  host_name: string;
  buy_in_amount: number;
  status: GameStatus;
  created_at: string;
  ended_at: string | null;
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
  verified: boolean;
  created_at: string;
}

export interface CashOut {
  id: string;
  game_id: string;
  player_id: string;
  amount: number;
  created_at: string;
}

export interface GameSnapshot {
  game: Game;
  players: Player[];
  buyIns: BuyIn[];
  cashOuts: CashOut[];
}

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  venmo_handle: string | null;
  zelle_handle: string | null;
  bio: string | null;
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