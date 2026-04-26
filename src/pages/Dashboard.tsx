import { useNavigate } from 'react-router-dom';
import { resolveVanshaIdForApi } from '@/services/api';
import { useLang } from '@/i18n/LanguageContext';
import { usePlan } from '@/contexts/PlanContext';
import { useTree } from '@/contexts/TreeContext';
import AppShell from '@/components/shells/AppShell';
import LockedBanner from '@/components/states/LockedBanner';
import TrustBadge from '@/components/ui/TrustBadge';
import TreeCompletionScore from '@/components/ui/TreeCompletionScore';
import ClanMilestone from '@/components/ui/ClanMilestone';
import { useState } from 'react';
import { Users, Layers, Mail, TreePine, UserPlus, ShieldCheck, Clock, Search, Heart, Check, X, GitFork, ArrowUpCircle, BarChart3, Rocket, Briefcase, HandHeart, Leaf } from 'lucide-react';
import { UPCOMING_SERVICES } from '@/config/upcomingServices.config';
import { JoinSEModal } from '@/components/sales/JoinSEModal';
import { EarningsWallet } from '@/components/sales/EarningsWallet';
import { useAuth } from '@/contexts/AuthContext';

const SALES_ROLES = new Set(['se', 'cp', 'rp', 'zp', 'np', 'admin', 'superadmin']);

const Dashboard = () => {
  const { tr, lang } = useLang();
  const navigate = useNavigate();
  const [showJoinSE, setShowJoinSE] = useState(false);
  const { plan, planId, membersUsed, generationsUsed, hasEntitlement } = usePlan();
  const { state, trustScore, isTreeInitialized, approvePending, objectPending } = useTree();
  const { appUser } = useAuth();

  const isSalesMember = appUser ? SALES_ROLES.has(appUser.role) : false;

  const pendingCount = state.pendingActions.filter(a => a.status === 'pending').length;
  const activeDisputes = state.disputes.filter(d => d.status === 'active').length;

  const stats = [
    { icon: Users, label: tr('members'), value: `${membersUsed}/${plan.maxNodes}` },
    { icon: Layers, label: tr('generations'), value: `${generationsUsed}/${plan.generationCap}` },
    { icon: Mail, label: tr('pendingInvites'), value: `${pendingCount}` },
    ...(hasEntitlement('ecoScore') ? [{ icon: Leaf, label: tr('prakritScoreLabel'), value: '—', eco: true }] : []),
  ];

  const milestones = [
    { key: 'firstBranch' as const, earned: membersUsed >= 2 },
    { key: 'threeGen' as const, earned: generationsUsed >= 3 },
    { key: 'panditVerified' as const, earned: false },
    { key: 'fiftyMembers' as const, earned: membersUsed >= 50 },
  ];

  // Format time ago
  const timeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return tr('justNow');
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  return (
    <AppShell>
      {/* Hero Banner */}
      <div className="relative gradient-hero text-primary-foreground py-10 overflow-hidden">
        {/* Subtle radial glow in top-left */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.06) 0%, transparent 55%)' }} />
        <div className="container relative">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs tracking-[0.2em] uppercase opacity-60 font-body mb-1">{tr('haritVanshavali')}</p>
              <h1 className="font-heading text-3xl font-bold mb-0">{isTreeInitialized ? state.treeName : tr('dashboardTitle')}</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-3 py-1.5 rounded-full bg-primary-foreground/10 border border-primary-foreground/25 text-primary-foreground font-semibold font-body backdrop-blur-sm">
                ✦ {tr(plan.nameKey as any)}
              </span>
            </div>
          </div>
        </div>
        {/* Gold shimmer line at bottom */}
        <div className="absolute inset-x-0 bottom-0 gold-line opacity-60" />
      </div>

      {/* Encrypted Strip */}
      <div className="bg-card/80 border-b border-border/50 backdrop-blur-sm">
        <div className="container py-2.5 flex items-center justify-center gap-4 flex-wrap">
          <TrustBadge variant="encrypted" compact />
          <span className="text-xs text-muted-foreground font-body">{tr('encryptedDesc')}</span>
        </div>
      </div>

      <div className="container py-8 space-y-8">
        {/* Not initialized banner */}
        {!isTreeInitialized && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-center">
            <TreePine className="w-10 h-10 text-primary mx-auto mb-3" />
            <p className="font-heading text-lg font-semibold mb-2">{tr('treeEmpty')}</p>
            <button
              onClick={() => navigate('/onboarding')}
              className="px-6 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold font-body text-sm shadow-warm hover:opacity-90 transition-opacity"
            >
              {tr('startTree')}
            </button>
          </div>
        )}

        {/* Stats + Trust Score Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map((s, i) => (
            <div key={i} className={`rounded-xl p-5 shadow-card border text-center animate-fade-in ${'eco' in s && s.eco ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' : 'bg-card border-border/50'}`} style={{ animationDelay: `${i * 80}ms` }}>
              <s.icon className={`w-6 h-6 mx-auto mb-2 ${'eco' in s && s.eco ? 'text-emerald-600' : 'text-primary'}`} />
              <p className="text-2xl font-bold font-heading">{s.value}</p>
              <p className={`text-sm font-body ${'eco' in s && s.eco ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-muted-foreground'}`}>{s.label}</p>
            </div>
          ))}
          <div className="bg-card rounded-xl p-5 shadow-card border border-border/50 flex items-center justify-center animate-fade-in" style={{ animationDelay: '240ms' }}>
            <TrustBadge variant="trust-score" score={trustScore} compact />
          </div>
        </div>

        {/* Tree Completion + Actions Row */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-card rounded-xl p-5 shadow-card border border-border/50 animate-fade-in">
            <TreeCompletionScore membersUsed={membersUsed} maxNodes={plan.maxNodes} generationsUsed={generationsUsed} generationCap={plan.generationCap} size="sm" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <button onClick={() => navigate('/tree')} className="flex flex-col items-center gap-2 bg-card rounded-xl p-4 shadow-card border border-border/50 hover:shadow-elevated transition-all hover:-translate-y-0.5 text-center animate-fade-in">
              <div className="w-10 h-10 rounded-lg gradient-hero flex items-center justify-center">
                <TreePine className="w-5 h-5 text-primary-foreground" />
              </div>
              <p className="text-sm font-semibold font-body">{tr('viewTree')}</p>
            </button>
            <button
              onClick={() => {
                const v = resolveVanshaIdForApi(null);
                navigate(v ? `/node?vansha_id=${encodeURIComponent(v)}` : '/node');
              }}
              className="flex flex-col items-center gap-2 bg-card rounded-xl p-4 shadow-card border border-border/50 hover:shadow-elevated transition-all hover:-translate-y-0.5 text-center animate-fade-in"
            >
              <div className="w-10 h-10 rounded-lg gradient-hero flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-primary-foreground" />
              </div>
              <p className="text-sm font-semibold font-body">{tr('addMember')}</p>
            </button>
            {isSalesMember && (
              <button
                onClick={() => navigate('/sales')}
                className="flex flex-col items-center gap-2 bg-card rounded-xl p-4 shadow-card border border-border/50 hover:shadow-elevated transition-all hover:-translate-y-0.5 text-center animate-fade-in"
              >
                <div className="w-10 h-10 rounded-lg gradient-hero flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-primary-foreground" />
                </div>
                <p className="text-sm font-semibold font-body">Sales</p>
              </button>
            )}
          </div>
        </div>

        {/* Pending Actions */}
        {state.pendingActions.filter(a => a.status === 'pending').length > 0 && (
          <div className="bg-card rounded-xl p-6 shadow-card border border-border/50 animate-fade-in">
            <h3 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2">
              <GitFork className="w-5 h-5 text-accent" />
              {tr('pendingReviews')}
            </h3>
            <div className="space-y-3">
              {state.pendingActions.filter(a => a.status === 'pending').map(action => {
                const node = state.nodes.find(n => n.id === action.nodeId);
                return (
                  <div key={action.id} className="flex items-center justify-between bg-secondary/30 rounded-lg p-4">
                    <div>
                      <p className="text-sm font-body font-medium">
                        {tr('correctionProposed')}: <span className="text-primary">{action.field}</span>
                      </p>
                      <p className="text-xs text-muted-foreground font-body">
                        {node?.name} — {action.oldValue || '—'} → {action.proposedValue}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => approvePending(action.id)}
                        className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => objectPending(action.id)}
                        className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Active Disputes */}
        {activeDisputes > 0 && (
          <div className="bg-accent/5 border border-accent/20 rounded-xl p-5 animate-fade-in">
            <p className="text-sm font-semibold font-body flex items-center gap-2">
              <GitFork className="w-4 h-4 text-accent" />
              {activeDisputes} {tr('activeDisputes')}
            </p>
            <p className="text-xs text-muted-foreground font-body mt-1">{tr('disputeForkDesc')}</p>
          </div>
        )}

        {/* Pandit Verified Badge */}
        <div className="bg-card rounded-xl p-5 shadow-card border border-border/50 flex items-center gap-4 animate-fade-in">
          <div className="w-12 h-12 rounded-lg bg-gold/10 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-6 h-6 text-gold" />
          </div>
          <div className="flex-1">
            <p className="font-semibold font-body flex items-center gap-2">
              {tr('panditVerified')}
              <span className="text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold font-medium">✓ {tr('noPanditAssigned')}</span>
            </p>
            <p className="text-sm text-muted-foreground font-body">{tr('trustSeal')}</p>
          </div>
          <TrustBadge variant="verified" compact />
        </div>

        {/* Clan Milestones */}
        <div className="animate-fade-in">
          <ClanMilestone milestones={milestones} />
        </div>

        {/* Feature Teasers */}
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl p-5 shadow-card border border-border/50 hover:shadow-elevated transition-all animate-fade-in">
            <ShieldCheck className="w-6 h-6 text-primary mb-2" />
            <p className="font-body font-medium text-sm mb-1">{tr('verification')}</p>
            <p className="text-xs text-muted-foreground font-body mb-3">{tr('verificationTeaser')}</p>
            {hasEntitlement('panditVerification') ? (
              <button onClick={() => navigate('/verification')} className="text-xs text-primary font-medium font-body hover:underline">{tr('explore')} →</button>
            ) : (
              <LockedBanner featureKey="panditVerification" />
            )}
          </div>
          <div className="bg-card rounded-xl p-5 shadow-card border border-border/50 hover:shadow-elevated transition-all animate-fade-in">
            <Search className="w-6 h-6 text-primary mb-2" />
            <p className="font-body font-medium text-sm mb-1">{tr('discovery')}</p>
            <p className="text-xs text-muted-foreground font-body mb-3">{tr('discoveryTeaser')}</p>
            {hasEntitlement('discovery') ? (
              <button onClick={() => navigate('/discovery')} className="text-xs text-primary font-medium font-body hover:underline">{tr('explore')} →</button>
            ) : (
              <LockedBanner featureKey="discovery" />
            )}
          </div>
          <div className="bg-card rounded-xl p-5 shadow-card border border-border/50 hover:shadow-elevated transition-all animate-fade-in">
            <Heart className="w-6 h-6 text-primary mb-2" />
            <p className="font-body font-medium text-sm mb-1">{tr('matrimony')}</p>
            <p className="text-xs text-muted-foreground font-body mb-3">{tr('matrimonyTeaser')}</p>
            {hasEntitlement('matrimony') ? (
              <button onClick={() => navigate('/matrimony')} className="text-xs text-primary font-medium font-body hover:underline">{tr('explore')} →</button>
            ) : (
              <LockedBanner featureKey="matrimony" />
            )}
          </div>
        </div>

        {/* Upgrade CTA */}
        {planId === 'beej' && (
          <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl p-6 border border-primary/20 text-center animate-fade-in">
            <ArrowUpCircle className="w-8 h-8 text-primary mx-auto mb-3" />
            <p className="font-heading text-lg font-bold mb-1">{tr('upgradePlan')}</p>
            <p className="text-sm text-muted-foreground font-body mb-4">{tr('upgradeSubtitle')}</p>
            <button
              onClick={() => navigate('/upgrade')}
              className="px-8 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold font-body text-sm shadow-warm hover:opacity-90 transition-opacity"
            >
              {tr('upgradePlan')} →
            </button>
          </div>
        )}

        {/* Launching Soon — Kutumb Map Ecosystem */}
        <div className="bg-gradient-to-br from-primary/5 to-accent/5 rounded-2xl border border-primary/15 p-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="w-5 h-5 text-primary" />
            <h3 className="font-heading text-lg font-bold">{tr('upcomingSection')}</h3>
          </div>
          <p className="text-sm text-muted-foreground font-body mb-5">{tr('upcomingSectionDesc')}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {UPCOMING_SERVICES.map((svc) => {
              const dest = svc.isLive ? (svc.livePath ?? svc.path) : svc.path;
              return (
                <button
                  key={svc.id}
                  onClick={() => navigate(dest)}
                  className="flex items-start gap-3 bg-card/80 rounded-xl p-4 border border-border/50 hover:border-primary/30 hover:shadow-card transition-all text-left group"
                >
                  <span className="text-2xl mt-0.5 flex-shrink-0">{svc.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className="font-semibold font-body text-sm">{svc.title[lang]}</p>
                      {!svc.isLive && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-bold tracking-wide flex-shrink-0">
                          SOON
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-body line-clamp-2">{svc.tagline[lang]}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-card rounded-xl p-6 shadow-card border border-border/50 animate-fade-in">
          <h3 className="font-heading text-lg font-semibold mb-4">{tr('recentActivity')}</h3>
          {state.activityLog.length === 0 ? (
            <p className="text-sm text-muted-foreground font-body text-center py-4">{tr('noDataYet')}</p>
          ) : (
            <div className="space-y-4">
              {state.activityLog.slice(0, 10).map((a) => (
                <div key={a.id} className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-body">
                      {tr(a.textKey as any)}
                      {a.params.memberName && ` — ${a.params.memberName}`}
                      {a.params.treeName && ` — ${a.params.treeName}`}
                      {a.params.field && ` (${a.params.field})`}
                      {a.textKey === 'activityTreeBroadcast' && a.params.message
                        ? ` — ${a.params.message.slice(0, 120)}${a.params.message.length > 120 ? '…' : ''}`
                        : ''}
                      {a.textKey === 'activitySosSent' && a.params.note
                        ? ` — ${a.params.note.slice(0, 80)}`
                        : ''}
                      {a.textKey === 'activitySosSent' && a.params.count
                        ? ` [${a.params.count} recipients]`
                        : ''}
                      {a.textKey === 'activityLinkedSpouses' && a.params.a && a.params.b
                        ? ` — ${a.params.a} & ${a.params.b}`
                        : ''}
                    </p>
                    <p className="text-xs text-muted-foreground font-body">{timeAgo(a.time)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Earnings Wallet — shown to active sales members */}
        <EarningsWallet />

        {/* Join Sales Team CTA — only shown to non-sales users */}
        {!isSalesMember && (
          <div className="bg-gradient-to-r from-accent/8 to-primary/8 rounded-xl p-5 border border-accent/20 flex items-center gap-4 animate-fade-in">
            <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
              <HandHeart className="w-5 h-5 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold font-body text-sm">{tr('joinSalesTeam')}</p>
              <p className="text-xs text-muted-foreground font-body">{tr('seContributeSub')}</p>
            </div>
            <button
              onClick={() => setShowJoinSE(true)}
              className="flex-shrink-0 px-4 py-2 rounded-lg gradient-hero text-primary-foreground font-semibold font-body text-xs shadow-warm hover:opacity-90 transition-opacity"
            >
              {tr('getStarted')} →
            </button>
          </div>
        )}

        {/* Disclaimer */}
        <div className="text-center text-xs text-muted-foreground font-body py-4 border-t border-border">
          {tr('disclaimer')}
        </div>
      </div>

      {showJoinSE && <JoinSEModal onClose={() => setShowJoinSE(false)} />}
    </AppShell>
  );
};

export default Dashboard;
