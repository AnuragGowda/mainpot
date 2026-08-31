import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "./supabase";
import { getBrowserSupabase } from "./supabase-browser";
import { ensureCurrentUser } from "./auth-client";
import type {
  BuyIn,
  BuyInType,
  CashOut,
  Game,
  GameEvent,
  GameEventMetadata,
  GameEventType,
  GameSnapshot,
  Player,
} from "./types";
import { generateRoomCode, normalizeRoomCode } from "./roomcode";
import { getSessionId, randomUUID } from "./session";
import { round2 } from "./format";

export { isSupabaseConfigured };

/** True when Supabase env vars are missing and the app runs on localStorage. */
export function usingLocalStorage(): boolean {
  return !isSupabaseConfigured;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function assertSupabase(): SupabaseClient {
  const client = getBrowserSupabase();
  if (!client) {
    throw new Error("Supabase is not configured.");
  }
  return client;
}

async function ensureSupabaseReady(): Promise<{
  client: SupabaseClient;
  userId: string;
}> {
  const client = assertSupabase();
  const user = await ensureCurrentUser();
  if (!user) {
    throw new Error("Could not start a secure guest session.");
  }
  return { client, userId: user.id };
}

// Supabase `numeric` columns sometimes come back as strings — coerce every
// amount to a number at the data layer so the rest of the app sees numbers.
function toGame(row: Game): Game {
  return { ...row, buy_in_amount: Number(row.buy_in_amount) };
}

function toPlayer(row: Player): Player {
  return { ...row };
}

function toBuyIn(row: BuyIn): BuyIn {
  return {
    ...row,
    amount: Number(row.amount),
    fronted_by_player_id: row.fronted_by_player_id ?? null,
  };
}

function toCashOut(row: CashOut): CashOut {
  return { ...row, amount: Number(row.amount) };
}

function toGameEvent(row: GameEvent): GameEvent {
  return {
    ...row,
    amount: row.amount == null ? null : Number(row.amount),
    metadata: row.metadata ?? {},
  };
}

// ---------------------------------------------------------------------------
// localStorage (single-device) mode
// ---------------------------------------------------------------------------

const STORE_KEY = "ante_store";

interface LocalStore {
  games: Game[];
  players: Player[];
  buyIns: BuyIn[];
  cashOuts: CashOut[];
  events: GameEvent[];
}

const subscribers = new Map<string, Set<(snapshot: GameSnapshot) => void>>();

function emptyStore(): LocalStore {
  return { games: [], players: [], buyIns: [], cashOuts: [], events: [] };
}

function loadStore(): LocalStore {
  if (typeof window === "undefined") {
    return emptyStore();
  }
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) {
      return emptyStore();
    }
    const parsed = JSON.parse(raw) as Partial<LocalStore>;
    return {
      games: parsed.games ?? [],
      players: parsed.players ?? [],
      buyIns: parsed.buyIns ?? [],
      cashOuts: parsed.cashOuts ?? [],
      events: parsed.events ?? [],
    };
  } catch (err) {
    console.error("Failed to read ante local store:", err);
    return emptyStore();
  }
}

function persistStore(store: LocalStore): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch (err) {
    console.error("Failed to write ante local store:", err);
  }
}

function buildSnapshot(store: LocalStore, gameId: string): GameSnapshot | null {
  const game = store.games.find((g) => g.id === gameId);
  if (!game) {
    return null;
  }
  const players = store.players
    .filter((p) => p.game_id === gameId)
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  const buyIns = store.buyIns
    .filter((b) => b.game_id === gameId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const cashOuts = store.cashOuts
    .filter((c) => c.game_id === gameId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const events = store.events
    .filter((event) => event.game_id === gameId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { game, players, buyIns, cashOuts, events };
}

function addLocalEvent(
  store: LocalStore,
  input: {
    gameId: string;
    eventType: GameEventType;
    actorPlayerId?: string | null;
    subjectPlayerId?: string | null;
    amount?: number | null;
    metadata?: GameEventMetadata;
    createdAt?: string;
  }
): GameEvent {
  const event: GameEvent = {
    id: randomUUID(),
    game_id: input.gameId,
    event_type: input.eventType,
    actor_player_id: input.actorPlayerId ?? null,
    subject_player_id: input.subjectPlayerId ?? null,
    amount: input.amount == null ? null : round2(input.amount),
    metadata: input.metadata ?? {},
    created_at: input.createdAt ?? new Date().toISOString(),
  };
  store.events.push(event);
  return event;
}

function currentLocalPlayerId(store: LocalStore, gameId: string): string | null {
  const sessionId = getSessionId();
  return (
    store.players.find(
      (player) => player.game_id === gameId && player.session_id === sessionId
    )?.id ?? null
  );
}

function emitSnapshot(gameId: string, store: LocalStore): void {
  const snapshot = buildSnapshot(store, gameId);
  if (!snapshot) {
    return;
  }
  const callbacks = subscribers.get(gameId);
  if (!callbacks) {
    return;
  }
  callbacks.forEach((callback) => {
    try {
      callback(snapshot);
    } catch (err) {
      console.error("Error in game subscriber:", err);
    }
  });
}

async function generateUniqueRoomCode(store: LocalStore): Promise<string> {
  const usedCodes = new Set(store.games.map((g) => g.code));
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateRoomCode();
    if (!usedCodes.has(candidate)) {
      return candidate;
    }
  }
  throw new Error("Could not generate a unique room code. Please try again.");
}

async function createGameLocal(
  name: string,
  hostName: string,
  buyInAmount: number,
  userId?: string | null
): Promise<{ code: string; gameId: string }> {
  const store = loadStore();
  const sessionId = getSessionId();
  const code = await generateUniqueRoomCode(store);
  const now = new Date().toISOString();
  const gameId = randomUUID();

  const game: Game = {
    id: gameId,
    code,
    name,
    host_user_id: userId ?? null,
    host_session_id: sessionId,
    host_name: hostName,
    buy_in_amount: round2(buyInAmount),
    status: "active",
    host_is_anonymous: userId == null,
    expires_at: userId == null ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
    created_at: now,
    ended_at: null,
  };

  const player: Player = {
    id: randomUUID(),
    game_id: gameId,
    session_id: sessionId,
    name: hostName,
    is_host: true,
    joined_at: now,
    left_at: null,
    user_id: userId ?? null,
  };

  const buyIn: BuyIn = {
    id: randomUUID(),
    game_id: gameId,
    player_id: player.id,
    amount: round2(buyInAmount),
    type: "buy_in",
    fronted_by_player_id: null,
    verified: true,
    created_at: now,
  };

  store.games.push(game);
  store.players.push(player);
  store.buyIns.push(buyIn);
  addLocalEvent(store, {
    gameId,
    eventType: "game_created",
    actorPlayerId: player.id,
    subjectPlayerId: player.id,
    metadata: { player_name: hostName },
    createdAt: now,
  });
  addLocalEvent(store, {
    gameId,
    eventType: "player_joined",
    actorPlayerId: player.id,
    subjectPlayerId: player.id,
    metadata: { player_name: hostName },
    createdAt: now,
  });
  addLocalEvent(store, {
    gameId,
    eventType: "buy_in_added",
    actorPlayerId: player.id,
    subjectPlayerId: player.id,
    amount: buyIn.amount,
    metadata: {
      player_name: hostName,
      buy_in_id: buyIn.id,
      buy_in_type: "buy_in",
    },
    createdAt: now,
  });
  persistStore(store);
  emitSnapshot(gameId, store);

  return { code, gameId };
}

async function joinGameLocal(
  code: string,
  playerName: string,
  userId?: string | null
): Promise<{ gameId: string; playerId: string }> {
  const store = loadStore();
  const sessionId = getSessionId();
  const normalized = normalizeRoomCode(code);

  const game = store.games.find((g) => g.code === normalized);
  if (!game) {
    throw new Error("Game not found.");
  }
  if (game.status === "ended") {
    throw new Error("This game has already ended.");
  }

  const existing = store.players.find(
    (p) => p.game_id === game.id && p.session_id === sessionId
  );
  if (existing) {
    return { gameId: game.id, playerId: existing.id };
  }

  const player: Player = {
    id: randomUUID(),
    game_id: game.id,
    session_id: sessionId,
    name: playerName,
    is_host: false,
    joined_at: new Date().toISOString(),
    left_at: null,
    user_id: userId ?? null,
  };
  store.players.push(player);
  addLocalEvent(store, {
    gameId: game.id,
    eventType: "player_joined",
    actorPlayerId: player.id,
    subjectPlayerId: player.id,
    metadata: { player_name: playerName },
    createdAt: player.joined_at,
  });
  persistStore(store);
  emitSnapshot(game.id, store);

  return { gameId: game.id, playerId: player.id };
}

async function getGameLocal(code: string): Promise<Game | null> {
  const store = loadStore();
  const normalized = normalizeRoomCode(code);
  return store.games.find((g) => g.code === normalized) ?? null;
}

function subscribeToGameLocal(
  gameId: string,
  callback: (snapshot: GameSnapshot) => void
): () => void {
  let callbacks = subscribers.get(gameId);
  if (!callbacks) {
    callbacks = new Set();
    subscribers.set(gameId, callbacks);
  }
  callbacks.add(callback);

  return () => {
    callbacks?.delete(callback);
    if (callbacks && callbacks.size === 0) {
      subscribers.delete(gameId);
    }
  };
}

async function addBuyInLocal(
  gameId: string,
  playerId: string,
  amount: number,
  type: BuyInType,
  frontedByPlayerId?: string | null
): Promise<BuyIn> {
  const store = loadStore();
  const buyIn: BuyIn = {
    id: randomUUID(),
    game_id: gameId,
    player_id: playerId,
    amount: round2(amount),
    type,
    fronted_by_player_id: frontedByPlayerId ?? null,
    verified: false,
    created_at: new Date().toISOString(),
  };
  store.buyIns.push(buyIn);
  const player = store.players.find((item) => item.id === playerId);
  const frontedBy = frontedByPlayerId
    ? store.players.find((item) => item.id === frontedByPlayerId)
    : null;
  addLocalEvent(store, {
    gameId,
    eventType: "buy_in_added",
    actorPlayerId: currentLocalPlayerId(store, gameId),
    subjectPlayerId: playerId,
    amount: buyIn.amount,
    metadata: {
      player_name: player?.name,
      buy_in_id: buyIn.id,
      buy_in_type: type,
      fronted_by_name: frontedBy?.name,
    },
    createdAt: buyIn.created_at,
  });
  persistStore(store);
  emitSnapshot(gameId, store);
  return buyIn;
}

async function removeBuyInLocal(buyInId: string): Promise<void> {
  const store = loadStore();
  const buyIn = store.buyIns.find((b) => b.id === buyInId);
  if (buyIn) {
    const player = store.players.find((item) => item.id === buyIn.player_id);
    addLocalEvent(store, {
      gameId: buyIn.game_id,
      eventType: "buy_in_removed",
      actorPlayerId: currentLocalPlayerId(store, buyIn.game_id),
      subjectPlayerId: buyIn.player_id,
      amount: buyIn.amount,
      metadata: {
        player_name: player?.name,
        buy_in_id: buyIn.id,
        buy_in_type: buyIn.type,
      },
    });
  }
  store.buyIns = store.buyIns.filter((b) => b.id !== buyInId);
  persistStore(store);
  if (buyIn) {
    emitSnapshot(buyIn.game_id, store);
  }
}

async function verifyBuyInLocal(buyInId: string): Promise<void> {
  const store = loadStore();
  const buyIn = store.buyIns.find((b) => b.id === buyInId);
  if (buyIn) {
    buyIn.verified = true;
    const player = store.players.find((item) => item.id === buyIn.player_id);
    addLocalEvent(store, {
      gameId: buyIn.game_id,
      eventType: "buy_in_verified",
      actorPlayerId: currentLocalPlayerId(store, buyIn.game_id),
      subjectPlayerId: buyIn.player_id,
      amount: buyIn.amount,
      metadata: {
        player_name: player?.name,
        buy_in_id: buyIn.id,
        buy_in_type: buyIn.type,
      },
    });
  }
  persistStore(store);
  if (buyIn) {
    emitSnapshot(buyIn.game_id, store);
  }
}

async function updateBuyInLocal(buyInId: string, amount: number): Promise<void> {
  const store = loadStore();
  const buyIn = store.buyIns.find((b) => b.id === buyInId);
  if (buyIn) {
    const previousAmount = buyIn.amount;
    buyIn.amount = round2(amount);
    const player = store.players.find((item) => item.id === buyIn.player_id);
    addLocalEvent(store, {
      gameId: buyIn.game_id,
      eventType: "buy_in_updated",
      actorPlayerId: currentLocalPlayerId(store, buyIn.game_id),
      subjectPlayerId: buyIn.player_id,
      amount: buyIn.amount,
      metadata: {
        player_name: player?.name,
        buy_in_id: buyIn.id,
        buy_in_type: buyIn.type,
        previous_amount: previousAmount,
      },
    });
  }
  persistStore(store);
  if (buyIn) {
    emitSnapshot(buyIn.game_id, store);
  }
}

async function removePlayerLocal(playerId: string): Promise<void> {
  const store = loadStore();
  const player = store.players.find((p) => p.id === playerId);
  if (player) {
    addLocalEvent(store, {
      gameId: player.game_id,
      eventType: "player_removed",
      actorPlayerId: currentLocalPlayerId(store, player.game_id),
      subjectPlayerId: player.id,
      metadata: { player_name: player.name },
    });
  }
  store.players = store.players.filter((p) => p.id !== playerId);
  // Mirror the DB cascade: removing a player removes their buy-ins/cash-outs.
  store.buyIns = store.buyIns.filter((b) => b.player_id !== playerId);
  store.cashOuts = store.cashOuts.filter((c) => c.player_id !== playerId);
  persistStore(store);
  if (player) {
    emitSnapshot(player.game_id, store);
  }
}

async function leaveGameLocal(playerId: string): Promise<void> {
  const store = loadStore();
  const player = store.players.find((p) => p.id === playerId);
  if (player) {
    player.left_at = new Date().toISOString();
    addLocalEvent(store, {
      gameId: player.game_id,
      eventType: "player_left",
      actorPlayerId: player.id,
      subjectPlayerId: player.id,
      metadata: { player_name: player.name },
      createdAt: player.left_at,
    });
  }
  persistStore(store);
  if (player) {
    emitSnapshot(player.game_id, store);
  }
}

async function transferHostLocal(gameId: string, targetPlayerId: string): Promise<void> {
  const store = loadStore();
  const game = store.games.find((item) => item.id === gameId);
  const currentHost = store.players.find(
    (player) => player.game_id === gameId && player.is_host
  );
  const nextHost = store.players.find(
    (player) => player.id === targetPlayerId && player.game_id === gameId && !player.left_at
  );
  if (!game || !currentHost || !nextHost) {
    throw new Error("That player is no longer at the table.");
  }
  if (currentHost.session_id !== getSessionId()) {
    throw new Error("Only the host can transfer the table.");
  }
  for (const player of store.players.filter((player) => player.game_id === gameId)) {
    player.is_host = player.id === targetPlayerId;
  }
  game.host_session_id = nextHost.session_id;
  game.host_user_id = nextHost.user_id;
  game.host_name = nextHost.name;
  addLocalEvent(store, {
    gameId,
    eventType: "host_transferred",
    actorPlayerId: currentHost.id,
    subjectPlayerId: nextHost.id,
    metadata: { player_name: nextHost.name },
  });
  persistStore(store);
  emitSnapshot(gameId, store);
}

async function addCashOutLocal(
  gameId: string,
  playerId: string,
  amount: number
): Promise<CashOut> {
  const store = loadStore();
  const existing = store.cashOuts.find(
    (c) => c.game_id === gameId && c.player_id === playerId
  );
  if (existing) {
    existing.amount = round2(amount);
    const player = store.players.find((item) => item.id === playerId);
    addLocalEvent(store, {
      gameId,
      eventType: "cash_out_updated",
      actorPlayerId: currentLocalPlayerId(store, gameId),
      subjectPlayerId: playerId,
      amount: existing.amount,
      metadata: { player_name: player?.name },
    });
    persistStore(store);
    emitSnapshot(gameId, store);
    return existing;
  }

  const cashOut: CashOut = {
    id: randomUUID(),
    game_id: gameId,
    player_id: playerId,
    amount: round2(amount),
    created_at: new Date().toISOString(),
  };
  store.cashOuts.push(cashOut);
  const player = store.players.find((item) => item.id === playerId);
  addLocalEvent(store, {
    gameId,
    eventType: "cash_out_updated",
    actorPlayerId: currentLocalPlayerId(store, gameId),
    subjectPlayerId: playerId,
    amount: cashOut.amount,
    metadata: { player_name: player?.name },
    createdAt: cashOut.created_at,
  });
  persistStore(store);
  emitSnapshot(gameId, store);
  return cashOut;
}

async function updateCashOutLocal(
  cashOutId: string,
  amount: number
): Promise<void> {
  const store = loadStore();
  const cashOut = store.cashOuts.find((c) => c.id === cashOutId);
  if (cashOut) {
    cashOut.amount = round2(amount);
    const player = store.players.find((item) => item.id === cashOut.player_id);
    addLocalEvent(store, {
      gameId: cashOut.game_id,
      eventType: "cash_out_updated",
      actorPlayerId: currentLocalPlayerId(store, cashOut.game_id),
      subjectPlayerId: cashOut.player_id,
      amount: cashOut.amount,
      metadata: { player_name: player?.name },
    });
  }
  persistStore(store);
  if (cashOut) {
    emitSnapshot(cashOut.game_id, store);
  }
}

async function endGameLocal(gameId: string): Promise<void> {
  const store = loadStore();
  const game = store.games.find((g) => g.id === gameId);
  if (game) {
    game.status = "settling";
    game.ended_at = new Date().toISOString();
    addLocalEvent(store, {
      gameId,
      eventType: "game_settling",
      actorPlayerId: currentLocalPlayerId(store, gameId),
      createdAt: game.ended_at,
    });
  }
  persistStore(store);
  if (game) {
    emitSnapshot(gameId, store);
  }
}

async function markEndedLocal(gameId: string): Promise<void> {
  const store = loadStore();
  const game = store.games.find((g) => g.id === gameId);
  if (game) {
    game.status = "ended";
    addLocalEvent(store, {
      gameId,
      eventType: "game_finalized",
      actorPlayerId: currentLocalPlayerId(store, gameId),
    });
  }
  persistStore(store);
  if (game) {
    emitSnapshot(gameId, store);
  }
}

async function getGameSnapshotLocal(gameId: string): Promise<GameSnapshot> {
  const store = loadStore();
  const snapshot = buildSnapshot(store, gameId);
  if (!snapshot) {
    throw new Error("Game not found.");
  }
  return snapshot;
}

// ---------------------------------------------------------------------------
// Supabase mode
// ---------------------------------------------------------------------------

async function currentSupabasePlayerId(
  client: SupabaseClient,
  gameId: string
): Promise<string | null> {
  const { data } = await client
    .from("players")
    .select("id")
    .eq("game_id", gameId)
    .eq("session_id", getSessionId())
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function addSupabaseEvent(
  client: SupabaseClient,
  input: {
    gameId: string;
    eventType: GameEventType;
    actorPlayerId?: string | null;
    subjectPlayerId?: string | null;
    amount?: number | null;
    metadata?: GameEventMetadata;
  }
): Promise<void> {
  const actorPlayerId =
    input.actorPlayerId === undefined
      ? await currentSupabasePlayerId(client, input.gameId)
      : input.actorPlayerId;
  const { error } = await client.from("game_events").insert({
    game_id: input.gameId,
    event_type: input.eventType,
    actor_player_id: actorPlayerId ?? null,
    subject_player_id: input.subjectPlayerId ?? null,
    amount: input.amount ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) {
    throw error;
  }
}

async function createGameSupabase(
  name: string,
  hostName: string,
  buyInAmount: number,
  _userId?: string | null
): Promise<{ code: string; gameId: string }> {
  const { client } = await ensureSupabaseReady();
  const sessionId = getSessionId();

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRoomCode();
    const { data, error } = await client
      .rpc("create_game_guarded", {
        input_code: code,
        input_game_name: name,
        input_host_name: hostName,
        input_buy_in: buyInAmount,
        input_session_id: sessionId,
      })
      .single();

    if (!error && data) {
      const row = data as { code: string; game_id: string };
      return { code: row.code, gameId: row.game_id };
    }
    if (error?.code === "23505") {
      continue;
    }
    throw error ?? new Error("Could not create the game.");
  }
  throw new Error("Could not generate a unique room code. Please try again.");
}

async function joinGameSupabase(
  code: string,
  playerName: string,
  _userId?: string | null
): Promise<{ gameId: string; playerId: string }> {
  const { client } = await ensureSupabaseReady();
  const sessionId = getSessionId();
  const normalized = normalizeRoomCode(code);

  const { data, error } = await client
    .rpc("join_game_guarded", {
      input_code: normalized,
      input_player_name: playerName,
      input_session_id: sessionId,
    })
    .single();
  if (error) {
    throw error;
  }
  const row = data as { game_id: string; player_id: string };
  return { gameId: row.game_id, playerId: row.player_id };
}

async function getGameSupabase(code: string): Promise<Game | null> {
  const { client } = await ensureSupabaseReady();
  const normalized = normalizeRoomCode(code);
  const { data, error } = await client
    .rpc("get_game_by_code", { input_code: normalized })
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  return toGame(data as Game);
}

async function refreshSnapshot(
  gameId: string,
  callback: (snapshot: GameSnapshot) => void
): Promise<void> {
  try {
    const snapshot = await getGameSnapshot(gameId);
    callback(snapshot);
  } catch (err) {
    console.error("Failed to refresh game snapshot:", err);
  }
}

function subscribeToGameSupabase(
  gameId: string,
  callback: (snapshot: GameSnapshot) => void
): () => void {
  const client = assertSupabase();

  const channel = client
    .channel(`game-${gameId}-${randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` },
      () => {
        void refreshSnapshot(gameId, callback);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "players",
        filter: `game_id=eq.${gameId}`,
      },
      () => {
        void refreshSnapshot(gameId, callback);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "buy_ins",
        filter: `game_id=eq.${gameId}`,
      },
      () => {
        void refreshSnapshot(gameId, callback);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "cash_outs",
        filter: `game_id=eq.${gameId}`,
      },
      () => {
        void refreshSnapshot(gameId, callback);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "game_events",
        filter: `game_id=eq.${gameId}`,
      },
      () => {
        void refreshSnapshot(gameId, callback);
      }
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

async function addBuyInSupabase(
  gameId: string,
  playerId: string,
  amount: number,
  type: BuyInType,
  frontedByPlayerId?: string | null
): Promise<BuyIn> {
  const { client } = await ensureSupabaseReady();
  const { data, error } = await client
    .from("buy_ins")
    .insert({
      game_id: gameId,
      player_id: playerId,
      amount,
      type,
      fronted_by_player_id: frontedByPlayerId ?? null,
      verified: false,
    })
    .select()
    .single();
  if (error) {
    throw error;
  }
  const buyIn = toBuyIn(data as BuyIn);
  const { data: player } = await client
    .from("players")
    .select("name")
    .eq("id", playerId)
    .maybeSingle();
  const { data: frontedBy } = frontedByPlayerId
    ? await client
        .from("players")
        .select("name")
        .eq("id", frontedByPlayerId)
        .maybeSingle()
    : { data: null };
  await addSupabaseEvent(client, {
    gameId,
    eventType: "buy_in_added",
    subjectPlayerId: playerId,
    amount: buyIn.amount,
    metadata: {
      player_name: (player as { name?: string } | null)?.name,
      buy_in_id: buyIn.id,
      buy_in_type: type,
      fronted_by_name: (frontedBy as { name?: string } | null)?.name,
    },
  });
  return buyIn;
}

async function removeBuyInSupabase(buyInId: string): Promise<void> {
  const { client } = await ensureSupabaseReady();
  const { data: buyIn, error: lookupError } = await client
    .from("buy_ins")
    .select("*, player:players!buy_ins_player_id_fkey(name)")
    .eq("id", buyInId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  const { error } = await client.from("buy_ins").delete().eq("id", buyInId);
  if (error) {
    throw error;
  }
  if (buyIn) {
    const row = buyIn as unknown as BuyIn & { player?: { name?: string } };
    await addSupabaseEvent(client, {
      gameId: row.game_id,
      eventType: "buy_in_removed",
      subjectPlayerId: row.player_id,
      amount: Number(row.amount),
      metadata: {
        player_name: row.player?.name,
        buy_in_id: row.id,
        buy_in_type: row.type,
      },
    });
  }
}

async function verifyBuyInSupabase(buyInId: string): Promise<void> {
  const { client } = await ensureSupabaseReady();
  const { data, error } = await client
    .from("buy_ins")
    .update({ verified: true })
    .eq("id", buyInId)
    .select("*, player:players!buy_ins_player_id_fkey(name)")
    .single();
  if (error) {
    throw error;
  }
  const row = data as unknown as BuyIn & { player?: { name?: string } };
  await addSupabaseEvent(client, {
    gameId: row.game_id,
    eventType: "buy_in_verified",
    subjectPlayerId: row.player_id,
    amount: Number(row.amount),
    metadata: {
      player_name: row.player?.name,
      buy_in_id: row.id,
      buy_in_type: row.type,
    },
  });
}

async function updateBuyInSupabase(buyInId: string, amount: number): Promise<void> {
  const { client } = await ensureSupabaseReady();
  const { data: existing, error: lookupError } = await client
    .from("buy_ins")
    .select("*, player:players!buy_ins_player_id_fkey(name)")
    .eq("id", buyInId)
    .single();
  if (lookupError) throw lookupError;
  const { data, error } = await client
    .from("buy_ins")
    .update({ amount })
    .eq("id", buyInId)
    .select()
    .single();
  if (error) {
    throw error;
  }
  const row = data as BuyIn;
  const previous = existing as unknown as BuyIn & { player?: { name?: string } };
  await addSupabaseEvent(client, {
    gameId: row.game_id,
    eventType: "buy_in_updated",
    subjectPlayerId: row.player_id,
    amount,
    metadata: {
      player_name: previous.player?.name,
      buy_in_id: row.id,
      buy_in_type: row.type,
      previous_amount: Number(previous.amount),
    },
  });
}

async function removePlayerSupabase(playerId: string): Promise<void> {
  const { client } = await ensureSupabaseReady();
  const { data: player, error: lookupError } = await client
    .from("players")
    .select("*")
    .eq("id", playerId)
    .single();
  if (lookupError) throw lookupError;
  const row = player as Player;
  const actorPlayerId = await currentSupabasePlayerId(client, row.game_id);
  await addSupabaseEvent(client, {
    gameId: row.game_id,
    eventType: "player_removed",
    actorPlayerId,
    subjectPlayerId: row.id,
    metadata: { player_name: row.name },
  });
  const { error } = await client.from("players").delete().eq("id", playerId);
  if (error) {
    throw error;
  }
}

async function leaveGameSupabase(playerId: string): Promise<void> {
  const { client } = await ensureSupabaseReady();
  const { data, error } = await client
    .from("players")
    .update({ left_at: new Date().toISOString() })
    .eq("id", playerId)
    .select()
    .single();
  if (error) {
    throw error;
  }
  const row = data as Player;
  await addSupabaseEvent(client, {
    gameId: row.game_id,
    eventType: "player_left",
    actorPlayerId: row.id,
    subjectPlayerId: row.id,
    metadata: { player_name: row.name },
  });
}

async function transferHostSupabase(gameId: string, targetPlayerId: string): Promise<void> {
  const { client } = await ensureSupabaseReady();
  const { error } = await client.rpc("transfer_game_host", {
    target_game_id: gameId,
    target_player_id: targetPlayerId,
  });
  if (error) throw error;
}

async function addCashOutSupabase(
  gameId: string,
  playerId: string,
  amount: number
): Promise<CashOut> {
  const { client } = await ensureSupabaseReady();

  const { data: existing, error: lookupError } = await client
    .from("cash_outs")
    .select("*")
    .eq("game_id", gameId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (lookupError) {
    throw lookupError;
  }

  if (existing) {
    const { data, error } = await client
      .from("cash_outs")
      .update({ amount })
      .eq("id", (existing as CashOut).id)
      .select()
      .single();
    if (error) {
      throw error;
    }
    const cashOut = toCashOut(data as CashOut);
    const { data: player } = await client
      .from("players")
      .select("name")
      .eq("id", playerId)
      .maybeSingle();
    await addSupabaseEvent(client, {
      gameId,
      eventType: "cash_out_updated",
      subjectPlayerId: playerId,
      amount: cashOut.amount,
      metadata: { player_name: (player as { name?: string } | null)?.name },
    });
    return cashOut;
  }

  const { data, error } = await client
    .from("cash_outs")
    .insert({ game_id: gameId, player_id: playerId, amount })
    .select()
    .single();
  if (error) {
    throw error;
  }
  const cashOut = toCashOut(data as CashOut);
  const { data: player } = await client
    .from("players")
    .select("name")
    .eq("id", playerId)
    .maybeSingle();
  await addSupabaseEvent(client, {
    gameId,
    eventType: "cash_out_updated",
    subjectPlayerId: playerId,
    amount: cashOut.amount,
    metadata: { player_name: (player as { name?: string } | null)?.name },
  });
  return cashOut;
}

async function updateCashOutSupabase(
  cashOutId: string,
  amount: number
): Promise<void> {
  const { client } = await ensureSupabaseReady();
  const { data, error } = await client
    .from("cash_outs")
    .update({ amount })
    .eq("id", cashOutId)
    .select("*, players(name)")
    .single();
  if (error) {
    throw error;
  }
  const row = data as unknown as CashOut & { players?: { name?: string } };
  await addSupabaseEvent(client, {
    gameId: row.game_id,
    eventType: "cash_out_updated",
    subjectPlayerId: row.player_id,
    amount,
    metadata: { player_name: row.players?.name },
  });
}

async function endGameSupabase(gameId: string): Promise<void> {
  const { client } = await ensureSupabaseReady();
  const { error } = await client
    .from("games")
    .update({ status: "settling", ended_at: new Date().toISOString() })
    .eq("id", gameId);
  if (error) {
    throw error;
  }
  await addSupabaseEvent(client, { gameId, eventType: "game_settling" });
}

async function markEndedSupabase(gameId: string): Promise<void> {
  const { client } = await ensureSupabaseReady();
  const { error } = await client
    .from("games")
    .update({ status: "ended" })
    .eq("id", gameId);
  if (error) {
    throw error;
  }
  await addSupabaseEvent(client, { gameId, eventType: "game_finalized" });
}

async function getGameSnapshotSupabase(gameId: string): Promise<GameSnapshot> {
  const { client } = await ensureSupabaseReady();

  const [gameResult, playersResult, buyInsResult, cashOutsResult, eventsResult] =
    await Promise.all([
      client.from("games").select("*").eq("id", gameId).maybeSingle(),
      client
        .from("players")
        .select("*")
        .eq("game_id", gameId)
        .order("joined_at", { ascending: true }),
      client
        .from("buy_ins")
        .select("*")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true }),
      client
        .from("cash_outs")
        .select("*")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true }),
      client
        .from("game_events")
        .select("*")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true }),
    ]);

  if (gameResult.error) {
    throw gameResult.error;
  }
  if (playersResult.error) {
    throw playersResult.error;
  }
  if (buyInsResult.error) {
    throw buyInsResult.error;
  }
  if (cashOutsResult.error) {
    throw cashOutsResult.error;
  }
  if (eventsResult.error) {
    throw eventsResult.error;
  }
  if (!gameResult.data) {
    throw new Error("Game not found.");
  }

  return {
    game: toGame(gameResult.data as Game),
    players: ((playersResult.data ?? []) as Player[]).map(toPlayer),
    buyIns: ((buyInsResult.data ?? []) as BuyIn[]).map(toBuyIn),
    cashOuts: ((cashOutsResult.data ?? []) as CashOut[]).map(toCashOut),
    events: ((eventsResult.data ?? []) as GameEvent[]).map(toGameEvent),
  };
}

// ---------------------------------------------------------------------------
// Public API — dispatch to localStorage or Supabase implementation
// ---------------------------------------------------------------------------

export async function createGame(
  name: string,
  hostName: string,
  buyInAmount: number,
  userId?: string | null
): Promise<{ code: string; gameId: string }> {
  return usingLocalStorage()
    ? createGameLocal(name, hostName, buyInAmount, userId)
    : createGameSupabase(name, hostName, buyInAmount, userId);
}

export async function joinGame(
  code: string,
  playerName: string,
  userId?: string | null
): Promise<{ gameId: string; playerId: string }> {
  return usingLocalStorage()
    ? joinGameLocal(code, playerName, userId)
    : joinGameSupabase(code, playerName, userId);
}

export async function getGame(code: string): Promise<Game | null> {
  return usingLocalStorage() ? getGameLocal(code) : getGameSupabase(code);
}

export function subscribeToGame(
  gameId: string,
  callback: (snapshot: GameSnapshot) => void
): () => void {
  return usingLocalStorage()
    ? subscribeToGameLocal(gameId, callback)
    : subscribeToGameSupabase(gameId, callback);
}

export async function addBuyIn(
  gameId: string,
  playerId: string,
  amount: number,
  type: BuyInType,
  frontedByPlayerId?: string | null
): Promise<BuyIn> {
  return usingLocalStorage()
    ? addBuyInLocal(gameId, playerId, amount, type, frontedByPlayerId)
    : addBuyInSupabase(gameId, playerId, amount, type, frontedByPlayerId);
}

export async function removeBuyIn(buyInId: string): Promise<void> {
  return usingLocalStorage()
    ? removeBuyInLocal(buyInId)
    : removeBuyInSupabase(buyInId);
}

export async function verifyBuyIn(buyInId: string): Promise<void> {
  return usingLocalStorage()
    ? verifyBuyInLocal(buyInId)
    : verifyBuyInSupabase(buyInId);
}

export async function updateBuyIn(buyInId: string, amount: number): Promise<void> {
  return usingLocalStorage()
    ? updateBuyInLocal(buyInId, amount)
    : updateBuyInSupabase(buyInId, amount);
}

export async function removePlayer(playerId: string): Promise<void> {
  return usingLocalStorage()
    ? removePlayerLocal(playerId)
    : removePlayerSupabase(playerId);
}

export async function leaveGame(playerId: string): Promise<void> {
  return usingLocalStorage()
    ? leaveGameLocal(playerId)
    : leaveGameSupabase(playerId);
}

export async function transferHost(gameId: string, targetPlayerId: string): Promise<void> {
  return usingLocalStorage()
    ? transferHostLocal(gameId, targetPlayerId)
    : transferHostSupabase(gameId, targetPlayerId);
}

export async function addCashOut(
  gameId: string,
  playerId: string,
  amount: number
): Promise<CashOut> {
  return usingLocalStorage()
    ? addCashOutLocal(gameId, playerId, amount)
    : addCashOutSupabase(gameId, playerId, amount);
}

export async function updateCashOut(
  cashOutId: string,
  amount: number
): Promise<void> {
  return usingLocalStorage()
    ? updateCashOutLocal(cashOutId, amount)
    : updateCashOutSupabase(cashOutId, amount);
}

export async function endGame(gameId: string): Promise<void> {
  return usingLocalStorage() ? endGameLocal(gameId) : endGameSupabase(gameId);
}

export async function markEnded(gameId: string): Promise<void> {
  return usingLocalStorage() ? markEndedLocal(gameId) : markEndedSupabase(gameId);
}

export async function getGameSnapshot(gameId: string): Promise<GameSnapshot> {
  return usingLocalStorage()
    ? getGameSnapshotLocal(gameId)
    : getGameSnapshotSupabase(gameId);
}
