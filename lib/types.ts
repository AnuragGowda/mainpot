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