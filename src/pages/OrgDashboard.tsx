/**
 * OrgDashboard — overview for a single Kutumb Pro organisation.
 * Accessed via /org/:slug
 *
 * Phase 2: Pulse Dashboard will show live analytics.
 * For now: org card + quick stats + recent member preview + action buttons.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '@/components/shells/AppShell';
import { orgApi } from '@/services/orgApi';
import type { OrgSummary, OrgMember } from '@/services/orgApi';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import {
  Building2, Users, Coins, Settings, UserPlus,
  Link, Copy, ChevronRight, Layers,
} from 'lucide-react';

/* ── Tier badge ── */
function TierBadge({ tier, aliases }: { tier: number; aliases: string[] }) {
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-body font-semibold">
      T{tier}: {aliases[tier - 1] ?? `Tier ${tier}`}
    </span>
  );
}

/* ── Quick stat card ── */
function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-body">{label}</p>
        <p className="font-heading font-bold text-base">{value}</p>
      </div>
    </div>
  );
}

/* ── Main ── */
const OrgDashboard = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { appUser } = useAuth();

  const [org, setOrg]         = useState<OrgSummary | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!slug) return;
    Promise.all([orgApi.get(slug), orgApi.members(slug)])
      .then(([o, m]) => { setOrg(o); setMembers(m); })
      .catch(err => toast({ title: 'Could not load org', description: err?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleOpenInvite() {
    if (!slug || !org) return;
    setInviting(true);
    try {
      const result = await orgApi.invite(slug, { target_tier: 5, max_uses: undefined });
      await navigator.clipboard.writeText(result.invite_url);
      toast({ title: 'Open invite link copied!', description: `Code: ${result.invite_code}` });
    } catch (err: any) {
      toast({ title: 'Could not create invite', description: err?.message, variant: 'destructive' });
    } finally {
      setInviting(false);
    }
  }

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
    return (
      <AppShell>
        <div className="container py-12 text-center">
          <p className="text-muted-foreground font-body">Organisation not found.</p>
        </div>
      </AppShell>
    );
  }

  const aliases = [
    org.tier1_alias, org.tier2_alias, org.tier3_alias,
    org.tier4_alias, org.tier5_alias,
  ];
  const isHead = appUser?.id === org.head_user_id;
  const activeCount = members.filter(m => m.status === 'active').length;

  return (
    <AppShell>
      <div className="container py-8 px-4 max-w-4xl mx-auto">

        {/* Org header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Building2 className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-bold">{org.name}</h1>
              <p className="text-sm text-muted-foreground font-body">
                {org.framework_type.charAt(0).toUpperCase() + org.framework_type.slice(1)} ·{' '}
                <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">kutumb.app/org/{org.slug}</span>
              </p>
            </div>
          </div>
          {isHead && (
            <button
              onClick={() => navigate(`/org/${slug}/settings`)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-body hover:bg-secondary transition"
            >
              <Settings className="w-4 h-4" /> Settings
            </button>
          )}
        </div>

        {org.description && (
          <p className="text-muted-foreground font-body text-sm mb-6 bg-secondary/40 rounded-xl px-4 py-3">
            {org.description}
          </p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <StatCard icon={Users} label="Active members" value={activeCount} />
          <StatCard icon={Layers} label="Active tiers" value={
            [true, org.is_tier2_active, org.is_tier3_active, org.is_tier4_active, true].filter(Boolean).length
          } />
          <StatCard
            icon={Coins}
            label={org.currency_name}
            value={`${org.currency_emoji} ${org.my_l_credits?.toFixed(0) ?? 0} (yours)`}
          />
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 mb-8">
          <button
            onClick={() => navigate(`/org/${slug}/members`)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-hero text-primary-foreground font-semibold font-body text-sm hover:opacity-90 transition"
          >
            <Users className="w-4 h-4" /> View Members
          </button>
          <button
            onClick={() => navigate(`/org/${slug}/invite`)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary text-primary font-semibold font-body text-sm hover:bg-primary/5 transition"
          >
            <UserPlus className="w-4 h-4" /> Invite by Kutumb ID
          </button>
          <button
            onClick={handleOpenInvite}
            disabled={inviting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border font-semibold font-body text-sm hover:bg-secondary transition disabled:opacity-60"
          >
            {inviting
              ? <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              : <Link className="w-4 h-4" />}
            Copy Open Invite Link
          </button>
        </div>

        {/* Member preview */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h2 className="font-heading font-bold text-base">Members</h2>
            <button
              onClick={() => navigate(`/org/${slug}/members`)}
              className="text-sm text-primary font-body font-medium flex items-center gap-1 hover:underline"
            >
              See all <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {members.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground font-body text-sm">
              No members yet. Invite your first member!
            </div>
          ) : (
            <div className="divide-y divide-border">
              {members.slice(0, 6).map(member => (
                <div key={member.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold font-heading flex-shrink-0">
                    {(member.full_name ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body font-medium text-sm truncate">
                      {member.full_name ?? 'Unknown'}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-body">
                      {member.kutumb_id ?? ''}
                    </p>
                  </div>
                  <TierBadge tier={member.tier_level} aliases={aliases} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Phase 2 placeholder */}
        <div className="mt-6 bg-secondary/30 border border-dashed border-border rounded-2xl p-6 text-center">
          <p className="text-xs font-semibold font-body text-muted-foreground/60 uppercase tracking-widest mb-2">
            Coming in Phase 2
          </p>
          <p className="text-sm text-muted-foreground font-body">
            Pulse Dashboard · L-Credit ledger · Org tree visualisation · Trust Multiplier
          </p>
        </div>

      </div>
    </AppShell>
  );
};

export default OrgDashboard;
