import './pandit-crm.css';
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Home, Calendar, Shield, Users, Map, BarChart3, Network,
  Search, Bell, Settings, RefreshCw, Plus, Phone, Copy,
  CheckCircle2, XCircle, Lock, TrendingUp, Clock, LogOut, Link2, Trash2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getApiBaseUrl, fetchTodayPanchang, type TodayPanchang } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import PanchangCalendarView from '@/components/PanchangCalendarView';

// ── Types ────────────────────────────────────────────────────────────
interface CalendarEvent {
  id: string; vansha_id: string; title: string;
  event_date: string; event_type: string; description: string; recurs_yearly: boolean;
}
interface VerifyRequest {
  id: string; node_id: string; status: string; created_at: string;
  vansha_id: string; notes: string; generations: number; members: number; city: string;
  person: { first_name: string; last_name: string; verification_tier: string; gotra: string; date_of_birth: string; } | null;
}
interface Transaction {
  id: string; created_at: string; description: string;
  base_amount_paise: number; igst_paise: number; status: string; payment_type: string;
  invoices: { invoice_number: string } | null;
}
interface TransactionsResponse {
  total: number;
  current_subscription: { plan_id: string; status: string; start_date: string; end_date: string; } | null;
  transactions: Transaction[];
}
interface PeerPandit { id: string; full_name: string; status: string; deva: string; city: string; spec: string; verified: boolean; }
interface VerifiedFamily { id: string; vansha_id: string; approved_at: string; person: { first_name: string; last_name: string; gotra?: string; vansha_id?: string } | null; }

// UI shapes
interface Milestone { id: string; type: 'bday'|'anniv'|'tithi'; name: string; family: string; detail: string; vansha: string; when: string; phone: string; }
interface Booking { id: string; date: string; time: string; ritual: string; family: string; loc: string; fee: number; }
interface QueueRow { id: string; family: string; vansha: string; requestedBy: string; generations: number; members: number; requested: string; city: string; notes: string; }
interface LedgerRow { id: string; date: string; family: string; kind: string; gross: number; net: number; status: string; invoice?: string; }
interface PeerRow { name: string; loc: string; city: string; spec: string; verified: boolean; }

// ── NAV ──────────────────────────────────────────────────────────────
const NAV = [
  { id: 'today',     label: 'Today',      deva: 'आज',          Icon: Home,     section: 'Daily' },
  { id: 'calendar',  label: 'Calendar',   deva: 'पञ्चाङ्ग',    Icon: Calendar, section: 'Daily' },
  { id: 'authority', label: 'Gold Seal',  deva: 'स्वर्ण मुहर', Icon: Shield,   section: 'Lineage' },
  { id: 'onboard',   label: 'Onboard',    deva: 'वंशावली',     Icon: Users,    section: 'Lineage' },
  { id: 'heritage',  label: 'Heritage',   deva: 'यजमान',       Icon: Map,      section: 'Lineage' },
  { id: 'earnings',  label: 'Earnings',   deva: 'आय-व्यय',     Icon: BarChart3,section: 'Practice' },
  { id: 'network',   label: 'Network',    deva: 'मण्डल',       Icon: Network,  section: 'Practice' },
  { id: 'referrals', label: 'Referrals',  deva: 'आमंत्रण',     Icon: Link2,    section: 'Practice' },
] as const;
type RouteId = typeof NAV[number]['id'];

// ── Utility ───────────────────────────────────────────────────────────
function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  return `${Math.floor(days / 7)} weeks ago`;
}
function relativeWhen(iso: string) {
  const today = new Date(); today.setHours(0,0,0,0);
  const dt = new Date(iso); dt.setHours(0,0,0,0);
  const diff = Math.round((dt.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return dt.toLocaleDateString('en-IN', { weekday: 'long' });
  return dt.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}


// ── Adapters ─────────────────────────────────────────────────────────
function adaptMilestones(events: CalendarEvent[]): Milestone[] {
  const today = new Date(); today.setHours(0,0,0,0);
  const horizon = new Date(today); horizon.setDate(horizon.getDate() + 2);
  return events
    .filter(e => ['birthday','anniversary','event'].includes(e.event_type))
    .map(e => ({ ...e, _d: new Date(e.event_date) }))
    .filter(e => e._d >= today && e._d < horizon)
    .map(e => {
      const phone = (e.description || '').match(/\+?\d[\d\s-]{8,}/)?.[0] ?? '';
      return {
        id: e.id,
        type: (e.event_type === 'birthday' ? 'bday' : e.event_type === 'anniversary' ? 'anniv' : 'tithi') as Milestone['type'],
        name: e.title.split('·')[0].trim(),
        family: e.description.split('·')[0].trim() || 'Yajman',
        detail: e.title.split('·').slice(1).join('·').trim() || e.event_type,
        vansha: e.vansha_id,
        when: relativeWhen(e.event_date),
        phone,
      };
    });
}
function adaptBookings(events: CalendarEvent[]): Booking[] {
  return events
    .filter(e => e.event_type === 'event')
    .map(e => {
      const desc = e.description || '';
      const timeM = desc.match(/(\d{1,2}:\d{2}\s*[AP]M)/i);
      const feeM  = desc.match(/₹([\d,]+)/);
      const parts = e.title.split('·').map(s => s.trim());
      return {
        id: e.id,
        date: relativeWhen(e.event_date),
        time: timeM ? timeM[1] : '—',
        ritual: parts[0],
        family: parts[1] || desc.split('·')[1]?.trim() || '',
        loc: desc.split('·')[1]?.trim() || desc,
        fee: feeM ? Number(feeM[1].replace(/,/g,'')) : 0,
      };
    })
    .sort((a, b) => (a.date === 'Today' ? -1 : 1));
}
function adaptQueue(rows: VerifyRequest[]): QueueRow[] {
  return rows.map(r => ({
    id: r.id,
    family: `${r.person?.last_name ?? ''} Kutumb`.trim(),
    vansha: r.vansha_id,
    requestedBy: `${r.person?.first_name ?? ''} ${r.person?.last_name ?? ''}`.trim(),
    generations: r.generations ?? 5,
    members: r.members ?? 30,
    requested: timeAgo(r.created_at),
    city: r.city || '—',
    notes: r.notes || `Gotra: ${r.person?.gotra ?? '—'}`,
  }));
}
function adaptTransactions(resp: TransactionsResponse | null): LedgerRow[] {
  if (!resp?.transactions) return [];
  return resp.transactions.map(t => {
    const gross = (t.base_amount_paise + t.igst_paise) / 100;
    const net   = Math.round(gross * 0.9);
    return {
      id: t.id,
      date: new Date(t.created_at).toLocaleDateString('en-IN', { month:'short', day:'numeric' }),
      family: t.description.split('—')[1]?.trim() || 'Yajman',
      kind:   t.description.split('—')[0]?.trim() || t.payment_type,
      gross, net,
      status: t.status === 'captured' ? 'paid' : t.status === 'created' ? 'pending' : t.status,
      invoice: t.invoices?.invoice_number,
    };
  });
}
function adaptPeers(rows: PeerPandit[]): PeerRow[] {
  return rows.map(r => ({
    name: r.full_name,
    loc: r.deva || '',
    city: r.city || '',
    spec: r.spec || 'General',
    verified: r.status === 'active' || r.verified === true,
  }));
}

// ── Local todo state (no backend — persisted in sessionStorage) ───────
interface TodoItem { id: number; text: string; priority: 'high'|'med'|'low'; done: boolean; }
function useTodos() {
  const [todos, setTodos] = useState<TodoItem[]>(() => {
    try { return JSON.parse(sessionStorage.getItem('pcrm-todos') ?? 'null') ?? []; } catch { return []; }
  });
  const save = (next: TodoItem[]) => { setTodos(next); try { sessionStorage.setItem('pcrm-todos', JSON.stringify(next)); } catch { /* ignore */ } };
  const toggle = (id: number) => save(todos.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const add = (text: string) => { if (!text.trim()) return; save([...todos, { id: Date.now(), text: text.trim(), priority: 'med', done: false }]); };
  const remove = (id: number) => save(todos.filter(t => t.id !== id));
  return { todos, toggle, add, remove };
}

// ── Shared hooks / components ─────────────────────────────────────────
function useAuthFetch() {
  const { session } = useAuth();
  return useCallback((url: string, init?: RequestInit) =>
    fetch(url, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
    }), [session?.access_token]);
}

function PageHead({ eyebrow, title, deva, subtitle, actions }: { eyebrow: string; title: string; deva?: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="pcrm-page-head">
      <div>
        <div className="pcrm-eyebrow">{eyebrow}</div>
        <h1 className="pcrm-page-title">
          {deva && <span className="pcrm-deva">{deva} </span>}{title}
        </h1>
        {subtitle && <p className="pcrm-page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="pcrm-head-actions">{actions}</div>}
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    paid: ['pcrm-tag-green','Paid'], captured: ['pcrm-tag-green','Paid'],
    pending: ['pcrm-tag-mute','Pending'], created: ['pcrm-tag-mute','Created'],
    in_progress: ['pcrm-tag-saffron','In progress'],
    completed: ['pcrm-tag-gold','Completed'], verified: ['pcrm-tag-gold','Verified'],
  };
  const [cls, label] = map[status] ?? ['pcrm-tag-mute', status];
  return <span className={`pcrm-tag ${cls}`}>{label}</span>;
}

function SourceBadge({ live, loading, error, endpoint }: { live: boolean; loading: boolean; error: string | null; endpoint: string }) {
  if (loading) return <span className="pcrm-tag pcrm-tag-mute"><span className="pcrm-dot"></span> Loading…</span>;
  if (live)    return <span className="pcrm-tag pcrm-tag-green" title={endpoint}><span className="pcrm-dot live"></span> Live</span>;
  return <span className="pcrm-tag pcrm-tag-mute" title={error ?? 'offline'}><span className="pcrm-dot"></span> Offline · cached</span>;
}

function ApiState({ loading, error, empty, emptyText = 'No records yet.' }: { loading: boolean; error?: string | null; empty?: boolean; emptyText?: string }) {
  if (loading) return <div className="pcrm-api-state"><span className="pcrm-spinner"></span><span>Fetching from kutumb-sangam API…</span></div>;
  if (error)   return <div className="pcrm-api-state error"><XCircle size={14}/><span>API unreachable — showing cached data. <span className="pcrm-mono">{error}</span></span></div>;
  if (empty)   return <div className="pcrm-api-state"><span className="pcrm-muted">{emptyText}</span></div>;
  return null;
}

// ── Page components ───────────────────────────────────────────────────
interface PageProps { base: string; authFetch: ReturnType<typeof useAuthFetch>; onNav?: (r: RouteId) => void; }

function TodayPage({ base, authFetch, onNav }: PageProps) {
  const today = new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' });
  const { todos, toggle, add, remove } = useTodos();
  const [newTodo, setNewTodo] = useState('');

  const { data: rawEvents, isLoading: evLoad, isError: evErr, isFetched: evFetched, refetch: evRefetch } =
    useQuery<CalendarEvent[]>({
      queryKey: ['pcrm-events'],
      queryFn: () => authFetch(`${base}/api/calendar/events`).then(r => { if (!r.ok) throw new Error(r.status.toString()); return r.json(); }),
      retry: 1, staleTime: 60_000,
    });

  const { data: rawQueue } = useQuery<VerifyRequest[]>({
    queryKey: ['pcrm-queue'],
    queryFn: () => authFetch(`${base}/api/margdarshak/queue`).then(r => { if (!r.ok) throw new Error(r.status.toString()); return r.json(); }),
    retry: 1, staleTime: 30_000,
  });
  const { data: verifiedFamilies = [], isLoading: vfLoad } = useQuery<VerifiedFamily[]>({
    queryKey: ['pcrm-verified'],
    queryFn: () => authFetch(`${base}/api/margdarshak/verified`).then(r => r.ok ? r.json() : []),
    retry: 1, staleTime: 120_000,
  });
  const { data: rawTxn } = useQuery<TransactionsResponse>({
    queryKey: ['pcrm-txn'],
    queryFn: () => authFetch(`${base}/api/payments/transactions`).then(r => { if (!r.ok) throw new Error(r.status.toString()); return r.json(); }),
    retry: 1, staleTime: 60_000,
  });

  const events = rawEvents ?? [];
  const milestones = useMemo(() => adaptMilestones(events), [events]);
  const bookings   = useMemo(() => adaptBookings(events),   [events]);
  const queue      = adaptQueue(rawQueue ?? []);
  const txns       = adaptTransactions(rawTxn ?? null);
  const monthNet   = txns.filter(t => t.status === 'paid').reduce((s, t) => s + t.net, 0);
  const live       = evFetched && !evErr;

  return (
    <>
      <PageHead eyebrow="आज · The Daily Blessing" deva="स्वस्ति" title="Today's Milestones"
        subtitle="Birthdays, anniversaries, and tithis across your network."
        actions={<>
          <SourceBadge live={live} loading={evLoad} error={evErr ? 'unreachable' : null} endpoint="/api/calendar/events"/>
          <button className="pcrm-btn pcrm-btn-ghost pcrm-btn-sm" onClick={() => evRefetch()}><RefreshCw size={13}/> Refresh</button>
          <button className="pcrm-btn pcrm-btn-primary pcrm-btn-sm"><Plus size={14}/> Add Booking</button>
        </>}
      />

      <div className="pcrm-kpi-row">
        <div className="pcrm-kpi accent">
          <div className="pcrm-kpi-label">Today's Network</div>
          <div className="pcrm-kpi-value">{milestones.length} <span style={{fontSize:14,color:'var(--pcrm-ink-mute)',fontWeight:400}}>milestones</span></div>
          <div className="pcrm-kpi-trend"><TrendingUp size={11}/> from your calendar</div>
        </div>
        <div className="pcrm-kpi">
          <div className="pcrm-kpi-label">Bookings This Week</div>
          <div className="pcrm-kpi-value">{bookings.length}</div>
          <div className="pcrm-kpi-trend flat"><Clock size={11}/> from your calendar</div>
        </div>
        <div className="pcrm-kpi">
          <div className="pcrm-kpi-label">Pending Verifications</div>
          <div className="pcrm-kpi-value"><span className="pcrm-shimmer-gold">{queue.length}</span></div>
          <div className="pcrm-kpi-trend flat"><Shield size={11}/> awaiting review</div>
        </div>
        <div className="pcrm-kpi">
          <div className="pcrm-kpi-label">Verified Families</div>
          <div className="pcrm-kpi-value">{vfLoad ? '…' : verifiedFamilies.length}</div>
          <div className="pcrm-kpi-trend"><CheckCircle2 size={11}/> Gold Seal approved</div>
        </div>
        <div className="pcrm-kpi">
          <div className="pcrm-kpi-label">May Earnings · Net</div>
          <div className="pcrm-kpi-value"><span className="pcrm-rupee">₹</span>{monthNet.toLocaleString('en-IN')}</div>
          <div className="pcrm-kpi-trend">from ledger</div>
        </div>
      </div>

      <div className="pcrm-cols-2">
        <section className="pcrm-card">
          <div className="pcrm-card-head">
            <div>
              <div className="pcrm-card-title">Today · {today}</div>
              <div className="pcrm-card-sub">Upcoming milestones &amp; occasions</div>
            </div>
            <span className="pcrm-tag pcrm-tag-gold"><span className="pcrm-dot gold"></span> Live</span>
          </div>
          <ApiState loading={evLoad} error={evErr && !milestones.length ? 'unreachable' : null} empty={!evLoad && !milestones.length} emptyText="No milestones today."/>
          <div className="pcrm-stack" style={{gap:10}}>
            {milestones.map(m => (
              <div key={m.id} className="pcrm-milestone">
                <div className={`pcrm-milestone-mark ${m.type}`}>
                  {m.type === 'bday' ? '🎂' : m.type === 'anniv' ? '💍' : <span className="pcrm-deva" style={{fontSize:18}}>श्र</span>}
                </div>
                <div>
                  <div className="pcrm-serif" style={{fontWeight:600,fontSize:15}}>{m.name}</div>
                  <div className="pcrm-mono pcrm-text-xs pcrm-muted" style={{marginTop:2}}>{m.family} · {m.vansha} · {m.detail}</div>
                  <div className="pcrm-text-xs pcrm-muted pcrm-mt-2">{m.when}</div>
                </div>
                <div className="pcrm-flex pcrm-gap-2">
                  <button className="pcrm-btn pcrm-btn-ghost pcrm-btn-sm" title={m.phone}><Phone size={13}/></button>
                  <button className="pcrm-btn pcrm-btn-primary pcrm-btn-sm">Bless</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="pcrm-stack">
          <section className="pcrm-card">
            <div className="pcrm-card-head">
              <div className="pcrm-card-title">Today's Schedule</div>
              <button className="pcrm-btn pcrm-btn-ghost pcrm-btn-sm" onClick={() => onNav?.('calendar')}>View all</button>
            </div>
            {bookings.filter(b => b.date === 'Today').map(b => (
              <div key={b.id} className="pcrm-row" style={{padding:'10px 0'}}>
                <div className="pcrm-row-avatar" style={{background:'var(--pcrm-saffron-tint)'}}>
                  <span className="pcrm-mono" style={{fontSize:11}}>{b.time.split(' ')[0]}</span>
                </div>
                <div>
                  <div className="pcrm-row-name">{b.ritual}</div>
                  <div className="pcrm-row-meta">{b.family} · {b.loc}</div>
                </div>
              </div>
            ))}
            {todos.slice(0,3).map(t => (
              <div key={t.id} className="pcrm-row" style={{padding:'10px 0',borderBottom:'1px dashed var(--pcrm-hair)'}}>
                <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} style={{width:16,height:16,accentColor:'var(--pcrm-saffron)'}}/>
                <div className="pcrm-grow pcrm-text-sm" style={{textDecoration:t.done?'line-through':'none',color:t.done?'var(--pcrm-ink-mute)':undefined}}>{t.text}</div>
                {t.priority === 'high' && <span className="pcrm-tag pcrm-tag-red">Priority</span>}
                <button onClick={() => remove(t.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--pcrm-ink-faint)',padding:'0 2px',fontSize:14}}>×</button>
              </div>
            ))}
            {todos.length === 0 && <div className="pcrm-muted pcrm-text-xs" style={{padding:'6px 0'}}>No tasks — add one below.</div>}
            <div className="pcrm-flex pcrm-gap-2 pcrm-mt-2">
              <input value={newTodo} onChange={e => setNewTodo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { add(newTodo); setNewTodo(''); } }} placeholder="Add task…" className="pcrm-input" style={{flex:1,fontSize:12,padding:'5px 8px'}}/>
              <button className="pcrm-btn pcrm-btn-ghost pcrm-btn-sm" onClick={() => { add(newTodo); setNewTodo(''); }}>Add</button>
            </div>
          </section>

          <section className="pcrm-lineage-seal">
            <div className="pcrm-lineage-seal-eyebrow">Lineage Authority</div>
            <div className="pcrm-lineage-seal-num">{queue.length}<span className="small"> / 7</span></div>
            <div className="pcrm-lineage-seal-cap">
              {queue.length} {queue.length === 1 ? 'family is' : 'families are'} awaiting your Gold Seal.
            </div>
            <button className="pcrm-btn pcrm-btn-gold pcrm-mt-4" onClick={() => onNav?.('authority')}>
              Review requests →
            </button>
          </section>

          <section className="pcrm-card">
            <div className="pcrm-card-head">
              <div className="pcrm-card-title">Verified Families</div>
              <span className="pcrm-tag pcrm-tag-green">{verifiedFamilies.length} sealed</span>
            </div>
            <ApiState loading={vfLoad} empty={!vfLoad && verifiedFamilies.length === 0} emptyText="No families approved yet." />
            <div className="pcrm-stack" style={{gap:8, maxHeight:240, overflowY:'auto'}}>
              {verifiedFamilies.map(f => {
                const p = f.person;
                const name = p ? `${p.first_name} ${p.last_name}`.trim() : '—';
                const approvedDate = f.approved_at
                  ? new Date(f.approved_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
                  : '';
                return (
                  <div key={f.id} className="pcrm-row" style={{padding:'8px 0'}}>
                    <div className="pcrm-row-avatar" style={{background:'rgba(34,197,94,0.12)'}}>
                      <CheckCircle2 size={15} color="var(--pcrm-green, #16a34a)" />
                    </div>
                    <div className="pcrm-grow">
                      <div className="pcrm-row-name" style={{fontSize:13}}>{name}</div>
                      <div className="pcrm-row-meta pcrm-mono" style={{fontSize:10}}>
                        {p?.gotra ? `Gotra: ${p.gotra} · ` : ''}{approvedDate}
                      </div>
                    </div>
                    <span className="pcrm-tag pcrm-tag-green" style={{fontSize:9}}>✓ Sealed</span>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function CalendarPage({ base, authFetch }: PageProps) {
  const { todos, toggle, add, remove } = useTodos();
  const [newTodo, setNewTodo] = useState('');
  const nowDate = new Date();

  const { data: todayPanchang } = useQuery<TodayPanchang | null>({
    queryKey: ['pcrm-panchang-today'],
    queryFn: () => fetchTodayPanchang(),
    retry: 1, staleTime: 3600_000,
  });

  const { data: rawEvents, isLoading: eLoad, isError: eErr } = useQuery<CalendarEvent[]>({
    queryKey: ['pcrm-events'],
    queryFn: () => authFetch(`${base}/api/calendar/events`).then(r => { if (!r.ok) throw new Error(r.status.toString()); return r.json(); }),
    retry: 1, staleTime: 60_000,
  });

  const events   = rawEvents ?? [];
  const bookings = useMemo(() => adaptBookings(events), [events]);

  return (
    <>
      <PageHead eyebrow="Ritual Calendar" deva="पञ्चाङ्ग" title="Bookings & Sankalp"
        subtitle="Lunar tithis &amp; your upcoming bookings"
        actions={<>
          <SourceBadge live={!eErr} loading={eLoad} error={eErr ? 'unreachable' : null} endpoint="panchang + calendar"/>
          <button className="pcrm-btn pcrm-btn-primary pcrm-btn-sm"><Plus size={14}/> New booking</button>
        </>}
      />

      {todayPanchang && (
        <div className="pcrm-card" style={{marginBottom:16,padding:'14px 18px',background:'var(--pcrm-saffron-tint)',border:'1px solid rgba(212,154,31,0.35)',display:'flex',gap:18,alignItems:'center',flexWrap:'wrap'}}>
          <div>
            <div className="pcrm-eyebrow" style={{fontSize:10,letterSpacing:'0.15em'}}>TODAY · Prokerala Panchang</div>
            <div className="pcrm-serif" style={{fontWeight:600,fontSize:16,marginTop:3}}>
              {todayPanchang.tithi?.name ?? '—'} · {todayPanchang.paksha === 'shukla' ? 'Shukla' : 'Krishna'} Paksha
            </div>
          </div>
          {todayPanchang.nakshatra && <span className="pcrm-tag pcrm-tag-gold" style={{fontSize:11}}>★ {todayPanchang.nakshatra}</span>}
          {todayPanchang.yoga      && <span className="pcrm-tag pcrm-tag-mute"  style={{fontSize:11}}>{todayPanchang.yoga} Yoga</span>}
          {todayPanchang.special_flag && <span className="pcrm-tag pcrm-tag-saffron" style={{fontSize:11}}>🪔 {todayPanchang.special_flag}</span>}
          {todayPanchang.masa && <span className="pcrm-mono pcrm-muted" style={{fontSize:11}}>{todayPanchang.masa}</span>}
        </div>
      )}

      <div className="pcrm-cols-2">
        <section className="pcrm-card">
          <div className="pcrm-card-head">
            <div className="pcrm-card-title">Panchang</div>
          </div>
          <PanchangCalendarView defaultYear={nowDate.getFullYear()} defaultMonth={nowDate.getMonth() + 1} showDetail={false} />
        </section>

        <aside className="pcrm-stack">
          <section className="pcrm-card">
            <div className="pcrm-card-head">
              <div className="pcrm-card-title">Upcoming Bookings</div>
              <span className="pcrm-tag pcrm-tag-saffron">{bookings.length} scheduled</span>
            </div>
            <ApiState loading={eLoad} error={eErr&&!bookings.length?'unreachable':null} empty={!eLoad&&!bookings.length}/>
            {bookings.map(b => (
              <div key={b.id} className="pcrm-row" style={{alignItems:'flex-start'}}>
                <div className="pcrm-row-avatar" style={{background:'var(--pcrm-bg-soft)'}}>
                  <div style={{textAlign:'center',lineHeight:1}}>
                    <div className="pcrm-mono" style={{fontSize:9,color:'var(--pcrm-ink-mute)'}}>{b.date.split(' ')[0]}</div>
                    <div className="pcrm-serif" style={{fontWeight:700,fontSize:14}}>{b.date.split(' ')[1] ?? b.date.slice(0,3)}</div>
                  </div>
                </div>
                <div className="pcrm-grow">
                  <div className="pcrm-row-name">{b.ritual}</div>
                  <div className="pcrm-row-meta">{b.time} · {b.family}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div className="pcrm-mono" style={{fontWeight:600,fontSize:13}}>₹{b.fee.toLocaleString('en-IN')}</div>
                </div>
              </div>
            ))}
          </section>

          <section className="pcrm-card">
            <div className="pcrm-card-head">
              <div className="pcrm-card-title">Daily To-Do</div>
            </div>
            {todos.map(t => (
              <div key={t.id} className="pcrm-row" style={{padding:'10px 0'}}>
                <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} style={{width:16,height:16,accentColor:'var(--pcrm-saffron)'}}/>
                <div className="pcrm-grow pcrm-text-sm" style={{textDecoration:t.done?'line-through':'none',color:t.done?'var(--pcrm-ink-mute)':undefined}}>{t.text}</div>
                {t.priority === 'high' && <span className="pcrm-tag pcrm-tag-red">High</span>}
                {t.priority === 'med'  && <span className="pcrm-tag pcrm-tag-saffron">Med</span>}
                <button onClick={() => remove(t.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--pcrm-ink-faint)',padding:'0 2px',fontSize:14}}>×</button>
              </div>
            ))}
            {todos.length === 0 && <div className="pcrm-muted pcrm-text-xs" style={{padding:'6px 0'}}>No tasks yet.</div>}
            <div className="pcrm-flex pcrm-gap-2 pcrm-mt-2">
              <input value={newTodo} onChange={e => setNewTodo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { add(newTodo); setNewTodo(''); } }} placeholder="Add task…" className="pcrm-input" style={{flex:1,fontSize:12,padding:'5px 8px'}}/>
              <button className="pcrm-btn pcrm-btn-ghost pcrm-btn-sm" onClick={() => { add(newTodo); setNewTodo(''); }}>Add</button>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function AuthorityPage({ base, authFetch }: PageProps) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: rawQueue, isLoading, isError, isFetched, refetch } = useQuery<VerifyRequest[]>({
    queryKey: ['pcrm-queue'],
    queryFn: () => authFetch(`${base}/api/margdarshak/queue`).then(r => { if (!r.ok) throw new Error(r.status.toString()); return r.json(); }),
    retry: 1, staleTime: 30_000,
  });
  const { data: verifiedFamilies } = useQuery<VerifiedFamily[]>({
    queryKey: ['pcrm-verified'],
    queryFn: () => authFetch(`${base}/api/margdarshak/verified`).then(r => r.ok ? r.json() : []),
    retry: 1, staleTime: 120_000,
  });
  const queue = adaptQueue(rawQueue ?? []);
  const live  = isFetched && !isError;

  const [decisions, setDecisions] = useState<Record<string, 'approved'|'rejected'|'submitting'>>({});

  const reviewMutation = useMutation({
    mutationFn: ({ request_id, action }: { request_id: string; action: string }) =>
      authFetch(`${base}/api/margdarshak/review`, {
        method: 'POST',
        body: JSON.stringify({ request_id, action, notes: null }),
      }).then(r => { if (!r.ok) throw new Error(r.status.toString()); return r.json(); }),
    onSuccess: (_d, { request_id, action }) => {
      setDecisions(s => ({ ...s, [request_id]: action as 'approved'|'rejected' }));
      toast({ title: action === 'approved' ? 'Gold Seal applied ✓' : 'Rejected', description: 'Decision saved.' });
      qc.invalidateQueries({ queryKey: ['pcrm-queue'] });
    },
    onError: (_e, { request_id, action }) => {
      setDecisions(s => ({ ...s, [request_id]: action as 'approved'|'rejected' }));
    },
  });

  const submit = (request_id: string, action: 'approved'|'rejected') => {
    setDecisions(s => ({ ...s, [request_id]: 'submitting' }));
    reviewMutation.mutate({ request_id, action });
  };

  return (
    <>
      <PageHead eyebrow="Lineage Authority" deva="स्वर्ण मुहर" title="Gold Seal Verification"
        subtitle="Review pending lineage verification requests and apply your Gold Seal."
        actions={<>
          <SourceBadge live={live} loading={isLoading} error={isError ? 'unreachable' : null} endpoint="/api/margdarshak/queue"/>
          <button className="pcrm-btn pcrm-btn-ghost pcrm-btn-sm" onClick={() => refetch()}><RefreshCw size={13}/></button>
        </>}
      />

      <div className="pcrm-kpi-row" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
        <div className="pcrm-kpi accent">
          <div className="pcrm-kpi-label">Awaiting your seal</div>
          <div className="pcrm-kpi-value">{queue.length}</div>
          <div className="pcrm-kpi-trend flat">awaiting review</div>
        </div>
        <div className="pcrm-kpi">
          <div className="pcrm-kpi-label">Sealed · This session</div>
          <div className="pcrm-kpi-value">{Object.values(decisions).filter(d=>d==='approved').length}</div>
          <div className="pcrm-kpi-trend">this session</div>
        </div>
        <div className="pcrm-kpi">
          <div className="pcrm-kpi-label">Lifetime verified</div>
          <div className="pcrm-kpi-value">{verifiedFamilies?.length ?? '—'}</div>
          <div className="pcrm-kpi-trend flat">all time</div>
        </div>
      </div>

      <section className="pcrm-card">
        <div className="pcrm-card-head">
          <div className="pcrm-card-title">Verification Requests</div>
          <div className="pcrm-card-sub">Verification requests from Yajman families</div>
        </div>
        <ApiState loading={isLoading} error={isError&&!queue.length?'unreachable':null} empty={!isLoading&&!queue.length} emptyText="Queue empty — all caught up."/>
        <div className="pcrm-stack" style={{gap:14}}>
          {queue.map(r => {
            const d = decisions[r.id];
            const isApproved   = d === 'approved';
            const isRejected   = d === 'rejected';
            const isSubmitting = d === 'submitting';
            return (
              <div key={r.id} className="pcrm-card flat" style={{
                border: isApproved ? '1.5px solid var(--pcrm-gold)' : isRejected ? '1.5px solid var(--pcrm-red)' : '1px solid var(--pcrm-hair-strong)',
                background: isApproved ? 'rgba(212,154,31,0.05)' : isRejected ? 'var(--pcrm-red-tint)' : undefined,
                padding: 18,
              }}>
                <div className="pcrm-flex pcrm-between pcrm-center">
                  <div className="pcrm-flex pcrm-gap-3 pcrm-center">
                    <div className={`pcrm-row-avatar${isApproved?' gold':''}`}>{r.family[0]}</div>
                    <div>
                      <div className="pcrm-serif" style={{fontWeight:600,fontSize:17}}>{r.family}</div>
                      <div className="pcrm-mono pcrm-text-xs pcrm-muted">{r.vansha} · {r.generations} gen · {r.members} members · {r.city}</div>
                    </div>
                  </div>
                  <div>
                    {isSubmitting && <span className="pcrm-tag pcrm-tag-mute">Submitting…</span>}
                    {isApproved   && <span className="pcrm-tag pcrm-tag-gold"><CheckCircle2 size={11}/> Sealed</span>}
                    {isRejected   && <span className="pcrm-tag pcrm-tag-red"><XCircle size={11}/> Rejected</span>}
                    {!d           && <span className="pcrm-tag pcrm-tag-saffron">Awaiting</span>}
                  </div>
                </div>

                <div className="pcrm-flex pcrm-gap-3 pcrm-mt-3 pcrm-text-sm" style={{flexWrap:'wrap'}}>
                  <div><span className="pcrm-mono pcrm-text-xs pcrm-muted">Requested by </span>{r.requestedBy}</div>
                  <div><span className="pcrm-mono pcrm-text-xs pcrm-muted">Submitted </span>{r.requested}</div>
                  <div className="pcrm-grow"><span className="pcrm-mono pcrm-text-xs pcrm-muted">Notes </span>{r.notes}</div>
                </div>

                <hr className="pcrm-divider"/>

                <div className="pcrm-flex pcrm-between pcrm-center">
                  <div className="pcrm-flex pcrm-gap-3 pcrm-center">
                    <span className="pcrm-serif" style={{fontWeight:600,fontSize:15,color:isApproved?'var(--pcrm-gold-deep)':'var(--pcrm-ink-soft)'}}>
                      {isApproved ? 'Gold Seal applied' : 'Slide to seal'}
                    </span>
                    <label className="pcrm-toggle">
                      <input type="checkbox" checked={isApproved} disabled={isSubmitting||isRejected}
                        onChange={e => e.target.checked && submit(r.id, 'approved')}/>
                      <span className="pcrm-toggle-track"></span>
                      <span className="pcrm-toggle-thumb"></span>
                    </label>
                  </div>
                  <div className="pcrm-flex pcrm-gap-2">
                    <button className="pcrm-btn pcrm-btn-ghost pcrm-btn-sm" disabled={isSubmitting||isApproved}
                      style={{color:'var(--pcrm-red)',borderColor:'rgba(192,57,43,0.25)'}}
                      onClick={() => submit(r.id, 'rejected')}>
                      <XCircle size={13}/> Reject
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function OnboardPage({ base, authFetch }: PageProps) {
  const { toast } = useToast();
  const [step, setStep]         = useState(2);
  const [familyName, setFN]     = useState('');
  const [phone, setPhone]       = useState('+91 ');
  const [gotra, setGotra]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]     = useState<{ ok: boolean; vansha_id?: string; error?: string } | null>(null);

  const handleBootstrap = async () => {
    setSubmitting(true); setResult(null);
    try {
      const res = await authFetch(`${base}/api/tree/bootstrap`, {
        method: 'POST',
        body: JSON.stringify({
          tree_name: familyName || 'New Kutumb',
          gotra: gotra || undefined,
          identity: { given_name: 'New', surname: familyName || 'Kutumb', date_of_birth: '1985-01-01', ancestral_place: 'Varanasi', current_residence: 'India' },
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setResult({ ok: true, vansha_id: data.vansha_id });
      setStep(3);
      toast({ title: 'Tree bootstrapped', description: `Vansha ID: ${data.vansha_id}` });
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
    } finally { setSubmitting(false); }
  };

  return (
    <>
      <PageHead eyebrow="Vanshavali Onboarding" deva="वंशावली" title="Seed a New Lineage"
        subtitle="Seed a new family tree and invite the head of family to claim it."
      />

      <div className="pcrm-stepper">
        {['Family details','Lineage seed','Send invite','Handover'].map((s, i) => (
          <div key={i} className={`pcrm-step${i<step?' done':i===step?' active':''}`}>
            <div className="pcrm-step-num">{i < step ? '✓' : i + 1}</div>
            <div className="pcrm-step-label">{s}</div>
          </div>
        ))}
      </div>

      <div className="pcrm-cols-2">
        <section className="pcrm-card">
          <div className="pcrm-card-head">
            <div className="pcrm-card-title">Step 2 · Lineage Seed</div>
            <span className="pcrm-tag pcrm-tag-gold">Auto-verified by Pandit Ji</span>
          </div>

          <div className="pcrm-tree-seed">
            {[
              [['पूर्वज','Great-grandfather']],
              [['Late Bhairo Lal','Grandfather · 1928'],['Smt. Kamla Devi','Grandmother · 1932']],
              [['Shri Mohanlal','Father · 1956'],['Smt. Sushila','Mother · 1960']],
              [[`${familyName.split(' ')[0]||'Rakesh'} Patel`,'Family head · 1985'],['+ Spouse','add']],
            ].map((row, ri) => (
              <div key={ri}>
                {ri > 0 && <div className="pcrm-tree-line"></div>}
                <div className="pcrm-tree-row">
                  {row.map(([name, rel], ni) => (
                    <div key={ni} className={`pcrm-tree-node${name.startsWith('+')?' placeholder':' verified'}`}>
                      <div className="pcrm-tree-node-name">{name}</div>
                      <div className="pcrm-tree-node-rel">{rel}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {result && (
            <div className={`pcrm-api-state${result.ok?'':' error'} pcrm-mt-3`}>
              {result.ok
                ? <><CheckCircle2 size={14}/><span>Tree bootstrapped · vansha_id <span className="pcrm-mono">{result.vansha_id}</span></span></>
                : <><XCircle size={14}/><span>{result.error}</span></>}
            </div>
          )}

          <div className="pcrm-flex pcrm-between pcrm-mt-4">
            <button className="pcrm-btn pcrm-btn-ghost pcrm-btn-sm" onClick={() => setStep(Math.max(0, step-1))}>Back</button>
            <button className="pcrm-btn pcrm-btn-primary pcrm-btn-sm" disabled={submitting} onClick={handleBootstrap}>
              {submitting ? 'Bootstrapping…' : 'Bootstrap & invite →'}
            </button>
          </div>
        </section>

        <aside className="pcrm-stack">
          <section className="pcrm-card">
            <div className="pcrm-card-title pcrm-mb-3">Family Head</div>
            <label className="pcrm-label">Kutumb / Family name</label>
            <input className="pcrm-input" placeholder="e.g. Patel Kutumb" value={familyName} onChange={e => setFN(e.target.value)}/>
            <label className="pcrm-label pcrm-mt-3">Phone (head of family)</label>
            <input className="pcrm-input" placeholder="+91 XXXXX XXXXX" value={phone} onChange={e => setPhone(e.target.value)}/>
            <label className="pcrm-label pcrm-mt-3">Gotra <span className="pcrm-muted" style={{textTransform:'none',letterSpacing:0}}>(optional)</span></label>
            <input className="pcrm-input" placeholder="e.g. Kashyap" value={gotra} onChange={e => setGotra(e.target.value)}/>
          </section>

          <section className="pcrm-card">
            <div className="pcrm-card-title pcrm-mb-3">Invite preview</div>
            <div className="pcrm-text-sm">
              <span className="pcrm-deva">नमस्ते</span>, {familyName || 'Patel'} Ji — your family lineage is ready. Tap to claim:
            </div>
            <div className="pcrm-mono pcrm-text-xs pcrm-mt-3" style={{padding:'10px 12px',background:'var(--pcrm-bg-soft)',borderRadius:7,border:'1px solid var(--pcrm-hair)',color:'var(--pcrm-saffron-dk)',wordBreak:'break-all'}}>
              {window.location.origin}/claim?v={result?.vansha_id ?? 'V-NEW-7821'}
            </div>
            <div className="pcrm-flex pcrm-gap-2 pcrm-mt-3">
              <button className="pcrm-btn pcrm-btn-ghost pcrm-btn-sm pcrm-grow" onClick={() => {
                const link = `${window.location.origin}/claim?v=${result?.vansha_id ?? ''}`;
                void navigator.clipboard.writeText(link);
                toast({ title: 'Link copied!' });
              }}><Copy size={13}/> Copy link</button>
              <button className="pcrm-btn pcrm-btn-primary pcrm-btn-sm pcrm-grow" onClick={() => {
                const link = `${window.location.origin}/claim?v=${result?.vansha_id ?? ''}`;
                const msg = encodeURIComponent(`नमस्ते ${familyName || ''} Ji — your family lineage is ready. Tap to claim: ${link}`);
                window.open(`https://wa.me/?text=${msg}`, '_blank');
              }}>Send via WhatsApp</button>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function EarningsPage({ base, authFetch }: PageProps) {
  const { data: rawTxn, isLoading, isError, isFetched, refetch } = useQuery<TransactionsResponse>({
    queryKey: ['pcrm-txn'],
    queryFn: () => authFetch(`${base}/api/payments/transactions`).then(r => { if (!r.ok) throw new Error(r.status.toString()); return r.json(); }),
    retry: 1, staleTime: 60_000,
  });

  const resp = rawTxn ?? null;
  const txns  = useMemo(() => adaptTransactions(resp), [resp]);
  const total = txns.reduce((s, t) => s + t.net, 0);
  const ytd   = Math.round(total);
  const target = 600000;
  const pct   = target > 0 ? Math.min(100, Math.round((ytd / target) * 100)) : 0;
  const live  = isFetched && !isError;

  return (
    <>
      <PageHead eyebrow="The Ledger" deva="आय-व्यय" title="Accounts & Earnings"
        subtitle="Real payment history from kutumb-sangam Razorpay integration."
        actions={<>
          <SourceBadge live={live} loading={isLoading} error={isError?'unreachable':null} endpoint="/api/payments/transactions"/>
          <button className="pcrm-btn pcrm-btn-ghost pcrm-btn-sm" onClick={() => refetch()}><RefreshCw size={13}/></button>
          <button className="pcrm-btn pcrm-btn-gold pcrm-btn-sm">Request Payout</button>
        </>}
      />

      <div className="pcrm-kpi-row">
        <div className="pcrm-kpi accent">
          <div className="pcrm-kpi-label">May Net Earned</div>
          <div className="pcrm-kpi-value"><span className="pcrm-rupee">₹</span>{total.toLocaleString('en-IN')}</div>
          <div className="pcrm-kpi-trend">{txns.length} txns · {resp?.current_subscription?.plan_id ?? '—'}</div>
        </div>
        <div className="pcrm-kpi">
          <div className="pcrm-kpi-label">Platform Fee · 10%</div>
          <div className="pcrm-kpi-value"><span className="pcrm-rupee">₹</span>{Math.round(total * 0.111).toLocaleString('en-IN')}</div>
          <div className="pcrm-kpi-trend flat">Settled</div>
        </div>
        <div className="pcrm-kpi">
          <div className="pcrm-kpi-label">Pending Payout</div>
          <div className="pcrm-kpi-value"><span className="pcrm-rupee">₹</span>{txns.filter(t=>t.status==='pending').reduce((s,t)=>s+t.net,0).toLocaleString('en-IN')}</div>
          <div className="pcrm-kpi-trend flat"><Clock size={11}/> {txns.filter(t=>t.status==='pending').length} pending</div>
        </div>
        <div className="pcrm-kpi">
          <div className="pcrm-kpi-label">Total Payments</div>
          <div className="pcrm-kpi-value">{resp?.total ?? '—'}</div>
          <div className="pcrm-kpi-trend flat">all time</div>
        </div>
      </div>

      <div className="pcrm-cols-2">
        <section className="pcrm-card">
          <div className="pcrm-card-head">
            <div className="pcrm-card-title">Transaction History</div>
            <div className="pcrm-flex pcrm-gap-2">
              <span className="pcrm-tag pcrm-tag-mute">All</span>
              <span className="pcrm-tag pcrm-tag-saffron">Pujas</span>
              <span className="pcrm-tag pcrm-tag-gold">Verifications</span>
            </div>
          </div>
          <ApiState loading={isLoading} error={isError&&!txns.length?'unreachable':null} empty={!isLoading&&!txns.length}/>
          <div className="pcrm-scroll-x">
            <table className="pcrm-tbl">
              <thead>
                <tr><th>Date</th><th>Family</th><th>Type</th><th className="right">Gross</th><th className="right">Net</th><th>Status</th></tr>
              </thead>
              <tbody>
                {txns.map(t => (
                  <tr key={t.id}>
                    <td className="pcrm-mono pcrm-muted">{t.date}</td>
                    <td>{t.family}</td>
                    <td>{t.kind}</td>
                    <td className="right num">₹{t.gross.toLocaleString('en-IN')}</td>
                    <td className="right num" style={{fontWeight:600,color:'var(--pcrm-saffron-dk)'}}>₹{t.net.toLocaleString('en-IN')}</td>
                    <td><StatusTag status={t.status}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="pcrm-stack">
          <section className="pcrm-card gold-edge">
            <div className="pcrm-eyebrow" style={{color:'var(--pcrm-gold-deep)'}}>Annual Target</div>
            <div className="pcrm-serif" style={{fontSize:32,fontWeight:700,marginTop:6,letterSpacing:'-0.02em'}}>
              <span className="pcrm-rupee" style={{fontSize:20,color:'var(--pcrm-ink-mute)'}}>₹</span>{ytd.toLocaleString('en-IN')}
              <span className="pcrm-muted" style={{fontSize:14,fontWeight:400,marginLeft:6}}>/ {target.toLocaleString('en-IN')}</span>
            </div>
            <div className="pcrm-meter large pcrm-mt-3">
              <div className="pcrm-meter-fill" style={{width:`${pct}%`}}/>
            </div>
            <div className="pcrm-flex pcrm-between pcrm-mt-2 pcrm-mono pcrm-text-xs pcrm-muted">
              <span>{pct}% of FY26 target</span>
              <span>~7 mo to go</span>
            </div>
          </section>

          <section className="pcrm-card">
            <div className="pcrm-card-head">
              <div className="pcrm-card-title">Recent Activity</div>
            </div>
            <ApiState loading={isLoading} empty={!isLoading && !txns.length} emptyText="No transactions yet."/>
            {txns.slice(0, 5).map(t => (
              <div key={t.id} className="pcrm-flex pcrm-between pcrm-center" style={{padding:'6px 0',borderBottom:'1px solid var(--pcrm-hair)'}}>
                <div className="pcrm-mono pcrm-text-xs pcrm-muted">{t.date}</div>
                <div className="pcrm-text-sm pcrm-grow" style={{padding:'0 8px',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{t.kind}</div>
                <div className="pcrm-mono" style={{fontWeight:600,fontSize:12,color:'var(--pcrm-saffron-dk)'}}>₹{t.net.toLocaleString('en-IN')}</div>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}

function NetworkPage({ base, authFetch }: PageProps) {
  const { data: rawPeers, isLoading, isError, isFetched } = useQuery<PeerPandit[]>({
    queryKey: ['pcrm-peers'],
    queryFn: () => authFetch(`${base}/api/margdarshak/family`).then(r => { if (!r.ok) throw new Error(r.status.toString()); return r.json(); }),
    retry: 1, staleTime: 120_000,
  });
  const peers = adaptPeers(rawPeers ?? []);
  const live  = isFetched && !isError;

  return (
    <>
      <PageHead eyebrow="Purohit Network" deva="पुरोहित मण्डल" title="Refer & Collaborate"
        subtitle="Pandits in your network across linked vanshas — refer and collaborate."
        actions={<>
          <SourceBadge live={live} loading={isLoading} error={isError?'unreachable':null} endpoint="/api/margdarshak/family"/>
          <button className="pcrm-btn pcrm-btn-primary pcrm-btn-sm"><Plus size={14}/> Refer a family</button>
        </>}
      />

      <div className="pcrm-cols-2">
        <section className="pcrm-card">
          <div className="pcrm-card-head">
            <div className="pcrm-card-title">Trusted Pandits Directory</div>
            <span className="pcrm-tag pcrm-tag-gold">{peers.filter(p=>p.verified).length} verified</span>
          </div>
          <ApiState loading={isLoading} error={isError&&!peers.length?'unreachable':null} empty={!isLoading&&!peers.length}/>
          <div className="pcrm-stack" style={{gap:10}}>
            {peers.map((p, i) => (
              <div key={i} className="pcrm-peer-card">
                <div className="pcrm-row-avatar gold">{(p.name.split(' ')[1] ?? p.name)[0]}</div>
                <div className="pcrm-grow">
                  <div className="pcrm-serif" style={{fontWeight:600,fontSize:15}}>
                    {p.name} {p.verified && <span className="pcrm-tag pcrm-tag-gold" style={{marginLeft:6}}><CheckCircle2 size={10}/> Verified</span>}
                  </div>
                  <div className="pcrm-mono pcrm-text-xs pcrm-muted pcrm-mt-2">
                    {p.loc && <span className="pcrm-deva" style={{marginRight:4}}>{p.loc}</span>}{p.city} · {p.spec}
                  </div>
                </div>
                <button className="pcrm-btn pcrm-btn-ghost pcrm-btn-sm">Refer →</button>
              </div>
            ))}
          </div>
        </section>

        <aside className="pcrm-stack">
          <section className="pcrm-card">
            <div className="pcrm-card-head">
              <div className="pcrm-card-title">Active Referrals</div>
            </div>
            <ApiState empty emptyText="No active referrals yet. Use 'Refer a family' to get started."/>
          </section>

          <section className="pcrm-card tinted">
            <div className="pcrm-flex pcrm-gap-3 pcrm-center">
              <Network size={28} color="var(--pcrm-saffron-dk)"/>
              <div>
                <div className="pcrm-serif" style={{fontWeight:600,fontSize:15}}>Collaborative rituals</div>
                <div className="pcrm-text-xs pcrm-muted pcrm-mt-2">
                  For yagyas / pind-daan, request a panel of fellow pandits.
                </div>
              </div>
            </div>
            <button className="pcrm-btn pcrm-btn-primary pcrm-btn-sm pcrm-mt-3" style={{width:'100%'}}>Request a panel</button>
          </section>
        </aside>
      </div>
    </>
  );
}

function HeritagePage(_: PageProps) {
  return (
    <>
      <PageHead eyebrow="Logistics & Heritage" deva="यजमान" title="Map & Vahi Archive"
        subtitle="Yajman locations and Vahi photo archive"
      />

      <div className="pcrm-cols-2">
        <section className="pcrm-card">
          <div className="pcrm-card-head">
            <div>
              <div className="pcrm-card-title">Yajman Map</div>
            </div>
          </div>
          <div className="pcrm-stack" style={{gap:8, minHeight:280}}>
            <ApiState empty emptyText="No yajman locations yet. Locations will appear here as families are onboarded."/>
          </div>
          <div className="pcrm-flex pcrm-gap-2 pcrm-mt-3">
            <button className="pcrm-btn pcrm-btn-ghost pcrm-btn-sm">Today's route</button>
            <button className="pcrm-btn pcrm-btn-ghost pcrm-btn-sm">Cluster by gotra</button>
            <button className="pcrm-btn pcrm-btn-primary pcrm-btn-sm" style={{marginLeft:'auto'}}>Plan visits →</button>
          </div>
        </section>

        <section className="pcrm-card">
          <div className="pcrm-card-head">
            <div>
              <div className="pcrm-card-title">Vahi Photo Archive</div>
            </div>
          </div>
          <div className="pcrm-coming-soon">
            <Lock size={32} color="var(--pcrm-ink-faint)"/>
            <div>
              <div className="pcrm-serif" style={{fontWeight:600,fontSize:16,color:'var(--pcrm-ink-soft)'}}>Coming Soon</div>
              <div className="pcrm-text-sm pcrm-muted pcrm-mt-2">
                Vahi photo scanning and OCR will be available in the next release. Storage bucket integration with Supabase is in progress.
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

// ── Referrals Page ────────────────────────────────────────────────────
interface InviteCode {
  id: string; code: string; created_for: string | null;
  used_by: string | null; used_at: string | null;
  status: 'active' | 'used' | 'revoked'; created_at: string;
}

function ReferralsPage({ base, authFetch }: PageProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [label, setLabel] = useState('');
  const [generating, setGenerating] = useState(false);

  const { data: codes = [], isLoading, isError, refetch } = useQuery<InviteCode[]>({
    queryKey: ['pcrm-my-codes'],
    queryFn: () => authFetch(`${base}/api/referral/mine`).then(r => { if (!r.ok) throw new Error(r.status.toString()); return r.json(); }),
    retry: 1, staleTime: 30_000,
  });

  async function generate() {
    setGenerating(true);
    try {
      const r = await authFetch(`${base}/api/referral/generate`, {
        method: 'POST',
        body: JSON.stringify({ created_for: label.trim() || null }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})) as { detail?: string }; throw new Error((e as { detail?: string }).detail ?? r.status.toString()); }
      setLabel('');
      await qc.invalidateQueries({ queryKey: ['pcrm-my-codes'] });
      toast({ title: 'Invite code generated!' });
    } catch (e) {
      toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' });
    } finally { setGenerating(false); }
  }

  async function revoke(id: string) {
    try {
      const r = await authFetch(`${base}/api/referral/revoke/${id}`, { method: 'POST' });
      if (!r.ok) { const e = await r.json().catch(() => ({})) as { detail?: string }; throw new Error((e as { detail?: string }).detail ?? 'Failed'); }
      await qc.invalidateQueries({ queryKey: ['pcrm-my-codes'] });
      toast({ title: 'Code revoked.' });
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    }
  }

  function copyLink(code: string) {
    const url = `${window.location.origin}/?ref=${code}`;
    void navigator.clipboard.writeText(url);
    toast({ title: 'Invite link copied!' });
  }

  const active  = codes.filter(c => c.status === 'active').length;
  const used    = codes.filter(c => c.status === 'used').length;

  return (
    <>
      <PageHead eyebrow="आमंत्रण · Invite" deva="आमंत्रण" title="Referral Codes"
        subtitle="Generate one-time invite links to bring families onto the platform."
        actions={<>
          <SourceBadge live={!isError && !isLoading} loading={isLoading} error={isError ? 'unreachable' : null} endpoint="/api/referral/mine"/>
          <button className="pcrm-btn pcrm-btn-ghost pcrm-btn-sm" onClick={() => refetch()}><RefreshCw size={13}/></button>
        </>}
      />

      <div className="pcrm-kpi-row" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
        <div className="pcrm-kpi accent">
          <div className="pcrm-kpi-label">Total Generated</div>
          <div className="pcrm-kpi-value">{codes.length}</div>
          <div className="pcrm-kpi-trend flat">all time</div>
        </div>
        <div className="pcrm-kpi">
          <div className="pcrm-kpi-label">Active</div>
          <div className="pcrm-kpi-value">{active}</div>
          <div className="pcrm-kpi-trend flat">unused</div>
        </div>
        <div className="pcrm-kpi">
          <div className="pcrm-kpi-label">Used</div>
          <div className="pcrm-kpi-value"><span className="pcrm-shimmer-gold">{used}</span></div>
          <div className="pcrm-kpi-trend"><CheckCircle2 size={11}/> accepted</div>
        </div>
      </div>

      <div className="pcrm-cols-2">
        <section className="pcrm-card">
          <div className="pcrm-card-head">
            <div className="pcrm-card-title">Generate New Code</div>
          </div>
          <label className="pcrm-label">For whom? <span className="pcrm-muted" style={{textTransform:'none',letterSpacing:0}}>(optional label)</span></label>
          <input className="pcrm-input" placeholder="e.g. Sharma Parivar" value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void generate(); }}
          />
          <button className="pcrm-btn pcrm-btn-primary pcrm-btn-sm pcrm-mt-3" style={{width:'100%'}}
            disabled={generating} onClick={() => void generate()}>
            <Plus size={14}/> {generating ? 'Generating…' : 'Generate Invite Code'}
          </button>
          <p className="pcrm-text-xs pcrm-muted pcrm-mt-3">
            Each code is single-use. Share the link — when someone registers via it, the code is marked as used and attributed to you.
          </p>
        </section>

        <section className="pcrm-card">
          <div className="pcrm-card-head">
            <div className="pcrm-card-title">My Codes</div>
            <span className="pcrm-tag pcrm-tag-mute">{codes.length} total</span>
          </div>
          <ApiState loading={isLoading} error={isError ? 'unreachable' : null} empty={!isLoading && !codes.length} emptyText="No codes yet — generate your first one."/>
          <div className="pcrm-scroll-x">
            <table className="pcrm-tbl">
              <thead>
                <tr><th>Code</th><th>For</th><th>Status</th><th>Date</th><th></th></tr>
              </thead>
              <tbody>
                {codes.map(c => (
                  <tr key={c.id}>
                    <td className="pcrm-mono" style={{fontWeight:700,letterSpacing:'0.08em',color:'var(--pcrm-saffron-dk)'}}>{c.code}</td>
                    <td className="pcrm-muted" style={{fontSize:12}}>{c.created_for ?? '—'}</td>
                    <td>
                      {c.status === 'active' && <span className="pcrm-tag pcrm-tag-saffron">Active</span>}
                      {c.status === 'used'   && <span className="pcrm-tag pcrm-tag-green"><CheckCircle2 size={10}/> Used</span>}
                      {c.status === 'revoked'&& <span className="pcrm-tag pcrm-tag-mute">Revoked</span>}
                    </td>
                    <td className="pcrm-mono pcrm-muted" style={{fontSize:11}}>
                      {new Date(c.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}
                    </td>
                    <td>
                      <div className="pcrm-flex pcrm-gap-2">
                        {c.status === 'active' && (
                          <>
                            <button className="pcrm-btn pcrm-btn-ghost pcrm-btn-sm" title="Copy invite link" onClick={() => copyLink(c.code)}>
                              <Copy size={12}/>
                            </button>
                            <button className="pcrm-btn pcrm-btn-ghost pcrm-btn-sm" title="Revoke"
                              style={{color:'var(--pcrm-red)'}} onClick={() => void revoke(c.id)}>
                              <Trash2 size={12}/>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────
export default function PanditDashboard() {
  const { appUser, signOut } = useAuth();
  const base       = getApiBaseUrl();
  const authFetch  = useAuthFetch();
  const [route, setRoute] = useState<RouteId>('today');

  const { data: rawQueue } = useQuery<VerifyRequest[]>({
    queryKey: ['pcrm-queue'],
    queryFn: () => authFetch(`${base}/api/margdarshak/queue`).then(r => { if (!r.ok) throw new Error(r.status.toString()); return r.json(); }),
    retry: 1, staleTime: 30_000,
  });
  const queueCount = (rawQueue ?? []).length;

  const sections = [...new Set(NAV.map(n => n.section))];
  const vikramYear = new Date().getFullYear() + 57;

  const initials = appUser
    ? `${appUser.first_name?.[0] ?? ''}${appUser.last_name?.[0] ?? ''}`.toUpperCase() || 'PJ'
    : 'PJ';

  return (
    <div className="purohit-crm">
      <div className="pcrm-app">
        {/* Sidebar */}
        <aside className="pcrm-sidebar">
          <div className="pcrm-brand">
            <div className="pcrm-brand-mark">ॐ</div>
            <div>
              <div className="pcrm-brand-name">Purohit Pro</div>
              <div className="pcrm-brand-sub">Kutumb · CRM</div>
            </div>
          </div>

          {sections.map(s => (
            <div key={s}>
              <div className="pcrm-nav-section-label">{s}</div>
              <nav className="pcrm-nav">
                {NAV.filter(n => n.section === s).map(n => {
                  const active = route === n.id;
                  return (
                    <button key={n.id} className={`pcrm-nav-item${active?' active':''}`} onClick={() => setRoute(n.id)}>
                      <n.Icon size={16} className="pcrm-ico"/>
                      <span className="pcrm-nav-item-label">
                        <span className="pcrm-deva" style={{marginRight:5,fontSize:13,color:active?'var(--pcrm-saffron-dk)':'var(--pcrm-ink-mute)'}}>{n.deva}</span>
                        {n.label}
                      </span>
                      {n.id === 'authority' && queueCount > 0 && (
                        <span className="pcrm-nav-badge gold">{queueCount}</span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}

          <div className="pcrm-user-card">
            <div className="pcrm-avatar">{initials}</div>
            <div style={{minWidth:0,flex:1}}>
              <div className="pcrm-user-name">{appUser ? `${appUser.first_name ?? ''} ${appUser.last_name ?? ''}`.trim() : 'Acharya Ji'}</div>
              <div className="pcrm-user-role">★ Verified · Margdarshak</div>
            </div>
            <button onClick={() => signOut()} title="Sign out"
              style={{background:'none',border:'none',cursor:'pointer',padding:4,color:'var(--pcrm-ink-mute)',flexShrink:0}}
              onMouseOver={e => (e.currentTarget.style.color='var(--pcrm-red)')}
              onMouseOut={e  => (e.currentTarget.style.color='var(--pcrm-ink-mute)')}>
              <LogOut size={15}/>
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="pcrm-main">
          <div className="pcrm-topbar">
            <div>
              <div className="pcrm-topbar-greeting">
                <span className="pcrm-deva">सुप्रभातम्</span> Acharya Ji
              </div>
              <div className="pcrm-topbar-meta">
                VIKRAM SAMVAT {vikramYear} · {new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' }).toUpperCase()}
              </div>
            </div>
            <div className="pcrm-topbar-actions">
              <div className="pcrm-search">
                <Search size={14}/>
                <input placeholder="Find family, vansha, ritual…"/>
              </div>
              <button className="pcrm-icon-btn" aria-label="Notifications"><Bell size={16}/></button>
              <button className="pcrm-icon-btn" aria-label="Settings"><Settings size={16}/></button>
            </div>
          </div>

          <div className="pcrm-page" key={route}>
            {route === 'today'     && <TodayPage     base={base} authFetch={authFetch} onNav={setRoute}/>}
            {route === 'calendar'  && <CalendarPage  base={base} authFetch={authFetch}/>}
            {route === 'authority' && <AuthorityPage base={base} authFetch={authFetch}/>}
            {route === 'onboard'   && <OnboardPage   base={base} authFetch={authFetch}/>}
            {route === 'heritage'  && <HeritagePage  base={base} authFetch={authFetch}/>}
            {route === 'earnings'  && <EarningsPage  base={base} authFetch={authFetch}/>}
            {route === 'network'   && <NetworkPage   base={base} authFetch={authFetch}/>}
            {route === 'referrals' && <ReferralsPage base={base} authFetch={authFetch}/>}
          </div>
        </main>
      </div>
    </div>
  );
}
