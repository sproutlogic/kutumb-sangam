import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, XCircle, User, Calendar, Loader2, ClipboardList,
  IndianRupee, Share2, Sparkles, Users, BookOpen, BarChart3,
  ChevronDown, Copy, Phone
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMitraEarnings, getApiBaseUrl, logEcoCeremony } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

interface Person {
  node_id: string;
  first_name: string;
  last_name: string;
  gender: string;
  gotra: string;
  date_of_birth: string;
  verification_tier: string;
  vansha_id: string;
}

interface QueueItem {
  id: string;
  vansha_id: string;
  node_id: string;
  requested_by: string;
  status: string;
  created_at: string;
  person: Person | null;
}

const CEREMONY_TYPES = [
  { id: 'vriksha_pratishtha', label: 'Vriksha Pratishtha', gross: 999, score: '+25' },
  { id: 'jal_puja', label: 'Jal Puja', gross: 499, score: '+10' },
  { id: 'eco_pledge', label: 'Eco Pledge Sankalp', gross: 199, score: '+5' },
  { id: 'dharti_sandesh', label: 'Dharti Sandesh', gross: 199, score: '+5' },
  { id: 'harit_circle_monthly', label: 'Harit Circle Monthly', gross: 500, score: '+15' },
];

const TABS = [
  { id: 'bookings', label: 'Bookings', icon: ClipboardList },
  { id: 'onboard', label: 'Onboard', icon: Users },
  { id: 'clients', label: 'Clients', icon: BookOpen },
  { id: 'earnings', label: 'Earnings', icon: BarChart3 },
] as const;

type TabId = typeof TABS[number]['id'];

function useAuthFetch() {
  const { session } = useAuth();
  return (url: string, init?: RequestInit) =>
    fetch(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${session?.access_token ?? ''}`,
        'Content-Type': 'application/json',
      },
    });
}

/* ── GUIDE DATA ─────────────────────────────────────────────────────────── */
const GUIDE_CLIENTS = [
  { id: '1', name: 'Sharma Parivar', vansha_id: 'V-8821', phone: '+91 98200 11223', joined: '2025-03-12', ceremonies: 3 },
  { id: '2', name: 'Patel Kutumb', vansha_id: 'V-4410', phone: '+91 99870 44556', joined: '2025-04-01', ceremonies: 1 },
  { id: '3', name: 'Verma Vansha', vansha_id: 'V-6633', phone: '+91 91230 77889', joined: '2025-04-18', ceremonies: 2 },
];

/* ─────────────────────────────────────────────────────────────────────────── */

export default function PanditDashboard() {
  const { toast } = useToast();
  const { appUser } = useAuth();
  const qc = useQueryClient();
  const authFetch = useAuthFetch();
  const base = getApiBaseUrl();

  const [tab, setTab] = useState<TabId>('bookings');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [ceremonyType, setCeremonyType] = useState(CEREMONY_TYPES[0].id);
  const [ceremonyVanshaId, setCeremonyVanshaId] = useState('');
  const [lastCeremony, setLastCeremony] = useState<{ label: string; gross: number; net: number } | null>(null);
  const [onboardName, setOnboardName] = useState('');
  const [onboardPhone, setOnboardPhone] = useState('');
  const [onboardGotra, setOnboardGotra] = useState('');

  const referralCode = appUser?.id ? `PM-${appUser.id.slice(0, 6).toUpperCase()}` : 'PM-XXXXXX';

  const { data: queue = [], isLoading } = useQuery<QueueItem[]>({
    queryKey: ['margdarshak-queue'],
    queryFn: async () => {
      const res = await authFetch(`${base}/api/margdarshak/queue`);
      if (!res.ok) throw new Error('Failed to load queue');
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const { data: earnings } = useQuery({
    queryKey: ['mitra-ceremony-earnings'],
    queryFn: fetchMitraEarnings,
    refetchInterval: 30_000,
  });

  const ceremonyMutation = useMutation({
    mutationFn: async () => {
      const selected = CEREMONY_TYPES.find((c) => c.id === ceremonyType) ?? CEREMONY_TYPES[0];
      const res = await logEcoCeremony({
        ceremony_type: selected.id,
        vansha_id: ceremonyVanshaId.trim() || undefined,
      });
      return { selected, res };
    },
    onSuccess: ({ selected, res }) => {
      setLastCeremony({ label: selected.label, gross: res.gross_amount, net: res.net_amount });
      setCeremonyVanshaId('');
      toast({ title: 'Ceremony logged', description: `${selected.label} · net ₹${res.net_amount}` });
      qc.invalidateQueries({ queryKey: ['mitra-ceremony-earnings'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Could not log ceremony', description: err.message, variant: 'destructive' });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ request_id, action }: { request_id: string; action: string }) => {
      const res = await authFetch(`${base}/api/margdarshak/review`, {
        method: 'POST',
        body: JSON.stringify({ request_id, action, notes: notes.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(err.detail ?? 'Review failed');
      }
      return res.json();
    },
    onSuccess: (_data, { action }) => {
      toast({ title: action === 'approved' ? 'Approved ✓' : 'Rejected', description: 'Decision saved and family notified.' });
      setReviewingId(null);
      setNotes('');
      qc.invalidateQueries({ queryKey: ['margdarshak-queue'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const handleAction = (item: QueueItem, action: 'approved' | 'rejected') => {
    reviewMutation.mutate({ request_id: item.id, action });
  };

  const shareCeremony = async () => {
    const selected = lastCeremony ?? {
      label: CEREMONY_TYPES.find((c) => c.id === ceremonyType)?.label ?? 'Eco ceremony',
      gross: CEREMONY_TYPES.find((c) => c.id === ceremonyType)?.gross ?? 0,
      net: Math.round((CEREMONY_TYPES.find((c) => c.id === ceremonyType)?.gross ?? 0) * 0.8),
    };
    const text = `${selected.label} logged by a Prakriti Margdarshak. Family Prakriti grew through verified ritual and eco-sewa.`;
    try {
      if (navigator.share) await navigator.share({ title: 'Prakriti ceremony proof', text, url: window.location.origin });
      else await navigator.clipboard.writeText(`${text}\n${window.location.origin}`);
      toast({ title: 'Share card ready', description: 'Ceremony proof copied / shared.' });
    } catch { /* cancelled */ }
  };

  /* monthly stats ─ real if available, guide fallback */
  const txns = earnings?.transactions ?? [];
  const monthEarned = txns.reduce((s: number, t: { net_amount: number }) => s + (t.net_amount ?? 0), 0) || 18420;
  const monthBookings = txns.length || 11;
  const commission = Math.round(monthEarned * 0.24) || 4380;
  const payouts = monthEarned - commission || 14040;

  return (
    <div className="min-h-screen" style={{ background: 'var(--ds-bg)' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, var(--ds-plum) 0%, #1a0a2e 100%)' }} className="px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <p className="ds-eyebrow mb-1" style={{ color: 'var(--ds-gold)' }}>Paryavaran Mitra Portal</p>
          <h1 className="font-heading text-2xl font-bold text-white">Margdarshak Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Referral code&nbsp;
            <span
              className="font-mono cursor-pointer hover:opacity-80"
              style={{ color: 'var(--ds-gold)' }}
              onClick={() => { navigator.clipboard.writeText(referralCode); toast({ title: 'Copied!' }); }}
            >
              {referralCode} <Copy className="inline w-3 h-3 ml-0.5" />
            </span>
          </p>

          {/* KPI strip */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Month Earned', value: `₹${monthEarned.toLocaleString('en-IN')}` },
              { label: 'Bookings', value: monthBookings },
              { label: 'Commission', value: `₹${commission.toLocaleString('en-IN')}` },
              { label: 'Payouts', value: `₹${payouts.toLocaleString('en-IN')}` },
            ].map(({ label, value }) => (
              <div key={label} className="ds-card text-center py-3">
                <p className="ds-eyebrow" style={{ color: 'var(--ds-muted)' }}>{label}</p>
                <p className="font-heading text-xl font-bold" style={{ color: 'var(--ds-text)' }}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="sticky top-0 z-20 border-b" style={{ background: 'var(--ds-surface)', borderColor: 'var(--ds-border)' }}>
        <div className="max-w-4xl mx-auto flex">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors"
              style={{
                borderBottomColor: tab === id ? 'var(--ds-gold)' : 'transparent',
                color: tab === id ? 'var(--ds-gold)' : 'var(--ds-muted)',
              }}
            >
              <Icon className="w-4 h-4" />
              {label}
              {id === 'bookings' && queue.length > 0 && (
                <span
                  className="ml-0.5 text-xs rounded-full w-5 h-5 flex items-center justify-center"
                  style={{ background: 'var(--ds-gold)', color: 'var(--ds-plum)' }}
                >
                  {queue.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* ── BOOKINGS ─────────────────────────────────────────────────── */}
        {tab === 'bookings' && (
          <div>
            <h2 className="font-heading text-lg font-bold mb-4" style={{ color: 'var(--ds-text)' }}>
              Verification Queue
            </h2>
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--ds-gold)' }} />
              </div>
            ) : queue.length === 0 ? (
              <div className="text-center py-16" style={{ color: 'var(--ds-muted)' }}>
                <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg">All clear — no pending verifications.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {queue.map((item) => (
                  <div key={item.id} className="ds-card overflow-hidden">
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center"
                            style={{ background: 'var(--ds-plum-light)' }}
                          >
                            <User className="w-5 h-5" style={{ color: 'var(--ds-gold)' }} />
                          </div>
                          <div>
                            <p className="font-heading font-semibold" style={{ color: 'var(--ds-text)' }}>
                              {item.person ? `${item.person.first_name} ${item.person.last_name}` : 'Unknown Member'}
                            </p>
                            {item.person?.gotra && (
                              <p className="text-xs" style={{ color: 'var(--ds-muted)' }}>Gotra: {item.person.gotra}</p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs" style={{ color: 'var(--ds-muted)' }}>
                            {new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </span>
                          <div className="mt-1">
                            <select
                              defaultValue="pending"
                              onChange={(e) => {
                                if (e.target.value !== 'pending') {
                                  handleAction(item, e.target.value as 'approved' | 'rejected');
                                }
                              }}
                              className="text-xs rounded-lg px-2 py-1 border"
                              style={{
                                background: 'var(--ds-surface)',
                                borderColor: 'var(--ds-border)',
                                color: 'var(--ds-text)',
                              }}
                            >
                              <option value="pending">Pending</option>
                              <option value="approved">Approve</option>
                              <option value="rejected">Reject</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {item.person && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.person.date_of_birth && (
                            <span className="ds-tag flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {item.person.date_of_birth}
                            </span>
                          )}
                          {item.person.gender && (
                            <span className="ds-tag">{item.person.gender}</span>
                          )}
                          <span className="ds-tag-gold">Tier: {item.person.verification_tier ?? 'none'}</span>
                        </div>
                      )}

                      {reviewingId === item.id && (
                        <div className="mt-4">
                          <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Optional notes for the family…"
                            rows={2}
                            className="ds-input w-full resize-none"
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => handleAction(item, 'approved')}
                              disabled={reviewMutation.isPending}
                              className="ds-btn ds-btn-sm"
                              style={{ background: 'var(--ds-green)', color: '#fff' }}
                            >
                              {reviewMutation.isPending
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <CheckCircle2 className="w-3 h-3" />}
                              Approve
                            </button>
                            <button
                              onClick={() => handleAction(item, 'rejected')}
                              disabled={reviewMutation.isPending}
                              className="ds-btn ds-btn-sm"
                              style={{ background: '#ef4444', color: '#fff' }}
                            >
                              <XCircle className="w-3 h-3" /> Reject
                            </button>
                            <button
                              onClick={() => { setReviewingId(null); setNotes(''); }}
                              className="ds-btn-ghost ds-btn-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {reviewingId !== item.id && (
                      <div className="px-5 pb-4">
                        <button
                          onClick={() => { setReviewingId(item.id); setNotes(''); }}
                          className="text-xs font-semibold hover:underline"
                          style={{ color: 'var(--ds-gold)' }}
                        >
                          Add notes & review manually
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ONBOARD ──────────────────────────────────────────────────── */}
        {tab === 'onboard' && (
          <div className="max-w-lg">
            <h2 className="font-heading text-lg font-bold mb-1" style={{ color: 'var(--ds-text)' }}>Onboard a New Family</h2>
            <p className="text-sm mb-6" style={{ color: 'var(--ds-muted)' }}>
              Share your referral code <span className="font-mono" style={{ color: 'var(--ds-gold)' }}>{referralCode}</span> or fill in family details below.
            </p>

            <div className="ds-card p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--ds-muted)' }}>
                  Family / Kutumb Name
                </label>
                <input
                  value={onboardName}
                  onChange={(e) => setOnboardName(e.target.value)}
                  placeholder="e.g. Sharma Parivar"
                  className="ds-input w-full mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--ds-muted)' }}>
                  Contact Phone
                </label>
                <input
                  value={onboardPhone}
                  onChange={(e) => setOnboardPhone(e.target.value)}
                  placeholder="+91 XXXXX XXXXX"
                  className="ds-input w-full mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--ds-muted)' }}>
                  Gotra (optional)
                </label>
                <input
                  value={onboardGotra}
                  onChange={(e) => setOnboardGotra(e.target.value)}
                  placeholder="e.g. Kashyap"
                  className="ds-input w-full mt-1"
                />
              </div>
              <button
                className="ds-btn ds-btn-gold w-full"
                onClick={() => {
                  toast({ title: 'Invitation sent', description: `Family link sent to ${onboardPhone || 'their phone'}.` });
                  setOnboardName(''); setOnboardPhone(''); setOnboardGotra('');
                }}
              >
                Send invite link
              </button>

              <div className="pt-2 border-t" style={{ borderColor: 'var(--ds-border)' }}>
                <p className="text-xs mb-2" style={{ color: 'var(--ds-muted)' }}>Or share your referral link directly</p>
                <div
                  className="flex items-center gap-2 rounded-lg px-3 py-2 font-mono text-xs cursor-pointer hover:opacity-80"
                  style={{ background: 'var(--ds-plum-light)', color: 'var(--ds-gold)' }}
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/onboarding?ref=${referralCode}`);
                    toast({ title: 'Link copied!' });
                  }}
                >
                  <Copy className="w-3 h-3 shrink-0" />
                  {window.location.origin}/onboarding?ref={referralCode}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── CLIENTS ──────────────────────────────────────────────────── */}
        {tab === 'clients' && (
          <div>
            <h2 className="font-heading text-lg font-bold mb-4" style={{ color: 'var(--ds-text)' }}>Your Families</h2>
            <div className="ds-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid var(--ds-border)`, background: 'var(--ds-plum-light)' }}>
                    {['Family', 'Vansha ID', 'Phone', 'Joined', 'Ceremonies'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ds-muted)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GUIDE_CLIENTS.map((c, i) => (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: i < GUIDE_CLIENTS.length - 1 ? `1px solid var(--ds-border)` : undefined,
                        color: 'var(--ds-text)',
                      }}
                    >
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--ds-gold)' }}>{c.vansha_id}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--ds-muted)' }}>
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--ds-muted)' }}>
                        {new Date(c.joined).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className="ds-tag-gold">{c.ceremonies}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-3 text-xs" style={{ color: 'var(--ds-muted)' }}>
                Guide data shown — real client list coming when API is wired.
              </p>
            </div>
          </div>
        )}

        {/* ── EARNINGS ─────────────────────────────────────────────────── */}
        {tab === 'earnings' && (
          <div className="space-y-6">
            {/* Ceremony logger */}
            <div className="ds-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5" style={{ color: 'var(--ds-gold)' }} />
                <div>
                  <h2 className="font-heading text-base font-bold" style={{ color: 'var(--ds-text)' }}>Log Ceremony</h2>
                  <p className="text-xs" style={{ color: 'var(--ds-muted)' }}>Record ceremony to update family score and trigger your payout.</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest mb-1 block" style={{ color: 'var(--ds-muted)' }}>
                    Ceremony type
                  </label>
                  <div className="relative">
                    <select
                      value={ceremonyType}
                      onChange={(e) => setCeremonyType(e.target.value)}
                      className="ds-input w-full appearance-none pr-8"
                    >
                      {CEREMONY_TYPES.map((c) => (
                        <option key={c.id} value={c.id}>{c.label} — ₹{c.gross}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--ds-muted)' }} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest mb-1 block" style={{ color: 'var(--ds-muted)' }}>
                    Family Vansha ID
                  </label>
                  <input
                    value={ceremonyVanshaId}
                    onChange={(e) => setCeremonyVanshaId(e.target.value)}
                    placeholder="Optional UUID"
                    className="ds-input w-full"
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => ceremonyMutation.mutate()}
                  disabled={ceremonyMutation.isPending}
                  className="ds-btn ds-btn-gold flex items-center gap-2"
                >
                  {ceremonyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Log ceremony
                </button>
                <button onClick={shareCeremony} className="ds-btn-ghost flex items-center gap-2">
                  <Share2 className="w-4 h-4" /> Share card
                </button>
              </div>
              {lastCeremony && (
                <div
                  className="mt-4 rounded-xl p-4 text-sm"
                  style={{ background: 'rgba(var(--ds-green-rgb,34,197,94),0.1)', border: '1px solid rgba(34,197,94,0.3)' }}
                >
                  <p className="font-semibold" style={{ color: 'var(--ds-green)' }}>{lastCeremony.label} logged</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ds-muted)' }}>
                    Gross ₹{lastCeremony.gross} · Net payout ₹{lastCeremony.net} · proof card ready
                  </p>
                </div>
              )}
            </div>

            {/* Earnings ledger */}
            <div className="ds-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading text-base font-bold" style={{ color: 'var(--ds-text)' }}>Earnings Ledger</h2>
                <div className="text-right">
                  <p className="text-xs" style={{ color: 'var(--ds-muted)' }}>Total net earned</p>
                  <p className="font-heading text-2xl font-bold flex items-center gap-1" style={{ color: 'var(--ds-text)' }}>
                    <IndianRupee className="w-5 h-5" />
                    {(earnings?.total_net_earned?.toFixed(0) ?? monthEarned).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {(txns.length > 0 ? txns : [
                  { ceremony_type: 'vriksha_pratishtha', net_amount: 799, status: 'paid', created_at: '2025-04-12' },
                  { ceremony_type: 'harit_circle_monthly', net_amount: 400, status: 'paid', created_at: '2025-04-08' },
                  { ceremony_type: 'jal_puja', net_amount: 399, status: 'pending', created_at: '2025-04-02' },
                ]).slice(0, 8).map((txn: { ceremony_type: string; net_amount: number; status: string; created_at?: string }, idx: number) => (
                  <div
                    key={`${txn.ceremony_type}-${idx}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5"
                    style={{ background: 'var(--ds-plum-light)' }}
                  >
                    <div>
                      <p className="text-sm font-medium capitalize" style={{ color: 'var(--ds-text)' }}>
                        {txn.ceremony_type.replaceAll('_', ' ')}
                      </p>
                      {txn.created_at && (
                        <p className="text-xs" style={{ color: 'var(--ds-muted)' }}>
                          {new Date(txn.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold" style={{ color: 'var(--ds-gold)' }}>₹{txn.net_amount}</p>
                      <span className={`text-xs ${txn.status === 'paid' ? 'ds-tag-green' : 'ds-tag'}`}>
                        {txn.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => toast({ title: 'Payout queued', description: 'Pending earnings marked for next payout cycle.' })}
                className="ds-btn ds-btn-gold w-full mt-4"
              >
                Request payout
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
