/**
 * Sewa Chakra — Kutumb Map's community service exchange.
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
  Heart, Plus, Star, X, ChevronDown, Globe, Lock,
  CheckCircle, XCircle, AlertTriangle, Shield, Users,
  Clock, TrendingUp, Award, Megaphone, Wrench,
  ToggleLeft, ToggleRight, Flag, Sparkles,
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
  pending:     'bg-amber-100 text-amber-700',
  assigned:    'bg-blue-100 text-blue-700',
  helper_done: 'bg-purple-100 text-purple-700',
  confirmed:   'bg-green-100 text-green-700',
  disputed:    'bg-red-100 text-red-700',
  cancelled:   'bg-secondary text-muted-foreground',
};

const USE_CASES = [
  { emoji: '📚', title: 'Teach a skill',   desc: 'Share coding, cooking, music, or language — earn Sewa Credits in return.' },
  { emoji: '🤝', title: 'Help an elder',   desc: 'Assist a senior with errands, tech support, or companionship.' },
  { emoji: '👶', title: 'Childcare swap',  desc: 'Two families take turns babysitting. No money — just mutual Sewa.' },
  { emoji: '🔧', title: 'Fix & repair',    desc: 'Offer plumbing, carpentry or electrical help. Your skills matter.' },
  { emoji: '🚗', title: 'Ride share',      desc: 'Going somewhere? Offer a seat. Someone helps you next time.' },
  { emoji: '💻', title: 'Tech support',    desc: 'Help a neighbour with their phone, Wi-Fi, or digital banking.' },
];

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
      pillar ? 'bg-amber-100 text-amber-700' : 'bg-secondary text-muted-foreground'
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

  const [tab, setTab] = useState<'feed' | 'activity' | 'admin'>('feed');
  const [feedScope, setFeedScope] = useState<'local' | 'global'>('local');
  const [feedType, setFeedType] = useState<'all' | 'offer' | 'need'>('all');
  const [feedCategory, setFeedCategory] = useState('all');
  const [showBranchMenu, setShowBranchMenu] = useState(false);

  const [showNewPost, setShowNewPost] = useState(false);
  const [showCreateBranch, setShowCreateBranch] = useState(false);
  const [ratingTxn, setRatingTxn] = useState<SamayTransaction | null>(null);
  const [respondingTo, setRespondingTo] = useState<SamayRequest | null>(null);

  const [npType, setNpType] = useState<'offer' | 'need'>('offer');
  const [npScope, setNpScope] = useState<'local' | 'global'>('local');
  const [npTitle, setNpTitle] = useState('');
  const [npDesc, setNpDesc] = useState('');
  const [npCat, setNpCat] = useState('general');
  const [npHours, setNpHours] = useState(1);
  const [npSaving, setNpSaving] = useState(false);

  const [respHours, setRespHours] = useState(1);
  const [respDesc, setRespDesc] = useState('');
  const [respSaving, setRespSaving] = useState(false);

  const [rateQ, setRateQ] = useState(5);
  const [rateB, setRateB] = useState(5);
  const [rateComment, setRateComment] = useState('');
  const [rateSaving, setRateSaving] = useState(false);

  const [cbName, setCbName] = useState('');
  const [cbPrivate, setCbPrivate] = useState(false);
  const [cbApproval, setCbApproval] = useState(false);
  const [cbSaving, setCbSaving] = useState(false);

  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const api = `${getApiBaseUrl()}/api/samay`;

  // ── API ──────────────────────────────────────────────────────────────────────

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

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
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

        const brRes = await fetch(`${api}/branches`, { headers });
        if (brRes.ok) {
          const allBranches: SamayBranch[] = await brRes.json();
          setBranches(allBranches);
          if (!activeBranch && allBranches.length > 0) activeBranch = allBranches[0];
        }

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

  useEffect(() => {
    if (branch) loadFeed(branch, feedScope, feedType, feedCategory);
  }, [feedScope, feedType, feedCategory, branch]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

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

  // ── Derived ───────────────────────────────────────────────────────────────────

  const userId = appUser?.id ?? '';
  const inProgress = myTxns.filter(t => ['pending','assigned'].includes(t.status));
  const history = myTxns.filter(t => ['confirmed','cancelled','disputed'].includes(t.status));
  const isManager = branch?.my_role === 'manager';
  const pendingApproval = adminTxns.filter(t => t.requires_manager_approval && !t.manager_approved && t.status === 'helper_done');

  // ── Loading ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl gradient-hero flex items-center justify-center mb-5 shadow-warm">
            <Clock className="w-8 h-8 text-white animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground font-body">{tr('loading')}</p>
        </div>
      </AppShell>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <AppShell>

      {/* ══════════════════════════════════════
          HERO
      ══════════════════════════════════════ */}
      <div className="relative overflow-hidden gradient-hero">

        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
          <div className="absolute -top-28 -right-28 w-[420px] h-[420px] rounded-full border border-white/[0.06]" />
          <div className="absolute -top-12 -right-12 w-[240px] h-[240px] rounded-full border border-white/[0.04]" />
          <div className="absolute top-1/2 -left-32 w-[360px] h-[360px] rounded-full border border-white/[0.04]" />
          <div className="absolute bottom-0 left-[15%] w-px h-40 bg-gradient-to-t from-amber-400/0 via-amber-400/20 to-amber-400/0" />
          <div className="absolute bottom-0 left-[55%] w-px h-56 bg-gradient-to-t from-amber-400/0 via-amber-400/18 to-amber-400/0" />
          <div className="absolute bottom-0 left-[80%] w-px h-32 bg-gradient-to-t from-amber-400/0 via-amber-400/15 to-amber-400/0" />
          <div className="absolute -bottom-2 right-4 font-heading text-[100px] leading-none text-white/[0.03] select-none">सेवा</div>
        </div>

        <div className="relative container px-4 pt-8 pb-6">

          {/* ── Title row + branch selector ── */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-8 h-8 gradient-gold rounded-lg flex items-center justify-center shadow-gold flex-shrink-0">
                  <Heart className="w-4 h-4 text-white" />
                </div>
                <h1 className="font-heading text-2xl sm:text-3xl font-bold text-white">Sewa Chakra</h1>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-body font-bold tracking-widest border border-amber-400/30">
                  LIVE
                </span>
              </div>
              <p className="text-white/60 font-body text-sm">
                Give your time · Gain community trust · Grow together
              </p>
            </div>

            {/* Branch selector */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowBranchMenu(!showBranchMenu)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white text-xs font-semibold hover:bg-white/[0.18] transition border border-white/20 backdrop-blur-sm"
              >
                {branch?.name ?? tr('selectBranch')}
                <ChevronDown className="w-3 h-3" />
              </button>
              {showBranchMenu && (
                <div className="absolute right-0 top-full mt-1 z-30 bg-card border border-border rounded-2xl shadow-elevated min-w-[200px] overflow-hidden">
                  {branches.map(b => (
                    <button
                      key={b.id}
                      onClick={() => selectBranch(b)}
                      className={`w-full text-left px-4 py-2.5 text-sm font-body hover:bg-secondary/50 transition-colors ${b.id === branch?.id ? 'text-primary font-semibold' : ''}`}
                    >
                      {b.name}
                      {b.vansha_id && <span className="ml-1 text-[10px] text-muted-foreground">· kutumb</span>}
                    </button>
                  ))}
                  <div className="border-t border-border/50" />
                  <button
                    onClick={() => { setShowBranchMenu(false); setShowCreateBranch(true); }}
                    className="w-full text-left px-4 py-2.5 text-sm font-body text-primary hover:bg-secondary/50 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> {tr('createTeamBranch')}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Concept pills ── */}
          <div className="flex flex-wrap gap-2 mb-6">
            {[
              { icon: '🤝', text: 'Give your time, gain trust' },
              { icon: '⚡', text: 'Every sewa earns verified credits' },
              { icon: '🌀', text: 'Karma made measurable' },
            ].map((p, i) => (
              <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-white/85 text-xs font-body backdrop-blur-sm">
                <span>{p.icon}</span>{p.text}
              </div>
            ))}
          </div>

          {/* ── Sewa Identity Card ── */}
          {appUser && (
            <div
              className="rounded-2xl border border-white/20 shadow-warm overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(14px)' }}
            >
              <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-5">
                {/* Identity */}
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] tracking-[0.25em] uppercase text-white/45 font-body mb-0.5">
                    Sewa Chakra Member
                  </p>
                  <p className="font-heading text-xl font-bold text-white tracking-wide truncate">
                    {profile?.display_name ?? appUser.full_name ?? 'Member'}
                  </p>
                  <p className="text-[11px] text-amber-300/70 font-mono tracking-widest mt-0.5">
                    {appUser.kutumb_id ?? appUser.id.slice(0, 10).toUpperCase()}
                  </p>
                  {profile?.is_community_pillar && (
                    <span className="inline-flex items-center gap-1 mt-2 text-[10px] px-2.5 py-0.5 rounded-full bg-amber-300/20 text-amber-300 font-bold border border-amber-300/30">
                      <Award className="w-3 h-3" /> Community Pillar
                    </span>
                  )}
                </div>

                {/* Balances */}
                <div className="flex gap-5 sm:border-l sm:border-white/20 sm:pl-6">
                  <div className="text-center">
                    <p className="font-heading text-2xl font-bold text-white">
                      {(branch?.my_local_balance ?? 0).toFixed(1)}
                    </p>
                    <p className="text-[10px] text-white/45 font-body uppercase tracking-wider">Local hrs</p>
                  </div>
                  <div className="text-center">
                    <p className="font-heading text-2xl font-bold text-amber-300">
                      {(profile?.total_global_credits ?? 0).toFixed(1)}
                    </p>
                    <p className="text-[10px] text-white/45 font-body uppercase tracking-wider">Global credits</p>
                  </div>
                  {profile && profile.rating_count > 0 && (
                    <div className="text-center">
                      <p className="font-heading text-2xl font-bold text-green-300">
                        {profile.avg_quality_rating.toFixed(1)}
                      </p>
                      <p className="text-[10px] text-white/45 font-body uppercase tracking-wider">Avg rating</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── CTA bar ── */}
          <div className="flex flex-wrap gap-3 mt-5">
            <button
              onClick={() => setShowNewPost(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-gold text-white font-semibold font-body text-sm hover:opacity-90 transition shadow-gold"
            >
              <Sparkles className="w-4 h-4" /> Post a Sewa
            </button>
            <button
              onClick={() => setTab('activity')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white font-semibold font-body text-sm hover:bg-white/[0.18] transition backdrop-blur-sm"
            >
              <TrendingUp className="w-4 h-4" /> My Sewa Journey
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════ */}
      <div className="border-b border-border" style={{ backgroundColor: 'hsl(290 18% 95%)' }}>
        <div className="container px-4 py-10">
          <div className="text-center mb-8">
            <h2 className="font-heading text-xl font-bold mb-1">How Sewa Chakra Works</h2>
            <div className="gold-line mx-auto mb-2" style={{ maxWidth: 48 }} />
            <p className="text-sm text-muted-foreground font-body max-w-md mx-auto">
              A living circle of service — no cash, no debt, just community karma made measurable.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { step: '1', icon: Megaphone, title: 'Post what you offer or need', desc: 'Share a skill, a service, or a request. 30 seconds. Your community sees it instantly.' },
              { step: '2', icon: CheckCircle, title: 'Complete the sewa together',  desc: 'Connect, help, and mark it done. Both parties verify with a simple handshake.' },
              { step: '3', icon: Award,      title: 'Earn verified Sewa Credits',   desc: 'Credits land in your Sewa Bank. Use them to receive help next time.' },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="flex gap-4 bg-card rounded-2xl p-5 border border-border shadow-card hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-300 group">
                <div className="w-9 h-9 rounded-xl gradient-hero text-white font-bold font-heading text-sm flex items-center justify-center flex-shrink-0 shadow-warm group-hover:scale-110 transition-transform duration-300">
                  {step}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className="w-4 h-4 text-primary" />
                    <p className="font-body font-semibold text-sm">{title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground font-body leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          USE CASES
      ══════════════════════════════════════ */}
      <div className="container px-4 py-10">
        <div className="mb-6">
          <h2 className="font-heading text-xl font-bold mb-1">What can you exchange?</h2>
          <div className="gold-line mb-1" style={{ maxWidth: 48 }} />
          <p className="text-sm text-muted-foreground font-body">
            Real services, real impact. Every skill has value in the Sewa Chakra.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
          {USE_CASES.map(uc => (
            <div
              key={uc.title}
              className="flex gap-3 bg-card border border-border rounded-2xl p-4 hover:border-primary/25 hover:shadow-card transition-all duration-200"
            >
              <span className="text-2xl flex-shrink-0 leading-none mt-0.5">{uc.emoji}</span>
              <div>
                <p className="font-body font-semibold text-sm mb-0.5">{uc.title}</p>
                <p className="text-xs text-muted-foreground font-body leading-relaxed">{uc.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* D-score explainer */}
        <div className="bg-card border border-amber-200/60 rounded-2xl p-5 flex gap-4 items-start shadow-card">
          <div className="w-11 h-11 rounded-xl gradient-gold flex items-center justify-center flex-shrink-0 shadow-gold">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Diversification Score</div>
            <p className="font-body font-semibold text-sm mb-1">The more you diversify, the more you earn</p>
            <p className="text-xs text-muted-foreground font-body leading-relaxed">
              Our <strong>D-score</strong> rewards members who help across multiple categories.
              Serve in 5+ categories and your credits are multiplied — earn the <strong>Community Pillar</strong> badge.
              Real community builders show up wherever they're needed.
            </p>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          BRANCH CONTENT
      ══════════════════════════════════════ */}
      <div className="container px-4 pb-8 space-y-5">

        {/* No branch state */}
        {!branch && (
          <div className="bg-card rounded-2xl p-10 text-center border border-border shadow-card">
            <div className="w-16 h-16 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-5 shadow-warm">
              <Users className="w-8 h-8 text-white" />
            </div>
            <h3 className="font-heading font-bold text-lg mb-2">{tr('noBranchYet')}</h3>
            <p className="text-sm text-muted-foreground font-body mb-6 max-w-sm mx-auto">{tr('noBranchDesc')}</p>
            <button
              onClick={() => setShowCreateBranch(true)}
              className="px-6 py-3 rounded-xl gradient-hero text-primary-foreground font-semibold font-body text-sm shadow-warm hover:opacity-90 transition"
            >
              {tr('createTeamBranch')}
            </button>
          </div>
        )}

        {branch && (
          <>
            {/* ── Tab bar ── */}
            <div className="flex gap-1 bg-secondary/50 rounded-xl p-1">
              {(['feed','activity', ...(isManager ? ['admin'] : [])] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t as typeof tab)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold font-body transition-all relative ${
                    tab === t ? 'bg-card shadow-card text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'feed' ? tr('feed') : t === 'activity' ? tr('activity') : tr('adminTab')}
                  {t === 'activity' && myTxns.filter(x => x.status === 'helper_done').length > 0 && (
                    <span className="absolute top-1.5 right-2 w-2 h-2 bg-destructive rounded-full" />
                  )}
                  {t === 'admin' && pendingApproval.length > 0 && (
                    <span className="absolute top-1.5 right-2 w-2 h-2 bg-amber-500 rounded-full" />
                  )}
                </button>
              ))}
            </div>

            {/* ══ FEED TAB ══ */}
            {tab === 'feed' && (
              <div className="space-y-4">
                {/* Filters */}
                <div className="flex gap-2 flex-wrap">
                  <div className="flex gap-1 bg-secondary/50 rounded-lg p-1">
                    {(['local','global'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setFeedScope(s)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          feedScope === s ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {s === 'local' ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                        {s === 'local' ? tr('local') : tr('global')}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1 bg-secondary/50 rounded-lg p-1">
                    {(['all','offer','need'] as const).map(tp => (
                      <button
                        key={tp}
                        onClick={() => setFeedType(tp)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          feedType === tp ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {tp === 'all' ? tr('all') : tp === 'offer' ? tr('offers') : tr('needs')}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowNewPost(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg gradient-hero text-primary-foreground text-xs font-bold shadow-warm hover:opacity-90 ml-auto"
                  >
                    <Plus className="w-3.5 h-3.5" /> {tr('newPost')}
                  </button>
                </div>

                {/* Category pills */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                  {['all', ...CATEGORIES].map(c => (
                    <button
                      key={c}
                      onClick={() => setFeedCategory(c)}
                      className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        feedCategory === c ? 'gradient-hero text-primary-foreground shadow-warm' : 'bg-secondary text-foreground hover:bg-secondary/80'
                      }`}
                    >
                      {c !== 'all' && <span>{CAT_EMOJI[c]}</span>}
                      {c === 'all' ? tr('all') : c}
                    </button>
                  ))}
                </div>

                {/* Feed cards */}
                {feed.length === 0 ? (
                  <div className="bg-card rounded-2xl p-10 text-center border border-border">
                    <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center mx-auto mb-4 shadow-warm">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-sm text-muted-foreground font-body">{tr('noPostsYet')}</p>
                    <button
                      onClick={() => setShowNewPost(true)}
                      className="mt-4 px-5 py-2 rounded-xl gradient-gold text-white text-xs font-bold shadow-gold hover:opacity-90 transition"
                    >
                      Be the first to post
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {feed.map(req => {
                      const minsLeft = minsUntilVisible(req.visible_from);
                      const isOwn = req.requester_id === userId;
                      const isOffer = req.request_type === 'offer';
                      return (
                        <div
                          key={req.id}
                          className={`bg-card rounded-2xl p-4 border shadow-card hover:shadow-elevated transition-all duration-200 ${
                            isOffer ? 'border-green-200/60' : 'border-blue-200/60'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg ${
                              isOffer ? 'bg-green-50' : 'bg-blue-50'
                            }`}>
                              {CAT_EMOJI[req.category] || '⭐'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                  isOffer ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {isOffer ? `🙋 ${tr('canHelp')}` : `🙏 ${tr('needsHelp')}`}
                                </span>
                                {req.scope === 'global' && (
                                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                    <Globe className="w-3 h-3" /> global
                                  </span>
                                )}
                              </div>
                              <p className="font-semibold font-body text-sm">{req.title}</p>
                              <p className="text-xs text-muted-foreground font-body mt-0.5">
                                {req.requester_name}
                                {req.hours_estimate && ` · ${req.hours_estimate}h est.`}
                              </p>
                              {req.description && (
                                <p className="text-xs text-muted-foreground font-body mt-1 line-clamp-2">
                                  {req.description}
                                </p>
                              )}
                            </div>
                            {!isOwn && (
                              minsLeft > 0 ? (
                                <span className="flex-shrink-0 text-[10px] text-muted-foreground font-body flex items-center gap-1">
                                  <Clock className="w-3 h-3" />{tr('opensIn')} {minsLeft}m
                                </span>
                              ) : (
                                <button
                                  onClick={() => { setRespondingTo(req); setRespHours(req.hours_estimate ?? 1); }}
                                  className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold text-white shadow-sm hover:opacity-90 transition ${
                                    isOffer ? 'bg-green-500' : 'bg-blue-500'
                                  }`}
                                >
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

            {/* ══ ACTIVITY TAB ══ */}
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
                          <div key={t.id} className="bg-card rounded-2xl p-4 border border-destructive/20 shadow-card">
                            <p className="font-semibold font-body text-sm mb-1">
                              {iAmHelper ? `${tr('waitingFor')} ${partner} ${tr('toConfirm')}` : `${partner} ${tr('markedWorkDone')}`}
                            </p>
                            <p className="text-xs text-muted-foreground font-body mb-3">{t.hours}h · {t.credit_type}</p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setRatingTxn(t)}
                                className="flex-1 py-2.5 rounded-xl gradient-hero text-primary-foreground text-xs font-bold shadow-warm hover:opacity-90"
                              >
                                <Star className="w-3 h-3 inline mr-1" />
                                {iAmHelper ? tr('rateNow') : tr('confirmAndRate')}
                              </button>
                              <button
                                onClick={() => cancelTxn(t.id)}
                                className="px-4 py-2.5 rounded-xl bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20"
                              >
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
                          <div key={t.id} className="bg-card rounded-2xl p-4 border border-border shadow-card flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold font-body text-sm">
                                {iAmHelper ? `${tr('helpingLabel')} ${t.requester_name}` : `${t.helper_name} ${tr('helpingYou')}`}
                              </p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_PILL[t.status]}`}>{t.status}</span>
                                <span className="text-xs text-muted-foreground font-body">{t.hours}h</span>
                                {t.is_flagged && (
                                  <span className="text-[10px] text-destructive flex items-center gap-0.5">
                                    <Flag className="w-2.5 h-2.5" /> {tr('flagged')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1.5 flex-shrink-0">
                              {iAmHelper && t.status === 'assigned' && (
                                <button
                                  onClick={() => markHelperDone(t.id)}
                                  className="px-3 py-1.5 rounded-xl bg-green-100 text-green-700 text-xs font-bold"
                                >
                                  <CheckCircle className="w-3.5 h-3.5 inline mr-1" />{tr('markDone')}
                                </button>
                              )}
                              <button
                                onClick={() => cancelTxn(t.id)}
                                className="p-1.5 rounded-xl bg-secondary text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                              >
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
                        <div key={t.id} className="bg-card rounded-2xl p-3 border border-border/50 flex items-center gap-3">
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
                  <div className="bg-card rounded-2xl p-10 text-center border border-border">
                    <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center mx-auto mb-4 shadow-warm">
                      <Clock className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-sm text-muted-foreground font-body">{tr('noActivityYet')}</p>
                  </div>
                )}
              </div>
            )}

            {/* ══ ADMIN TAB ══ */}
            {tab === 'admin' && isManager && (
              <div className="space-y-6">

                {/* Branch settings */}
                <div className="bg-card rounded-2xl p-5 border border-border shadow-card space-y-4">
                  <h3 className="font-heading font-bold text-sm">{tr('branchSettings')}</h3>
                  {[
                    { label: tr('privateLedger'), desc: tr('privateLedgerDesc'), val: branch.is_private_ledger, toggle: togglePrivateLedger },
                    {
                      label: tr('requireApproval'), desc: tr('requireApprovalDesc'),
                      val: branch.requires_manager_approval,
                      toggle: async () => {
                        const newVal = !branch.requires_manager_approval;
                        const res = await fetch(`${api}/branches/${branch.id}/settings`, {
                          method: 'PUT', headers, body: JSON.stringify({ requires_manager_approval: newVal }),
                        });
                        if (res.ok) setBranch(prev => prev ? { ...prev, requires_manager_approval: newVal } : prev);
                      },
                    },
                  ].map(({ label, desc, val, toggle }) => (
                    <div key={label} className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-body font-semibold">{label}</p>
                        <p className="text-xs text-muted-foreground font-body">{desc}</p>
                      </div>
                      <button onClick={toggle}>
                        {val
                          ? <ToggleRight className="w-8 h-8 text-primary" />
                          : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
                      </button>
                    </div>
                  ))}
                </div>

                {/* Pending approval */}
                {pendingApproval.length > 0 && (
                  <div>
                    <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2 text-amber-600">
                      <Megaphone className="w-4 h-4" /> {tr('pendingApproval')} ({pendingApproval.length})
                    </h3>
                    <div className="space-y-3">
                      {pendingApproval.map(t => (
                        <div key={t.id} className="bg-amber-50 border border-amber-200/60 rounded-2xl p-4 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold font-body">{t.helper_name} → {t.requester_name}</p>
                            <p className="text-xs text-muted-foreground font-body">{t.hours}h · {t.description || '—'}</p>
                          </div>
                          <button
                            onClick={() => approveTransaction(t.id)}
                            className="flex-shrink-0 px-3 py-1.5 rounded-xl bg-green-500 text-white text-xs font-bold hover:bg-green-600"
                          >
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
                    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-card">
                      {members.map((m, i) => (
                        <div key={m.user_id} className={`flex items-center px-4 py-3 gap-3 ${i < members.length - 1 ? 'border-b border-border/40' : ''}`}>
                          <div className="w-8 h-8 rounded-full gradient-hero text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                            {(m.display_name || 'M').charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold font-body">{m.display_name || tr('member')}</p>
                            {m.node_id && <p className="text-[10px] text-muted-foreground font-body">node: {m.node_id}</p>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            {m.local_balance !== null
                              ? <p className={`font-bold font-heading text-sm ${m.local_balance >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                                  {m.local_balance >= 0 ? '+' : ''}{m.local_balance}h
                                </p>
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
                        <div key={t.id} className="bg-card rounded-2xl p-3 border border-destructive/30 flex items-center gap-3">
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

                {/* Audit trail */}
                {adminTxns.length > 0 && (
                  <div>
                    <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-primary" /> {tr('auditTrail')} ({adminTxns.length})
                    </h3>
                    <div className="space-y-2">
                      {adminTxns.map(t => (
                        <div key={t.id} className="bg-card rounded-2xl p-3 border border-border/40 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-body">{t.helper_name} → {t.requester_name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_PILL[t.status]}`}>{t.status}</span>
                              <span className="text-xs text-muted-foreground font-body">{t.hours}h</span>
                              {t.is_flagged && <Flag className="w-3 h-3 text-destructive" />}
                            </div>
                          </div>
                          {t.requires_manager_approval && !t.manager_approved && t.status === 'helper_done' && (
                            <button
                              onClick={() => approveTransaction(t.id)}
                              className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-bold"
                            >
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

      {/* New Post */}
      {showNewPost && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-elevated border border-border max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
              <h3 className="font-heading font-bold">{tr('newPost')}</h3>
              <button onClick={() => setShowNewPost(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-2 text-muted-foreground">{tr('postType')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['offer','need'] as const).map(tp => (
                    <button
                      key={tp}
                      onClick={() => setNpType(tp)}
                      className={`py-3 rounded-xl text-sm font-bold transition-all ${
                        npType === tp ? 'gradient-hero text-primary-foreground shadow-warm' : 'bg-secondary text-foreground'
                      }`}
                    >
                      {tp === 'offer' ? `🙋 ${tr('iCanHelp')}` : `🙏 ${tr('iNeedHelp')}`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2 text-muted-foreground">{tr('visibility')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['local','global'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setNpScope(s)}
                      className={`py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        npScope === s ? 'gradient-hero text-primary-foreground shadow-warm' : 'bg-secondary text-foreground'
                      }`}
                    >
                      {s === 'local' ? <Lock className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                      {s === 'local' ? tr('local') : tr('global')}
                    </button>
                  ))}
                </div>
                {npScope === 'global' && (
                  <p className="text-[10px] text-muted-foreground font-body mt-1.5">⏱ {tr('globalDelay30')}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2 text-muted-foreground">{tr('category')}</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {CATEGORIES.map(c => (
                    <button
                      key={c}
                      onClick={() => setNpCat(c)}
                      className={`flex flex-col items-center gap-0.5 p-2 rounded-xl text-center transition-all ${
                        npCat === c ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/50 hover:bg-secondary'
                      }`}
                    >
                      <span className="text-base">{CAT_EMOJI[c]}</span>
                      <span className="text-[9px] font-body leading-tight">{c}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">{tr('title')}</label>
                <input
                  value={npTitle}
                  onChange={e => setNpTitle(e.target.value)}
                  maxLength={200}
                  placeholder={npType === 'offer' ? tr('offerTitlePlaceholder') : tr('needTitlePlaceholder')}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">{tr('hoursEstimate')}: {npHours}h</label>
                <input type="range" min={0.5} max={20} step={0.5} value={npHours} onChange={e => setNpHours(Number(e.target.value))} className="w-full accent-primary" />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">
                  {tr('description')} <span className="font-normal">(optional)</span>
                </label>
                <textarea
                  value={npDesc}
                  onChange={e => setNpDesc(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-body resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border flex gap-3">
              <button onClick={() => setShowNewPost(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-body">{tr('cancel')}</button>
              <button
                onClick={submitNewPost}
                disabled={npSaving}
                className="flex-1 py-2.5 rounded-xl gradient-hero text-primary-foreground font-semibold text-sm shadow-warm hover:opacity-90 disabled:opacity-50"
              >
                {npSaving ? tr('posting') : tr('post')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Respond to Post */}
      {respondingTo && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-sm rounded-2xl shadow-elevated border border-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="font-heading font-bold">{respondingTo.request_type === 'offer' ? tr('requestHelp') : tr('offerHelp')}</h3>
              <button onClick={() => setRespondingTo(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-secondary/40 rounded-xl p-3">
                <p className="text-sm font-semibold font-body">{respondingTo.title}</p>
                <p className="text-xs text-muted-foreground font-body">{respondingTo.requester_name} · {CAT_EMOJI[respondingTo.category]} {respondingTo.category}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">{tr('hoursRequested')}: {respHours}h</label>
                <input type="range" min={0.5} max={respondingTo.hours_estimate ?? 20} step={0.5} value={respHours} onChange={e => setRespHours(Number(e.target.value))} className="w-full accent-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">{tr('notes')} <span className="font-normal">(optional)</span></label>
                <textarea
                  value={respDesc}
                  onChange={e => setRespDesc(e.target.value)}
                  rows={2}
                  maxLength={500}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-body resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border flex gap-3">
              <button onClick={() => setRespondingTo(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-body">{tr('cancel')}</button>
              <button
                onClick={submitRespond}
                disabled={respSaving}
                className="flex-1 py-2.5 rounded-xl gradient-hero text-primary-foreground font-semibold text-sm shadow-warm hover:opacity-90 disabled:opacity-50"
              >
                {respSaving ? tr('sending') : tr('sendRequest')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rate & Confirm */}
      {ratingTxn && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-sm rounded-2xl shadow-elevated border border-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="font-heading font-bold">{tr('rateAndConfirm')}</h3>
              <button onClick={() => setRatingTxn(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div className="bg-secondary/40 rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground font-body mb-1">{tr('ratingPartner')}</p>
                <p className="font-semibold font-body">{ratingTxn.helper_id === userId ? ratingTxn.requester_name : ratingTxn.helper_name}</p>
                <p className="text-xs text-muted-foreground font-body">{ratingTxn.hours}h · {ratingTxn.credit_type}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2 text-muted-foreground">{tr('workQuality')}</label>
                <StarRow value={rateQ} onChange={setRateQ} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2 text-muted-foreground">{tr('behaviour')}</label>
                <StarRow value={rateB} onChange={setRateB} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">{tr('comment')} <span className="font-normal">(optional)</span></label>
                <textarea
                  value={rateComment}
                  onChange={e => setRateComment(e.target.value)}
                  rows={2}
                  maxLength={500}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-body resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <p className="text-[10px] text-muted-foreground font-body">{tr('bothRateNote')}</p>
            </div>
            <div className="px-6 py-4 border-t border-border flex gap-3">
              <button onClick={() => setRatingTxn(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-body">{tr('cancel')}</button>
              <button
                onClick={submitRating}
                disabled={rateSaving}
                className="flex-1 py-2.5 rounded-xl gradient-hero text-primary-foreground font-semibold text-sm shadow-warm hover:opacity-90 disabled:opacity-50"
              >
                {rateSaving ? tr('saving') : tr('submitRating')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Branch */}
      {showCreateBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-sm rounded-2xl shadow-elevated border border-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="font-heading font-bold">{tr('createTeamBranch')}</h3>
              <button onClick={() => setShowCreateBranch(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">{tr('branchName')}</label>
                <input
                  value={cbName}
                  onChange={e => setCbName(e.target.value)}
                  maxLength={100}
                  placeholder={tr('branchNamePlaceholder')}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
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
            <div className="px-6 py-4 border-t border-border flex gap-3">
              <button onClick={() => setShowCreateBranch(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-body">{tr('cancel')}</button>
              <button
                onClick={createBranch}
                disabled={cbSaving}
                className="flex-1 py-2.5 rounded-xl gradient-hero text-primary-foreground font-semibold text-sm shadow-warm hover:opacity-90 disabled:opacity-50"
              >
                {cbSaving ? tr('creating') : tr('create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
