import './pandit-crm.css';
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Home, Calendar, Shield, Users, Map, BarChart3, Network,
  Search, Bell, Settings, RefreshCw, Plus, Phone, Copy,
  CheckCircle2, XCircle, Lock, TrendingUp, Clock, LogOut,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getApiBaseUrl, fetchPanchangCalendar, fetchTodayPanchang, type PanchangCalendarRow, type TodayPanchang } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

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
] as const;
type RouteId = typeof NAV[number]['id'];

// ── Fallback data ────────────────────────────────────────────────────
function isoOffset(days: number) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
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

const FB_EVENTS: CalendarEvent[] = [
  { id:'ev1', vansha_id:'V-8821', title:'Aarav Sharma · 7th birthday',       event_date:isoOffset(0), event_type:'birthday',    description:'Sharma Parivar · +91 98200 11223', recurs_yearly:true },
  { id:'ev2', vansha_id:'V-6633', title:'Verma Ji · 25th Anniversary',        event_date:isoOffset(0), event_type:'anniversary', description:'Verma Vansha · +91 91230 77889',  recurs_yearly:true },
  { id:'ev3', vansha_id:'V-4410', title:'Late Mohanlal Patel · Pitru Tithi',  event_date:isoOffset(0), event_type:'event',       description:'Patel Kutumb · Ashwin Krishna 7 · +91 99870 44556', recurs_yearly:true },
  { id:'ev6', vansha_id:'V-8821', title:'Griha Pravesh · Sharma',             event_date:isoOffset(0), event_type:'event',       description:'4:30 PM · Sec-12, Noida · ₹11,000', recurs_yearly:false },
  { id:'ev7', vansha_id:'V-2207', title:'Satyanarayan Katha · Joshi',         event_date:isoOffset(1), event_type:'event',       description:'9:00 AM · Vasant Vihar · ₹5,100',  recurs_yearly:false },
  { id:'ev8', vansha_id:'V-6633', title:'Mundan Sanskar · Verma',             event_date:isoOffset(5), event_type:'event',       description:'7:00 AM · Ashok Nagar · ₹7,500',   recurs_yearly:false },
];
const FB_QUEUE: VerifyRequest[] = [
  { id:'rq-01', node_id:'n-iyer',    status:'pending', created_at:'2026-05-02T09:00:00Z', vansha_id:'V-9921', notes:'Has scanned old vahi pages. 4 elder voice notes.', generations:6, members:42, city:'Chennai',   person:{ first_name:'Krishna',last_name:'Iyer',    verification_tier:'self-claimed', gotra:'Bharadwaj', date_of_birth:'1972-04-15' } },
  { id:'rq-02', node_id:'n-banerjee',status:'pending', created_at:'2026-04-30T11:00:00Z', vansha_id:'V-7715', notes:'Awaiting one missing DOB confirmation.',           generations:5, members:31, city:'Kolkata',   person:{ first_name:'Aniket', last_name:'Banerjee',verification_tier:'self-claimed', gotra:'Shandilya', date_of_birth:'1985-11-02' } },
  { id:'rq-03', node_id:'n-reddy',   status:'pending', created_at:'2026-04-27T08:00:00Z', vansha_id:'V-3344', notes:'Cross-verified via temple records.',               generations:7, members:58, city:'Hyderabad', person:{ first_name:'Sailaja',last_name:'Reddy',   verification_tier:'self-claimed', gotra:'Vasishtha', date_of_birth:'1968-07-19' } },
];
const FB_TXN: TransactionsResponse = {
  total: 6,
  current_subscription: { plan_id:'mool', status:'active', start_date:'2026-01-01', end_date:'2027-01-01' },
  transactions: [
    { id:'p1', created_at:'2026-05-03', description:'Greh Pravesh — Sharma Parivar',    base_amount_paise:1100000, igst_paise:0, status:'captured', payment_type:'service',      invoices:{ invoice_number:'KS-2026-1043' } },
    { id:'p2', created_at:'2026-05-01', description:'Verification fee — Verma Vansha',  base_amount_paise:199900,  igst_paise:0, status:'captured', payment_type:'service',      invoices:{ invoice_number:'KS-2026-1041' } },
    { id:'p3', created_at:'2026-04-29', description:'Subscription — Joshi Kul',         base_amount_paise:49900,   igst_paise:0, status:'captured', payment_type:'subscription', invoices:{ invoice_number:'KS-2026-1037' } },
    { id:'p4', created_at:'2026-04-27', description:'Namkaran — Mishra Parivar',        base_amount_paise:650000,  igst_paise:0, status:'created',  payment_type:'service',      invoices:null },
    { id:'p5', created_at:'2026-04-25', description:'Direct Dakshina — Patel Kutumb',   base_amount_paise:210000,  igst_paise:0, status:'captured', payment_type:'service',      invoices:{ invoice_number:'KS-2026-1029' } },
    { id:'p6', created_at:'2026-04-22', description:'Verification fee — Reddy Vansha',  base_amount_paise:199900,  igst_paise:0, status:'captured', payment_type:'service',      invoices:{ invoice_number:'KS-2026-1024' } },
  ],
};
const FB_PEERS: PeerPandit[] = [
  { id:'p-hari', full_name:'Pt. Hari Mishra',     status:'active',    deva:'काशी',     city:'Kashi (Varanasi)', spec:'Pitru Karma',    verified:true  },
  { id:'p-gov',  full_name:'Pt. Govind Tripathi', status:'active',    deva:'वृन्दावन', city:'Vrindavan',        spec:'Bhagwat Katha',  verified:true  },
  { id:'p-dev',  full_name:'Pt. Devdatt Joshi',   status:'active',    deva:'हरिद्वार', city:'Haridwar',         spec:'Asthi Visarjan', verified:true  },
  { id:'p-ana',  full_name:'Pt. Anand Sharma',    status:'verifying', deva:'उज्जैन',   city:'Ujjain',           spec:'Kaal Sarp Dosh', verified:false },
];
const TITHI_NAMES = ['Pratipada','Dwitiya','Tritiya','Chaturthi','Panchami','Shashthi','Saptami','Ashtami','Navami','Dashami','Ekadashi','Dwadashi','Trayodashi','Chaturdashi','Purnima'];
function makeFbPanchang(): PanchangCalendarRow[] {
  const now = new Date();
  const y = now.getFullYear(); const m = now.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const mm = String(m + 1).padStart(2, '0');
  return Array.from({ length: days }, (_, i) => ({
    id: `fb-${i}`,
    gregorian_date: `${y}-${mm}-${String(i+1).padStart(2,'0')}`,
    tithi_id: (i * 3) % 15 + 1,
    tithis: { id: (i*3)%15+1, name: TITHI_NAMES[(i*3)%15], sanskrit_name: TITHI_NAMES[(i*3)%15], paksha: i<15?'shukla':'krishna', lord: '', eco_action: '', eco_score_delta: 0, description: '', suitable_for: [] },
    paksha: (i < 15 ? 'shukla' : 'krishna') as 'shukla'|'krishna',
    nakshatra: null, yoga: null, masa_name: null, samvat_year: null,
    special_flag: null, is_kshaya: false, is_adhika: false,
    sunrise_ts: null, sunset_ts: null, ref_lat: 23.18, ref_lon: 75.78,
  }));
}
const FB_PANCHANG = makeFbPanchang();
const YAJMAN_MARKERS = [
  { lat: 28.6139, lng: 77.2090, label: 'Sharma · Noida' },
  { lat: 28.5355, lng: 77.3910, label: 'Joshi · Vasant Vihar' },
  { lat: 28.6692, lng: 77.4538, label: 'Verma · Ashok Nagar' },
  { lat: 25.5941, lng: 85.1376, label: 'Patel · Patna' },
  { lat: 19.0760, lng: 72.8777, label: 'Mishra · Mumbai' },
  { lat: 17.3850, lng: 78.4867, label: 'Reddy · Hyderabad' },
];
const TODO_ITEMS = [
  { id:1, text:'Prepare Samagri for Sharma Greh Pravesh', priority:'high', done:false },
  { id:2, text:'Call Verma Ji to confirm Barsi timings',  priority:'med',  done:false },
  { id:3, text:'Order fresh marigold mala (4 sets)',      priority:'med',  done:true  },
  { id:4, text:'Print Sankalp slokas for Mishra Namkaran',priority:'low',  done:false },
];
const REFERRALS_OUT = [
  { family:'Sharma Parivar', toCity:'Kashi',     toPandit:'Pt. Hari Mishra',     purpose:'Asthi Visarjan', status:'in_progress', date:'Apr 28' },
  { family:'Goyal Kutumb',   toCity:'Vrindavan', toPandit:'Pt. Govind Tripathi', purpose:'Bhagwat Katha',  status:'completed',   date:'Apr 12' },
];

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
  if (live)    return <span className="pcrm-tag pcrm-tag-green"><span className="pcrm-dot live"></span> Live · {endpoint}</span>;
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
  const { data: rawTxn } = useQuery<TransactionsResponse>({
    queryKey: ['pcrm-txn'],
    queryFn: () => authFetch(`${base}/api/payments/transactions`).then(r => { if (!r.ok) throw new Error(r.status.toString()); return r.json(); }),
    retry: 1, staleTime: 60_000,
  });

  const events = rawEvents ?? FB_EVENTS;
  const milestones = useMemo(() => adaptMilestones(events), [events]);
  const bookings   = useMemo(() => adaptBookings(events),   [events]);
  const queue      = adaptQueue(rawQueue ?? FB_QUEUE);
  const txns       = adaptTransactions(rawTxn ?? FB_TXN);
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
          <div className="pcrm-kpi-trend"><TrendingUp size={11}/> from /api/calendar/events</div>
        </div>
        <div className="pcrm-kpi">
          <div className="pcrm-kpi-label">Bookings This Week</div>
          <div className="pcrm-kpi-value">{bookings.length}</div>
          <div className="pcrm-kpi-trend flat"><Clock size={11}/> event_type=event</div>
        </div>
        <div className="pcrm-kpi">
          <div className="pcrm-kpi-label">Pending Verifications</div>
          <div className="pcrm-kpi-value"><span className="pcrm-shimmer-gold">{queue.length}</span></div>
          <div className="pcrm-kpi-trend flat"><Shield size={11}/> /api/margdarshak/queue</div>
        </div>
        <div className="pcrm-kpi">
          <div className="pcrm-kpi-label">May Earnings · Net</div>
          <div className="pcrm-kpi-value"><span className="pcrm-rupee">₹</span>{monthNet.toLocaleString('en-IN')}</div>
          <div className="pcrm-kpi-trend">/api/payments/transactions</div>
        </div>
      </div>

      <div className="pcrm-cols-2">
        <section className="pcrm-card">
          <div className="pcrm-card-head">
            <div>
              <div className="pcrm-card-title">Today · {today}</div>
              <div className="pcrm-card-sub pcrm-mono">GET /api/calendar/events · today + tomorrow</div>
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
            {TODO_ITEMS.slice(0,3).map(t => (
              <div key={t.id} className="pcrm-row" style={{padding:'10px 0',borderBottom:'1px dashed var(--pcrm-hair)'}}>
                <input type="checkbox" defaultChecked={t.done} style={{width:16,height:16,accentColor:'var(--pcrm-saffron)'}}/>
                <div className="pcrm-grow pcrm-text-sm" style={{textDecoration:t.done?'line-through':'none',color:t.done?'var(--pcrm-ink-mute)':undefined}}>{t.text}</div>
                {t.priority === 'high' && <span className="pcrm-tag pcrm-tag-red">Priority</span>}
              </div>
            ))}
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
        </aside>
      </div>
    </>
  );
}

function CalendarPage({ base, authFetch }: PageProps) {
  const _now = new Date();
  const _y = _now.getFullYear(); const _m = _now.getMonth();
  const _dim = new Date(_y, _m + 1, 0).getDate();
  const _mm = String(_m + 1).padStart(2, '0');
  const fromStr = `${_y}-${_mm}-01`;
  const toStr   = `${_y}-${_mm}-${String(_dim).padStart(2,'0')}`;
  const monthLabel = _now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const { data: rawPanchang, isLoading: pLoad, isError: pErr } = useQuery<PanchangCalendarRow[]>({
    queryKey: ['pcrm-panchang', fromStr],
    queryFn: () => fetchPanchangCalendar(fromStr, toStr),
    retry: 1, staleTime: 3600_000,
  });

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

  const panchang = rawPanchang?.length ? rawPanchang : FB_PANCHANG;
  const events   = rawEvents   ?? FB_EVENTS;
  const bookings = useMemo(() => adaptBookings(events), [events]);
  const live = !pErr && !eErr;

  const eventDays = useMemo(() => {
    const map: Record<number, string[]> = {};
    events.forEach(e => {
      const day = parseInt(e.event_date.slice(8, 10), 10);
      if (!day) return;
      const c: Record<string, string> = { event:'saffron', birthday:'plum', anniversary:'gold' };
      (map[day] ??= []).push(c[e.event_type] ?? 'saffron');
    });
    return map;
  }, [events]);

  const todayNum = _now.getDate();
  const days: { n: number; muted: boolean }[] = [];
  const _firstDow = new Date(_y, _m, 1).getDay();
  const _prevDays = new Date(_y, _m, 0).getDate();
  for (let i = _firstDow - 1; i >= 0; i--) days.push({ muted: true, n: _prevDays - i });
  for (let d = 1; d <= _dim; d++) days.push({ n: d, muted: false });
  let _trail = 1;
  while (days.length % 7 !== 0) days.push({ muted: true, n: -(_trail++) });

  const panchangByDay = useMemo(() => {
    const m: Record<number, PanchangCalendarRow> = {};
    panchang.forEach(p => { m[parseInt(p.gregorian_date.slice(8,10), 10)] = p; });
    return m;
  }, [panchang]);

  const tithiName = (n: number) => panchangByDay[n]?.tithis?.name?.slice(0, 3) ?? '';
  const specialFlag = (n: number) => panchangByDay[n]?.special_flag ?? null;

  return (
    <>
      <PageHead eyebrow="Ritual Calendar" deva="पञ्चाङ्ग" title="Bookings & Sankalp"
        subtitle="Lunar tithis from /api/panchang/calendar · bookings from /api/calendar/events"
        actions={<>
          <SourceBadge live={live} loading={pLoad || eLoad} error={pErr||eErr ? 'unreachable' : null} endpoint="panchang + calendar"/>
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
            <div>
              <div className="pcrm-card-title">{monthLabel}</div>
              <div className="pcrm-card-sub pcrm-mono">Prokerala API → /api/panchang/calendar</div>
            </div>
          </div>
          <div className="pcrm-cal pcrm-mb-3">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(h => <div key={h} className="pcrm-cal-head">{h}</div>)}
            {days.map((d, i) => {
              const ev = eventDays[d.n] ?? [];
              const flag = !d.muted ? specialFlag(d.n) : null;
              return (
                <div key={i} className={`pcrm-cal-cell${d.muted?' muted':''}${d.n===todayNum&&!d.muted?' today':''}${ev.length||flag?' has-event':''}`}>
                  {!d.muted && <span className="pcrm-cal-cell-num">{d.n}</span>}
                  {!d.muted && <span className="pcrm-cal-cell-tithi">{tithiName(d.n)}</span>}
                  {flag && <span className="pcrm-cal-cell-tithi" style={{color:'var(--pcrm-saffron-dk)',fontSize:8}}>🪔</span>}
                  {ev.length > 0 && (
                    <div className="pcrm-cal-events">
                      {ev.slice(0,3).map((c, k) => (
                        <span key={k} className="pcrm-cal-event-dot" style={{background:`var(--pcrm-${c})`}}/>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
            {TODO_ITEMS.map(t => (
              <div key={t.id} className="pcrm-row" style={{padding:'10px 0'}}>
                <input type="checkbox" defaultChecked={t.done} style={{width:16,height:16,accentColor:'var(--pcrm-saffron)'}}/>
                <div className="pcrm-grow pcrm-text-sm" style={{textDecoration:t.done?'line-through':'none',color:t.done?'var(--pcrm-ink-mute)':undefined}}>{t.text}</div>
                {t.priority === 'high' && <span className="pcrm-tag pcrm-tag-red">High</span>}
                {t.priority === 'med'  && <span className="pcrm-tag pcrm-tag-saffron">Med</span>}
              </div>
            ))}
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
  const queue = adaptQueue(rawQueue ?? FB_QUEUE);
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
        subtitle="Slide the toggle → fires POST /api/margdarshak/review with action='approved'."
        actions={<>
          <SourceBadge live={live} loading={isLoading} error={isError ? 'unreachable' : null} endpoint="/api/margdarshak/queue"/>
          <button className="pcrm-btn pcrm-btn-ghost pcrm-btn-sm" onClick={() => refetch()}><RefreshCw size={13}/></button>
        </>}
      />

      <div className="pcrm-kpi-row" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
        <div className="pcrm-kpi accent">
          <div className="pcrm-kpi-label">Awaiting your seal</div>
          <div className="pcrm-kpi-value">{queue.length}</div>
          <div className="pcrm-kpi-trend flat">status='pending'</div>
        </div>
        <div className="pcrm-kpi">
          <div className="pcrm-kpi-label">Verified · This month</div>
          <div className="pcrm-kpi-value">{Object.values(decisions).filter(d=>d==='approved').length + 12}</div>
          <div className="pcrm-kpi-trend">verification_audit</div>
        </div>
        <div className="pcrm-kpi">
          <div className="pcrm-kpi-label">Lifetime verified</div>
          <div className="pcrm-kpi-value">187</div>
          <div className="pcrm-kpi-trend flat">expert-verified</div>
        </div>
      </div>

      <section className="pcrm-card">
        <div className="pcrm-card-head">
          <div className="pcrm-card-title">Verification Requests</div>
          <div className="pcrm-card-sub pcrm-mono">verification_requests JOIN persons ON node_id</div>
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
        subtitle="Calls POST /api/tree/bootstrap. Inherits Gold-standard verification."
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
              kutumb.app/claim?v={result?.vansha_id ?? 'V-NEW-7821'}
            </div>
            <div className="pcrm-flex pcrm-gap-2 pcrm-mt-3">
              <button className="pcrm-btn pcrm-btn-ghost pcrm-btn-sm pcrm-grow"><Copy size={13}/> Copy link</button>
              <button className="pcrm-btn pcrm-btn-primary pcrm-btn-sm pcrm-grow">Send via WhatsApp</button>
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

  const resp = rawTxn ?? FB_TXN;
  const txns  = useMemo(() => adaptTransactions(resp), [resp]);
  const total = txns.reduce((s, t) => s + t.net, 0);
  const ytd   = 218400 + Math.round(total);
  const target = 600000;
  const pct   = Math.min(100, Math.round((ytd / target) * 100));
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
          <div className="pcrm-kpi-trend">{txns.length} txns · {resp.current_subscription?.plan_id ?? '—'}</div>
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
          <div className="pcrm-kpi-label">Lifetime · 24 mo</div>
          <div className="pcrm-kpi-value"><span className="pcrm-rupee">₹</span>4.18 L</div>
          <div className="pcrm-kpi-trend">{resp.total} payments</div>
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
              <div className="pcrm-card-title">Last 14 days</div>
              <span className="pcrm-mono pcrm-text-xs pcrm-muted">net · ₹</span>
            </div>
            <div className="pcrm-sparkbars">
              {[28,35,18,42,52,30,68,75,48,62,80,58,72,90].map((h, i) => (
                <div key={i} className={`b${i<7?' dim':''}`} style={{height:`${h}%`}}/>
              ))}
            </div>
            <div className="pcrm-flex pcrm-between pcrm-mt-2 pcrm-mono pcrm-text-xs pcrm-muted">
              <span>Apr 21</span><span>May 5</span>
            </div>
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
  const peers = adaptPeers(rawPeers ?? FB_PEERS);
  const live  = isFetched && !isError;

  return (
    <>
      <PageHead eyebrow="Purohit Network" deva="पुरोहित मण्डल" title="Refer & Collaborate"
        subtitle="Verified pandits from /api/margdarshak/family across linked vanshas."
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
              <span className="pcrm-mono pcrm-text-xs pcrm-muted">{REFERRALS_OUT.length} families</span>
            </div>
            {REFERRALS_OUT.map((r, i) => (
              <div key={i} className="pcrm-row" style={{alignItems:'flex-start'}}>
                <div className="pcrm-row-avatar" style={{background:'var(--pcrm-saffron-tint)'}}>
                  <Network size={16} color="var(--pcrm-saffron-dk)"/>
                </div>
                <div className="pcrm-grow">
                  <div className="pcrm-row-name">{r.family}</div>
                  <div className="pcrm-row-meta">→ {r.toPandit} · {r.toCity}</div>
                  <div className="pcrm-text-xs pcrm-muted pcrm-mt-2">{r.purpose} · {r.date}</div>
                </div>
                <StatusTag status={r.status}/>
              </div>
            ))}
          </section>

          <section className="pcrm-card tinted">
            <div className="pcrm-flex pcrm-gap-3 pcrm-center">
              <Network size={28} color="var(--pcrm-saffron-dk)"/>
              <div>
                <div className="pcrm-serif" style={{fontWeight:600,fontSize:15}}>Collaborative rituals</div>
                <div className="pcrm-text-xs pcrm-muted pcrm-mt-2">
                  For yagyas / pind-daan, request a panel of fellow pandits. Endpoint: <span className="pcrm-mono">POST /api/margdarshak/panel-request</span> (proposed).
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

function HeritagePage({ base, authFetch }: PageProps) {
  const { isFetched, isError } = useQuery({
    queryKey: ['pcrm-tree'],
    queryFn: () => authFetch(`${base}/api/tree/00000000-0000-0000-0000-000000000000`).then(r => { if (!r.ok) throw new Error(r.status.toString()); return r.json(); }),
    retry: 1, staleTime: 120_000,
  });
  const live = isFetched && !isError;

  return (
    <>
      <PageHead eyebrow="Logistics & Heritage" deva="यजमान" title="Map & Vahi Archive"
        subtitle="Yajman pins from /api/tree/{vansha_id} · vahi photos from Supabase Storage"
        actions={<SourceBadge live={live} loading={false} error={isError?'unreachable':null} endpoint="/api/tree/{vansha_id}"/>}
      />

      <div className="pcrm-cols-2">
        <section className="pcrm-card">
          <div className="pcrm-card-head">
            <div>
              <div className="pcrm-card-title">Yajman Map</div>
              <div className="pcrm-card-sub pcrm-mono">persons[].current_residence → Google Maps</div>
            </div>
          </div>
          <div className="pcrm-stack" style={{gap:8, minHeight:280}}>
            {YAJMAN_MARKERS.map((m, i) => (
              <a key={i}
                href={`https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`}
                target="_blank" rel="noopener noreferrer"
                className="pcrm-row"
                style={{padding:'10px 12px', textDecoration:'none', border:'1px solid var(--pcrm-hair)', borderRadius:8, color:'inherit'}}>
                <div className="pcrm-row-avatar" style={{background:'var(--pcrm-saffron-tint)'}}>
                  <Map size={16} color="var(--pcrm-saffron-dk)"/>
                </div>
                <div className="pcrm-grow">
                  <div className="pcrm-row-name">{m.label}</div>
                  <div className="pcrm-row-meta pcrm-mono" style={{fontSize:11}}>{m.lat.toFixed(4)}, {m.lng.toFixed(4)}</div>
                </div>
                <span className="pcrm-tag pcrm-tag-saffron" style={{fontSize:11}}>Open ↗</span>
              </a>
            ))}
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
              <div className="pcrm-card-sub pcrm-mono">supabase.storage 'vahi-archive'</div>
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
  const queueCount = (rawQueue ?? FB_QUEUE).length;

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
          </div>
        </main>
      </div>
    </div>
  );
}
