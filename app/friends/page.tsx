"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import SiteNav from "@/components/SiteNav";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { getCurrentUser } from "@/lib/auth-client";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  getFriends,
  getFriendshipBetween,
  getIncomingRequests,
  getOutgoingRequests,
  removeFriend,
  searchUsers,
  sendFriendRequest,
} from "@/lib/friends";
import type { Friendship, Profile } from "@/lib/types";

type FriendItem = { friendship: Friendship; profile: Profile };

export default function FriendsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [incoming, setIncoming] = useState<FriendItem[]>([]);
  const [outgoing, setOutgoing] = useState<FriendItem[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async (id: string) => {
    const [nextFriends, nextIncoming, nextOutgoing] = await Promise.all([
      getFriends(id),
      getIncomingRequests(id),
      getOutgoingRequests(id),
    ]);
    setFriends(nextFriends);
    setIncoming(nextIncoming);
    setOutgoing(nextOutgoing);
  }, []);

  useEffect(() => {
    void (async () => {
      const user = await getCurrentUser();
      if (!user || user.is_anonymous) {
        router.replace("/signin?next=/friends");
        return;
      }
      setUserId(user.id);
      try {
        await refresh(user.id);
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not load friends.", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh, router, toast]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const matches = await searchUsers(query);
      setResults(matches.filter((profile) => profile.id !== userId));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Search failed.", "error");
    } finally {
      setSearching(false);
    }
  }

  async function act(id: string, action: () => Promise<void>, success: string) {
    if (!userId) return;
    setBusyId(id);
    try {
      await action();
      await refresh(userId);
      toast(success, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Something went wrong.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function addFriend(profile: Profile) {
    if (!userId) return;
    setBusyId(profile.id);
    try {
      const existing = await getFriendshipBetween(userId, profile.id);
      if (existing?.status === "pending" && existing.addressee_id === userId) {
        await acceptFriendRequest(existing.id);
        toast(`${profile.display_name || profile.username || "Player"} is now a friend`, "success");
      } else if (existing?.status === "pending") {
        toast("Friend request already sent.");
      } else if (existing?.status === "accepted") {
        toast("You are already friends.");
      } else {
        await sendFriendRequest(profile.id);
        toast("Friend request sent", "success");
      }
      await refresh(userId);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not send request.", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f8f6]">
      <SiteNav />
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href="/dashboard" className="text-sm font-medium text-gray-500 hover:text-gray-900">← Dashboard</Link>
        <div className="mt-5">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-950">Your poker circle</h1>
          <p className="mt-2 text-gray-600">Find your regulars and keep everyone connected between games.</p>
        </div>

        <Card className="mt-8 rounded-xl">
          <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
            <Input label="Find a player" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or @username" />
            <Button type="submit" loading={searching} className="sm:mt-6">Search</Button>
          </form>
          {results.length ? (
            <ul className="mt-5 divide-y divide-gray-100 border-t border-gray-100">
              {results.map((profile) => (
                <li key={profile.id} className="flex items-center gap-3 py-3.5">
                  <Avatar profile={profile} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{profile.display_name || profile.username || "Player"}</p>
                    <p className="truncate text-xs text-gray-500">{profile.username ? `@${profile.username}` : profile.bio || "Ante player"}</p>
                  </div>
                  <Button size="sm" variant="secondary" loading={busyId === profile.id} onClick={() => addFriend(profile)}>Add</Button>
                </li>
              ))}
            </ul>
          ) : query && !searching ? <p className="mt-5 border-t border-gray-100 pt-5 text-sm text-gray-500">No matching players yet.</p> : null}
        </Card>

        {incoming.length ? (
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Requests · {incoming.length}</h2>
            <Card padding="none" className="mt-3 overflow-hidden rounded-xl">
              <ul className="divide-y divide-gray-100">
                {incoming.map(({ friendship, profile }) => (
                  <li key={friendship.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <Avatar profile={profile} />
                    <div className="min-w-0 flex-1"><p className="font-medium text-gray-900">{profile.display_name || profile.username || "Player"}</p><p className="text-xs text-gray-500">{profile.username ? `@${profile.username}` : "Wants to join your circle"}</p></div>
                    <Button size="sm" loading={busyId === friendship.id} onClick={() => act(friendship.id, () => acceptFriendRequest(friendship.id), "Friend added")}>Accept</Button>
                    <Button size="sm" variant="ghost" disabled={busyId === friendship.id} onClick={() => act(friendship.id, () => declineFriendRequest(friendship.id), "Request declined")}>Decline</Button>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Friends · {friends.length}</h2>
          <Card padding="none" className="mt-3 overflow-hidden rounded-xl">
            {loading ? <div className="h-28 animate-pulse bg-gray-100" /> : friends.length ? (
              <ul className="divide-y divide-gray-100">
                {friends.map(({ friendship, profile }) => (
                  <li key={friendship.id} className="flex items-center gap-3 px-5 py-4">
                    <Avatar profile={profile} />
                    <div className="min-w-0 flex-1"><p className="truncate font-medium text-gray-900">{profile.display_name || profile.username || "Player"}</p><p className="truncate text-xs text-gray-500">{profile.username ? `@${profile.username}` : profile.bio || "Ante player"}</p></div>
                    <Button size="sm" variant="ghost" loading={busyId === friendship.id} onClick={() => act(friendship.id, () => removeFriend(friendship.id), "Friend removed")}>Remove</Button>
                  </li>
                ))}
              </ul>
            ) : <div className="px-6 py-14 text-center"><p className="text-sm font-medium text-gray-700">No friends added yet</p><p className="mt-1 text-sm text-gray-500">Search above to build your regular table.</p></div>}
          </Card>
        </section>

        {outgoing.length ? (
          <section className="mt-8 pb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Sent requests · {outgoing.length}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {outgoing.map(({ friendship, profile }) => (
                <button key={friendship.id} type="button" disabled={busyId === friendship.id} onClick={() => act(friendship.id, () => cancelFriendRequest(friendship.id), "Request canceled")} className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1.5 pl-1.5 pr-3 text-sm text-gray-700 shadow-sm transition hover:border-red-200 hover:text-red-600 disabled:opacity-50">
                  <Avatar profile={profile} size="sm" />
                  {profile.display_name || profile.username || "Player"}
                  <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
