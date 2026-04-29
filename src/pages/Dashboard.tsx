import { useNavigate } from 'react-router-dom';
import { resolveVanshaIdForApi, fetchPrakritiScore, type PrakritiScore, fetchPanchangCalendar, type PanchangCalendarRow } from '@/services/api';
import { mergeTithiWithFallback, type Paksha } from '@/lib/tithiFallback';
import { useLang } from '@/i18n/LanguageContext';
import { usePlan } from '@/contexts/PlanContext';
import { useTree } from '@/contexts/TreeContext';
import AppShell from '@/components/shells/AppShell';
import LockedBanner from '@/components/states/LockedBanner';
import TrustBadge from '@/components/ui/TrustBadge';
import TreeCompletionScore from '@/components/ui/TreeCompletionScore';
import ClanMilestone from '@/components/ui/ClanMilestone';
import { useState, useEffect } from 'react';
import { Users, Layers, Mail, TreePine, UserPlus, ShieldCheck, Clock, Search, Heart, Check, X, GitFork, ArrowUpCircle, BarChart3, Rocket, HandHeart, Leaf, UserCircle2, Loader2 } from 'lucide-react';
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

  const [prakritiScore, setPrakritiScore] = useState<PrakritiScore | null>(null);
  useEffect(() => {
    const vid = resolveVanshaIdForApi(null);
    if (!vid) {
      setPrakritiScore(null);
      return;
    }
    fetchPrakritiScore(vid).then(setPrakritiScore).catch(() => setPrakritiScore(null));
  }, [state.nodes.length, appUser?.vansha_id]);

  const pendingCount = state.pendingActions.filter(a => a.status === 'pending').length;
  const activeDisputes = state.disputes.filter(d => d.status === 'active').length;

  const stats = [
    { icon: Users, label: tr('members'), value: `${membersUsed}/${plan.maxNodes}` },
    { icon: Layers, label: tr('generations'), value: `${generationsUsed}/${plan.generationCap}` },
    { icon: Mail, label: tr('pendingInvites'), value: `${pendingCount}` },
    { icon: Leaf, label: tr('prakritScoreLabel'), value: prakritiScore ? String(prakritiScore.score) : '—', eco: true },
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

  // Compute profile node (onboarding name) for hero greeting
  const profileNode =
    (state.currentUserId ? state.nodes.find(n => n.id === state.currentUserId) : undefined) ??
    state.nodes.find(n => n.relation.toLowerCase() === 'self') ??
    state.nodes.find(n => (n.generation ?? 0) === 0) ??
    null;
  const profileNodeName = profileNode
    ? [profileNode.givenName, profileNode.middleName, profileNode.surname].filter(Boolean).join(' ')
    : null;

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
              {/* Greet by onboarding form name, fallback to Gmail name */}
              {(profileNodeName || appUser?.full_name) && (
                <p className="text-sm opacity-75 font-body mb-0.5">
                  नमस्ते, {profileNodeName || appUser?.full_name} 🌿
                </p>
              )}
              <h1 className="font-heading text-3xl font-bold mb-0">{tr('dashboardTitle')}</h1>
              {appUser?.kutumb_id && (
                <p className="text-[11px] opacity-60 font-body mt-0.5 tracking-wide font-mono">
                  Kutumb ID: {appUser.kutumb_id}
                </p>
              )}
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

      <div className="container py-8 space-y-8">
        {/* Weekly Panchang Strip */}
        <div>
          <DashboardWeekStrip />
          <p className="text-xs text-muted-foreground text-center mt-2 font-body">
            किसी तिथि पर क्लिक करें — अधिक जानकारी और अनुशंसाओं के लिए
          </p>
        </div>
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

        {/* ── My Profile card — pre-fills saved personal details ── */}
        {isTreeInitialized && (() => {
          // Logged-in member's tree node — not "lowest generation" (that is often father / ancestors).
          const profileNode =
            (state.currentUserId
              ? state.nodes.find((n) => n.id === state.currentUserId)
              : undefined) ??
            state.nodes.find((n) => n.relation.toLowerCase() === "self") ??
            state.nodes.find((n) => (n.generation ?? 0) === 0) ??
            null;
          if (!profileNode) return null;
          return (
            <div className="bg-card rounded-xl p-5 shadow-card border border-border/50 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading text-base font-semibold flex items-center gap-2">
                  <UserCircle2 className="w-5 h-5 text-primary" />
                  मेरी प्रोफ़ाइल
                </h3>
                <button
                  onClick={() => navigate(`/node/${profileNode.id}`)}
                  className="text-xs text-primary font-body font-medium hover:underline"
                >
                  संपादित करें →
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm font-body">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">नाम</p>
                  <p className="font-medium">
                    {[profileNode.givenName, profileNode.middleName, profileNode.surname].filter(Boolean).join(' ') || profileNode.name}
                  </p>
                </div>
                {appUser?.phone && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">फ़ोन</p>
                    <p className="font-medium">{appUser.phone}</p>
                  </div>
                )}
                {appUser?.kutumb_id && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Kutumb ID</p>
                    <p className="font-medium font-mono text-xs">{appUser.kutumb_id}</p>
                  </div>
                )}
                {profileNode.dateOfBirth && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">जन्मतिथि</p>
                    <p className="font-medium">{profileNode.dateOfBirth}</p>
                  </div>
                )}
                {profileNode.ancestralPlace && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">पैतृक स्थान</p>
                    <p className="font-medium">{profileNode.ancestralPlace}</p>
                  </div>
                )}
                {profileNode.currentResidence && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">वर्तमान निवास</p>
                    <p className="font-medium">{profileNode.currentResidence}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

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

        {/* Trust Seal Strip */}
        <div className="bg-card rounded-xl p-5 shadow-card border border-border/50 animate-fade-in">
          <p className="font-heading text-sm font-semibold mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Trust Seals
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border/50 bg-secondary/20 text-center">
              <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Leaf className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-xs font-semibold font-body leading-tight">Paryavaran Mitra</p>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-medium">Pending</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border/50 bg-secondary/20 text-center">
              <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-xs font-semibold font-body leading-tight">Trust / NGO</p>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-medium">Pending</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border/50 bg-secondary/20 text-center">
              <div className="w-9 h-9 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <UserCircle2 className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-xs font-semibold font-body leading-tight">KYC</p>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-medium">Pending</span>
            </div>
          </div>
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

// ── Dashboard Week Strip ──────────────────────────────────────────────────────

function addDaysLocal(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function DashboardWeekStrip() {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);

  // Start from Monday of current week
  const weekStart = (() => {
    const d = new Date(today + 'T00:00:00');
    const day = d.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  })();

  const [rows, setRows] = useState<PanchangCalendarRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPanchangCalendar(weekStart, addDaysLocal(weekStart, 6))
      .then(cal => {
        if (cal.length > 0) {
          setRows(cal.map(row => ({
            ...row,
            tithis: mergeTithiWithFallback(
              row.tithis as Record<string, unknown> | null | undefined,
              row.tithi_id,
              row.paksha as Paksha,
            ) as unknown as PanchangCalendarRow['tithis'],
          })));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [weekStart]);

  const SPECIAL_LABELS: Record<string, string> = {
    ekadashi: 'एकादशी', purnima: 'पूर्णिमा', amavasya: 'अमावस्या',
    pradosh: 'प्रदोष', chaturthi: 'चतुर्थी', ashtami: 'अष्टमी',
    navami: 'नवमी', sankranti: 'संक्रांति',
  };

  return (
    <div className="border border-green-200 dark:border-green-800 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20 rounded-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-green-100 dark:border-green-900 flex items-center justify-between">
        <span className="text-xs font-semibold text-green-800 dark:text-green-300">🌿 साप्ताहिक तिथि पंचांग</span>
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-green-600" />}
      </div>
      <div className="grid grid-cols-7 divide-x divide-green-100 dark:divide-green-900/50">
        {Array.from({ length: 7 }).map((_, i) => {
          const d = addDaysLocal(weekStart, i);
          const row = rows.find(r => r.gregorian_date === d);
          const t = row?.tithis as Record<string, string> | undefined;
          const isToday = d === today;
          const tithiName = t?.name_sanskrit || t?.name_common || '';
          return (
            <button
              key={d}
              onClick={() => navigate('/eco-panchang')}
              title="पूरा पंचांग देखें"
              className={[
                'flex flex-col items-center gap-0.5 py-2 px-0.5 text-center transition-all',
                isToday
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'hover:bg-green-100/70 dark:hover:bg-green-900/30',
              ].join(' ')}
            >
              <span className={`text-[9px] sm:text-[10px] font-medium leading-none ${isToday ? 'text-green-100' : 'text-muted-foreground'}`}>
                {new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })}
              </span>
              <span className={`text-sm font-bold leading-tight ${isToday ? 'text-white' : 'text-foreground'}`}>
                {new Date(d + 'T00:00:00').getDate()}
              </span>
              {tithiName && (
                <span className={`text-[8px] sm:text-[9px] leading-tight line-clamp-2 px-0.5 ${isToday ? 'text-green-100' : 'text-green-900 dark:text-green-200'}`}>
                  {tithiName}
                </span>
              )}
              {row?.special_flag && SPECIAL_LABELS[row.special_flag] && (
                <span className={`text-[7px] leading-tight ${isToday ? 'text-green-100' : 'text-amber-600 dark:text-amber-400'}`}>
                  {SPECIAL_LABELS[row.special_flag]}
                </span>
              )}
              {isToday && (
                <span className="text-[7px] bg-white/25 text-white rounded-full px-1 leading-tight">आज</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default Dashboard;
