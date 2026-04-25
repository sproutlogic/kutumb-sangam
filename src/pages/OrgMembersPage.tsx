/**
 * OrgMembersPage — full member list with invite, tier management, and search.
 * Accessed via /org/:slug/members
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '@/components/shells/AppShell';
import { orgApi } from '@/services/orgApi';
import type { OrgSummary, OrgMember, InviteResult } from '@/services/orgApi';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import {
  Users, UserPlus, Link, Copy, Search, ArrowLeft,
  CheckCircle2, Star, Coins,
} from 'lucide-react';

/* ── Invite modal ── */
interface InviteModalProps {
  slug: string;
  tiers: string[];
  activeTiers: number[];
  onClose: () => void;
}

function InviteModal({ slug, tiers, activeTiers, onClose }: InviteModalProps) {
  const [mode, setMode] = useState<'id' | 'open'>('id');
  const [kutumbId, setKutumbId] = useState('');
  const [targetTier, setTargetTier] = useState(activeTiers[activeTiers.length - 1] ?? 5);
  const [expiryDays, setExpiryDays] = useState(7);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (mode === 'id' && !kutumbId.trim()) {
      toast({ title: 'Enter a Kutumb ID', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const res = await orgApi.invite(slug, {
        target_kutumb_id: mode === 'id' ? kutumbId.trim() : undefined,
        target_tier:      targetTier,
        expires_in_days:  expiryDays,
        max_uses:         mode === 'open' ? undefined : 1,
      });
      setResult(res);
    } catch (err: any) {
      toast({ title: 'Could not create invite', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    if (result) {
      navigator.clipboard.writeText(result.invite_url);
      toast({ title: 'Invite link copied!' });
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md p-6">
        <h3 className="font-heading font-bold text-lg mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-primary" /> Invite Member
        </h3>

        {result ? (
          <div className="space-y-4">
            <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-xl p-4 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="font-semibold font-body text-sm">Invite created!</p>
              <p className="text-xs text-muted-foreground font-body mt-1">
                Code: <span className="font-mono font-bold">{result.invite_code}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <input
                readOnly
                value={result.invite_url}
                className="flex-1 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-mono"
              />
              <button
                onClick={copyLink}
                className="p-2.5 rounded-lg border border-border hover:bg-secondary transition"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl border border-border text-sm font-body hover:bg-secondary transition"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Mode toggle */}
            <div className="flex rounded-xl border border-border overflow-hidden">
              {(['id', 'open'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2 text-sm font-body font-medium transition-all ${
                    mode === m ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
                  }`}
                >
                  {m === 'id' ? '🔍 By Kutumb ID' : '🔗 Open Link'}
                </button>
              ))}
            </div>

            {mode === 'id' && (
              <div>
                <label className="text-xs font-semibold font-body text-muted-foreground mb-1 block">
                  Member's Kutumb ID
                </label>
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                  value={kutumbId}
                  onChange={e => setKutumbId(e.target.value.toUpperCase())}
                  placeholder="KMAB3CD7EF"
                  maxLength={10}
                />
              </div>
            )}

            {mode === 'open' && (
              <div>
                <label className="text-xs font-semibold font-body text-muted-foreground mb-1 block">
                  Expires in (days)
                </label>
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-body"
                  value={expiryDays}
                  onChange={e => setExpiryDays(parseInt(e.target.value))}
                >
                  {[1, 3, 7, 14, 30].map(d => (
                    <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold font-body text-muted-foreground mb-1 block">
                Join as (Tier)
              </label>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-body"
                value={targetTier}
                onChange={e => setTargetTier(parseInt(e.target.value))}
              >
                {activeTiers.map(t => (
                  <option key={t} value={t}>Tier {t}: {tiers[t - 1]}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-body hover:bg-secondary transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl gradient-hero text-primary-foreground font-semibold font-body text-sm hover:opacity-90 transition disabled:opacity-60"
              >
                {loading
                  ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin mx-auto block" />
                  : 'Create Invite'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Member row ── */
function MemberRow({
  member, aliases, currencyName, currencyEmoji,
}: {
  member: OrgMember;
  aliases: string[];
  currencyName: string;
  currencyEmoji: string;
}) {
  const tierAlias = aliases[member.tier_level - 1] ?? `Tier ${member.tier_level}`;
  const initials = (member.full_name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-secondary/30 transition">
      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold font-heading flex-shrink-0 text-primary">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-body font-medium text-sm truncate">{member.full_name ?? 'Unknown'}</p>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-body font-semibold flex-shrink-0">
            T{member.tier_level}: {tierAlias}
          </span>
          {member.role_label && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-body">
              {member.role_label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {member.kutumb_id && (
            <p className="text-[11px] text-muted-foreground font-mono">{member.kutumb_id}</p>
          )}
          {member.avg_quality_rating !== null && (
            <p className="text-[11px] text-muted-foreground font-body flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
              {member.avg_quality_rating.toFixed(1)}
            </p>
          )}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs font-body font-semibold">{currencyEmoji} {member.l_credits.toFixed(0)}</p>
        <p className="text-[10px] text-muted-foreground font-body">{currencyName}</p>
      </div>
    </div>
  );
}

/* ── Main ── */
const OrgMembersPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate  = useNavigate();
  const { appUser } = useAuth();

  const [org, setOrg]           = useState<OrgSummary | null>(null);
  const [members, setMembers]   = useState<OrgMember[]>([]);
  const [filtered, setFiltered] = useState<OrgMember[]>([]);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [tierFilter, setTierFilter] = useState<number | null>(null);

  useEffect(() => {
    if (!slug) return;
    Promise.all([orgApi.get(slug), orgApi.members(slug)])
      .then(([o, m]) => { setOrg(o); setMembers(m); setFiltered(m); })
      .catch(err => toast({ title: 'Could not load members', description: err?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    let result = members;
    if (tierFilter !== null) result = result.filter(m => m.tier_level === tierFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(m =>
        (m.full_name ?? '').toLowerCase().includes(q) ||
        (m.kutumb_id ?? '').toLowerCase().includes(q),
      );
    }
    setFiltered(result);
  }, [search, tierFilter, members]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <span className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!org) {
    return <AppShell><div className="container py-12 text-center"><p className="text-muted-foreground font-body">Organisation not found.</p></div></AppShell>;
  }

  const aliases = [org.tier1_alias, org.tier2_alias, org.tier3_alias, org.tier4_alias, org.tier5_alias];
  const activeTierNums = [1, ...(org.is_tier2_active ? [2] : []), ...(org.is_tier3_active ? [3] : []), ...(org.is_tier4_active ? [4] : []), 5];
  const isHead = appUser?.id === org.head_user_id;

  return (
    <AppShell>
      {showInvite && slug && (
        <InviteModal
          slug={slug}
          tiers={aliases}
          activeTiers={activeTierNums}
          onClose={() => setShowInvite(false)}
        />
      )}

      <div className="container py-8 px-4 max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(`/org/${slug}`)}
            className="p-2 rounded-lg border border-border hover:bg-secondary transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-heading text-xl font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> Members · {org.name}
            </h1>
            <p className="text-xs text-muted-foreground font-body">
              {members.filter(m => m.status === 'active').length} active members
            </p>
          </div>
          {isHead && (
            <button
              onClick={() => setShowInvite(true)}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl gradient-hero text-primary-foreground font-semibold font-body text-sm hover:opacity-90 transition"
            >
              <UserPlus className="w-4 h-4" /> Invite
            </button>
          )}
        </div>

        {/* Search + tier filter */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Search by name or Kutumb ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setTierFilter(null)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-body font-medium transition-all ${
                tierFilter === null ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'
              }`}
            >
              All
            </button>
            {activeTierNums.map(t => (
              <button
                key={t}
                onClick={() => setTierFilter(t === tierFilter ? null : t)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-body font-medium transition-all ${
                  tierFilter === t ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'
                }`}
              >
                T{t}: {aliases[t - 1]}
              </button>
            ))}
          </div>
        </div>

        {/* Member list */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-body text-sm">
                {search || tierFilter !== null ? 'No members match your search.' : 'No members yet.'}
              </p>
              {isHead && !search && tierFilter === null && (
                <button
                  onClick={() => setShowInvite(true)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl gradient-hero text-primary-foreground font-semibold font-body text-sm"
                >
                  <UserPlus className="w-4 h-4" /> Invite First Member
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(member => (
                <MemberRow
                  key={member.id}
                  member={member}
                  aliases={aliases}
                  currencyName={org.currency_name}
                  currencyEmoji={org.currency_emoji}
                />
              ))}
            </div>
          )}
        </div>

        {/* Summary */}
        {filtered.length > 0 && (
          <p className="text-center text-xs text-muted-foreground font-body mt-4">
            Showing {filtered.length} of {members.length} members ·{' '}
            {org.currency_emoji} {org.currency_name} earned within this org only
          </p>
        )}
      </div>
    </AppShell>
  );
};

export default OrgMembersPage;
