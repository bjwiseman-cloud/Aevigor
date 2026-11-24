// Training › Challenges (Ben 2026-11-24): friends, family and teams.
// * First challenge: most Zone 2 hours in the week (Monday to Sunday), with your friends or with any group you are in.
// * Only training performance is shared. Never health, check-in, log or record data.
// * Friends: find people by athlete ID (anyone) or by name (only people who switched on "Let people find me by name").
// * Groups: create up to 3, join as many as you like. Public groups are listed and people ask to join; private
//   groups are invite only. The leader (creator) approves requests, invites and removes members.
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Crown, Lock, Globe, Plus, Search, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SubTabs, TRAINING_TABS } from '@/screens/Layout';
import { Arrange } from '@/components/Arrange';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Chip, Chips, Field } from '@/components/chips';
import { useProfile } from '@/hooks/data';
import { mondayOf } from '@/components/WeekCards';
import { shortDate } from '@/lib/plan';
import { todayIn } from '@/lib/time';
import { addDays } from '@rules';
import { cn } from '@/lib/utils';

type Friendship = { id: string; user_a: string; user_b: string; requested_by: string; status: 'pending' | 'accepted' };
type Group = { id: string; owner: string; name: string; visibility: 'public' | 'private' };
type Member = { group_id: string; user_id: string; role: 'leader' | 'member'; status: 'member' | 'requested' | 'invited' };
type Person = { user_id: string; display_name: string; athlete_code: string };
const MAX_OWN = 3;

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function useSocial() {
  const p = useProfile().data!;
  return useQuery({
    queryKey: ['social', p.user_id],
    queryFn: async () => {
      const [f, g, m] = await Promise.all([
        supabase.from('friendships').select('*'), supabase.from('social_groups').select('*'), supabase.from('group_members').select('*')
      ]);
      for (const r of [f, g, m]) if (r.error) throw r.error;
      const friendships = (f.data ?? []) as Friendship[], members = (m.data ?? []) as Member[];
      const mine = new Set(members.filter((x) => x.user_id === p.user_id).map((x) => x.group_id));
      const groups = ((g.data ?? []) as Group[]).filter((x) => mine.has(x.id) || x.owner === p.user_id);
      const ids = [...new Set([...friendships.flatMap((x) => [x.user_a, x.user_b]), ...members.map((x) => x.user_id), p.user_id])];
      const people = await rpc<Person[]>('social_names', { ids }).catch(() => [] as Person[]);
      return { friendships, groups, members, names: new Map(people.map((x) => [x.user_id, x])) };
    }
  });
}

function useAct() {
  const qc = useQueryClient();
  return async (fn: string, args: Record<string, unknown>, ok?: string) => {
    try { await rpc(fn, args); if (ok) toast.success(ok); await qc.invalidateQueries({ queryKey: ['social'] }); await qc.invalidateQueries({ queryKey: ['z2'] }); }
    catch (e) { toast.error((e as Error).message); }
  };
}

const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const AVATAR = ['from-[#FF6B00] to-[#FF2E63]', 'from-sky-400 to-blue-600', 'from-emerald-400 to-teal-500', 'from-violet-500 to-fuchsia-500', 'from-amber-300 to-orange-500'];
function Avatar({ name, i = 0 }: { name: string; i?: number }) {
  return <span className={cn('grid h-9 w-9 shrink-0 -skew-x-6 place-items-center rounded-lg bg-gradient-to-br font-display text-sm font-extrabold italic text-white shadow', AVATAR[i % AVATAR.length])}>{initials(name)}</span>;
}

// ---------- Zone 2 leaderboard ----------
function Z2Card({ groups }: { groups: Group[] }) {
  const p = useProfile().data!;
  const today = todayIn(p.time_zone);
  const [scope, setScope] = useState('friends');
  const [last, setLast] = useState(false);
  const week = last ? addDays(mondayOf(today), -7) : mondayOf(today);
  const q = useQuery({
    queryKey: ['z2', scope, week],
    queryFn: () => rpc<{ user_id: string; display_name: string; z2_secs: number; me: boolean }[]>('challenge_z2', { scope, week_start: week })
  });
  const rows = q.data ?? [], top = Math.max(1, ...rows.map((r) => Number(r.z2_secs)));
  const MEDAL = ['🥇', '🥈', '🥉'];
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="challenges">🏆 Zone 2 hours</CardTitle><p className="text-xs text-muted-foreground">Most time in Zone 2, {shortDate(week)} to {shortDate(addDays(week, 6))}</p></CardHeader>
      <CardContent className="space-y-3">
        <Chips>
          <Chip on={scope === 'friends'} onClick={() => setScope('friends')}>👥 Friends</Chip>
          {groups.map((g) => <Chip key={g.id} on={scope === g.id} onClick={() => setScope(g.id)}>{g.name}</Chip>)}
        </Chips>
        <Chips><Chip className="text-xs" on={!last} onClick={() => setLast(false)}>This week</Chip><Chip className="text-xs" on={last} onClick={() => setLast(true)}>Last week</Chip></Chips>
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length <= 1 && scope === 'friends' ? (
          <p className="rounded-xl border border-dashed p-3 text-sm">Add a friend or join a group to start racing for Zone 2 hours. Your own time this week: <b>{rows[0] ? (Number(rows[0].z2_secs) / 3600).toFixed(1) : '0.0'} h</b>.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r, i) => { const h = Number(r.z2_secs) / 3600; return (
              <div key={r.user_id} className={cn('flex items-center gap-2.5 rounded-xl p-2', r.me ? 'bg-gradient-to-r from-[#FF6B00]/20 to-[#FF2E63]/20 ring-1 ring-[#FF6B00]' : 'bg-muted')}>
                <span className="w-6 text-center font-display text-lg font-extrabold italic">{MEDAL[i] ?? i + 1}</span>
                <Avatar name={r.display_name} i={i} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-sm"><b className="truncate">{r.display_name}{r.me ? ' (you)' : ''}</b><span className="font-display text-base font-extrabold italic">{h.toFixed(1)} h</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-background/60"><div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-500 bg-[length:200%_100%] animate-shine motion-reduce:animate-none" style={{ width: `${Math.max(3, (100 * Number(r.z2_secs)) / top)}%` }} /></div>
                </div>
              </div>
            ); })}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">Zone 2 = power zone 2 when a session has power, else heart-rate zone 2, from intervals.icu. Only this number is shared, never health or check-in data.</p>
      </CardContent>
    </Card>
  );
}

// ---------- Your athlete ID ----------
export function AthleteIdCard() {
  const p = useProfile().data! as ReturnType<typeof useProfile>['data'] & { athlete_code?: string | null; discoverable?: boolean };
  const qc = useQueryClient();
  const code = p!.athlete_code ?? '…';
  const setFind = async (v: boolean) => {
    const { error } = await supabase.from('profiles').update({ discoverable: v }).eq('user_id', p!.user_id);
    if (error) toast.error(error.message); else { toast.success(v ? 'People can now find you by name' : 'Name search off'); qc.invalidateQueries({ queryKey: ['profile'] }); }
  };
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle>🪪 Your athlete ID</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex-1 -skew-x-6 rounded-lg bg-gradient-to-r from-[#FF6B00] to-[#FF2E63] px-3 py-2 text-center font-display text-2xl font-extrabold italic tracking-widest text-white shadow-[0_0_14px_rgba(255,107,0,0.5)]">{code}</span>
          <Button variant="outline" size="icon" aria-label="Copy athlete ID" onClick={() => navigator.clipboard?.writeText(code).then(() => toast.success('Copied'))}><Copy /></Button>
        </div>
        <p className="text-xs text-muted-foreground">Give this ID to friends so they can add you. Anyone with your ID can send a friend request; you choose whether to accept.</p>
        <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
          <span>Let people find me by name<span className="block text-xs text-muted-foreground">Off by default. When on, other testers can find you by typing part of your name.</span></span>
          <Switch checked={!!p!.discoverable} onCheckedChange={setFind} aria-label="Let people find me by name" />
        </label>
      </CardContent>
    </Card>
  );
}

// ---------- Friends ----------
function FriendsCard({ s }: { s: NonNullable<ReturnType<typeof useSocial>['data']> }) {
  const me = useProfile().data!.user_id;
  const act = useAct();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<(Person & { friend_status: string | null })[] | null>(null);
  const other = (f: Friendship) => (f.user_a === me ? f.user_b : f.user_a);
  const name = (id: string) => s.names.get(id)?.display_name ?? 'Athlete';
  const friends = s.friendships.filter((f) => f.status === 'accepted'), incoming = s.friendships.filter((f) => f.status === 'pending' && f.requested_by !== me), sent = s.friendships.filter((f) => f.status === 'pending' && f.requested_by === me);
  const search = async () => { try { setFound(await rpc('social_find_people', { q })); } catch (e) { toast.error((e as Error).message); } };
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle>👥 Friends</CardTitle><p className="text-xs text-muted-foreground">{friends.length} friend{friends.length === 1 ? '' : 's'}</p></CardHeader>
      <CardContent className="space-y-3">
        {incoming.map((f) => (
          <div key={f.id} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6B00]/15 to-[#FF2E63]/15 p-2">
            <Avatar name={name(other(f))} /><span className="flex-1 text-sm"><b>{name(other(f))}</b> wants to be friends</span>
            <Button size="sm" onClick={() => act('social_friend', { target: other(f), action: 'accept' }, 'Friend added')}>Accept</Button>
            <Button size="sm" variant="ghost" onClick={() => act('social_friend', { target: other(f), action: 'remove' })}>No</Button>
          </div>
        ))}
        {friends.map((f, i) => (
          <div key={f.id} className="flex items-center gap-2 rounded-xl bg-muted p-2">
            <Avatar name={name(other(f))} i={i + 1} /><span className="flex-1 text-sm"><b>{name(other(f))}</b><span className="block text-xs text-muted-foreground">{s.names.get(other(f))?.athlete_code}</span></span>
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => act('social_friend', { target: other(f), action: 'remove' }, 'Removed')}>Remove</Button>
          </div>
        ))}
        {sent.map((f) => <div key={f.id} className="flex items-center gap-2 text-sm text-muted-foreground"><span className="flex-1">Request sent to {name(other(f))}</span><Button size="sm" variant="ghost" onClick={() => act('social_friend', { target: other(f), action: 'remove' })}>Cancel</Button></div>)}
        <div className="flex gap-2">
          <Input value={q} maxLength={60} placeholder="Athlete ID (AEV-…) or name" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
          <Button variant="outline" size="icon" aria-label="Search" disabled={q.trim().length < 2} onClick={search}><Search /></Button>
        </div>
        {found && (found.length ? found.map((x) => (
          <div key={x.user_id} className="flex items-center gap-2 rounded-xl border p-2">
            <Avatar name={x.display_name} /><span className="flex-1 text-sm"><b>{x.display_name}</b><span className="block text-xs text-muted-foreground">{x.athlete_code}</span></span>
            {x.friend_status ? <span className="text-xs text-muted-foreground">{x.friend_status === 'friends' ? 'Friends' : x.friend_status === 'sent' ? 'Sent' : 'Asked you'}</span>
              : <Button size="sm" onClick={async () => { await act('social_friend', { target: x.user_id, action: 'request' }, 'Request sent'); setFound(found.map((y) => (y.user_id === x.user_id ? { ...y, friend_status: 'sent' } : y))); }}><UserPlus /> Add</Button>}
          </div>
        )) : <p className="text-sm text-muted-foreground">No one found. Names only show for people who chose to be found by name; an exact athlete ID always works.</p>)}
      </CardContent>
    </Card>
  );
}

// ---------- Groups ----------
function GroupsCard({ s }: { s: NonNullable<ReturnType<typeof useSocial>['data']> }) {
  const me = useProfile().data!.user_id;
  const act = useAct();
  const [create, setCreate] = useState(false);
  const [open, setOpen] = useState<Group | null>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: string; name: string; members: number; my_status: string | null }[] | null>(null);
  const mine = (g: Group) => s.members.find((m) => m.group_id === g.id && m.user_id === me);
  const joined = s.groups.filter((g) => mine(g)?.status === 'member'), invites = s.groups.filter((g) => mine(g)?.status === 'invited'), asked = s.groups.filter((g) => mine(g)?.status === 'requested');
  const owned = s.groups.filter((g) => g.owner === me).length;
  const count = (g: Group) => s.members.filter((m) => m.group_id === g.id && m.status === 'member').length;
  const waiting = (g: Group) => (g.owner === me ? s.members.filter((m) => m.group_id === g.id && m.status === 'requested').length : 0);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle>🚩 Groups</CardTitle><p className="text-xs text-muted-foreground">Family, friends or a team · you lead {owned} of {MAX_OWN}</p></CardHeader>
      <CardContent className="space-y-2">
        {invites.map((g) => (
          <div key={g.id} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6B00]/15 to-[#FF2E63]/15 p-2 text-sm">
            <span className="flex-1">Invited to <b>{g.name}</b></span>
            <Button size="sm" onClick={() => act('social_group', { gid: g.id, action: 'accept_invite' }, `Joined ${g.name}`)}>Join</Button>
            <Button size="sm" variant="ghost" onClick={() => act('social_group', { gid: g.id, action: 'decline' })}>No</Button>
          </div>
        ))}
        {joined.map((g, i) => (
          <button key={g.id} type="button" onClick={() => setOpen(g)} className="flex w-full items-center gap-3 rounded-xl bg-muted p-2 text-left">
            <span className={cn('grid h-10 w-10 shrink-0 -skew-x-6 place-items-center rounded-lg bg-gradient-to-br text-lg text-white shadow', AVATAR[(i + 2) % AVATAR.length])}>{g.visibility === 'public' ? <Globe className="h-5 w-5" /> : <Lock className="h-5 w-5" />}</span>
            <span className="min-w-0 flex-1"><b className="block truncate">{g.name}</b><span className="text-xs text-muted-foreground">{count(g)} member{count(g) === 1 ? '' : 's'} · {g.visibility === 'public' ? 'Public' : 'Private, invite only'}</span></span>
            {g.owner === me && <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-heading"><Crown className="h-3 w-3" />Leader</span>}
            {waiting(g) > 0 && <span className="rounded-full bg-[#FF2E63] px-2 py-0.5 text-[11px] font-bold text-white">{waiting(g)} asking</span>}
          </button>
        ))}
        {asked.map((g) => <div key={g.id} className="flex items-center gap-2 text-sm text-muted-foreground"><span className="flex-1">Asked to join {g.name}</span><Button size="sm" variant="ghost" onClick={() => act('social_group', { gid: g.id, action: 'cancel' })}>Cancel</Button></div>)}
        {!joined.length && !invites.length && <p className="rounded-xl border border-dashed p-3 text-sm">No groups yet. Make one for your family, club or team, or find a public group.</p>}
        <Button className="w-full" disabled={owned >= MAX_OWN} onClick={() => setCreate(true)}><Plus /> {owned >= MAX_OWN ? 'You lead 3 groups (the most)' : 'Create a group'}</Button>
        <div className="flex gap-2 pt-1">
          <Input value={q} maxLength={40} placeholder="Find a public group" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && rpc<typeof found>('social_find_groups', { q }).then(setFound).catch((er) => toast.error(er.message))} />
          <Button variant="outline" size="icon" aria-label="Find group" disabled={q.trim().length < 2} onClick={() => rpc<typeof found>('social_find_groups', { q }).then(setFound).catch((er) => toast.error(er.message))}><Search /></Button>
        </div>
        {found && (found.length ? found.map((g) => (
          <div key={g.id} className="flex items-center gap-2 rounded-xl border p-2 text-sm">
            <span className="flex-1"><b>{g.name}</b><span className="block text-xs text-muted-foreground">{g.members} members · public</span></span>
            {g.my_status ? <span className="text-xs text-muted-foreground">{g.my_status === 'member' ? 'Joined' : g.my_status === 'requested' ? 'Asked' : 'Invited'}</span>
              : <Button size="sm" onClick={async () => { await act('social_group', { gid: g.id, action: 'request' }, 'Request sent to the leader'); setFound(found.map((x) => (x.id === g.id ? { ...x, my_status: 'requested' } : x))); }}>Ask to join</Button>}
          </div>
        )) : <p className="text-sm text-muted-foreground">No public group by that name.</p>)}
      </CardContent>
      {create && <CreateGroup onClose={() => setCreate(false)} />}
      {open && <GroupSheet g={open} s={s} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function CreateGroup({ onClose }: { onClose: () => void }) {
  const act = useAct();
  const [name, setName] = useState('');
  const [vis, setVis] = useState<'private' | 'public'>('private');
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader><SheetTitle className="font-display text-2xl font-extrabold uppercase italic">Create a group</SheetTitle><SheetDescription>You will be its leader: you approve who joins and can remove people.</SheetDescription></SheetHeader>
        <div className="space-y-4">
          <Field label="Name"><Input value={name} maxLength={40} placeholder="e.g. Family Z2 Club" onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Who can find it">
            <Chips><Chip on={vis === 'private'} onClick={() => setVis('private')}>🔒 Private · invite only</Chip><Chip on={vis === 'public'} onClick={() => setVis('public')}>🌍 Public · people ask to join</Chip></Chips>
          </Field>
          <Button className="w-full" disabled={name.trim().length < 2} onClick={async () => { await act('social_group_create', { gname: name.trim(), gvis: vis }, 'Group created'); onClose(); }}>Create</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function GroupSheet({ g, s, onClose }: { g: Group; s: NonNullable<ReturnType<typeof useSocial>['data']>; onClose: () => void }) {
  const me = useProfile().data!.user_id;
  const act = useAct();
  const lead = g.owner === me;
  const ms = s.members.filter((m) => m.group_id === g.id);
  const name = (id: string) => s.names.get(id)?.display_name ?? 'Athlete';
  const friends = useMemo(() => s.friendships.filter((f) => f.status === 'accepted').map((f) => (f.user_a === me ? f.user_b : f.user_a)).filter((id) => !ms.some((m) => m.user_id === id)), [s, me, ms]);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader><SheetTitle className="font-display text-2xl font-extrabold uppercase italic">{g.name}</SheetTitle><SheetDescription>{g.visibility === 'public' ? 'Public: listed in Find a group, people ask to join.' : 'Private: invite only.'}</SheetDescription></SheetHeader>
        <div className="space-y-3">
          {lead && ms.filter((m) => m.status === 'requested').map((m) => (
            <div key={m.user_id} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6B00]/15 to-[#FF2E63]/15 p-2 text-sm">
              <Avatar name={name(m.user_id)} /><span className="flex-1"><b>{name(m.user_id)}</b> asks to join</span>
              <Button size="sm" onClick={() => act('social_group', { gid: g.id, action: 'approve', target: m.user_id }, 'Approved')}>Approve</Button>
              <Button size="sm" variant="ghost" onClick={() => act('social_group', { gid: g.id, action: 'reject', target: m.user_id })}>No</Button>
            </div>
          ))}
          <div className="text-sm font-semibold">Members</div>
          {ms.filter((m) => m.status === 'member').map((m, i) => (
            <div key={m.user_id} className="flex items-center gap-2 rounded-xl bg-muted p-2 text-sm">
              <Avatar name={name(m.user_id)} i={i} /><span className="flex-1"><b>{name(m.user_id)}</b>{m.role === 'leader' && <span className="ml-1 text-xs text-heading">· leader</span>}</span>
              {lead && m.user_id !== me && <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => act('social_group', { gid: g.id, action: 'remove', target: m.user_id }, 'Removed')}>Remove</Button>}
            </div>
          ))}
          {ms.filter((m) => m.status === 'invited').map((m) => <p key={m.user_id} className="text-xs text-muted-foreground">Invited: {name(m.user_id)}</p>)}
          {lead && (<>
            <div className="text-sm font-semibold">Invite friends</div>
            {friends.length ? <Chips>{friends.map((id) => <Chip key={id} onClick={() => act('social_group', { gid: g.id, action: 'invite', target: id }, 'Invite sent')}>＋ {name(id)}</Chip>)}</Chips>
              : <p className="text-xs text-muted-foreground">Add friends first (by athlete ID), then invite them here.</p>}
            <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"><span>Public group<span className="block text-xs text-muted-foreground">Listed so people can ask to join</span></span>
              <Switch checked={g.visibility === 'public'} onCheckedChange={(v) => act('social_group', { gid: g.id, action: 'visibility', val: v ? 'public' : 'private' }).then(onClose)} aria-label="Public group" /></label>
            <Button variant="ghost" className="w-full text-destructive" onClick={async () => { if (window.confirm?.(`Delete ${g.name} for everyone?`) !== false) { await act('social_group', { gid: g.id, action: 'delete' }, 'Group deleted'); onClose(); } }}>Delete group</Button>
          </>)}
          {!lead && <Button variant="ghost" className="w-full text-destructive" onClick={async () => { await act('social_group', { gid: g.id, action: 'leave' }, 'Left the group'); onClose(); }}>Leave group</Button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Challenges() {
  const s = useSocial();
  const me = useProfile().data!.user_id;
  const joined = (s.data?.groups ?? []).filter((g) => s.data!.members.some((m) => m.group_id === g.id && m.user_id === me && m.status === 'member'));
  return (
    <div className="space-y-4">
      <SubTabs tabs={TRAINING_TABS} />
      {s.isLoading ? <p className="text-muted-foreground">Loading…</p> : s.error ? <Card><CardContent className="pt-6 text-sm text-muted-foreground">Challenges are not ready yet: {(s.error as Error).message}</CardContent></Card> : (
        <Arrange page="challenges" cards={[
          { id: 'z2', label: 'Zone 2 hours', node: <Z2Card groups={joined} /> },
          { id: 'friends', label: 'Friends', node: <FriendsCard s={s.data!} /> },
          { id: 'groups', label: 'Groups', node: <GroupsCard s={s.data!} /> },
          { id: 'id', label: 'Your athlete ID', node: <AthleteIdCard /> }
        ]} />
      )}
      <p className="text-center text-xs text-muted-foreground">Challenges share training performance only, never health data.</p>
    </div>
  );
}
