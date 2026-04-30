import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, User, Calendar, MapPin, Loader2, ClipboardList, IndianRupee, Share2, WalletCards, Sparkles } from 'lucide-react';
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

export default function PanditDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const authFetch = useAuthFetch();
  const base = getApiBaseUrl();

  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [ceremonyType, setCeremonyType] = useState(CEREMONY_TYPES[0].id);
  const [ceremonyVanshaId, setCeremonyVanshaId] = useState('');
  const [lastCeremony, setLastCeremony] = useState<{ label: string; gross: number; net: number } | null>(null);

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
      toast({ title: 'Ceremony logged', description: `${selected.label} added. Net earning ₹${res.net_amount}.` });
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
      toast({ title: action === 'approved' ? 'Approved' : 'Rejected', description: 'Decision saved and family notified.' });
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
      toast({ title: 'Share card ready', description: 'Ceremony proof copied/shared.' });
    } catch { /* cancelled */ }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <ClipboardList className="w-7 h-7 text-primary" />
          <div>
            <p className="text-[10px] tracking-[0.15em] uppercase text-emerald-600 font-body mb-0.5">Paryavaran Mitra</p>
            <h1 className="font-heading text-2xl font-bold">Harit Vanshavali Verification Queue</h1>
            <p className="text-sm text-muted-foreground font-body">{queue.length} pending verification{queue.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr] mb-8">
          <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <h2 className="font-heading text-lg font-bold">Ceremony Logger</h2>
                <p className="text-sm text-muted-foreground">Log the core Margdarshak commerce action and trigger family score proof.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Ceremony
                <select
                  value={ceremonyType}
                  onChange={(e) => setCeremonyType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  {CEREMONY_TYPES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label} - ₹{c.gross}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Family Vansha ID
                <input
                  value={ceremonyVanshaId}
                  onChange={(e) => setCeremonyVanshaId(e.target.value)}
                  placeholder="Optional UUID"
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => ceremonyMutation.mutate()}
                disabled={ceremonyMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {ceremonyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Log ceremony
              </button>
              <button
                type="button"
                onClick={shareCeremony}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"
              >
                <Share2 className="h-4 w-4" />
                Share card
              </button>
            </div>
            {lastCeremony && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
                <p className="font-semibold text-emerald-900 dark:text-emerald-100">{lastCeremony.label} logged</p>
                <p className="text-emerald-700 dark:text-emerald-300">Gross ₹{lastCeremony.gross} · Net payout ₹{lastCeremony.net} · proof card ready</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <WalletCards className="h-5 w-5 text-primary" />
              <h2 className="font-heading text-lg font-bold">Earnings & Payout</h2>
            </div>
            <div className="rounded-xl bg-primary/8 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Net earned</p>
              <p className="mt-1 flex items-center text-3xl font-bold">
                <IndianRupee className="h-6 w-6" />
                {earnings?.total_net_earned?.toFixed(0) ?? '0'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{earnings?.transactions?.length ?? 0} ceremony transaction(s)</p>
            </div>
            <div className="mt-3 space-y-2">
              {(earnings?.transactions ?? []).slice(0, 4).map((txn, idx) => (
                <div key={`${txn.ceremony_type}-${idx}`} className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-xs">
                  <span className="font-medium">{txn.ceremony_type.replaceAll('_', ' ')}</span>
                  <span className="text-muted-foreground">₹{txn.net_amount} · {txn.status}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => toast({ title: 'Payout queued', description: 'Pending earnings are marked for the next payout cycle.' })}
              className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Request payout
            </button>
          </div>
        </div>

        {queue.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground font-body">
            <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">All clear — no pending verifications.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {queue.map((item) => (
              <div key={item.id} className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-heading font-semibold text-base">
                          {item.person
                            ? `${item.person.first_name} ${item.person.last_name}`
                            : 'Unknown Member'}
                        </p>
                        {item.person?.gotra && (
                          <p className="text-xs text-muted-foreground font-body">Gotra: {item.person.gotra}</p>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground font-body whitespace-nowrap">
                      {new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>

                  {item.person && (
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-body text-muted-foreground">
                      {item.person.date_of_birth && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {item.person.date_of_birth}
                        </span>
                      )}
                      {item.person.gender && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {item.person.gender}
                        </span>
                      )}
                      <span className="flex items-center gap-1 col-span-2">
                        <MapPin className="w-3 h-3" />
                        Tier: <strong>{item.person.verification_tier ?? 'none'}</strong>
                      </span>
                    </div>
                  )}

                  {reviewingId === item.id && (
                    <div className="mt-4">
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Optional notes for the family (reason for rejection, etc.)"
                        rows={2}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background font-body focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none"
                      />
                    </div>
                  )}
                </div>

                <div className="px-5 pb-4 flex gap-2">
                  {reviewingId !== item.id ? (
                    <button
                      onClick={() => { setReviewingId(item.id); setNotes(''); }}
                      className="text-sm font-body text-primary hover:underline"
                    >
                      Review
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleAction(item, 'approved')}
                        disabled={reviewMutation.isPending}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold font-body hover:bg-green-700 transition-colors disabled:opacity-60"
                      >
                        {reviewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Approve
                      </button>
                      <button
                        onClick={() => handleAction(item, 'rejected')}
                        disabled={reviewMutation.isPending}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold font-body hover:opacity-90 transition-opacity disabled:opacity-60"
                      >
                        {reviewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                        Reject
                      </button>
                      <button
                        onClick={() => { setReviewingId(null); setNotes(''); }}
                        className="px-3 py-2 text-sm text-muted-foreground font-body hover:underline"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
