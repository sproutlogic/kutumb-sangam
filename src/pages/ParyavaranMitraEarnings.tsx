import { useEffect, useState } from 'react';
import { IndianRupee, Leaf, Loader2, Plus, X, CheckCircle2, Clock, XCircle } from 'lucide-react';
import AppShell from '@/components/shells/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMitraEarnings, logEcoCeremony, resolveVanshaIdForApi, type MitraEarnings } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

const CEREMONY_OPTIONS = [
  { value: 'vriksha_pratishtha',   label: 'Vriksha Pratishtha',    gross: 999  },
  { value: 'jal_puja',             label: 'Jal Puja',              gross: 499  },
  { value: 'eco_pledge',           label: 'Eco Pledge',            gross: 199  },
  { value: 'dharti_sandesh',       label: 'Dharti Sandesh',        gross: 199  },
  { value: 'harit_circle_monthly', label: 'Harit Circle Monthly',  gross: 500  },
];

const CEREMONY_LABEL: Record<string, string> = Object.fromEntries(
  CEREMONY_OPTIONS.map(c => [c.value, c.label])
);

const STATUS_ICON = {
  completed: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
  pending:   <Clock        className="w-3.5 h-3.5 text-amber-500"   />,
  cancelled: <XCircle      className="w-3.5 h-3.5 text-red-400"     />,
};

const STATUS_COLOR: Record<string, string> = {
  completed: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30',
  pending:   'text-amber-600   bg-amber-50   dark:bg-amber-900/30',
  cancelled: 'text-red-500     bg-red-50     dark:bg-red-900/30',
};

export default function ParyavaranMitraEarnings() {
  const { appUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMitra = appUser?.role === 'margdarshak' || appUser?.role === 'admin' || appUser?.role === 'superadmin';

  const [data, setData]           = useState<MitraEarnings | null>(null);
  const [loading, setLoading]     = useState(true);
  const [showLog, setShowLog]     = useState(false);
  const [logging, setLogging]     = useState(false);
  const [ceremonyType, setCeremonyType] = useState(CEREMONY_OPTIONS[0].value);

  const selected = CEREMONY_OPTIONS.find(c => c.value === ceremonyType)!;
  const net = Math.round(selected.gross * 0.8);

  const load = () =>
    fetchMitraEarnings().then(d => { setData(d); setLoading(false); });

  useEffect(() => { load(); }, []);

  const handleLog = async (e: React.FormEvent) => {
    e.preventDefault();
    setLogging(true);
    try {
      const vid = resolveVanshaIdForApi(null);
      const res = await logEcoCeremony({ ceremony_type: ceremonyType, vansha_id: vid || undefined });
      toast({
        title: 'Ceremony logged!',
        description: `You earned ₹${res.net_amount} net (₹${res.gross_amount} gross − 20% platform fee).`,
      });
      setShowLog(false);
      load();
    } catch (err: unknown) {
      toast({ title: 'Could not log ceremony', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLogging(false);
    }
  };

  if (!isMitra) {
    return (
      <AppShell>
        <div className="container py-20 text-center">
          <Leaf className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <p className="font-heading text-xl font-semibold mb-2">Paryavaran Mitra only</p>
          <p className="text-muted-foreground font-body text-sm mb-6">
            This page is for verified Paryavaran Mitras. Apply via the KYC process.
          </p>
          <button
            onClick={() => navigate('/margdarshak-kyc')}
            className="px-6 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold font-body text-sm shadow-warm hover:opacity-90 transition-opacity">
            Apply as Paryavaran Mitra
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Hero */}
      <div className="relative gradient-hero text-primary-foreground py-10 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.06) 0%, transparent 55%)' }} />
        <div className="container relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs tracking-[0.2em] uppercase opacity-60 font-body mb-1">Paryavaran Mitra</p>
            <h1 className="font-heading text-3xl font-bold">Eco-Ceremony Earnings</h1>
            <p className="text-sm opacity-75 font-body mt-1">80% of ceremony fees go to you · 20% platform fee</p>
          </div>
          <button
            onClick={() => setShowLog(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-foreground/15 border border-primary-foreground/30 text-primary-foreground font-semibold font-body text-sm hover:bg-primary-foreground/25 transition-colors"
          >
            <Plus className="w-4 h-4" /> Log Ceremony
          </button>
        </div>
        <div className="absolute inset-x-0 bottom-0 gold-line opacity-60" />
      </div>

      <div className="container py-8 space-y-6">

        {/* Log ceremony modal */}
        {showLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-card rounded-2xl shadow-xl border border-border/50 w-full max-w-md p-6 animate-fade-in">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-heading text-xl font-bold">Log Eco-Ceremony</h2>
                <button onClick={() => setShowLog(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleLog} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium font-body mb-1.5">Ceremony Type</label>
                  <select
                    value={ceremonyType}
                    onChange={e => setCeremonyType(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-ring/30"
                  >
                    {CEREMONY_OPTIONS.map(c => (
                      <option key={c.value} value={c.value}>{c.label} — ₹{c.gross}</option>
                    ))}
                  </select>
                </div>
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 p-4">
                  <div className="flex justify-between text-sm font-body mb-1">
                    <span className="text-muted-foreground">Gross amount</span>
                    <span>₹{selected.gross}</span>
                  </div>
                  <div className="flex justify-between text-sm font-body mb-1">
                    <span className="text-muted-foreground">Platform fee (20%)</span>
                    <span className="text-red-500">−₹{selected.gross - net}</span>
                  </div>
                  <div className="flex justify-between font-semibold font-body text-emerald-700 dark:text-emerald-400 pt-2 border-t border-emerald-200 dark:border-emerald-700">
                    <span>You receive</span>
                    <span>₹{net}</span>
                  </div>
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowLog(false)}
                    className="flex-1 py-2.5 rounded-lg border border-border font-body text-sm font-medium hover:bg-muted transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={logging}
                    className="flex-1 py-2.5 rounded-lg gradient-hero text-primary-foreground font-body text-sm font-semibold shadow-warm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                    {logging && <Loader2 className="w-4 h-4 animate-spin" />}
                    Log & Earn
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !data ? (
          <div className="text-center py-20 text-muted-foreground font-body">Could not load earnings.</div>
        ) : (
          <>
            {/* Total earnings card */}
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
                <IndianRupee className="w-8 h-8 text-emerald-600 mb-2" />
                <p className="font-heading text-4xl font-bold text-emerald-700 dark:text-emerald-400">
                  {data.total_net_earned.toLocaleString('en-IN')}
                </p>
                <p className="text-sm text-emerald-600 font-body mt-1">Total Net Earned</p>
              </div>

              <div className="sm:col-span-2 bg-card rounded-2xl border border-border/50 shadow-card p-5">
                <h3 className="font-heading font-semibold text-base mb-4">By Ceremony Type</h3>
                {Object.keys(data.by_ceremony).length === 0 ? (
                  <p className="text-muted-foreground font-body text-sm">No ceremonies logged yet.</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(data.by_ceremony).map(([type, amount]) => (
                      <div key={type} className="flex items-center justify-between">
                        <span className="text-sm font-body text-muted-foreground">
                          {CEREMONY_LABEL[type] ?? type}
                        </span>
                        <span className="font-semibold font-body text-sm">
                          ₹{(amount as number).toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Transactions table */}
            <div className="bg-card rounded-2xl border border-border/50 shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border/40">
                <h3 className="font-heading font-semibold text-base">Transaction History</h3>
              </div>
              {data.transactions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground font-body text-sm">
                  No ceremonies logged yet. Click "Log Ceremony" to start.
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {data.transactions.map((txn, i) => (
                    <div key={i} className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <Leaf className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="text-sm font-body">{CEREMONY_LABEL[txn.ceremony_type] ?? txn.ceremony_type}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-body font-medium flex items-center gap-1 ${STATUS_COLOR[txn.status] ?? ''}`}>
                          {STATUS_ICON[txn.status as keyof typeof STATUS_ICON]}
                          {txn.status}
                        </span>
                        <span className="font-semibold font-body text-sm min-w-[60px] text-right">
                          ₹{txn.net_amount.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
