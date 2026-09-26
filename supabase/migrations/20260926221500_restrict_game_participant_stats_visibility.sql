-- Participation results reveal per-game profit and loss. They are visible to
-- their owner and to an accepted friend, which is the only social stats reader.
drop policy if exists "game_participants select" on public.game_participants;
create policy "game_participants select own or accepted friend"
  on public.game_participants for select to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1
      from public.friendships as friendship
      where friendship.status = 'accepted'
        and (
          (friendship.requester_id = (select auth.uid())
            and friendship.addressee_id = user_id)
          or (friendship.addressee_id = (select auth.uid())
            and friendship.requester_id = user_id)
        )
    )
  );
