"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowRight, X } from "lucide-react";
import SiteNav from "@/components/SiteNav";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { linkSessionToUser } from "@/lib/accounts";
import { exportMyAccountData, requestAccountDeletion } from "@/lib/account-data";
import { getCurrentUser } from "@/lib/auth-client";
import { formatCurrency, formatSignedNet } from "@/lib/format";
import { getProfileById, isUsernameTaken, updateProfile } from "@/lib/friends";
import { getFriendsStats, getUserGames, getUserStats } from "@/lib/stats";
import { friendLabel, getIncomingGameInvites, respondToGameInvite } from "@/lib/invites";
import type { FriendStats, GameHistory, IncomingGameInvite, Profile, UserStats } from "@/lib/types";
import {
  PLAYER_NAME_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  validateDisplayName,
  validateUsername,
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
  const [gameInvites, setGameInvites] = useState<IncomingGameInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    display_name: "",
    username: "",
    venmo_handle: "",
    zelle_handle: "",
    bio: "",
  });

  const load = useCallback(async () => {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.is_anonymous) {
      router.replace("/signin?next=/dashboard");
      return;
    }
    setUser(currentUser);
    try {
      await linkSessionToUser(currentUser.id);
      const [nextProfile, nextStats, nextGames, nextFriendStats, nextInvites] = await Promise.all([
        getProfileById(currentUser.id),
        getUserStats(currentUser.id),
        getUserGames(currentUser.id, 8),
        getFriendsStats(currentUser.id),
        currentUser.is_anonymous ? Promise.resolve([]) : getIncomingGameInvites(currentUser.id),
      ]);
      setProfile(nextProfile);
      setStats(nextStats);
      setGames(nextGames);
      setFriendStats(nextFriendStats);
      setGameInvites(nextInvites);
      setForm({
        display_name: nextProfile?.display_name ?? "",
        username: nextProfile?.username ?? "",
        venmo_handle: nextProfile?.venmo_handle ?? "",
        zelle_handle: nextProfile?.zelle_handle ?? "",
        bio: nextProfile?.bio ?? "",
      });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not load your dashboard.", "error");
    } finally {
      setLoading(false);
    }
  }, [router, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const username = form.username.trim().replace(/^@/, "").toLowerCase();
    const displayNameError = validateDisplayName(form.display_name);
    if (displayNameError) {
      toast(displayNameError, "error");
      return;
    }
    const usernameError = validateUsername(username);
    if (usernameError) {
      toast(usernameError, "error");
      return;
    }
    setSaving(true);
    try {
      if (username && (await isUsernameTaken(username, user.id))) {
        toast("That username is already taken.", "error");
        return;
      }
      const nextProfile = await updateProfile(user.id, {
        display_name: form.display_name.trim(),
        username: username || null,
        venmo_handle: form.venmo_handle.trim(),
        zelle_handle: form.zelle_handle.trim(),
        bio: form.bio.trim(),
      });
      setProfile(nextProfile);
      setEditing(false);
      toast("Profile saved", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save your profile.", "error");
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
    if (!window.confirm("Request deletion of your Mainpot account? This cannot be undone once support completes it.")) return;
    setDeleting(true);
    try {
      await requestAccountDeletion();
      toast("Deletion requested. Support will process your account and confirm by email.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't request deletion.", "error");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f8f6]">
        <SiteNav />
        <LoadingDashboard />
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

  return (
    <div className="min-h-screen bg-[#f7f8f6]">
      <SiteNav />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
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
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing((value) => !value)}>
              {editing ? "Cancel" : "Edit profile"}
            </Button>
            <Link href="/create" className="inline-flex h-11 items-center justify-center rounded-lg bg-gray-950 px-4 text-sm font-medium text-white transition hover:bg-gray-800">
              New game
            </Link>
          </div>
        </section>

        {editing ? (
          <Card className="mt-7">
            <form onSubmit={saveProfile} className="grid gap-5 sm:grid-cols-2">
              <Input label="Display name" value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} maxLength={PLAYER_NAME_MAX_LENGTH} />
              <Input label="Username" prefix="@" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value.replace(/^@/, "") })} placeholder="pocketaces" maxLength={USERNAME_MAX_LENGTH} autoCapitalize="none" spellCheck={false} />
              <Input label="Venmo" prefix="@" value={form.venmo_handle} onChange={(event) => setForm({ ...form, venmo_handle: event.target.value.replace(/^@/, "") })} placeholder="your-handle" />
              <Input label="Zelle email or phone" value={form.zelle_handle} onChange={(event) => setForm({ ...form, zelle_handle: event.target.value })} />
              <p className="-mt-2 text-xs leading-5 text-gray-500 sm:col-span-2">
                Optional. Mainpot uses these to create settlement shortcuts; you always review and send the payment yourself.
              </p>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-gray-700">Bio</span>
                <textarea value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} maxLength={160} rows={3} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-gray-950 focus:outline-none focus:ring-2 focus:ring-gray-950/10" placeholder="Tuesday $20 home game" />
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" loading={saving}>Save profile</Button>
              </div>
            </form>
          </Card>
        ) : null}

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
                    onClick={async () => {
                      await respondToGameInvite(invite.id, "declined");
                      setGameInvites((items) => items.filter((item) => item.id !== invite.id));
                    }}
                  >
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    leftIcon={<ArrowRight size={16} />}
                    onClick={async () => {
                      await respondToGameInvite(invite.id, "accepted");
                      router.push(`/game/${invite.game.code}`);
                    }}
                  >
                    Join table
                  </Button>
                </div>
              </Card>
            ))}
          </section>
        ) : null}

        <section aria-label="Poker statistics" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((item) => (
            <Card key={item.label} padding="sm" className="rounded-xl">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{item.label}</p>
              <p className={`mt-3 text-2xl font-semibold tracking-tight ${item.tone}`}>{item.value}</p>
            </Card>
          ))}
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.55fr_1fr]">
          <Card padding="none" className="overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="font-semibold text-gray-950">Recent games</h2>
                <p className="text-sm text-gray-500">Your settled results</p>
              </div>
              <span className="text-xs text-gray-400">Best win {formatCurrency(stats.biggestWin)}</span>
            </div>
            {games.length ? (
              <ul className="divide-y divide-gray-100">
                {games.map((game) => (
                  <li key={game.gameId} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{game.gameName}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {game.date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {game.playerCount} players · {formatCurrency(game.buyInAmount)} buy-in
                      </p>
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
                <p className="text-sm font-medium text-gray-700">No settled games yet</p>
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
            {friendStats.length ? (
              <ol className="divide-y divide-gray-100">
                {friendStats.slice(0, 5).map((friend, index) => (
                  <li key={friend.userId} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="w-5 text-xs font-medium text-gray-400">{index + 1}</span>
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
        </div>

        <Card className="mt-6 border-gray-200">
          <h2 className="font-semibold text-gray-950">Your data</h2>
          <p className="mt-1 text-sm leading-6 text-gray-600">Download the information tied to your account, or submit a deletion request for the support team to fulfill.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={exportData} loading={exporting}>Export my data</Button>
            <Button variant="danger" onClick={requestDeletion} loading={deleting}>Request account deletion</Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-gray-500">Export files can include personal details and game history. Keep them private.</p>
        </Card>
      </main>
    </div>
  );
}
