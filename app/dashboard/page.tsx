"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowRight, X } from "lucide-react";
import ConfirmButton from "@/components/GameRoom/ConfirmButton";
import SiteNav from "@/components/SiteNav";
import { ResumeGameCard } from "@/components/ResumeBanner";
import { withTimeout } from "@/lib/request-timeout";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { linkSessionToUser } from "@/lib/accounts";
import { cancelAccountDeletion, exportMyAccountData, getAccountDeletionRequest, requestAccountDeletion } from "@/lib/account-data";
import { getCurrentUser } from "@/lib/auth-client";
import { formatCurrency, formatSignedNet } from "@/lib/format";
import { getProfileById, isUsernameTaken, updateProfile } from "@/lib/friends";
import { getFriendsStats, getUnfinishedGames, getUserGames, getUserStats } from "@/lib/stats";
import { friendLabel, getIncomingGameInvites, respondToGameInvite, type IncomingGameInviteMetadata } from "@/lib/invites";
import { SUPPORT_EMAIL } from "@/lib/product";
import type { AccountDeletionRequest } from "@/lib/account-data";
import type { FriendStats, Game, GameHistory, Profile, UserStats } from "@/lib/types";
import {
  PLAYER_NAME_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  validateDisplayName,
  validateUsername,
  normalizeZelleContact,
  validateZelleContact,
} from "@/lib/name-validation";

const emptyStats: UserStats = {
  gamesPlayed: 0,
  totalPL: 0,
  avgPL: 0,
  biggestWin: 0,
  biggestLoss: 0,
  winRate: 0,
};

function LoadingDashboard() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="h-24 animate-pulse rounded-xl bg-gray-200/70" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-28 animate-pulse rounded-xl bg-gray-200/70" />
        ))}
      </div>
    </div>
  );
}

function resultClass(value: number) {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-600";
  return "text-gray-700";
}

export default function DashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<UserStats>(emptyStats);
  const [games, setGames] = useState<GameHistory[]>([]);
  const [friendStats, setFriendStats] = useState<FriendStats[]>([]);
  const [gameInvites, setGameInvites] = useState<IncomingGameInviteMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
  const [unfinishedGames, setUnfinishedGames] = useState<Game[]>([]);
  const loadGeneration = useRef(0);
  const loadedOnce = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileErrors, setProfileErrors] = useState<{ displayName?: string; username?: string; zelle?: string; save?: string }>({});
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletionRequest, setDeletionRequest] = useState<AccountDeletionRequest | null>(null);
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({
    display_name: "",
    username: "",
    venmo_handle: "",
    zelle_handle: "",
    bio: "",
  });

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (loadedOnce.current) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const currentUser = await withTimeout(getCurrentUser(), "Sign-in is taking too long. Check your connection and retry.");
      if (!currentUser || currentUser.is_anonymous) {
        router.replace("/signin?next=/dashboard");
        return;
      }
      if (generation !== loadGeneration.current) return;
      setUser(currentUser);
      const warnings: Record<string, string> = {};
      try {
        await withTimeout(linkSessionToUser(currentUser.id), "Account linking is taking too long.");
      } catch {
        warnings["Account linking"] = "Some games from this device could not be linked. Retry to reconnect them.";
      }
      const sections = ["Profile", "Statistics", "Recent games", "Friends", "Invitations", "Deletion status", "Unfinished games"];
      const results = await Promise.allSettled([
        getProfileById(currentUser.id), getUserStats(currentUser.id), getUserGames(currentUser.id, 8),
        getFriendsStats(currentUser.id), getIncomingGameInvites(), getAccountDeletionRequest(),
        getUnfinishedGames(currentUser.id),
      ].map((work, index) => withTimeout<unknown>(work, `${sections[index]} is taking too long. Check your connection and retry.`)));
      if (generation !== loadGeneration.current) return;
      const read = <T,>(index: number, fallback: T): T => {
        const result = results[index];
        if (result.status === "fulfilled") return result.value as T;
        warnings[sections[index]] = `${sections[index]} could not load. Retry to refresh this section.`;
        return fallback;
      };
      const nextProfile = read<Profile | null>(0, null);
      setProfile(nextProfile);
      setStats(read(1, emptyStats));
      setGames(read<GameHistory[]>(2, []));
      setFriendStats(read<FriendStats[]>(3, []));
      setGameInvites(read<IncomingGameInviteMetadata[]>(4, []));
      setDeletionRequest(read<AccountDeletionRequest | null>(5, null));
      setUnfinishedGames(read<Game[]>(6, []));
      setSectionErrors(warnings);
      loadedOnce.current = true;
      setForm({
        display_name: nextProfile?.display_name ?? "", username: nextProfile?.username ?? "",
        venmo_handle: nextProfile?.venmo_handle ?? "", zelle_handle: nextProfile?.zelle_handle ?? "",
        bio: nextProfile?.bio ?? "",
      });
    } catch (error) {
      if (generation === loadGeneration.current) setLoadError(error instanceof Error ? error.message : "Could not load your dashboard.");
    } finally {
      if (generation === loadGeneration.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const username = form.username.trim().replace(/^@/, "").toLowerCase();
    setProfileErrors({});
    const displayNameError = validateDisplayName(form.display_name);
    if (displayNameError) {
      setProfileErrors({ displayName: displayNameError });
      document.getElementById("profile-display-name")?.focus();
      return;
    }
    const usernameError = validateUsername(username);
    if (usernameError) {
      setProfileErrors({ username: usernameError });
      document.getElementById("profile-username")?.focus();
      return;
    }
    const zelleError = validateZelleContact(form.zelle_handle);
    if (zelleError) {
      setProfileErrors({ zelle: zelleError });
      document.getElementById("profile-zelle")?.focus();
      return;
    }
    setSaving(true);
    try {
      if (username && (await isUsernameTaken(username, user.id))) {
        setProfileErrors({ username: "That username is already taken." });
        document.getElementById("profile-username")?.focus();
        return;
      }
      const nextProfile = await updateProfile(user.id, {
        display_name: form.display_name.trim(),
        username: username || null,
        venmo_handle: form.venmo_handle.trim(),
        zelle_handle: normalizeZelleContact(form.zelle_handle),
        bio: form.bio.trim(),
      });
      setProfile(nextProfile);
      setEditing(false);
      toast("Profile saved", "success");
    } catch (error) {
      setProfileErrors({ save: error instanceof Error ? error.message : "Could not save your profile." });
    } finally {
      setSaving(false);
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      const data = await exportMyAccountData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mainpot-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast("Your data export is downloading.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't export your data.", "error");
    } finally {
      setExporting(false);
    }
  }

  async function requestDeletion() {
    setDeleting(true);
    try {
      await requestAccountDeletion();
      setDeletionRequest(await getAccountDeletionRequest());
      toast("Deletion requested. Support will process your account and confirm by email.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't request deletion.", "error");
    } finally {
      setDeleting(false);
    }
  }

  function resetForm() {
    setProfileErrors({});
    setForm({
      display_name: profile?.display_name ?? "",
      username: profile?.username ?? "",
      venmo_handle: profile?.venmo_handle ?? "",
      zelle_handle: profile?.zelle_handle ?? "",
      bio: profile?.bio ?? "",
    });
  }

  function startEditing() {
    resetForm();
    setEditing(true);
  }

  function cancelEditing() {
    resetForm();
    setEditing(false);
  }

  async function respondToInvite(
    invite: IncomingGameInviteMetadata,
    status: "accepted" | "declined",
  ) {
    setInviteBusyId(invite.id);
    try {
      const code = await respondToGameInvite(invite.id, status);
      if (status === "accepted") {
        if (!code) throw new Error("The invitation was accepted, but the room could not be opened. Refresh and try again.");
        router.push(`/game/${code}`);
      } else {
        setGameInvites((items) => items.filter((item) => item.id !== invite.id));
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update the invitation.", "error");
    } finally {
      setInviteBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f8f6]">
        <SiteNav />
        <main tabIndex={-1} id="main-content"><LoadingDashboard /></main>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#f7f8f6]">
        <SiteNav />
        <main tabIndex={-1} id="main-content" className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
          <Card className="text-center">
            <h1 className="text-xl font-semibold text-gray-950">Your dashboard could not load</h1>
            <p role="alert" className="mt-2 text-sm leading-6 text-gray-600">{loadError}</p>
            <Button className="mt-5" onClick={() => void load()}>Retry</Button>
          </Card>
        </main>
      </div>
    );
  }

  if (!user) return null;

  const statCards = [
    { label: "All-time P&L", value: formatSignedNet(stats.totalPL), tone: resultClass(stats.totalPL) },
    { label: "Games played", value: String(stats.gamesPlayed), tone: "text-gray-950" },
    { label: "Win rate", value: `${stats.winRate}%`, tone: "text-gray-950" },
    { label: "Average game", value: formatSignedNet(stats.avgPL), tone: resultClass(stats.avgPL) },
  ];
  const isFirstUse = Object.keys(sectionErrors).length === 0 && stats.gamesPlayed === 0 && games.length === 0 && friendStats.length === 0 && unfinishedGames.length === 0;

  return (
    <div className="min-h-screen bg-[#f7f8f6]">
      <SiteNav />
      <main tabIndex={-1} id="main-content" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar profile={profile} email={user.email} size="lg" />
            <div>
              <p className="text-sm font-medium text-gray-600">Your poker ledger</p>
              <h1 className="text-3xl font-semibold tracking-tight text-gray-950">
                {profile?.display_name || user.email?.split("@")[0] || "Player"}
              </h1>
              <p className="mt-0.5 text-sm text-gray-500">
                {profile?.username ? `@${profile.username}` : "Add a username so friends can find you"}
              </p>
            </div>
          </div>
          {!editing ? <div className="flex gap-2">
            <Button variant="secondary" disabled={refreshing || Boolean(sectionErrors.Profile)} onClick={startEditing}>
              Edit profile
            </Button>
            <Link href="/create" className="inline-flex h-11 items-center justify-center rounded-lg bg-gray-950 px-4 text-sm font-medium text-white transition hover:bg-gray-800">
              New game
            </Link>
          </div> : null}
        </section>

        {Object.keys(sectionErrors).length ? (
          <Card className="mt-6 border-amber-200" padding="sm">
            <p role="status" className="text-sm font-medium text-gray-950">Some dashboard sections are unavailable</p>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {Object.entries(sectionErrors).map(([section, message]) => <li key={section}>{message}</li>)}
            </ul>
            <Button variant="secondary" size="sm" className="mt-3" loading={refreshing} disabled={editing || saving} onClick={() => void load()}>Retry dashboard</Button>
          </Card>
        ) : null}
        {unfinishedGames.length ? (
          <section aria-label="Your unfinished games" className="mt-7">
            <h2 className="text-lg font-semibold text-gray-950">Pick up where you left off</h2>
            <p className="mt-1 text-sm text-gray-600">Resume a table to keep playing or finish its cash-outs. Starting another game keeps these ledgers saved.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {unfinishedGames.map((game) => <ResumeGameCard key={game.id} game={{ code: game.code, name: game.name, status: game.status === "settling" ? "settling" : "active" }} />)}
            </div>
          </section>
        ) : null}

        {editing ?  (
          <Card className="mt-7">
            <h2 className="mb-5 text-lg font-semibold text-gray-950">Edit profile</h2>
            <form onSubmit={saveProfile} className="grid gap-5 sm:grid-cols-2">
              <Input id="profile-display-name" error={profileErrors.displayName} label="Display name" value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} maxLength={PLAYER_NAME_MAX_LENGTH} />
              <Input id="profile-username" error={profileErrors.username} label="Username" prefix="@" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value.replace(/^@/, "") })} placeholder="pocketaces" maxLength={USERNAME_MAX_LENGTH} autoCapitalize="none" spellCheck={false} />
              <Input label="Venmo" prefix="@" value={form.venmo_handle} onChange={(event) => setForm({ ...form, venmo_handle: event.target.value.replace(/^@/, "") })} placeholder="your-handle" />
              <Input id="profile-zelle" error={profileErrors.zelle} label="Zelle email or U.S. mobile number" value={form.zelle_handle} onChange={(event) => setForm({ ...form, zelle_handle: event.target.value })} placeholder="you@example.com or (312) 555-1234" />
              <p className="-mt-2 text-xs leading-5 text-gray-500 sm:col-span-2">
                Optional. Mainpot uses these to create settlement shortcuts; you always review and send the payment yourself.
              </p>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-gray-700">Bio</span>
                <textarea value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} maxLength={160} rows={3} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-gray-950 focus:outline-none focus:ring-2 focus:ring-gray-950/10" placeholder="Tuesday $20 home game" />
                <span className="mt-1 block text-xs leading-5 text-gray-500">Public to Mainpot members who find you, and to your friends. Never shown in a game room or payment instructions.</span>
              </label>
              {profileErrors.save ? <p role="alert" className="text-sm text-red-700 sm:col-span-2">{profileErrors.save}</p> : null}
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" loading={saving}>Save profile</Button>
                <Button type="button" variant="secondary" disabled={saving} onClick={cancelEditing}>Cancel</Button>
              </div>
            </form>
          </Card>
        ) : <>
        {gameInvites.length ? (
          <section aria-label="Game invitations" className="mt-7 space-y-2">
            {gameInvites.map((invite) => (
              <Card key={invite.id} padding="sm" className="flex flex-col gap-3 border-gray-300 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Table invite</p>
                  <p className="mt-1 truncate font-semibold text-gray-950">{invite.game.name}</p>
                  <p className="text-sm text-gray-500">{friendLabel(invite.inviter ?? { display_name: null, username: null })} invited you · {formatCurrency(invite.game.buy_in_amount)} buy-in</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<X size={16} />}
                    loading={inviteBusyId === invite.id}
                    disabled={inviteBusyId === invite.id}
                    onClick={() => void respondToInvite(invite, "declined")}
                  >
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    leftIcon={<ArrowRight size={16} />}
                    loading={inviteBusyId === invite.id}
                    disabled={inviteBusyId === invite.id}
                    onClick={() => void respondToInvite(invite, "accepted")}
                  >
                    Join table
                  </Button>
                </div>
              </Card>
            ))}
          </section>
        ) : null}

        {!isFirstUse && !sectionErrors.Statistics ? <section aria-label="Poker statistics" className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {statCards.map((item) => (
            <Card key={item.label} padding="sm" className="rounded-xl">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{item.label}</p>
              <p className={`mt-3 text-2xl font-semibold tracking-tight ${item.tone}`}>{item.value}</p>
            </Card>
          ))}
        </section> : null}

        {isFirstUse ? (
          <Card className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-gray-950">Start your first table</h2>
              <p className="mt-1 text-sm text-gray-600">Create a game, then add your regulars when they join.</p>
            </div>
            <div className="flex gap-2">
              <Link href="/create" className="inline-flex h-10 items-center justify-center rounded-lg bg-gray-950 px-3 text-sm font-medium text-white hover:bg-gray-800">New game</Link>
              <Link href="/friends" className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50">Find friends</Link>
            </div>
          </Card>
        ) : <div className="mt-6 grid gap-6 lg:grid-cols-[1.55fr_1fr]">
          <Card padding="none" className="overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="font-semibold text-gray-950">Recent games</h2>
                <p className="text-sm text-gray-500">Final results · payment status is tracked separately</p>
              </div>
              {!sectionErrors.Statistics ? <span className="text-xs text-gray-600">Best win {formatCurrency(stats.biggestWin)}</span> : null}
            </div>
            {sectionErrors["Recent games"] ? <p className="px-5 py-8 text-sm text-gray-600">Game history is unavailable. Use Retry dashboard to load your results.</p> : games.length ? (
              <ul className="divide-y divide-gray-100">
                {games.map((game) => (
                  <li key={game.gameId} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <Link
                        href={`/game/${game.gameCode}`}
                        className="block truncate font-medium text-gray-900 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
                      >
                        {game.gameName}
                      </Link>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {game.date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {game.playerCount} {game.playerCount === 1 ? "player" : "players"} · {formatCurrency(game.buyInAmount)} buy-in
                      </p>
                      <Link href={`/game/${game.gameCode}#payment-ledger`} className="mt-1 inline-block text-xs font-medium text-gray-700 underline underline-offset-2">
                        {game.paymentProgress == null ? "Payment progress unavailable · open game" : game.paymentProgress.total === 0 ? "No transfers required" : `${game.paymentProgress.markedSent}/${game.paymentProgress.total} payments marked sent${game.paymentProgress.markedSent < game.paymentProgress.total ? " · review payments" : ""}`}
                      </Link>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <p className={`font-semibold tabular-nums ${resultClass(game.netResult)}`}>
                        {formatSignedNet(game.netResult)}
                      </p>
                      <Link
                        href={`/create?name=${encodeURIComponent(game.gameName)}&buyin=${game.buyInAmount}`}
                        aria-label={`Play ${game.gameName} again`}
                        className="rounded-md px-2 py-1 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-950"
                      >
                        Rematch
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-6 py-14 text-center">
                <p className="text-sm font-medium text-gray-700">No final results yet</p>
                <p className="mt-1 text-sm text-gray-500">Finish your first game and the result appears here.</p>
                <Link href="/create" className="mt-5 inline-block text-sm font-semibold text-gray-900">Create a game →</Link>
              </div>
            )}
          </Card>

          <Card padding="none" className="overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="font-semibold text-gray-950">Your table</h2>
                <p className="text-sm text-gray-500">Friends by all-time P&L</p>
              </div>
              <Link href="/friends" className="text-sm font-medium text-gray-900">Manage</Link>
            </div>
            {sectionErrors.Friends ? <p className="px-5 py-8 text-sm text-gray-600">Friend records are unavailable. Use Retry dashboard to load them.</p> : friendStats.length ? (
              <ol className="divide-y divide-gray-100">
                {friendStats.slice(0, 5).map((friend, index) => (
                  <li key={friend.userId} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="w-5 text-xs font-medium text-gray-600">{index + 1}</span>
                    <Avatar profile={{ display_name: friend.displayName, username: friend.username, avatar_url: friend.avatarUrl }} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{friend.displayName || friend.username || "Player"}</p>
                      <p className="text-xs text-gray-500">{friend.gamesPlayed} games</p>
                    </div>
                    <span className={`text-sm font-semibold tabular-nums ${resultClass(friend.totalPL)}`}>{formatSignedNet(friend.totalPL)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="px-6 py-14 text-center">
                <p className="text-sm font-medium text-gray-700">Build your regular table</p>
                <p className="mt-1 text-sm text-gray-500">Find friends and compare records.</p>
                <Link href="/friends" className="mt-5 inline-block text-sm font-semibold text-gray-900">Find friends →</Link>
              </div>
            )}
          </Card>
        </div>}

        <details className="mt-6 rounded-xl border border-gray-200 bg-white px-5 py-4">
          <summary className="cursor-pointer font-semibold text-gray-950">Account data and deletion</summary>
          <p className="mt-3 text-sm leading-6 text-gray-600">Export your account summary: profile, templates, hosted game details, final results, friendships, invitations, and feedback. Detailed buy-in, cash-out, and payment ledgers are not included. You can also request deletion for support to fulfill; deletion is not immediate.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={exportData} loading={exporting}>Export my data</Button>
            {deletionRequest?.status === "pending" ? <Button variant="secondary" loading={deleting} onClick={async () => {
              setDeleting(true);
              try { await cancelAccountDeletion(); setDeletionRequest(await getAccountDeletionRequest()); toast("Deletion request cancelled"); }
              catch (error) { toast(error instanceof Error ? error.message : "Could not cancel deletion.", "error"); }
              finally { setDeleting(false); }
            }}>Cancel deletion request</Button> : null}
            {!sectionErrors["Deletion status"] && (!deletionRequest || deletionRequest.status === "cancelled") ? (
              <ConfirmButton
                loading={deleting}
                onConfirm={() => void requestDeletion()}
                confirmationTitle="Request account deletion?"
                confirmationDescription="Support will process your request and confirm by email. This cannot be undone once completed."
                confirmLabel="Request deletion"
              >
                Request account deletion
              </ConfirmButton>
            ) : null}
          </div>
          {deletionRequest ? (
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Your deletion request is <span className="font-semibold text-gray-900">{deletionRequest.status}</span> and was requested on {new Date(deletionRequest.requested_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}. {deletionRequest.status === "pending" || deletionRequest.status === "processing" ? "Support will follow up by email. " : ""}For questions, contact <a className="font-medium text-gray-900 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </p>
          ) : null}
          <p className="mt-3 text-xs leading-5 text-gray-500">Export files can include personal details and game history. Keep them private.</p>
        </details>
        </>}
      </main>
    </div>
  );
}
