"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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

function profileDetail(profile: Profile, fallback: string) {
  const identity = profile.username ? `@${profile.username}` : null;
  return [identity, profile.bio].filter(Boolean).join(" · ") || fallback;
}

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const searchRequest = useRef(0);

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

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const user = await getCurrentUser();
      if (!user || user.is_anonymous) {
        router.replace("/signin?next=/friends");
        return;
      }
      setUserId(user.id);
      await refresh(user.id);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load friends.");
    } finally {
      setLoading(false);
    }
  }, [refresh, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runSearch(value: string) {
    const submitted = value.trim();
    if (!submitted) return;
    const request = ++searchRequest.current;
    setSearching(true);
    setSearchError(null);
    setSubmittedQuery(submitted);
    try {
      const matches = await searchUsers(submitted);
      if (request !== searchRequest.current) return;
      setResults(matches.filter((profile) => profile.id !== userId));
    } catch (error) {
      if (request !== searchRequest.current) return;
      setResults([]);
      setSearchError(error instanceof Error ? error.message : "Search failed.");
    } finally {
      if (request === searchRequest.current) setSearching(false);
    }
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch(query);
  }

  function changeQuery(value: string) {
    searchRequest.current += 1;
    setQuery(value);
    setResults([]);
    setSubmittedQuery(null);
    setSearchError(null);
    setSearching(false);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f8f6]">
        <SiteNav />
        <main tabIndex={-1} id="main-content" className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
          <div className="h-44 animate-pulse rounded-xl bg-gray-200/70" />
        </main>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#f7f8f6]">
        <SiteNav />
        <main tabIndex={-1} id="main-content" className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
          <Card className="text-center">
            <h1 className="text-xl font-semibold text-gray-950">Your friends could not load</h1>
            <p role="alert" className="mt-2 text-sm leading-6 text-gray-600">{loadError}</p>
            <Button className="mt-5" onClick={() => void load()}>Retry</Button>
          </Card>
        </main>
      </div>
    );
  }

  if (!userId) return null;

  return (
    <div className="min-h-screen bg-[#f7f8f6]">
      <SiteNav />
      <main tabIndex={-1} id="main-content" className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href="/dashboard" className="text-sm font-medium text-gray-500 hover:text-gray-900">← Dashboard</Link>
        <div className="mt-5">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-950">Friends</h1>
          <p className="mt-2 text-gray-600">Add your regular players to invite them to games and compare results.</p>
        </div>

        <Card className="mt-8 rounded-xl">
          <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
            <Input label="Find a player" value={query} onChange={(event) => changeQuery(event.target.value)} placeholder="Search name or @username" />
            <Button type="submit" loading={searching} className="sm:mt-6">Search</Button>
          </form>
          {submittedQuery ? <p className="mt-4 text-sm text-gray-500">Search results for <span className="font-medium text-gray-700">{submittedQuery}</span></p> : null}
          {searchError ? (
            <div className="mt-5 border-t border-gray-100 pt-5">
              <p role="alert" className="text-sm text-red-700">{searchError}</p>
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => void runSearch(submittedQuery ?? query)}>Retry search</Button>
            </div>
          ) : results.length ? (
            <ul className="mt-5 divide-y divide-gray-100 border-t border-gray-100">
              {results.map((profile) => (
                <li key={profile.id} className="flex items-center gap-3 py-3.5">
                  <Avatar profile={profile} />
                  <div className="min-w-0 flex-1">
                    <p data-testid="friend-name" className="break-words text-sm font-medium text-gray-900">{profile.display_name || profile.username || "Player"}</p>
                    <p className="truncate text-xs text-gray-500">{profileDetail(profile, "No username yet")}</p>
                  </div>
                  <Button size="sm" variant="secondary" loading={busyId === profile.id} onClick={() => addFriend(profile)}>Add friend</Button>
                </li>
              ))}
            </ul>
          ) : submittedQuery && !searching ? <div className="mt-5 border-t border-gray-100 pt-5 text-sm text-gray-500"><p>No matching players found. Friends need accounts; guests can still join a game without one.</p><Link href="/create" className="mt-2 inline-block font-semibold text-gray-900 underline underline-offset-2">Start a game and share its invite link</Link></div> : null}
        </Card>

        {incoming.length ? (
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Friend requests · {incoming.length}</h2>
            <Card padding="none" className="mt-3 overflow-hidden rounded-xl">
              <ul className="divide-y divide-gray-100">
                {incoming.map(({ friendship, profile }) => (
                  <li key={friendship.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <Avatar profile={profile} />
                    <div className="min-w-0 flex-1"><p data-testid="friend-name" className="break-words font-medium text-gray-900">{profile.display_name || profile.username || "Player"}</p><p className="break-words text-xs text-gray-500">{profile.username ? `@${profile.username}` : "Sent you a friend request"}</p></div>
                    <div className="flex w-full justify-end gap-2 sm:w-auto">
                      <Button size="sm" loading={busyId === friendship.id} onClick={() => act(friendship.id, () => acceptFriendRequest(friendship.id), "Friend added")}>Accept</Button>
                      <Button size="sm" variant="ghost" disabled={busyId === friendship.id} onClick={() => act(friendship.id, () => declineFriendRequest(friendship.id), "Request declined")}>Decline</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Friends · {friends.length}</h2>
          <Card padding="none" className="mt-3 overflow-hidden rounded-xl">
            {friends.length ? (
              <ul className="divide-y divide-gray-100">
                {friends.map(({ friendship, profile }) => (
                  <li key={friendship.id} className="flex items-center gap-3 px-5 py-4">
                    <Avatar profile={profile} />
                    <div className="min-w-0 flex-1"><p data-testid="friend-name" className="break-words font-medium text-gray-900">{profile.display_name || profile.username || "Player"}</p><p className="truncate text-xs text-gray-500">{profileDetail(profile, "No username yet")}</p></div>
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
                <button key={friendship.id} type="button" aria-label={`Cancel friend request to ${profile.display_name || profile.username || "Player"}`} disabled={busyId === friendship.id} onClick={() => act(friendship.id, () => cancelFriendRequest(friendship.id), "Request canceled")} className="inline-flex max-w-full items-center gap-2 rounded-full border border-gray-200 bg-white py-1.5 pl-1.5 pr-3 text-sm text-gray-700 shadow-sm transition hover:border-red-200 hover:text-red-600 disabled:opacity-50">
                  <Avatar profile={profile} size="sm" />
                  <span data-testid="friend-name" className="min-w-0 break-words text-left">{profile.display_name || profile.username || "Player"}</span>
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
