/**
 * Samay Bank — Kutumb Map integrated time-banking.
 *
 * Features:
 *  • Two-sided marketplace (Offers + Needs)
 *  • Local (branch) + Global credits
 *  • "Simple Handshake": helper marks done → both rate → credits transfer
 *  • Double-entry zero-sum ledger with negative-balance cap
 *  • D-score diversification engine (C_final = hours × (1 + D))
 *  • Community Pillar badge if D ≥ 0.7
 *  • Manager dashboard: approval queue, private ledger toggle, flagged trades
 *  • Social worker teams (standalone branch, no vansha required)
 *  • Kutumb Map node-ID linkage
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Hourglass, Plus, Star, X, ChevronDown, Globe, Lock,
  CheckCircle, XCircle, AlertTriangle, Shield, Users,
  Clock, TrendingUp, Award, Megaphone, Wrench,
  ToggleLeft, ToggleRight, Flag,
} from 'lucide-react';
import AppShell from '@/components/shells/AppShell';
import { useLang } from '@/i18n/LanguageContext';
import { getApiBaseUrl, resolveVanshaIdForApi } from '@/services/api';
import { useTree } from '@/contexts/TreeContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SamayBranch {
  id: string; name: string; manager_id: string; vansha_id?: string;
  is_private_ledger: boolean; requires_manager_approval: boolean;
  allow_global: boolean; negative_limit_hours: number;
  my_local_balance?: number; my_role?: string;
}

interface BranchMember {
  user_id: string; display_name?: string; node_id?: string;
  role: string; local_balance: number | null;
}

interface SamayRequest {
  id: string; requester_id: string; requester_name?: string;
  request_type: 'offer' | 'need'; scope: 'local' | 'global';
  title: string; description?: string; category: string;
  hours_estimate?: number; status: string; visible_from: string;
  created_at: string;
}

interface SamayTransaction {
  id: string; request_id?: string;
  helper_id: string; helper_name?: string;
  requester_id: string; requester_name?: string;
  branch_id?: string; hours: number;
  credit_type: 'local' | 'global'; final_value?: number;
  status: 'pending' | 'assigned' | 'helper_done' | 'confirmed' | 'disputed' | 'cancelled';
  requires_manager_approval: boolean; manager_approved?: boolean;
  helper_confirmed_at?: string; requester_confirmed_at?: string;
  description?: string; is_flagged: boolean; flag_reason?: string;
  created_at: string;
  both_rated?: boolean;
}

interface SamayProfile {
  user_id: string; node_id?: string; display_name?: string;
  total_global_credits: number; total_verified_hours: number;
  avg_quality_rating: number; avg_behavior_rating: number;
  d_score: number; is_community_pillar: boolean; rating_count: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'teaching','cooking','childcare','eldercare',
  'repairs','transport','tech','admin','health','general',
];
const CAT_EMOJI: Record<string, string> = {
  teaching:'📚', cooking:'🍳', childcare:'👶', eldercare:'🤝',
  repairs:'🔧', transport:'🚗', tech:'💻', admin:'📋',
  health:'❤️', general:'⭐',
};
const STATUS_PILL: Record<string, string> = {
  pending:     'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  assigned:    'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  helper_done: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  confirmed:   'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  disputed:    'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  cancelled:   'bg-secondary text-muted-foreground',
};

// ── Auth helper ───────────────────────────────────────────────────────────────

function getToken(): string {
  try {
    for (const k of Object.keys(localStorage).filter(k => k.endsWith('-auth-token'))) {
      const p = JSON.parse(localStorage.getItem(k) || '{}');
      if (p?.access_token) return p.access_token;
    }
  } catch { /* ignore */ }
  return '';
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function minsUntilVisible(visibleFrom: string): number {
  const diff = new Date(visibleFrom).getTime() - Date.now();
  return diff > 0 ? Math.ceil(diff / 60000) : 0;
}

function StarRow({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" onClick={() => onChange?.(n)} className={onChange ? 'cursor-pointer' : 'cursor-default'}>
          <Star className={`w-5 h-5 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
        </button>
      ))}
    </div>
  );
}

function DScoreBadge({ d, pillar }: { d: number; pillar: boolean }) {
  const pct = Math.round(d * 100);
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
      pillar ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
             : 'bg-secondary text-muted-foreground'
    }`}>
      {pillar && <Award className="w-3 h-3" />}
      D {pct}%{pillar && ' · Pillar'}
    </span>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TimeBankPage() {
  const { tr } = useLang();
  const { appUser } = useAuth();
  const vanshaId = resolveVanshaIdForApi(null);
  const { state: treeState } = useTree();

  // Find user's own node ID from the tree context (best-effort)
  const myNodeId = treeState.nodes.find(n => n.id)?.id ?? null;

  const [branches, setBranches] = useState<SamayBranch[]>([]);
  const [branch, setBranch] = useState<SamayBranch | null>(null);
  const [profile, setProfile] = useState<SamayProfile | null>(null);
  const [feed, setFeed] = useState<SamayRequest[]>([]);
  const [myTxns, setMyTxns] = useState<SamayTransaction[]>([]);
  const [members, setMembers] = useState<BranchMember[]>([]);
  const [adminTxns, setAdminTxns] = useState<SamayTransaction[]>([]);
  const [flagged, setFlagged] = useState<SamayTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [tab, setTab] = useState<'feed' | 'activity' | 'admin'>('feed');
  const [feedScope, setFeedScope] = useState<'local' | 'global'>('local');
  const [feedType, setFeedType] = useState<'all' | 'offer' | 'need'>('all');
  const [feedCategory, setFeedCategory] = useState('all');
  const [showBranchMenu, setShowBranchMenu] = useState(false);

  // Modal state
  const [showNewPost, setShowNewPost] = useState(false);
  const [showCreateBranch, setShowCreateBranch] = useState(false);
  const [ratingTxn, setRatingTxn] = useState<SamayTransaction | null>(null);
  const [respondingTo, setRespondingTo] = useState<SamayRequest | null>(null);

  // New post form
  const [npType, setNpType] = useState<'offer' | 'need'>('offer');
  const [npScope, setNpScope] = useState<'local' | 'global'>('local');
  const [npTitle, setNpTitle] = useState('');
  const [npDesc, setNpDesc] = useState('');
  const [npCat, setNpCat] = useState('general');
  const [npHours, setNpHours] = useState(1);
  const [npSaving, setNpSaving] = useState(false);

  // Respond form
  const [respHours, setRespHours] = useState(1);
  const [respDesc, setRespDesc] = useState('');
  const [respSaving, setRespSaving] = useState(false);

  // Rating form
  const [rateQ, setRateQ] = useState(5);
  const [rateB, setRateB] = useState(5);
  const [rateComment, setRateComment] = useState('');
  const [rateSaving, setRateSaving] = useState(false);

  // Create branch form
  const [cbName, setCbName] = useState('');
  const [cbPrivate, setCbPrivate] = useState(false);
  const [cbApproval, setCbApproval] = useState(false);
  const [cbSaving, setCbSaving] = useState(false);

  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const api = `${getApiBaseUrl()}/api/samay`;

  // ── API functions ────────────────────────────────────────────────────────────

  const loadFeed = useCallback(async (b: SamayBranch, scope: string, type: string, cat: string) => {
    try {
      const params = new URLSearchParams({ scope, req_type: type, category: cat });
      if (scope === 'local') params.set('branch_id', b.id);
      const res = await fetch(`${api}/requests?${params}`, { headers });
      if (res.ok) setFeed(await res.json());
    } catch { /* silent */ }
  }, [api]);

  const loadMyTxns = useCallback(async (b: SamayBranch) => {
    try {
      const res = await fetch(`${api}/transactions?branch_id=${b.id}`, { headers });
      if (res.ok) setMyTxns(await res.json());
    } catch { /* silent */ }
  }, [api]);

  const loadAdminData = useCallback(async (b: SamayBranch) => {
    if (b.my_role !== 'manager') return;
    try {
      const [txnRes, flagRes, mbrRes] = await Promise.all([
        fetch(`${api}/admin/transactions?branch_id=${b.id}`, { headers }),
        fetch(`${api}/admin/flagged?branch_id=${b.id}`, { headers }),
        fetch(`${api}/branches/${b.id}/members`, { headers }),
      ]);
      if (txnRes.ok) setAdminTxns(await txnRes.json());
      if (flagRes.ok) setFlagged(await flagRes.json());
      if (mbrRes.ok) setMembers(await mbrRes.json());
    } catch { /* silent */ }
  }, [api]);

  // Boot: auto-join kutumb branch + load profile
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // 1) Auto-join kutumb branch if vansha exists
        let activeBranch: SamayBranch | null = null;
        if (vanshaId) {
          const joinRes = await fetch(`${api}/branches/auto-join`, {
            method: 'POST', headers,
            body: JSON.stringify({ vansha_id: vanshaId, node_id: myNodeId }),
          });
          if (joinRes.ok) {
            const { branch: b, member } = await joinRes.json();
            activeBranch = { ...b, my_local_balance: member?.local_balance ?? 0, my_role: member?.role ?? 'member' };
          }
        }

        // 2) Load all my branches
        const brRes = await fetch(`${api}/branches`, { headers });
        if (brRes.ok) {
          const allBranches: SamayBranch[] = await brRes.json();
          setBranches(allBranches);
          if (!activeBranch && allBranches.length > 0) activeBranch = allBranches[0];
        }

        // 3) Load profile
        const profRes = await fetch(`${api}/profile`, { headers });
        if (profRes.ok) setProfile(await profRes.json());

        if (activeBranch) {
          setBranch(activeBranch);
          await Promise.all([
            loadFeed(activeBranch, 'local', 'all', 'all'),
            loadMyTxns(activeBranch),
            loadAdminData(activeBranch),
          ]);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [vanshaId]);

  // Reload feed when filters change
  useEffect(() => {
    if (branch) loadFeed(branch, feedScope, feedType, feedCategory);
  }, [feedScope, feedType, feedCategory, branch]);

  // ── Action handlers ──────────────────────────────────────────────────────────

  async function selectBranch(b: SamayBranch) {
    setBranch(b); setShowBranchMenu(false);
    await Promise.all([loadFeed(b, feedScope, feedType, feedCategory), loadMyTxns(b), loadAdminData(b)]);
  }

  async function submitNewPost() {
    if (!npTitle.trim()) { toast({ title: tr('fillRequired'), variant: 'destructive' }); return; }
    if (npScope === 'local' && !branch) { toast({ title: tr('noVanshaId'), variant: 'destructive' }); return; }
    setNpSaving(true);
    try {
      const res = await fetch(`${api}/requests`, {
        method: 'POST', headers,
        body: JSON.stringify({
          branch_id: npScope === 'local' ? branch?.id : null,
          request_type: npType, scope: npScope,
          title: npTitle.trim(), description: npDesc || null,
          category: npCat, hours_estimate: npHours,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || tr('errorGeneric'));
      if (npScope === 'local') setFeed(prev => [data, ...prev]);
      toast({ title: npScope === 'global' ? tr('globalPostScheduled') : tr('postCreated') });
      setShowNewPost(false); setNpTitle(''); setNpDesc(''); setNpCat('general'); setNpHours(1);
    } catch (e) { toast({ title: String(e), variant: 'destructive' }); }
    finally { setNpSaving(false); }
  }

  async function submitRespond() {
    if (!respondingTo) return;
    setRespSaving(true);
    try {
      const res = await fetch(`${api}/requests/${respondingTo.id}/respond`, {
        method: 'POST', headers,
        body: JSON.stringify({ hours: respHours, description: respDesc || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || tr('errorGeneric'));
      setMyTxns(prev => [data, ...prev]);
      toast({ title: tr('requestSent') });
      setRespondingTo(null); setRespHours(1); setRespDesc('');
      if (branch) loadFeed(branch, feedScope, feedType, feedCategory);
    } catch (e) { toast({ title: String(e), variant: 'destructive' }); }
    finally { setRespSaving(false); }
  }

  async function markHelperDone(txnId: string) {
    const res = await fetch(`${api}/transactions/${txnId}`, {
      method: 'PUT', headers, body: JSON.stringify({ action: 'helper_done' }),
    });
    if (res.ok) {
      const updated = await res.json();
      setMyTxns(prev => prev.map(t => t.id === txnId ? { ...t, ...updated } : t));
      toast({ title: tr('markedDone') });
    }
  }

  async function submitRating() {
    if (!ratingTxn) return;
    setRateSaving(true);
    try {
      const res = await fetch(`${api}/transactions/${ratingTxn.id}/rate`, {
        method: 'POST', headers,
        body: JSON.stringify({ quality_rating: rateQ, behavior_rating: rateB, comment: rateComment || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || tr('errorGeneric'));
      setMyTxns(prev => prev.map(t => t.id === ratingTxn.id ? { ...t, ...data } : t));
      if (data.both_rated) {
        toast({ title: tr('creditsTransferred') });
        if (branch) loadMyTxns(branch);
      } else {
        toast({ title: tr('ratingSubmitted') });
      }
      setRatingTxn(null); setRateQ(5); setRateB(5); setRateComment('');
      // Refresh profile for updated balance
      const profRes = await fetch(`${api}/profile`, { headers });
      if (profRes.ok) setProfile(await profRes.json());
    } catch (e) { toast({ title: String(e), variant: 'destructive' }); }
    finally { setRateSaving(false); }
  }

  async function cancelTxn(txnId: string) {
    const res = await fetch(`${api}/transactions/${txnId}`, {
      method: 'PUT', headers, body: JSON.stringify({ action: 'cancel' }),
    });
    if (res.ok) {
      setMyTxns(prev => prev.map(t => t.id === txnId ? { ...t, status: 'cancelled' } : t));
      toast({ title: tr('cancelled') });
    }
  }

  async function approveTransaction(txnId: string) {
    const res = await fetch(`${api}/admin/transactions/${txnId}/approve`, { method: 'PUT', headers });
    if (res.ok) {
      toast({ title: tr('creditsTransferred') });
      if (branch) loadAdminData(branch);
    }
  }

  async function togglePrivateLedger() {
    if (!branch) return;
    const newVal = !branch.is_private_ledger;
    const res = await fetch(`${api}/branches/${branch.id}/settings`, {
      method: 'PUT', headers, body: JSON.stringify({ is_private_ledger: newVal }),
    });
    if (res.ok) {
      setBranch(prev => prev ? { ...prev, is_private_ledger: newVal } : prev);
      setBranches(prev => prev.map(b => b.id === branch.id ? { ...b, is_private_ledger: newVal } : b));
    }
  }

  async function createBranch() {
    if (!cbName.trim()) { toast({ title: tr('fillRequired'), variant: 'destructive' }); return; }
    setCbSaving(true);
    try {
      const res = await fetch(`${api}/branches`, {
        method: 'POST', headers,
        body: JSON.stringify({
          name: cbName.trim(), is_private_ledger: cbPrivate,
          requires_manager_approval: cbApproval, allow_global: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || tr('errorGeneric'));
      const newBranch: SamayBranch = { ...data, my_local_balance: 0, my_role: 'manager' };
      setBranches(prev => [...prev, newBranch]);
      await selectBranch(newBranch);
      setShowCreateBranch(false); setCbName(''); setCbPrivate(false); setCbApproval(false);
      toast({ title: tr('branchCreated') });
    } catch (e) { toast({ title: String(e), variant: 'destructive' }); }
    finally { setCbSaving(false); }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const userId = appUser?.id ?? '';

  // Transactions where I need to act: helper_done means either party must rate
  const actionNeeded = myTxns.filter(t => t.status === 'helper_done');

  const inProgress = myTxns.filter(t => ['pending','assigned'].includes(t.status));
  const history = myTxns.filter(t => ['confirmed','cancelled','disputed'].includes(t.status));

  const isManager = branch?.my_role === 'manager';
  const pendingApproval = adminTxns.filter(t => t.requires_manager_approval && !t.manager_approved && t.status === 'helper_done');

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppShell>
        <div className="container py-20 text-center">
          <Hourglass className="w-10 h-10 text-primary mx-auto mb-3 animate-spin" />
          <p className="text-sm text-muted-foreground font-body">{tr('loading')}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* ── Header ── */}
      <div className="relative gradient-hero text-primary-foreground py-6 overflow-hidden">
        <div className="container">
          <div className="flex items-center justify-between gap-4 mb-1">
            <div className="flex items-center gap-2">
              <Hourglass className="w-6 h-6" />
              <h1 className="font-heading text-2xl font-bold">Samay Bank</h1>
            </div>
            {/* Branch selector */}
            <div className="relative">
              <button onClick={() => setShowBranchMenu(!showBranchMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-foreground/15 text-xs font-semibold hover:bg-primary-foreground/25 transition-colors">
                {branch?.name ?? tr('selectBranch')}
                <ChevronDown className="w-3 h-3" />
              </button>
              {showBranchMenu && (
                <div className="absolute right-0 top-full mt-1 z-30 bg-card border border-border rounded-xl shadow-2xl min-w-[200px] overflow-hidden">
                  {branches.map(b => (
                    <button key={b.id} onClick={() => selectBranch(b)}
                      className={`w-full text-left px-4 py-2.5 text-sm font-body hover:bg-secondary/50 transition-colors ${b.id === branch?.id ? 'text-primary font-semibold' : ''}`}>
                      {b.name}
                      {b.vansha_id && <span className="ml-1 text-[10px] text-muted-foreground">· kutumb</span>}
                    </button>
                  ))}
                  <hr className="border-border/50" />
                  <button onClick={() => { setShowBranchMenu(false); setShowCreateBranch(true); }}
                    className="w-full text-left px-4 py-2.5 text-sm font-body text-primary hover:bg-secondary/50 flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> {tr('createTeamBranch')}
                  </button>
                </div>
              )}
            </div>
          </div>
          <p className="text-sm opacity-70 font-body">{tr('samayBankSubtitle')}</p>
        </div>
      </div>

      <div className="container py-6 space-y-5">

        {/* ── My Trust Card / Balance ── */}
        {profile && (
          <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-card">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="font-heading font-bold">{profile.display_name ?? tr('myProfile')}</span>
                  {profile.is_community_pillar && <DScoreBadge d={profile.d_score} pillar />}
                  {!profile.is_community_pillar && profile.d_score > 0 && <DScoreBadge d={profile.d_score} pillar={false} />}
                </div>
                {profile.rating_count > 0 && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground font-body">
                    <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-400 fill-amber-400" />{tr('quality')} {profile.avg_quality_rating.toFixed(1)}</span>
                    <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-blue-400" />{tr('behaviour')} {profile.avg_behavior_rating.toFixed(1)}</span>
                    <span>({profile.rating_count} {tr('ratings')})</span>
                  </div>
                )}
              </div>
              <button onClick={() => setShowNewPost(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg gradient-hero text-primary-foreground text-sm font-semibold shadow-warm hover:opacity-90 flex-shrink-0">
                <Plus className="w-4 h-4" /> {tr('newPost')}
              </button>
            </div>

            {/* Balance row */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="bg-secondary/40 rounded-xl p-3 text-center">
                <p className="text-lg font-bold font-heading text-primary">{(branch?.my_local_balance ?? 0).toFixed(1)}h</p>
                <p className="text-[10px] text-muted-foreground font-body">{tr('localBalance')}</p>
              </div>
              <div className="bg-secondary/40 rounded-xl p-3 text-center">
                <p className="text-lg font-bold font-heading text-green-600">{profile.total_global_credits.toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground font-body">{tr('globalCredits')}</p>
              </div>
              <div className="bg-secondary/40 rounded-xl p-3 text-center">
                <p className="text-lg font-bold font-heading">{profile.total_verified_hours.toFixed(1)}h</p>
                <p className="text-[10px] text-muted-foreground font-body">{tr('totalGiven')}</p>
              </div>
            </div>
          </div>
        )}

        {!branch && !loading && (
          <div className="bg-card rounded-xl p-8 text-center border border-border/50">
            <Hourglass className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-heading font-bold mb-1">{tr('noBranchYet')}</p>
            <p className="text-sm text-muted-foreground font-body mb-4">{tr('noBranchDesc')}</p>
            <button onClick={() => setShowCreateBranch(true)}
              className="px-5 py-2.5 rounded-xl gradient-hero text-primary-foreground font-semibold text-sm shadow-warm hover:opacity-90">
              {tr('createTeamBranch')}
            </button>
          </div>
        )}

        {branch && (
          <>
            {/* ── Tab bar ── */}
            <div className="flex gap-1 bg-secondary/50 rounded-lg p-1">
              {(['feed','activity', ...(isManager ? ['admin'] : [])] as const).map(t => (
                <button key={t} onClick={() => setTab(t as typeof tab)}
                  className={`flex-1 py-2 rounded-md text-sm font-semibold font-body transition-all relative ${
                    tab === t ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
                  }`}>
                  {t === 'feed' ? tr('feed') : t === 'activity' ? tr('activity') : tr('adminTab')}
                  {t === 'activity' && myTxns.filter(x => x.status === 'helper_done').length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-destructive rounded-full" />
                  )}
                  {t === 'admin' && pendingApproval.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full" />
                  )}
                </button>
              ))}
            </div>

            {/* ══════════════ FEED TAB ══════════════ */}
            {tab === 'feed' && (
              <div className="space-y-4">
                {/* Scope + type filters */}
                <div className="flex gap-2 flex-wrap">
                  <div className="flex gap-1 bg-secondary/50 rounded-lg p-1">
                    {(['local','global'] as const).map(s => (
                      <button key={s} onClick={() => setFeedScope(s)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          feedScope === s ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
                        }`}>
                        {s === 'local' ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                        {s === 'local' ? tr('local') : tr('global')}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1 bg-secondary/50 rounded-lg p-1">
                    {(['all','offer','need'] as const).map(tp => (
                      <button key={tp} onClick={() => setFeedType(tp)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          feedType === tp ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
                        }`}>
                        {tp === 'all' ? tr('all') : tp === 'offer' ? tr('offers') : tr('needs')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category pills */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                  {['all', ...CATEGORIES].map(c => (
                    <button key={c} onClick={() => setFeedCategory(c)}
                      className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        feedCategory === c ? 'gradient-hero text-primary-foreground shadow-warm' : 'bg-secondary text-foreground hover:bg-secondary/80'
                      }`}>
                      {c !== 'all' && <span>{CAT_EMOJI[c]}</span>}
                      {c === 'all' ? tr('all') : c}
                    </button>
                  ))}
                </div>

                {/* Feed cards */}
                {feed.length === 0 ? (
                  <div className="bg-card rounded-xl p-8 text-center border border-border/50">
                    <Users className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground font-body">{tr('noPostsYet')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {feed.map(req => {
                      const minsLeft = minsUntilVisible(req.visible_from);
                      const isOwn = req.requester_id === userId;
                      const isOffer = req.request_type === 'offer';
                      return (
                        <div key={req.id} className={`bg-card rounded-xl p-4 border shadow-card ${
                          isOffer ? 'border-green-200 dark:border-green-900/30' : 'border-blue-200 dark:border-blue-900/30'
                        }`}>
                          <div className="flex items-start gap-3">
                            <span className="text-2xl flex-shrink-0">{CAT_EMOJI[req.category] || '⭐'}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                  isOffer ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300'
                                          : 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                                }`}>
                                  {isOffer ? `🙋 ${tr('canHelp')}` : `🙏 ${tr('needsHelp')}`}
                                </span>
                                {req.scope === 'global' && <Globe className="w-3 h-3 text-muted-foreground" />}
                              </div>
                              <p className="font-semibold font-body text-sm">{req.title}</p>
                              <p className="text-xs text-muted-foreground font-body">
                                {req.requester_name}
                                {req.hours_estimate && ` · ${req.hours_estimate}h est.`}
                              </p>
                              {req.description && (
                                <p className="text-xs text-muted-foreground font-body mt-1 line-clamp-2">{req.description}</p>
                              )}
                            </div>
                            {!isOwn && (
                              minsLeft > 0 ? (
                                <div className="flex-shrink-0 text-right">
                                  <span className="text-[10px] text-muted-foreground font-body flex items-center gap-1">
                                    <Clock className="w-3 h-3" />{tr('opensIn')} {minsLeft}m
                                  </span>
                                </div>
                              ) : (
                                <button onClick={() => { setRespondingTo(req); setRespHours(req.hours_estimate ?? 1); }}
                                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-primary-foreground shadow-warm hover:opacity-90 transition-opacity ${
                                    isOffer ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-500 hover:bg-blue-600'
                                  }`}>
                                  {isOffer ? tr('requestHelp') : tr('offerHelp')}
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ══════════════ ACTIVITY TAB ══════════════ */}
            {tab === 'activity' && (
              <div className="space-y-6">
                {/* Needs action */}
                {myTxns.filter(t => t.status === 'helper_done').length > 0 && (
                  <div>
                    <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2 text-destructive">
                      <AlertTriangle className="w-4 h-4" /> {tr('needsYourAction')}
                    </h3>
                    <div className="space-y-3">
                      {myTxns.filter(t => t.status === 'helper_done').map(t => {
                        const iAmHelper = t.helper_id === userId;
                        const partner = iAmHelper ? t.requester_name : t.helper_name;
                        return (
                          <div key={t.id} className="bg-card rounded-xl p-4 border border-destructive/20 shadow-card">
                            <p className="font-semibold font-body text-sm mb-1">
                              {iAmHelper ? `${tr('waitingFor')} ${partner} ${tr('toConfirm')}` : `${partner} ${tr('markedWorkDone')}`}
                            </p>
                            <p className="text-xs text-muted-foreground font-body mb-3">{t.hours}h · {t.credit_type}</p>
                            <div className="flex gap-2">
                              <button onClick={() => setRatingTxn(t)}
                                className="flex-1 py-2 rounded-lg gradient-hero text-primary-foreground text-xs font-bold shadow-warm hover:opacity-90">
                                <Star className="w-3 h-3 inline mr-1" />
                                {iAmHelper ? tr('rateNow') : tr('confirmAndRate')}
                              </button>
                              <button onClick={() => cancelTxn(t.id)}
                                className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20">
                                {tr('dispute')}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* In progress */}
                {inProgress.length > 0 && (
                  <div>
                    <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" /> {tr('inProgress')}
                    </h3>
                    <div className="space-y-3">
                      {inProgress.map(t => {
                        const iAmHelper = t.helper_id === userId;
                        return (
                          <div key={t.id} className="bg-card rounded-xl p-4 border border-border/50 shadow-card flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold font-body text-sm">
                                {iAmHelper ? `${tr('helpingLabel')} ${t.requester_name}` : `${t.helper_name} ${tr('helpingYou')}`}
                              </p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_PILL[t.status]}`}>{t.status}</span>
                                <span className="text-xs text-muted-foreground font-body">{t.hours}h</span>
                                {t.is_flagged && <span className="text-[10px] text-destructive flex items-center gap-0.5"><Flag className="w-2.5 h-2.5" /> {tr('flagged')}</span>}
                              </div>
                            </div>
                            <div className="flex gap-1.5 flex-shrink-0">
                              {iAmHelper && t.status === 'assigned' && (
                                <button onClick={() => markHelperDone(t.id)}
                                  className="px-3 py-1.5 rounded-lg bg-green-100 dark:bg-green-950/40 text-green-700 text-xs font-bold">
                                  <CheckCircle className="w-3.5 h-3.5 inline mr-1" />{tr('markDone')}
                                </button>
                              )}
                              <button onClick={() => cancelTxn(t.id)}
                                className="p-1.5 rounded-lg bg-secondary text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                                <XCircle className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* History */}
                {history.length > 0 && (
                  <div>
                    <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" /> {tr('history')}
                    </h3>
                    <div className="space-y-2">
                      {history.map(t => (
                        <div key={t.id} className="bg-card rounded-xl p-3 border border-border/40 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-body font-semibold">
                              {t.helper_id === userId ? `${tr('gaveTo')} ${t.requester_name}` : `${tr('receivedFrom')} ${t.helper_name}`}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_PILL[t.status]}`}>{t.status}</span>
                              <span className="text-xs text-muted-foreground font-body">{t.hours}h</span>
                              {t.final_value && t.final_value !== t.hours && (
                                <span className="text-xs text-green-600 font-semibold">→ {t.final_value.toFixed(2)} credits</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {myTxns.length === 0 && (
                  <div className="bg-card rounded-xl p-8 text-center border border-border/50">
                    <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground font-body">{tr('noActivityYet')}</p>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════ ADMIN TAB ══════════════ */}
            {tab === 'admin' && isManager && (
              <div className="space-y-6">
                {/* Settings row */}
                <div className="bg-card rounded-xl p-4 border border-border/50 shadow-card space-y-3">
                  <h3 className="font-heading font-bold text-sm">{tr('branchSettings')}</h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-body font-semibold">{tr('privateLedger')}</p>
                      <p className="text-xs text-muted-foreground font-body">{tr('privateLedgerDesc')}</p>
                    </div>
                    <button onClick={togglePrivateLedger}>
                      {branch.is_private_ledger
                        ? <ToggleRight className="w-8 h-8 text-primary" />
                        : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-body font-semibold">{tr('requireApproval')}</p>
                      <p className="text-xs text-muted-foreground font-body">{tr('requireApprovalDesc')}</p>
                    </div>
                    <button onClick={async () => {
                      const newVal = !branch.requires_manager_approval;
                      const res = await fetch(`${api}/branches/${branch.id}/settings`, {
                        method: 'PUT', headers, body: JSON.stringify({ requires_manager_approval: newVal }),
                      });
                      if (res.ok) setBranch(prev => prev ? { ...prev, requires_manager_approval: newVal } : prev);
                    }}>
                      {branch.requires_manager_approval
                        ? <ToggleRight className="w-8 h-8 text-primary" />
                        : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
                    </button>
                  </div>
                </div>

                {/* Pending approval queue */}
                {pendingApproval.length > 0 && (
                  <div>
                    <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2 text-amber-600">
                      <Megaphone className="w-4 h-4" /> {tr('pendingApproval')} ({pendingApproval.length})
                    </h3>
                    <div className="space-y-3">
                      {pendingApproval.map(t => (
                        <div key={t.id} className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold font-body">{t.helper_name} → {t.requester_name}</p>
                            <p className="text-xs text-muted-foreground font-body">{t.hours}h · {t.description || '—'}</p>
                          </div>
                          <button onClick={() => approveTransaction(t.id)}
                            className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-green-500 text-white text-xs font-bold hover:bg-green-600">
                            <CheckCircle className="w-3.5 h-3.5 inline mr-1" />{tr('approve')}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Member balances */}
                {members.length > 0 && (
                  <div>
                    <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" /> {tr('memberBalances')}
                    </h3>
                    <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
                      {members.map((m, i) => (
                        <div key={m.user_id} className={`flex items-center px-4 py-3 gap-3 ${i < members.length - 1 ? 'border-b border-border/40' : ''}`}>
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0">
                            {(m.display_name || 'M').charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold font-body">{m.display_name || tr('member')}</p>
                            {m.node_id && <p className="text-[10px] text-muted-foreground font-body">node: {m.node_id}</p>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            {m.local_balance !== null
                              ? <p className={`font-bold font-heading text-sm ${m.local_balance >= 0 ? 'text-green-600' : 'text-destructive'}`}>{m.local_balance >= 0 ? '+' : ''}{m.local_balance}h</p>
                              : <p className="text-xs text-muted-foreground font-body italic">{tr('hidden')}</p>
                            }
                            <p className="text-[10px] text-muted-foreground font-body">{m.role}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Flagged trades */}
                {flagged.length > 0 && (
                  <div>
                    <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2 text-destructive">
                      <Flag className="w-4 h-4" /> {tr('flaggedTrades')} ({flagged.length})
                    </h3>
                    <div className="space-y-2">
                      {flagged.map(t => (
                        <div key={t.id} className="bg-card rounded-xl p-3 border border-destructive/30 flex items-center gap-3">
                          <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-body font-semibold">{t.helper_name} → {t.requester_name}</p>
                            <p className="text-xs text-muted-foreground font-body">{t.flag_reason} · {t.hours}h · {t.status}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* All transactions audit trail */}
                {adminTxns.length > 0 && (
                  <div>
                    <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-primary" /> {tr('auditTrail')} ({adminTxns.length})
                    </h3>
                    <div className="space-y-2">
                      {adminTxns.map(t => (
                        <div key={t.id} className="bg-card rounded-xl p-3 border border-border/40 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-body">{t.helper_name} → {t.requester_name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_PILL[t.status]}`}>{t.status}</span>
                              <span className="text-xs text-muted-foreground font-body">{t.hours}h</span>
                              {t.is_flagged && <Flag className="w-3 h-3 text-destructive" />}
                            </div>
                          </div>
                          {t.requires_manager_approval && !t.manager_approved && t.status === 'helper_done' && (
                            <button onClick={() => approveTransaction(t.id)}
                              className="flex-shrink-0 px-2 py-1 rounded bg-green-100 dark:bg-green-950/40 text-green-700 text-xs font-bold">
                              {tr('approve')}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══════════════════ MODALS ═══════════════════ */}

      {/* New Post Modal */}
      {showNewPost && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border/50 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 sticky top-0 bg-card">
              <h3 className="font-heading font-bold">{tr('newPost')}</h3>
              <button onClick={() => setShowNewPost(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Type */}
              <div>
                <label className="block text-xs font-medium mb-2">{tr('postType')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['offer','need'] as const).map(tp => (
                    <button key={tp} onClick={() => setNpType(tp)}
                      className={`py-3 rounded-xl text-sm font-bold transition-all ${
                        npType === tp ? 'gradient-hero text-primary-foreground shadow-warm' : 'bg-secondary text-foreground'
                      }`}>
                      {tp === 'offer' ? `🙋 ${tr('iCanHelp')}` : `🙏 ${tr('iNeedHelp')}`}
                    </button>
                  ))}
                </div>
              </div>
              {/* Scope */}
              <div>
                <label className="block text-xs font-medium mb-2">{tr('visibility')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['local','global'] as const).map(s => (
                    <button key={s} onClick={() => setNpScope(s)}
                      className={`py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        npScope === s ? 'gradient-hero text-primary-foreground shadow-warm' : 'bg-secondary text-foreground'
                      }`}>
                      {s === 'local' ? <Lock className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                      {s === 'local' ? tr('local') : tr('global')}
                    </button>
                  ))}
                </div>
                {npScope === 'global' && (
                  <p className="text-[10px] text-muted-foreground font-body mt-1.5">
                    ⏱ {tr('globalDelay30')}
                  </p>
                )}
              </div>
              {/* Category */}
              <div>
                <label className="block text-xs font-medium mb-2">{tr('category')}</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {CATEGORIES.map(c => (
                    <button key={c} onClick={() => setNpCat(c)}
                      className={`flex flex-col items-center gap-0.5 p-2 rounded-lg text-center transition-all ${
                        npCat === c ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/50 hover:bg-secondary'
                      }`}>
                      <span className="text-base">{CAT_EMOJI[c]}</span>
                      <span className="text-[9px] font-body leading-tight">{c}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* Title */}
              <div>
                <label className="block text-xs font-medium mb-1.5">{tr('title')}</label>
                <input value={npTitle} onChange={e => setNpTitle(e.target.value)} maxLength={200}
                  placeholder={npType === 'offer' ? tr('offerTitlePlaceholder') : tr('needTitlePlaceholder')}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              {/* Hours */}
              <div>
                <label className="block text-xs font-medium mb-1.5">{tr('hoursEstimate')}: {npHours}h</label>
                <input type="range" min={0.5} max={20} step={0.5} value={npHours} onChange={e => setNpHours(Number(e.target.value))} className="w-full accent-primary" />
              </div>
              {/* Description */}
              <div>
                <label className="block text-xs font-medium mb-1.5">{tr('description')} <span className="text-muted-foreground font-normal">(optional)</span></label>
                <textarea value={npDesc} onChange={e => setNpDesc(e.target.value)} rows={3} maxLength={1000}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border/50 flex gap-3">
              <button onClick={() => setShowNewPost(false)} className="flex-1 py-2.5 rounded-lg border border-border text-sm font-body">{tr('cancel')}</button>
              <button onClick={submitNewPost} disabled={npSaving}
                className="flex-1 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold text-sm shadow-warm hover:opacity-90 disabled:opacity-50">
                {npSaving ? tr('posting') : tr('post')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Respond to Post Modal */}
      {respondingTo && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-sm rounded-2xl shadow-2xl border border-border/50">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
              <h3 className="font-heading font-bold">{respondingTo.request_type === 'offer' ? tr('requestHelp') : tr('offerHelp')}</h3>
              <button onClick={() => setRespondingTo(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-secondary/30 rounded-xl p-3">
                <p className="text-sm font-semibold font-body">{respondingTo.title}</p>
                <p className="text-xs text-muted-foreground font-body">{respondingTo.requester_name} · {CAT_EMOJI[respondingTo.category]} {respondingTo.category}</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">{tr('hoursRequested')}: {respHours}h</label>
                <input type="range" min={0.5} max={respondingTo.hours_estimate ?? 20} step={0.5} value={respHours} onChange={e => setRespHours(Number(e.target.value))} className="w-full accent-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">{tr('notes')} <span className="text-muted-foreground font-normal">(optional)</span></label>
                <textarea value={respDesc} onChange={e => setRespDesc(e.target.value)} rows={2} maxLength={500}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border/50 flex gap-3">
              <button onClick={() => setRespondingTo(null)} className="flex-1 py-2.5 rounded-lg border border-border text-sm font-body">{tr('cancel')}</button>
              <button onClick={submitRespond} disabled={respSaving}
                className="flex-1 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold text-sm shadow-warm hover:opacity-90 disabled:opacity-50">
                {respSaving ? tr('sending') : tr('sendRequest')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rate & Confirm Modal */}
      {ratingTxn && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-sm rounded-2xl shadow-2xl border border-border/50">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
              <h3 className="font-heading font-bold">{tr('rateAndConfirm')}</h3>
              <button onClick={() => setRatingTxn(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div className="bg-secondary/30 rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground font-body mb-1">{tr('ratingPartner')}</p>
                <p className="font-semibold font-body">{ratingTxn.helper_id === userId ? ratingTxn.requester_name : ratingTxn.helper_name}</p>
                <p className="text-xs text-muted-foreground font-body">{ratingTxn.hours}h · {ratingTxn.credit_type}</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-2">{tr('workQuality')}</label>
                <StarRow value={rateQ} onChange={setRateQ} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-2">{tr('behaviour')}</label>
                <StarRow value={rateB} onChange={setRateB} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">{tr('comment')} <span className="text-muted-foreground font-normal">(optional)</span></label>
                <textarea value={rateComment} onChange={e => setRateComment(e.target.value)} rows={2} maxLength={500}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <p className="text-[10px] text-muted-foreground font-body">{tr('bothRateNote')}</p>
            </div>
            <div className="px-6 py-4 border-t border-border/50 flex gap-3">
              <button onClick={() => setRatingTxn(null)} className="flex-1 py-2.5 rounded-lg border border-border text-sm font-body">{tr('cancel')}</button>
              <button onClick={submitRating} disabled={rateSaving}
                className="flex-1 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold text-sm shadow-warm hover:opacity-90 disabled:opacity-50">
                {rateSaving ? tr('saving') : tr('submitRating')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Branch Modal */}
      {showCreateBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-sm rounded-2xl shadow-2xl border border-border/50">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
              <h3 className="font-heading font-bold">{tr('createTeamBranch')}</h3>
              <button onClick={() => setShowCreateBranch(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5">{tr('branchName')}</label>
                <input value={cbName} onChange={e => setCbName(e.target.value)} maxLength={100}
                  placeholder={tr('branchNamePlaceholder')}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={cbPrivate} onChange={e => setCbPrivate(e.target.checked)} className="accent-primary" />
                <span className="text-sm font-body">{tr('privateLedger')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={cbApproval} onChange={e => setCbApproval(e.target.checked)} className="accent-primary" />
                <span className="text-sm font-body">{tr('requireApproval')}</span>
              </label>
              <p className="text-[10px] text-muted-foreground font-body">{tr('socialWorkerNote')}</p>
            </div>
            <div className="px-6 py-4 border-t border-border/50 flex gap-3">
              <button onClick={() => setShowCreateBranch(false)} className="flex-1 py-2.5 rounded-lg border border-border text-sm font-body">{tr('cancel')}</button>
              <button onClick={createBranch} disabled={cbSaving}
                className="flex-1 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold text-sm shadow-warm hover:opacity-90 disabled:opacity-50">
                {cbSaving ? tr('creating') : tr('create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
