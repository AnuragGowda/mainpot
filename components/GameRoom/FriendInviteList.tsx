"use client";

import Link from "next/link";
import { Check, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { getCurrentUser } from "@/lib/auth-client";
import { getFriends } from "@/lib/friends";
import { friendLabel, inviteFriendToGame } from "@/lib/invites";
import type { Friendship, Profile } from "@/lib/types";

interface FriendInviteListProps {
  gameId: string;
  isHost: boolean;
}

type Friend = { profile: Profile; friendship: Friendship };

export default function FriendInviteList({ gameId, isHost }: FriendInviteListProps) {
  const { toast } = useToast();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [accountReady, setAccountReady] = useState<boolean | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (!isHost) return;
    let cancelled = false;
    void (async () => {
      const user = await getCurrentUser();
      const ready = Boolean(user && !user.is_anonymous);
      if (cancelled) return;
      setAccountReady(ready);
      if (ready && user) {
        try {
          const next = await getFriends(user.id);
          if (!cancelled) setFriends(next);
        } catch {
          if (!cancelled) setFriends([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isHost]);

  if (!isHost || accountReady === null) return null;
  if (!accountReady) {
    return (
      <p className="mt-4 text-center text-xs text-gray-500">
        <Link href="/signin" className="font-semibold text-gray-900 underline underline-offset-2">Sign in</Link> to invite saved friends directly.
      </p>
    );
  }
  if (!friends.length) {
    return (
      <p className="mt-4 text-center text-xs text-gray-500">
        <Link href="/friends" className="font-semibold text-gray-900 underline underline-offset-2">Add friends</Link> to build your regular table.
      </p>
    );
  }

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Invite your regulars</p>
      <ul className="max-h-44 space-y-1 overflow-y-auto">
        {friends.map(({ profile }) => {
          const wasSent = sent.has(profile.id);
          return (
            <li key={profile.id} className="flex items-center gap-2 rounded-lg px-1 py-1.5">
              <Avatar profile={profile} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{friendLabel(profile)}</span>
              <Button
                size="sm"
                variant={wasSent ? "ghost" : "secondary"}
                disabled={wasSent}
                loading={sending === profile.id}
                leftIcon={wasSent ? <Check size={15} /> : <UserPlus size={15} />}
                onClick={async () => {
                  setSending(profile.id);
                  try {
                    await inviteFriendToGame(gameId, profile.id);
                    setSent((current) => new Set(current).add(profile.id));
                    toast(`Invited ${friendLabel(profile)}`, "success");
                  } catch (error) {
                    toast(error instanceof Error ? error.message : "Could not send invite.", "error");
                  } finally {
                    setSending(null);
                  }
                }}
              >
                {wasSent ? "Invited" : "Invite"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
