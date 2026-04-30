import { useNavigate, useSearchParams } from 'react-router-dom';
import { resolveVanshaIdForApi, fetchPrakritiScore, type PrakritiScore, fetchFamilyRank, type FamilyRank, fetchPanchangCalendar, type PanchangCalendarRow } from '@/services/api';
import { mergeTithiWithFallback, type Paksha } from '@/lib/tithiFallback';
import { useLang } from '@/i18n/LanguageContext';
import { usePlan } from '@/contexts/PlanContext';
import { useTree } from '@/contexts/TreeContext';
import AppShell from '@/components/shells/AppShell';
import LockedBanner from '@/components/states/LockedBanner';
import TrustBadge from '@/components/ui/TrustBadge';
import TreeCompletionScore from '@/components/ui/TreeCompletionScore';
import ClanMilestone from '@/components/ui/ClanMilestone';
import MilestoneCelebration from '@/components/ui/MilestoneCelebration';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Users, Layers, Mail, TreePine, UserPlus, ShieldCheck, Clock, Search, Heart, Check, X, GitFork, ArrowUpCircle, BarChart3, Rocket, HandHeart, Leaf, UserCircle2, Loader2, Share2, Flame, TrendingUp, Mic } from 'lucide-react';
import { UPCOMING_SERVICES } from '@/config/upcomingServices.config';
import { JoinSEModal } from '@/components/sales/JoinSEModal';
import { EarningsWallet } from '@/components/sales/EarningsWallet';
import { useAuth } from '@/contexts/AuthContext';
import { MovementBelief } from '@/components/prakriti/MovementBelief';

const SALES_ROLES = new Set(['se', 'cp', 'rp', 'zp', 'np', 'admin', 'superadmin']);

const Dashboard = () => {
  const { tr, lang } = useLang();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showJoinSE, setShowJoinSE] = useState(false);
  const { plan, planId, membersUsed, generationsUsed, hasEntitlement } = usePlan();
  const { state, trustScore, isTreeInitialized, approvePending, objectPending } = useTree();
  const { appUser } = useAuth();

  const isSalesMember = appUser ? SALES_ROLES.has(appUser.role) : false;

  const [prakritiScore, setPrakritiScore] = useState<PrakritiScore | null>(null);
  const [familyRank, setFamilyRank] = useState<FamilyRank | null>(null);
  const [notificationStatus, setNotificationStatus] = useState(() => {
    try { return localStorage.getItem('prakriti_pulse_notifications') ?? 'off'; } catch { return 'off'; }
  });
  const [firstSeenAt, setFirstSeenAt] = useState(() => {
    try { return Number(localStorage.getItem('prakriti_first_seen_at') ?? '0'); } catch { return 0; }
  });
  // Streak: read from localStorage until backend endpoint is wired
  const streakDays = (() => {
    try { return parseInt(localStorage.getItem('prakriti_streak') ?? '0', 10) || 0; } catch { return 0; }
  })();
  useEffect(() => {
    if (firstSeenAt > 0) return;
    const now = Date.now();
    try { localStorage.setItem('prakriti_first_seen_at', String(now)); } catch { /* ignore */ }
    setFirstSeenAt(now);
  }, [firstSeenAt]);

  useEffect(() => {
    const vid = resolveVanshaIdForApi(null);
    if (!vid) {
      setPrakritiScore(null);
      setFamilyRank(null);
      return;
    }
    fetchPrakritiScore(vid).then(setPrakritiScore).catch(() => setPrakritiScore(null));
    fetchFamilyRank(vid).then(setFamilyRank).catch(() => setFamilyRank(null));
  }, [state.nodes.length, appUser?.vansha_id]);

  useEffect(() => {
    if (searchParams.get('join-team') !== '1' || isSalesMember) return;
    setShowJoinSE(true);
  }, [searchParams, isSalesMember]);

  const closeJoinSE = () => {
    setShowJoinSE(false);
    if (searchParams.get('join-team') !== '1') return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('join-team');
    setSearchParams(nextParams, { replace: true });
  };

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

  const [celebrationMilestone, setCelebrationMilestone] = useState<typeof milestones[0]['key'] | null>(null);

  useEffect(() => {
    if (!appUser?.vansha_id) return;
    const storageKey = `prakriti_celebrated_${appUser.vansha_id}`;
    const celebrated: string[] = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    const newlyEarned = milestones.find(m => m.earned && !celebrated.includes(m.key));
    if (!newlyEarned) return;
    setCelebrationMilestone(newlyEarned.key);
    localStorage.setItem(storageKey, JSON.stringify([...celebrated, newlyEarned.key]));
  }, [membersUsed, generationsUsed, appUser?.vansha_id]);

  const dismissCelebration = useCallback(() => setCelebrationMilestone(null), []);

  const familyName = appUser?.family_name ?? appUser?.full_name?.split(' ').slice(-1)[0] ?? 'Aapka';
  const now = Date.now();
  const hoursSinceFirstSeen = firstSeenAt > 0 ? (now - firstSeenAt) / 36e5 : 0;
  const showDay2Hook = hoursSinceFirstSeen >= 24 && hoursSinceFirstSeen <= 72;
  const lastPulseAt = (() => {
    try { return Number(localStorage.getItem('prakriti_last_pulse_at') ?? '0'); } catch { return 0; }
  })();
  const missedPulseDays = lastPulseAt > 0 ? Math.floor((now - lastPulseAt) / 86_400_000) : 0;
  const showReactivation = missedPulseDays >= 3;

  const enablePulseWorkflow = async () => {
    try {
      localStorage.setItem('prakriti_pulse_notifications', 'on');
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      setNotificationStatus('on');
    } catch {
      setNotificationStatus('on');
    }
  };

  const logDailyPulse = () => {
    try {
      localStorage.setItem('prakriti_last_pulse_at', String(Date.now()));
      localStorage.setItem('prakriti_streak', String(streakDays + 1));
    } catch { /* ignore */ }
    navigate('/time-bank');
  };

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
      {/* Header Bar */}
      <div className="relative gradient-hero text-primary-foreground py-8 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.06) 0%, transparent 55%)' }} />
        <div className="container relative">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              {(profileNodeName || appUser?.full_name) && (
                <p className="text-sm opacity-75 font-body mb-0.5">नमस्ते, {profileNodeName || appUser?.full_name} 🌿</p>
              )}
              <h1 className="font-heading text-2xl font-bold mb-0">
                {familyName ? `${familyName} Parivar` : tr('dashboardTitle')}
              </h1>
              {appUser?.kutumb_id && (
                <p className="text-[10px] opacity-50 font-body mt-0.5 font-mono">ID: {appUser.kutumb_id}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Streak counter */}
              <span className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-orange-500/80 text-white font-semibold font-body">
                <Flame className="w-3.5 h-3.5" /> {streakDays}-day streak
              </span>
              <span className="text-xs px-3 py-1.5 rounded-full bg-primary-foreground/10 border border-primary-foreground/25 text-primary-foreground font-semibold font-body backdrop-blur-sm">
                ✦ {tr(plan.nameKey as any)}
              </span>
            </div>
          </div>
        </div>
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
        <MovementBelief variant="compact" />

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

        {showDay2Hook && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-900 dark:bg-sky-950/30">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">Day-2 nudge</p>
                <h3 className="mt-1 font-heading text-lg font-bold">Join your village circle before the trail goes cold.</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connect your family to a village/community space in the next 24 hours. If you are not ready,
                  complete one missing family detail to keep discovery active.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/org/my')}
                  className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
                >
                  Join village
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/tree')}
                  className="rounded-lg border border-sky-300 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 dark:text-sky-200"
                >
                  Complete tree
                </button>
              </div>
            </div>
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

        {/* ── Pinned Score Card ── */}
        <div className="bg-card rounded-2xl shadow-elevated border border-border/50 overflow-hidden animate-fade-in">
          <div className="gradient-hero text-primary-foreground p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-body tracking-[0.2em] uppercase opacity-70 mb-1">Prakriti Score</p>
                <div className="flex items-end gap-3">
                  <span className="font-heading text-5xl font-bold">{prakritiScore?.score ?? '—'}</span>
                  {familyRank?.rank != null && (
                    <span className="text-sm font-body opacity-80 mb-1 flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" /> ▲ this week
                    </span>
                  )}
                </div>
                {familyRank && (
                  <p className="text-sm font-body opacity-80 mt-1">
                    Higher than {familyRank.top_percentile}% of families ·{' '}
                    <button onClick={() => navigate('/leaderboard')} className="underline underline-offset-2 hover:opacity-100">
                      #{familyRank.rank} in India
                    </button>
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  const url = appUser?.vansha_id ? `${window.location.origin}/green-legacy/${appUser.vansha_id}` : window.location.origin;
                  if (navigator.share) {
                    navigator.share({ title: 'My family\'s Prakriti Score', url }).catch(() => {});
                  } else {
                    navigator.clipboard.writeText(url).then(() => {}).catch(() => {});
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground text-xs font-semibold font-body transition-colors flex-shrink-0"
              >
                <Share2 className="w-3.5 h-3.5" /> Share
              </button>
            </div>
          </div>
          {/* Completeness gap */}
          <div className="px-5 py-3 bg-secondary/30 border-t border-border/40">
            <TreeCompletionScore membersUsed={membersUsed} maxNodes={plan.maxNodes} generationsUsed={generationsUsed} generationCap={plan.generationCap} size="sm" />
          </div>
        </div>

        {/* ── Daily Pulse — Today's Action ── */}
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-body text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-0.5">Today's eco-action</p>
            <p className="font-semibold font-body text-sm text-emerald-900 dark:text-white">Water a tree today → <span className="text-emerald-600">+5 Prakriti</span></p>
          </div>
          <button
            onClick={logDailyPulse}
            className="flex-shrink-0 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold font-body text-sm transition-colors"
          >
            Log it →
          </button>
          {notificationStatus !== 'on' && (
            <button
              type="button"
              onClick={enablePulseWorkflow}
              className="hidden rounded-xl border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:text-emerald-200 md:block"
            >
              Remind daily
            </button>
          )}
        </div>

        {showReactivation && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900 dark:bg-rose-950/30">
            <div className="flex items-center gap-3">
              <Flame className="h-5 w-5 shrink-0 text-rose-600" />
              <p className="flex-1 text-sm font-body text-rose-900 dark:text-rose-100">
                You missed {missedPulseDays} days of Prakriti Pulse. Restart with one small sewa today and recover the streak loop.
              </p>
              <button
                type="button"
                onClick={logDailyPulse}
                className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Restart
              </button>
            </div>
          </div>
        )}

        {/* ── Alert Strip — contextual, max 1 ── */}
        {state.nodes.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 flex items-center gap-3 animate-fade-in">
            <span className="text-xl flex-shrink-0">🪔</span>
            <p className="text-sm font-body text-amber-900 dark:text-amber-200 flex-1">
              {prakritiScore && prakritiScore.score < 30
                ? `Your tree has no voice recordings yet. Elders won't wait.`
                : `Your family's Prakriti is growing — keep the streak alive.`}
            </p>
            <button
              onClick={() => navigate('/legacy-box')}
              className="flex-shrink-0 text-xs font-semibold font-body text-amber-700 dark:text-amber-300 hover:underline whitespace-nowrap"
            >
              Record now →
            </button>
          </div>
        )}

        {/* ── Quick Actions Row — 4 icons ── */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: TreePine, label: 'View Tree', onClick: () => navigate('/tree') },
            { icon: UserPlus, label: 'Add Member', onClick: () => { const v = resolveVanshaIdForApi(null); navigate(v ? `/node?vansha_id=${encodeURIComponent(v)}` : '/node'); } },
            { icon: Leaf, label: 'Log Eco-Sewa', onClick: () => navigate('/time-bank') },
            { icon: Mic, label: 'Record Elder', onClick: () => navigate('/legacy-box') },
          ].map(({ icon: Icon, label, onClick }, i) => (
            <button
              key={label}
              onClick={onClick}
              className="flex flex-col items-center gap-2 bg-card rounded-xl p-3 shadow-card border border-border/50 hover:shadow-elevated transition-all hover:-translate-y-0.5 text-center animate-fade-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="w-10 h-10 rounded-lg gradient-hero flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary-foreground" />
              </div>
              <p className="text-xs font-semibold font-body leading-tight">{label}</p>
            </button>
          ))}
        </div>

        {/* Sales quick-access (role-gated) */}
        {isSalesMember && (
          <button
            onClick={() => navigate('/sales')}
            className="flex items-center gap-3 bg-card rounded-xl px-4 py-3 shadow-card border border-border/50 hover:shadow-elevated transition-all w-full text-left"
          >
            <div className="w-9 h-9 rounded-lg gradient-hero flex items-center justify-center flex-shrink-0">
              <BarChart3 className="w-4 h-4 text-primary-foreground" />
            </div>
            <p className="text-sm font-semibold font-body">Sales Dashboard →</p>
          </button>
        )}

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
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20 text-center">
              <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Leaf className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-xs font-semibold font-body leading-tight">Paryavaran Mitra</p>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-medium">Pending</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20 text-center">
              <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-xs font-semibold font-body leading-tight">Trust / NGO</p>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-medium">Pending</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/20 text-center">
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

      {showJoinSE && <JoinSEModal onClose={closeJoinSE} />}

      {celebrationMilestone && (
        <MilestoneCelebration
          familyName={familyName}
          milestoneKey={celebrationMilestone}
          onDismiss={dismissCelebration}
          shareUrl={appUser?.vansha_id ? `${window.location.origin}/green-legacy/${appUser.vansha_id}` : undefined}
        />
      )}
    </AppShell>
  );
};

// ── Dashboard Week Strip ──────────────────────────────────────────────────────

/**
 * Approximate tithi ID (1–30) for a date using the synodic period.
 * Reference new moon: 2000-01-06T18:14:00Z
 */
function estimateTithiForDate(dateStr: string): { tithi_id: number; paksha: Paksha } {
  const REF_NEW_MOON_MS = 946_939_440_000; // 2000-01-06T18:14:00Z
  const SYNODIC_MS = 29.530_588_67 * 86_400_000;
  const t = new Date(dateStr + 'T12:00:00Z').getTime();
  const phase = ((t - REF_NEW_MOON_MS) % SYNODIC_MS + SYNODIC_MS) % SYNODIC_MS;
  const raw = Math.floor((phase / SYNODIC_MS) * 30) + 1;
  const tithi_id = Math.min(30, Math.max(1, raw));
  const paksha: Paksha = tithi_id <= 15 ? 'shukla' : 'krishna';
  return { tithi_id, paksha };
}

/** Returns a vrat/festival label for a tithi + special_flag. */
function getVratLabel(tithi_id: number, special_flag?: string | null): string {
  if (special_flag) {
    const map: Record<string, string> = {
      ekadashi: 'एकादशी व्रत', purnima: 'पूर्णिमा', amavasya: 'अमावस्या',
      pradosh: 'प्रदोष व्रत', chaturthi: 'चतुर्थी व्रत', ashtami: 'अष्टमी',
      navami: 'नवमी', sankranti: 'संक्रांति',
    };
    if (map[special_flag]) return map[special_flag];
  }
  const tithiVrats: Record<number, string> = {
    11: 'एकादशी', 26: 'एकादशी', 15: 'पूर्णिमा', 30: 'अमावस्या',
    4: 'चतुर्थी', 19: 'चतुर्थी', 14: 'प्रदोष', 29: 'प्रदोष',
    8: 'अष्टमी', 23: 'अष्टमी',
  };
  return tithiVrats[tithi_id] ?? '';
}

function addDaysLocal(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const ECO_SEWA_ITEMS = [
  { emoji: '🌳', label: 'पेड़ लगाएं', sub: 'Plant a Tree', path: '/time-bank' },
  { emoji: '💧', label: 'जल संरक्षण', sub: 'Water Body Restoration', path: '/time-bank' },
  { emoji: '🧹', label: 'स्वच्छता अभियान', sub: 'Cleanliness Drive', path: '/time-bank' },
  { emoji: '🌾', label: 'जैविक खेती', sub: 'Organic Farming', path: '/time-bank' },
  { emoji: '🦋', label: 'वन्यजीव सेवा', sub: 'Wildlife Care', path: '/time-bank' },
];

function DashboardWeekStrip() {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [showEcoMenu, setShowEcoMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowEcoMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="border border-green-200 dark:border-green-800 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20 rounded-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-green-100 dark:border-green-900 flex items-center justify-between">
        <span className="text-xs font-semibold text-green-800 dark:text-green-300">🌿 साप्ताहिक तिथि पंचांग</span>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-green-600" />}
          {/* Commit Environmental Service CTA */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setShowEcoMenu(v => !v)}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-green-600 hover:bg-green-700 text-white transition-colors"
            >
              🌱 पर्यावरण सेवा
              <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showEcoMenu && (
              <div className="absolute right-0 top-8 z-50 w-56 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-border/60">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">स्वयं करें</p>
                </div>
                {ECO_SEWA_ITEMS.map(item => (
                  <button
                    key={item.label}
                    onClick={() => { setShowEcoMenu(false); navigate(item.path); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-secondary/60 text-left transition-colors"
                  >
                    <span className="text-base">{item.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground leading-tight">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{item.sub}</p>
                    </div>
                  </button>
                ))}
                <div className="border-t border-border/60">
                  <button
                    onClick={() => { setShowEcoMenu(false); navigate('/services'); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-primary/5 text-left transition-colors"
                  >
                    <span className="text-base">🛍️</span>
                    <div>
                      <p className="text-xs font-semibold text-primary leading-tight">Prakriti के साथ बुक करें</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">Book with Prakriti</p>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-7 divide-x divide-green-100 dark:divide-green-900/50">
        {Array.from({ length: 7 }).map((_, i) => {
          const d = addDaysLocal(weekStart, i);
          const row = rows.find(r => r.gregorian_date === d);
          const isToday = d === today;

          // Always compute tithi — use API row when available, else offline estimate
          const { tithi_id: estId, paksha: estPaksha } = estimateTithiForDate(d);
          const apiTithi_id = row?.tithi_id ?? estId;
          const apiPaksha = (row?.paksha ?? estPaksha) as Paksha;
          const tithiObj = mergeTithiWithFallback(
            row?.tithis as Record<string, unknown> | null | undefined,
            apiTithi_id,
            apiPaksha,
          );
          const tithiName = tithiObj.name_sanskrit || tithiObj.name_common || '';
          const vratLabel = getVratLabel(apiTithi_id, row?.special_flag);
          const pakshaSymbol = apiPaksha === 'shukla' ? '☀' : '🌙';

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
              {/* Tithi — always shown */}
              <span className={`text-[8px] sm:text-[9px] font-semibold leading-tight line-clamp-2 px-0.5 ${isToday ? 'text-white' : 'text-green-800 dark:text-green-300'}`}>
                {pakshaSymbol} {tithiName}
              </span>
              {/* Vrat / festival label */}
              {vratLabel && (
                <span className={`text-[7px] font-bold leading-tight px-1 py-0.5 rounded-full mt-0.5 ${isToday ? 'bg-white/20 text-white' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}`}>
                  {vratLabel}
                </span>
              )}
              {isToday && (
                <span className="text-[7px] bg-white/25 text-white rounded-full px-1 leading-tight mt-0.5">आज</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default Dashboard;
