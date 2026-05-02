import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePlan } from '@/contexts/PlanContext';
import { useLang } from '@/i18n/LanguageContext';
import AppShell from '@/components/shells/AppShell';
import { JoinSEModal } from '@/components/sales/JoinSEModal';
import { EarningsWallet } from '@/components/sales/EarningsWallet';
import {
  resolveVanshaIdForApi, fetchPrakritiScore, type PrakritiScore,
  fetchFamilyRank, type FamilyRank,
  fetchTodayPanchang,
  fetchSamayProfile, type SamayProfile,
  fetchSamayRequests, type SamayRequest,
  fetchRadarNearby, type RadarMember,
  fetchGreenLegacyTimeline, type GreenLegacyEvent,
  fetchVanshaTree,
  fetchDashboardTasks, createDashboardTask, type DashboardTask,
} from '@/services/api';
import { computeTithiIdToday, getPaksha } from '@/lib/panchangUtils';
import { mergeTithiWithFallback } from '@/lib/tithiFallback';

const SALES_ROLES = new Set(['se', 'cp', 'rp', 'zp', 'np', 'admin', 'superadmin']);

interface LivePanchang {
  tithiId: number;
  tithiName: string;
  tithiEn: string;
  pakshaLabel: string;
  nakshatra: string | null;
  sunriseStr: string | null;
  isSpecial: boolean;
  specialFlag: string | null;
  ecoPlant: string | null;
  ecoCommunity: string | null;
}

const PAKSHA_LABEL: Record<string, string> = { shukla: 'शुक्ल पक्ष', krishna: 'कृष्ण पक्ष' };

function useLivePanchang(): LivePanchang | null {
  const [p, setP] = useState<LivePanchang | null>(null);
  useEffect(() => {
    async function load() {
      const fallbackId = computeTithiIdToday();
      const api = await fetchTodayPanchang().catch(() => null);
      const tithiId = typeof (api?.tithi as { id?: number } | null)?.id === 'number'
        ? (api!.tithi as { id: number }).id : fallbackId;
      const finalPaksha = api?.paksha ?? getPaksha(tithiId);
      const merged = mergeTithiWithFallback(
        api ? api.tithi as Record<string, unknown> : null, tithiId, finalPaksha,
      );
      const sunriseStr = api?.sunrise_ts
        ? new Date(api.sunrise_ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
        : null;
      const ecoRec = (api?.eco_recommendation ?? {}) as Record<string, string | null>;
      setP({
        tithiId,
        tithiName: merged.name_sanskrit || merged.name_common || '—',
        tithiEn: merged.name_common || 'Tithi',
        pakshaLabel: PAKSHA_LABEL[finalPaksha] ?? finalPaksha,
        nakshatra: api?.nakshatra ?? null,
        sunriseStr,
        isSpecial: !!api?.special_flag,
        specialFlag: api?.special_flag ?? null,
        ecoPlant: (ecoRec.plant ?? merged.plant_action) || null,
        ecoCommunity: (ecoRec.community ?? merged.community_action) || null,
      });
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return p;
}

/* ─────────────────────────────────────────────────────────────
   1. Community Pulse Bar — social proof + streak + one CTA
   Sticky. First thing seen. Drives retention + FOMO.
───────────────────────────────────────────────────────────── */
const CommunityPulseBar = ({ streak }: { streak: number }) => {
  const navigate = useNavigate();
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const today = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const done = days.map((_, i) => i < today);
  return (
    <section style={{ position: 'sticky', top: 64, zIndex: 50, background: 'linear-gradient(90deg, var(--ds-plum-deep), var(--ds-plum) 50%, var(--ds-plum-deep))', color: 'var(--ds-paper)', borderBottom: '1px solid rgba(212,154,31,0.2)', padding: '12px 0' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 24, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="ds-pill" style={{ background: 'rgba(122,219,160,0.15)', borderColor: 'rgba(122,219,160,0.35)', color: '#7adba0' }}>
            <span className="ds-pill-dot live" />2,847 contributors active today
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--ds-mono)' }}>|</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>3 Sewa requests open near you</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', width: 36, height: 36, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <svg width="36" height="36" viewBox="0 0 36 36" style={{ position: 'absolute' }}>
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2.5" />
              <circle cx="18" cy="18" r="14" fill="none" stroke="var(--ds-gold)" strokeWidth="2.5"
                strokeDasharray="88" strokeDashoffset={88 * (1 - Math.min(streak / 30, 1))}
                transform="rotate(-90 18 18)" strokeLinecap="round" />
            </svg>
            <span style={{ fontFamily: 'var(--ds-serif)', fontWeight: 700, fontSize: 13, color: 'var(--ds-gold-light)' }}>{streak}</span>
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {days.map((d, i) => (
              <div key={i} title={d} style={{ width: 20, height: 20, borderRadius: '50%', background: done[i] ? 'linear-gradient(135deg,var(--ds-gold-light),var(--ds-gold))' : i === today ? 'rgba(212,154,31,0.15)' : 'rgba(255,255,255,0.06)', border: i === today && !done[i] ? '1.5px dashed var(--ds-gold-light)' : 'none', display: 'grid', placeItems: 'center', fontSize: 8, color: done[i] ? 'var(--ds-plum-deep)' : 'transparent' }}>
                {done[i] ? '🪔' : ''}
              </div>
            ))}
          </div>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{streak}-day streak</span>
        </div>
        <button onClick={() => navigate('/legacy-box')} className="ds-btn ds-btn-sm ds-btn-gold">🎙️ Add today's moment →</button>
      </div>
    </section>
  );
};

/* ─────────────────────────────────────────────────────────────
   2. Right Now Moment — panchang urgency with live countdown
   High CRO: scarcity + free action + score multiplier
───────────────────────────────────────────────────────────── */
const RightNowMoment = ({ panchang }: { panchang: LivePanchang | null }) => {
  const navigate = useNavigate();
  const [secs, setSecs] = useState(() => {
    const now = new Date();
    const end = new Date(now);
    end.setHours(18, 30, 0, 0); // default sunset for India
    return Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
  });
  useEffect(() => {
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const tithiLabel = panchang ? panchang.tithiName : '—';
  const subLabel = panchang ? `${panchang.pakshaLabel} · ${panchang.tithiEn}`.toUpperCase() : 'LOADING…';
  return (
    <section style={{ background: 'linear-gradient(90deg,#0d1f14,#142822,#0d1f14)', color: 'var(--ds-paper)', borderBottom: '1px solid rgba(122,219,160,0.15)', padding: '18px 0' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 34 }}>🌾</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="ds-pill" style={{ background: 'rgba(122,219,160,0.15)', borderColor: 'rgba(122,219,160,0.35)', color: '#7adba0' }}>
                <span className="ds-pill-dot live" />Live · {tithiLabel}
              </span>
              <span style={{ fontSize: 10, fontFamily: 'var(--ds-mono)', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em' }}>{subLabel}</span>
            </div>
            <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 19, marginTop: 4, lineHeight: 1.2 }}>
              {panchang?.isSpecial
                ? <>Most auspicious day. <span style={{ color: '#7adba0', fontWeight: 600 }}>2× Prakriti</span> on every eco-action.</>
                : <>Eco window open until sunset. Every action logged today counts.</>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--ds-mono)', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Window closes</div>
            <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 34, color: secs > 3600 ? '#7adba0' : 'var(--ds-saffron)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {pad(h)}:{pad(m)}:{pad(s)}
            </div>
          </div>
          <button onClick={() => navigate('/eco-panchang')} className="ds-btn ds-btn-sm" style={{ background: '#7adba0', color: '#0a1f17', fontWeight: 700, whiteSpace: 'nowrap' }}>
            Log eco-action — free →
          </button>
        </div>
      </div>
    </section>
  );
};

/* ─────────────────────────────────────────────────────────────
   3. Community Hero — score + gotra comparison + rank + todo
   CRO: social comparison drives action + aspiration
───────────────────────────────────────────────────────────── */
const CommunityHero = ({ appUser, score, familyRank, panchang }: {
  appUser: { full_name?: string | null } | null;
  score: PrakritiScore | null;
  familyRank: FamilyRank | null;
  panchang: LivePanchang | null;
}) => {
  const navigate = useNavigate();
  const displayScore = score?.total_score ?? 78;
  const firstName = appUser?.full_name?.split(' ')[0] ?? 'there';
  const [todos, setTodos] = useState([
    { icon: '🌱', t: 'Plant a sapling — counts 2× today', done: false, src: 'eco' },
    { icon: '🤝', t: 'Accept 1 Sewa request near you', done: false, src: 'sewa' },
    { icon: '📲', t: 'Invite 1 member to your tree — both get +12', done: false, src: 'tree' },
    { icon: '📍', t: 'Scan Kutumb Radar — kin may be nearby', done: false, src: 'radar' },
    { icon: '🪔', t: 'Log sankalp for Akshaya Tritiya', done: false, src: 'panchang' },
  ]);
  const [newTask, setNewTask] = useState('');
  const doneCnt = todos.filter(t => t.done).length;
  return (
    <section style={{ background: 'linear-gradient(180deg,var(--ds-plum-deep),var(--ds-plum) 80%)', color: 'var(--ds-paper)', padding: '40px 0 72px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
          <div>
            <div className="ds-eyebrow" style={{ color: 'var(--ds-gold-light)' }}>Your Prakriti · live</div>
            <h1 style={{ fontFamily: 'var(--ds-serif)', fontSize: 'clamp(26px,3vw,42px)', marginTop: 6 }}>
              Namaste, <span style={{ fontStyle: 'italic', color: 'var(--ds-gold-light)' }}>{firstName}</span>
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => navigate('/invite')} className="ds-btn ds-btn-ghost ds-btn-sm" style={{ color: 'var(--ds-paper)', borderColor: 'rgba(255,255,255,0.25)' }}>Invite →</button>
            <button onClick={() => navigate('/tree')} className="ds-btn ds-btn-gold ds-btn-sm">Open tree →</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 18, alignItems: 'start' }} className="dash-hero-grid">

          {/* Score + gotra comparison */}
          <div className="ds-card" style={{ padding: 28, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(212,154,31,0.3)', color: 'var(--ds-paper)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="ds-eyebrow" style={{ color: 'var(--ds-gold-light)' }}>Prakriti score</span>
              <span className="ds-pill" style={{ background: 'rgba(122,219,160,0.12)', borderColor: 'rgba(122,219,160,0.3)', color: '#7adba0' }}>↑ +6 this week</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 14 }}>
              <div className="ds-score-num" style={{ fontSize: 100, color: 'var(--ds-gold-light)', lineHeight: 1 }}>{displayScore}</div>
              <div style={{ paddingBottom: 12 }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>/100</div>
                {familyRank && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>#{familyRank.city_rank} in {familyRank.city ?? 'city'}</div>}
                {familyRank && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>#{familyRank.state_rank} in {familyRank.state ?? 'state'}</div>}
              </div>
            </div>
            {/* Impact this week — pride in contributions, not comparison */}
            <div style={{ marginTop: 14, padding: '11px 14px', borderRadius: 8, background: 'rgba(122,219,160,0.06)', border: '1px solid rgba(122,219,160,0.15)' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--ds-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Your impact · this week</div>
              <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#7adba0' }}>🌱 — eco-actions</span>
                <span style={{ fontSize: 13, color: 'var(--ds-gold-light)' }}>🤝 — Sewa hrs</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>📲 — invited</span>
              </div>
            </div>
            <div style={{ marginTop: 14, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <div style={{ width: `${displayScore}%`, height: '100%', background: 'linear-gradient(90deg,var(--ds-saffron),var(--ds-gold))' }} />
            </div>
            <div style={{ marginTop: 5, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--ds-mono)' }}>
              <span>Beej</span><span>Ankur</span><span>Vriksh</span><span>Vansh</span>
            </div>
            <button onClick={() => navigate('/tree')} className="ds-btn ds-btn-sm" style={{ marginTop: 16, width: '100%', justifyContent: 'center', background: 'rgba(212,154,31,0.14)', color: 'var(--ds-gold-light)', border: '1px solid rgba(212,154,31,0.3)' }}>
              What raised your score this week →
            </button>
          </div>

          {/* Today card — live tithi */}
          <div className="ds-card" style={{ padding: 24, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--ds-paper)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="ds-eyebrow" style={{ color: 'rgba(255,255,255,0.55)' }}>Today</span>
              {panchang?.isSpecial && (
                <span className="ds-pill" style={{ background: 'rgba(122,219,160,0.12)', borderColor: 'rgba(122,219,160,0.3)', color: '#7adba0' }}><span className="ds-pill-dot live" />2× day</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 12 }}>
              <div className="ds-score-num" style={{ fontSize: 72, color: 'var(--ds-gold-light)', lineHeight: 1 }}>{new Date().getDate()}</div>
              <div>
                <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 20, color: 'var(--ds-paper)', lineHeight: 1.1 }}>{new Date().toLocaleString('en-IN', { month: 'long' })}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>{new Date().toLocaleString('en-IN', { weekday: 'long' })} · {new Date().getFullYear()}</div>
              </div>
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
              <div className="ds-sanskrit" style={{ color: 'var(--ds-gold-light)', fontSize: 13, marginBottom: 6 }}>
                {panchang ? `${panchang.pakshaLabel} · ${panchang.tithiName}` : '—'}
              </div>
              {panchang?.sunriseStr && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Sunrise</span><span>{panchang.sunriseStr}</span></div>
              )}
              {panchang?.nakshatra && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}><span>Nakshatra</span><span>{panchang.nakshatra}</span></div>
              )}
              {!panchang && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>Computing tithi…</div>
              )}
            </div>
            <button onClick={() => navigate('/eco-panchang')} className="ds-btn ds-btn-sm" style={{ marginTop: 14, background: 'var(--ds-gold)', color: 'var(--ds-plum-deep)', fontWeight: 700, width: '100%', justifyContent: 'center' }}>Open Prakriti panchang →</button>
          </div>

          {/* Smart todo */}
          <div className="ds-card" style={{ padding: 24, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--ds-paper)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="ds-eyebrow" style={{ color: 'rgba(255,255,255,0.55)' }}>Today's actions</span>
              <span style={{ fontSize: 11, color: doneCnt === todos.length ? '#7adba0' : 'rgba(255,255,255,0.4)', fontFamily: 'var(--ds-mono)' }}>{doneCnt}/{todos.length}</span>
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
              {todos.map((td, i) => (
                <label key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input type="checkbox" checked={td.done} onChange={() => setTodos(t => t.map((x, j) => j === i ? { ...x, done: !x.done } : x))} style={{ marginTop: 2, accentColor: 'var(--ds-gold)' }} />
                  <span style={{ fontSize: 12, color: td.done ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.85)', textDecoration: td.done ? 'line-through' : 'none', flex: 1, lineHeight: 1.35 }}>
                    <span style={{ marginRight: 5 }}>{td.icon}</span>{td.t}
                  </span>
                  <span style={{ fontSize: 9, fontFamily: 'var(--ds-mono)', textTransform: 'uppercase', color: td.src === 'eco' ? '#7adba0' : td.src === 'sewa' ? 'var(--ds-gold-light)' : td.src === 'panchang' ? 'var(--ds-saffron)' : 'rgba(255,255,255,0.3)', flexShrink: 0, marginTop: 2 }}>{td.src}</span>
                </label>
              ))}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
              <input value={newTask} onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newTask.trim()) { setTodos(t => [...t, { icon: '✅', t: newTask, done: false, src: 'self' }]); setNewTask(''); } }}
                placeholder="+ Add your own task"
                style={{ flex: 1, padding: '7px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--ds-paper)', fontSize: 12, fontFamily: 'inherit' }} />
              <button onClick={() => { if (newTask.trim()) { setTodos(t => [...t, { icon: '✅', t: newTask, done: false, src: 'self' }]); setNewTask(''); } }}
                className="ds-btn ds-btn-sm" style={{ background: 'var(--ds-gold)', color: 'var(--ds-plum-deep)', fontWeight: 700, padding: '7px 12px' }}>+</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ─────────────────────────────────────────────────────────────
   4. Sewa Engine — time bank as HERO, not buried third tile
   CRO: one-tap accept = community engagement + score + network effect
───────────────────────────────────────────────────────────── */
const SewaEngine = ({ samayProfile, samayRequests }: {
  samayProfile: SamayProfile | null;
  samayRequests: SamayRequest[];
}) => {
  const navigate = useNavigate();
  const [accepted, setAccepted] = useState(false);
  const balance = samayProfile?.total_global_credits ?? null;
  const openRequest = samayRequests.find(r => r.request_type === 'need' && r.status === 'open') ?? samayRequests[0] ?? null;
  const openCount = samayRequests.filter(r => r.status === 'open').length;

  return (
    <section style={{ padding: '32px 0', background: 'var(--ds-ivory-warm)', borderBottom: '1px solid var(--ds-hairline)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="ds-eyebrow">Sewa Chakra · Time Bank</span>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 26, marginTop: 6, color: 'var(--ds-ink)' }}>
              Give one hour. <span style={{ fontStyle: 'italic', color: 'var(--ds-gold-deep)' }}>Earn one hour back.</span>
            </h2>
          </div>
          <button onClick={() => navigate('/time-bank')} className="ds-btn ds-btn-sm ds-btn-ghost">Full ledger →</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.7fr 1fr', gap: 14 }} className="dash-sewa-grid">

          {/* Balance — real API */}
          <div className="ds-card" style={{ padding: 24, background: 'linear-gradient(135deg,rgba(212,154,31,0.08),var(--ds-paper))', border: '1px solid rgba(212,154,31,0.3)' }}>
            <span className="ds-eyebrow" style={{ color: 'var(--ds-gold-deep)' }}>Your Sewa balance</span>
            {balance !== null ? (
              <>
                <div className="ds-score-num" style={{ fontSize: 72, color: 'var(--ds-gold-deep)', lineHeight: 1, marginTop: 10 }}>
                  {balance}<span style={{ fontSize: 18, color: 'var(--ds-ink-mute)' }}> hrs</span>
                </div>
                {samayProfile?.is_community_pillar && (
                  <div style={{ fontSize: 12, color: '#2a8068', marginTop: 6, fontWeight: 600 }}>⭐ Community Pillar</div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--ds-ink-mute)', marginTop: 18, fontStyle: 'italic' }}>Start offering Sewa to build your balance.</div>
            )}
            <button onClick={() => navigate('/time-bank')} className="ds-btn ds-btn-sm ds-btn-plum" style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}>Offer 1 hour →</button>
          </div>

          {/* Open request — real API */}
          <div className="ds-card" style={{ padding: 24, border: accepted ? '1px solid rgba(122,219,160,0.4)' : '1.5px solid var(--ds-saffron)', background: accepted ? 'rgba(122,219,160,0.03)' : 'var(--ds-paper)', position: 'relative', transition: 'all 0.3s' }}>
            {!accepted && openRequest && <div style={{ position: 'absolute', top: -9, right: 18, background: 'var(--ds-saffron)', color: '#fff', fontSize: 9, fontFamily: 'var(--ds-mono)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 4 }}>Open request</div>}
            {accepted ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 48 }}>🙏</div>
                <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 22, color: '#2a8068', marginTop: 12 }}>Sewa accepted!</div>
                <div style={{ fontSize: 13, color: 'var(--ds-ink-soft)', marginTop: 8, lineHeight: 1.5 }}>
                  +{openRequest?.hours_estimate ?? openRequest?.hours ?? 1} hours added to your balance.
                  {openRequest?.requester_name && ` ${openRequest.requester_name} has been notified.`}
                </div>
                <button onClick={() => navigate('/time-bank')} className="ds-btn ds-btn-sm" style={{ marginTop: 16, background: '#7adba0', color: '#0a1f17', fontWeight: 700 }}>View your ledger →</button>
              </div>
            ) : openRequest ? (
              <>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,var(--ds-plum),var(--ds-plum-rose))', display: 'grid', placeItems: 'center', color: '#fff', fontFamily: 'var(--ds-serif)', fontWeight: 700, fontSize: 20, flexShrink: 0 }}>
                    {(openRequest.requester_name ?? 'S')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 18, fontWeight: 600, color: 'var(--ds-plum)' }}>
                      {openRequest.requester_name ?? 'Community member'}
                    </div>
                    {openRequest.category && <span className="ds-tag ds-tag-plum" style={{ fontSize: 10, marginTop: 4, display: 'inline-block' }}>{openRequest.category}</span>}
                    {(openRequest.description ?? openRequest.notes) && <div style={{ fontSize: 13, color: 'var(--ds-ink-soft)', marginTop: 8, lineHeight: 1.5 }}>{openRequest.description ?? openRequest.notes}</div>}
                    <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, color: 'var(--ds-ink-mute)', fontFamily: 'var(--ds-mono)' }}>
                      <span>⏱ ~{openRequest.hours_estimate ?? openRequest.hours ?? 1} hrs</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                  <button onClick={() => setAccepted(true)} className="ds-btn ds-btn-plum" style={{ flex: 2, justifyContent: 'center', fontWeight: 700 }}>🤝 Accept · earn +{openRequest.hours_estimate ?? openRequest.hours ?? 1} hrs →</button>
                  <button onClick={() => navigate('/time-bank')} className="ds-btn ds-btn-ghost ds-btn-sm" style={{ flex: 1, justifyContent: 'center' }}>See all</button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 36 }}>🤝</div>
                <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 18, color: 'var(--ds-plum)', marginTop: 12 }}>No open requests right now</div>
                <div style={{ fontSize: 13, color: 'var(--ds-ink-soft)', marginTop: 6 }}>Be the first to offer Sewa to your community.</div>
                <button onClick={() => navigate('/time-bank')} className="ds-btn ds-btn-sm ds-btn-plum" style={{ marginTop: 16 }}>Post an offer →</button>
              </div>
            )}
          </div>

          {/* Community stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Open requests near you', val: openCount > 0 ? String(openCount) : '—', icon: '📍', color: 'var(--ds-saffron)' },
              { label: 'Your verified hours', val: samayProfile ? `${samayProfile.total_verified_hours}h` : '—', icon: '⏱', color: 'var(--ds-gold-deep)' },
              { label: 'Community Pillar status', val: samayProfile?.is_community_pillar ? 'Earned' : 'Build yours', icon: '⭐', color: 'var(--ds-plum)' },
            ].map(stat => (
              <div key={stat.label} className="ds-card" style={{ padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ fontSize: 20, flexShrink: 0 }}>{stat.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--ds-ink-mute)', lineHeight: 1.3 }}>{stat.label}</div>
                  <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 22, fontWeight: 700, color: stat.color, marginTop: 2 }}>{stat.val}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

/* ─────────────────────────────────────────────────────────────
   5. Kutumb Radar — nearby kin, arrival discovery
   Surprise + delight = share moment = new user acquisition
───────────────────────────────────────────────────────────── */
const KutumbRadar = ({ nearby }: { nearby: RadarMember[] }) => {
  const navigate = useNavigate();
  if (nearby.length === 0) return null;
  // Consider "online" if location updated within last 30 min
  const enriched = nearby.slice(0, 3).map(p => ({
    ...p,
    online: (Date.now() - new Date(p.updated_at).getTime()) < 30 * 60 * 1000,
  }));
  return (
    <section style={{ padding: '32px 0', background: 'var(--ds-paper)', borderBottom: '1px solid var(--ds-hairline)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="ds-eyebrow">Kutumb Radar · nearby</span>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 26, marginTop: 6, color: 'var(--ds-ink)' }}>
              {enriched.length} {enriched.length === 1 ? 'person' : 'people'} from your tree{' '}
              <span style={{ fontStyle: 'italic', color: 'var(--ds-plum-rose)' }}>are here right now.</span>
            </h2>
          </div>
          <button onClick={() => navigate('/radar')} className="ds-btn ds-btn-sm ds-btn-plum">Open full radar →</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }} className="dash-radar-grid">
          {enriched.map((p, i) => (
            <div key={i} className="ds-card" style={{ padding: 20, display: 'flex', gap: 14, alignItems: 'center', border: p.online ? '1px solid rgba(122,219,160,0.3)' : '1px solid var(--ds-hairline)' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,var(--ds-plum),var(--ds-plum-rose))', display: 'grid', placeItems: 'center', color: '#fff', fontFamily: 'var(--ds-serif)', fontWeight: 700, fontSize: 18 }}>
                  {p.name[0].toUpperCase()}
                </div>
                {p.online && <div style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: '50%', background: '#7adba0', border: '2px solid var(--ds-paper)' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--ds-serif)', fontWeight: 600, color: 'var(--ds-plum)', fontSize: 15 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ds-ink-mute)', marginTop: 2 }}>{p.relation}</div>
                <div style={{ fontSize: 11, color: 'var(--ds-ink-mute)', marginTop: 1 }}>📍 {p.distance_km.toFixed(1)} km</div>
              </div>
              <button onClick={() => navigate('/radar')} className="ds-btn ds-btn-sm" style={{ background: p.online ? '#7adba0' : 'var(--ds-ivory-warm)', color: p.online ? '#0a1f17' : 'var(--ds-plum)', whiteSpace: 'nowrap', fontSize: 11, flexShrink: 0 }}>
                {p.online ? 'Say namaste →' : 'Connect →'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─────────────────────────────────────────────────────────────
   6. Invite Loop — viral growth engine
   Every invite = +12 score for both. Value exchange is explicit.
───────────────────────────────────────────────────────────── */
const InviteLoop = ({ treeSize }: { treeSize: number }) => {
  const navigate = useNavigate();
  const target = Math.max(10, treeSize + 5);
  return (
    <section style={{ padding: '24px 0', background: 'linear-gradient(90deg,rgba(74,33,104,0.04),rgba(212,154,31,0.04))' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
        <div className="ds-card" style={{ padding: '22px 28px', display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap', border: '1px solid rgba(212,154,31,0.2)', background: 'linear-gradient(135deg,var(--ds-paper),var(--ds-ivory))' }}>
          <div style={{ flex: '2 1 260px' }}>
            <span className="ds-eyebrow" style={{ color: 'var(--ds-gold-deep)' }}>Your tree has {treeSize} member{treeSize !== 1 ? 's' : ''} — keep growing</span>
            <h3 style={{ fontFamily: 'var(--ds-serif)', fontSize: 22, marginTop: 6, color: 'var(--ds-ink)', lineHeight: 1.2 }}>
              Every invite = <span style={{ color: 'var(--ds-gold-deep)' }}>+12 Prakriti</span> for both of you.
            </h3>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--ds-mono)', color: 'var(--ds-ink-mute)', marginBottom: 5 }}>
                <span>{treeSize} members so far</span><span>Goal: {target}</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'var(--ds-hairline-strong)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, (treeSize / target) * 100)}%`, height: '100%', background: 'linear-gradient(90deg,var(--ds-plum-rose),var(--ds-gold))' }} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: '1 1 auto' }}>
            <button onClick={() => navigate('/invite')} className="ds-btn ds-btn-plum" style={{ flex: 1, justifyContent: 'center', minWidth: 140, whiteSpace: 'nowrap' }}>📲 Invite via WhatsApp</button>
            <button onClick={() => navigate('/invite')} className="ds-btn ds-btn-ghost" style={{ flex: 1, justifyContent: 'center', minWidth: 100, whiteSpace: 'nowrap' }}>Copy link</button>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ─────────────────────────────────────────────────────────────
   7. Community Feed + Rank sidebar
   Every feed row has a "Do this too →" CTA. Monkey-see, monkey-do.
───────────────────────────────────────────────────────────── */
const SOURCE_ICON: Record<string, string> = { eco_sewa: '🤝', verified: '🪔', ceremony: '🌾' };
const SOURCE_CTA: Record<string, { label: string; path: string }> = {
  eco_sewa:  { label: 'Offer sewa →',    path: '/time-bank' },
  verified:  { label: 'Verify yours →',  path: '/verification' },
  ceremony:  { label: 'Log yours →',     path: '/eco-panchang' },
};
function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const CommunityFeed = ({ familyRank, timeline, panchang, dashboardTasks, openSewa }: {
  familyRank: FamilyRank | null;
  timeline: GreenLegacyEvent[];
  panchang: LivePanchang | null;
  dashboardTasks: DashboardTask[];
  openSewa: SamayRequest | null;
}) => {
  const navigate = useNavigate();
  const [taskInput, setTaskInput] = useState('');
  const [tasks, setTasks] = useState<DashboardTask[]>(dashboardTasks);
  const [addingTask, setAddingTask] = useState(false);

  // sync if prop changes (after fetch completes)
  useEffect(() => { setTasks(dashboardTasks); }, [dashboardTasks]);

  async function handleAddTask() {
    const title = taskInput.trim();
    if (!title) return;
    setAddingTask(true);
    const created = await createDashboardTask(title);
    if (created) setTasks(prev => [created, ...prev]);
    else setTasks(prev => [{ id: Date.now().toString(), title, hours_estimate: 0, status: 'open', created_at: new Date().toISOString() }, ...prev]);
    setTaskInput('');
    setAddingTask(false);
  }
  // Map real timeline events; fall back to empty if none
  const feed = timeline.slice(0, 5).map(e => ({
    who: 'Your tree',
    what: e.notes ?? e.action_type.replace(/_/g, ' '),
    when: timeAgo(e.created_at),
    icon: SOURCE_ICON[e.source] ?? '🌱',
    delta: e.points > 0 ? `+${e.points}` : null,
    cta: SOURCE_CTA[e.source]?.label ?? null,
    path: SOURCE_CTA[e.source]?.path ?? '/eco-panchang',
  }));
  return (
    <section style={{ padding: '24px 0 64px', background: 'var(--ds-ivory)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }} className="dash-grid">
          <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--ds-hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--ds-ivory-warm)' }}>
              <div>
                <span className="ds-eyebrow">Kutumb feed · live</span>
                <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 20, marginTop: 3, color: 'var(--ds-plum)' }}>What your community is doing</div>
              </div>
              <span className="ds-pill"><span className="ds-pill-dot live" />Live</span>
            </div>
            {feed.length > 0 ? feed.map((e, i) => (
              <div key={i} style={{ padding: '15px 22px', borderBottom: '1px solid var(--ds-hairline)', display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ fontSize: 19, width: 36, height: 36, borderRadius: 8, background: 'var(--ds-ivory-warm)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{e.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}><strong style={{ color: 'var(--ds-plum)' }}>{e.who}</strong> {e.what}</div>
                  <div style={{ fontSize: 11, color: 'var(--ds-ink-mute)', marginTop: 2 }}>{e.when}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  {e.delta && <span className="ds-tag ds-tag-green" style={{ fontSize: 10 }}>{e.delta}</span>}
                  {e.cta && <button onClick={() => navigate(e.path)} className="ds-btn ds-btn-sm ds-btn-ghost" style={{ fontSize: 10, padding: '4px 9px', whiteSpace: 'nowrap' }}>{e.cta}</button>}
                </div>
              </div>
            )) : (
              <div style={{ padding: '32px 22px', textAlign: 'center', color: 'var(--ds-ink-mute)', fontSize: 13, fontStyle: 'italic' }}>
                Log your first eco-action to start your feed.
                <div style={{ marginTop: 12 }}>
                  <button onClick={() => navigate('/eco-panchang')} className="ds-btn ds-btn-sm ds-btn-plum">Log an action →</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="ds-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="ds-eyebrow">Your rank</span>
                <span className="ds-pill"><span className="ds-pill-dot live" />Live</span>
              </div>
              {familyRank ? (
                <div style={{ padding: '12px 14px', borderRadius: 6, background: 'rgba(212,154,31,0.08)', border: '1px solid rgba(212,154,31,0.25)', marginBottom: 12 }}>
                  <div style={{ fontFamily: 'var(--ds-mono)', fontSize: 10, color: 'var(--ds-gold-deep)' }}>Your position</div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 5 }}>
                    <div><span style={{ fontFamily: 'var(--ds-serif)', fontSize: 26, fontWeight: 700, color: 'var(--ds-plum)' }}>#{familyRank.city_rank}</span><span style={{ fontSize: 11, color: 'var(--ds-ink-mute)', marginLeft: 4 }}>{familyRank.city ?? 'city'}</span></div>
                    <div><span style={{ fontFamily: 'var(--ds-serif)', fontSize: 26, fontWeight: 700, color: 'var(--ds-plum)' }}>#{familyRank.state_rank}</span><span style={{ fontSize: 11, color: 'var(--ds-ink-mute)', marginLeft: 4 }}>{familyRank.state ?? 'state'}</span></div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px 14px', borderRadius: 6, background: 'var(--ds-ivory-warm)', border: '1px solid var(--ds-hairline)', marginBottom: 12, fontSize: 13, color: 'var(--ds-ink-soft)' }}>Complete your tree to get ranked</div>
              )}
              <button onClick={() => navigate('/leaderboard')} className="ds-btn ds-btn-sm ds-btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>Full leaderboard →</button>
            </div>
            <div className="ds-card" style={{ padding: 20, background: 'linear-gradient(180deg,#142822,#0d1d18)', color: 'var(--ds-paper)', border: 'none' }}>
              <span className="ds-eyebrow" style={{ color: '#7adba0' }}>
                {panchang?.isSpecial ? 'Right now · 2× day' : 'Today · eco window'}
              </span>
              <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 20, marginTop: 8 }}>
                {panchang ? panchang.tithiName : '—'}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                {panchang?.pakshaLabel ?? ''}
                {panchang?.nakshatra ? ` · ${panchang.nakshatra}` : ''}
              </div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6, lineHeight: 1.5 }}>
                {panchang?.isSpecial ? 'Most auspicious day. Log eco-actions — they count double today.' : 'Every eco-action logged today adds to your Prakriti score.'}
              </p>
              <button onClick={() => navigate('/eco-panchang')} className="ds-btn ds-btn-sm" style={{ marginTop: 14, background: '#7adba0', color: '#0a1f17', fontWeight: 700, width: '100%', justifyContent: 'center' }}>Log a planting — free →</button>
            </div>
            <div className="ds-card" style={{ padding: 20 }}>
              <span className="ds-eyebrow">Today's actions</span>

              {/* Add task input */}
              <div style={{ display: 'flex', gap: 6, marginTop: 10, marginBottom: 10 }}>
                <input
                  value={taskInput}
                  onChange={e => setTaskInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                  placeholder="Add your own task…"
                  style={{ flex: 1, fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--ds-hairline)', background: 'var(--ds-ivory-warm)', color: 'var(--ds-ink)', outline: 'none' }}
                />
                <button
                  onClick={handleAddTask}
                  disabled={addingTask || !taskInput.trim()}
                  className="ds-btn ds-btn-sm"
                  style={{ background: 'var(--ds-plum)', color: '#fff', padding: '6px 10px', fontSize: 11 }}
                >
                  {addingTask ? '…' : '+'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* User's own tasks */}
                {tasks.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 6, background: 'rgba(212,154,31,0.07)', border: '1px solid rgba(212,154,31,0.2)' }}>
                    <span style={{ fontSize: 12, color: 'var(--ds-ink)' }}>✏️ {t.title}</span>
                    <button onClick={() => navigate('/time-bank')} className="ds-btn ds-btn-sm" style={{ padding: '4px 8px', fontSize: 10, background: 'var(--ds-plum)', color: '#fff' }}>Log →</button>
                  </div>
                ))}

                {/* Tithi-based: plant action */}
                {panchang?.ecoPlant && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 6, background: 'var(--ds-ivory-warm)', border: '1px solid var(--ds-hairline)' }}>
                    <span style={{ fontSize: 12, color: 'var(--ds-ink)' }}>🌱 {panchang.ecoPlant}</span>
                    <button onClick={() => navigate('/eco-panchang')} className="ds-btn ds-btn-sm" style={{ padding: '4px 8px', fontSize: 10, background: 'var(--ds-plum)', color: '#fff' }}>Do →</button>
                  </div>
                )}

                {/* Tithi-based: community action */}
                {panchang?.ecoCommunity && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 6, background: 'var(--ds-ivory-warm)', border: '1px solid var(--ds-hairline)' }}>
                    <span style={{ fontSize: 12, color: 'var(--ds-ink)' }}>🤝 {panchang.ecoCommunity}</span>
                    <button onClick={() => navigate('/eco-panchang')} className="ds-btn ds-btn-sm" style={{ padding: '4px 8px', fontSize: 10, background: 'var(--ds-plum)', color: '#fff' }}>Do →</button>
                  </div>
                )}

                {/* Open Sewa request */}
                {openSewa && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 6, background: 'rgba(122,219,160,0.08)', border: '1px solid rgba(122,219,160,0.25)' }}>
                    <span style={{ fontSize: 12, color: 'var(--ds-ink)' }}>🙏 {openSewa.description ?? openSewa.notes ?? openSewa.category ?? 'Open Sewa request'} · {openSewa.hours_estimate ?? openSewa.hours ?? 1}h</span>
                    <button onClick={() => navigate('/time-bank')} className="ds-btn ds-btn-sm" style={{ padding: '4px 8px', fontSize: 10, background: '#2a8068', color: '#fff' }}>Reply →</button>
                  </div>
                )}

                {/* Fallback if nothing loaded yet */}
                {tasks.length === 0 && !panchang?.ecoPlant && !panchang?.ecoCommunity && !openSewa && (
                  <div style={{ fontSize: 12, color: 'var(--ds-ink-mute)', fontStyle: 'italic', padding: '4px 0' }}>Add a task or check back once panchang loads.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ─────────────────────────────────────────────────────────────
   8. On This Day — community + gotra, not only family
───────────────────────────────────────────────────────────── */
const OnThisDay = () => {
  const navigate = useNavigate();
  const today = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'long' });
  const items = [
    { yr: 'Today', who: 'Akshaya Tritiya · Your gotra', text: '1,400+ Kashyap families have planted saplings on this day historically. Start your record.', icon: '🌾', cta: 'Log a planting', tone: '#2a8068' },
    { yr: '1962', who: 'Your tree', text: 'A member of your tree turns 63 today. Have you wished them?', icon: '🎂', cta: 'Send aashirvaad', tone: 'var(--ds-saffron)' },
    { yr: '1947', who: 'Gotra memory', text: 'Many Kashyap families moved post-partition on dates like today. Record your movement story.', icon: '🚂', cta: 'Add to tree →', tone: 'var(--ds-plum-rose)' },
    { yr: 'Nature', who: 'Prakriti note', text: 'May 2 · peak Rohini Nakshatra for sowing in North India. Ideal day to plant a fruit tree.', icon: '🌱', cta: 'Log eco-action', tone: 'var(--ds-gold-deep)' },
  ];
  return (
    <section style={{ padding: '72px 0', background: 'linear-gradient(180deg,#f4ecdb,var(--ds-ivory))' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ marginBottom: 24 }}>
          <span className="ds-eyebrow" style={{ color: 'var(--ds-gold-deep)' }}>On this day · {today}</span>
          <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 32, marginTop: 6, color: 'var(--ds-ink)' }}>
            This date has <span style={{ fontStyle: 'italic', color: 'var(--ds-plum-rose)' }}>happened before</span>
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }} className="dash-otd-grid">
          {items.map((it, i) => (
            <div key={i} className="ds-card" style={{ padding: 22, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -10, right: -10, fontSize: 80, opacity: 0.05, fontFamily: 'var(--ds-serif)', color: it.tone, fontWeight: 700 }}>{it.yr}</div>
              <div style={{ fontSize: 32, marginBottom: 10 }}>{it.icon}</div>
              <div className="ds-eyebrow" style={{ color: it.tone }}>{it.yr} · {it.who}</div>
              <p style={{ fontSize: 14, marginTop: 8, fontFamily: 'var(--ds-serif)', lineHeight: 1.4, color: 'var(--ds-ink)', position: 'relative' }}>{it.text}</p>
              <button onClick={() => navigate('/eco-panchang')} className="ds-btn ds-btn-sm ds-btn-plum" style={{ marginTop: 14 }}>{it.cta}</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─────────────────────────────────────────────────────────────
   9. Sanskaras — loss aversion drives completion
   Closest unearned badge + action shown prominently at top.
───────────────────────────────────────────────────────────── */
const Sanskaras = () => {
  const navigate = useNavigate();
  const tiers = [
    { name: 'Gotra Keeper', icon: '🪔', sub: 'Verified 4 generations', earned: true, rare: 'Common', progress: null, action: '' },
    { name: 'Smriti Voice', icon: '🎙️', sub: 'Recorded 60 min audio', earned: true, rare: 'Uncommon', progress: null, action: '' },
    { name: 'Vat Vriksh', icon: '🌳', sub: 'Planted 7 saplings', earned: true, rare: 'Uncommon', progress: null, action: '' },
    { name: 'Karta', icon: '👑', sub: 'Lead 8 community members', earned: true, rare: 'Rare', progress: null, action: '' },
    { name: 'Sangam', icon: '🌊', sub: 'Connect 2 partner trees', earned: false, rare: 'Rare', progress: 50, action: 'Invite 2 more kin →' },
    { name: 'Vansh-Setu', icon: '🌉', sub: 'Trace 6 generations', earned: false, rare: 'Epic', progress: 67, action: 'Add 2 ancestors →' },
    { name: 'Yagna Patron', icon: '🔥', sub: 'Sponsor 3 community rites', earned: false, rare: 'Epic', progress: 33, action: 'Browse rites →' },
    { name: 'Akshaya', icon: '♾️', sub: '365-day nitya streak', earned: false, rare: 'Mythic', progress: 1.9, action: 'Keep streak →' },
  ];
  const rarityColor: Record<string, string> = { Common: 'var(--ds-ink-mute)', Uncommon: '#2a8068', Rare: 'var(--ds-plum-rose)', Epic: 'var(--ds-saffron)', Mythic: 'var(--ds-gold-deep)' };
  const closest = [...tiers].filter(t => !t.earned).sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))[0];
  return (
    <section style={{ padding: '72px 0', background: 'var(--ds-plum-deep)', color: 'var(--ds-paper)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 20% 50%,rgba(212,154,31,0.08),transparent 50%)' }} />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="ds-eyebrow" style={{ color: 'var(--ds-gold-light)' }}>Sanskaras · earned &amp; sought</span>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 32, marginTop: 6 }}>Your <span style={{ fontStyle: 'italic', color: 'var(--ds-gold-light)' }}>journey</span> in the kutumb</h2>
          </div>
          {closest && (
            <div style={{ padding: '12px 18px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(212,154,31,0.3)', display: 'flex', gap: 14, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: 'var(--ds-mono)', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>You're closest to</div>
                <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 16, color: 'var(--ds-gold-light)', marginTop: 2 }}>{closest.icon} {closest.name} · {closest.progress}%</div>
              </div>
              <button onClick={() => navigate('/dashboard')} className="ds-btn ds-btn-sm ds-btn-gold">{closest.action}</button>
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }} className="dash-sk-grid">
          {tiers.map(t => (
            <div key={t.name} style={{ padding: 18, borderRadius: 10, background: t.earned ? 'linear-gradient(180deg,rgba(212,154,31,0.1),rgba(212,154,31,0.02))' : 'rgba(255,255,255,0.03)', border: t.earned ? '1px solid rgba(212,154,31,0.4)' : '1px dashed rgba(255,255,255,0.12)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 36, filter: t.earned ? 'none' : 'grayscale(1) opacity(0.4)' }}>{t.icon}</div>
                <span style={{ fontSize: 9, fontFamily: 'var(--ds-mono)', letterSpacing: '0.15em', textTransform: 'uppercase', color: rarityColor[t.rare], fontWeight: 700 }}>{t.rare}</span>
              </div>
              <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 18, marginTop: 10, color: t.earned ? 'var(--ds-gold-light)' : 'rgba(255,255,255,0.7)' }}>{t.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{t.sub}</div>
              {!t.earned && t.progress != null && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${t.progress}%`, height: '100%', background: 'var(--ds-gold)' }} />
                  </div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--ds-mono)', color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{t.progress}% — {Math.round(100 - t.progress)}% to go</div>
                </div>
              )}
              {t.earned && <div style={{ marginTop: 10, fontSize: 10, fontFamily: 'var(--ds-mono)', color: '#7adba0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>✓ Earned</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─────────────────────────────────────────────────────────────
   10. Pride Wall — open to gotra + community, not just blood
───────────────────────────────────────────────────────────── */
const PrideWall = () => {
  const [dismissed, setDismissed] = useState<number[]>([]);
  const cards = [
    { who: 'Aanya · your tree', kind: 'Achievement', title: 'AIR 412 in JEE Main · first in 3 generations', img: '🏆', when: '2 weeks ago', tributes: 23, tone: 'var(--ds-saffron)', highlight: true },
    { who: 'Chacha ji · your tree', kind: 'Service', title: 'Built a primary school in Etawah village', img: '🏫', when: '2024', tributes: 18, tone: '#a64a8e', highlight: false },
    { who: 'Meena Devi · Kashyap gotra', kind: 'Ecology', title: 'Planted 200 saplings across 3 villages in UP', img: '🌳', when: '1 month ago', tributes: 41, tone: '#2a8068', highlight: false },
    { who: 'Pt. Ramesh ji · community', kind: 'Wisdom', title: '47 years of Vedic teaching · 1,200+ students', img: '🪔', when: 'Ongoing', tributes: 67, tone: 'var(--ds-plum-rose)', highlight: false },
    { who: 'Bhabhi · your tree', kind: 'Craft', title: 'Rangoli book published · Rajpal & Sons', img: '📕', when: '3 months ago', tributes: 7, tone: '#a64a8e', highlight: false },
    { who: 'Verma parivar · Lucknow', kind: 'Community', title: 'Organized free health camp for 300 people', img: '🩺', when: 'Last month', tributes: 55, tone: 'var(--ds-saffron)', highlight: false },
  ];
  const visible = cards.filter((_, i) => !dismissed.includes(i));
  return (
    <section style={{ padding: '72px 0', background: 'var(--ds-ivory)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="ds-eyebrow">Garv · Pride Wall</span>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 32, marginTop: 6, color: 'var(--ds-ink)' }}>Your kutumb's <span style={{ fontStyle: 'italic', color: 'var(--ds-gold-deep)' }}>gauravgaatha</span></h2>
            <p style={{ fontSize: 14, color: 'var(--ds-ink-soft)', marginTop: 6, maxWidth: 580 }}>Achievements from your tree, your gotra, your community. Tribute — don't 'like'.</p>
          </div>
          <button className="ds-btn ds-btn-sm ds-btn-plum">+ Share yours</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }} className="dash-pw-grid">
          {visible.map((c, i) => (
            <div key={i} className="ds-card" style={{ padding: 0, overflow: 'hidden', position: 'relative', border: c.highlight ? '1.5px solid var(--ds-gold)' : '1px solid var(--ds-hairline)' }}>
              {c.highlight && <div style={{ position: 'absolute', top: 14, right: 14, padding: '4px 10px', borderRadius: 999, background: 'linear-gradient(135deg,var(--ds-gold-light),var(--ds-gold))', color: 'var(--ds-plum-deep)', fontSize: 9, fontFamily: 'var(--ds-mono)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', zIndex: 2 }}>★ Featured</div>}
              <button onClick={() => setDismissed(d => [...d, cards.indexOf(c)])} style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.25)', border: 'none', color: '#fff', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 13, display: 'grid', placeItems: 'center', zIndex: 3 }}>×</button>
              <div style={{ height: 120, background: `linear-gradient(135deg,${c.tone},var(--ds-plum-deep))`, display: 'grid', placeItems: 'center', fontSize: 54 }}>{c.img}</div>
              <div style={{ padding: 18 }}>
                <div className="ds-eyebrow" style={{ color: c.tone }}>{c.kind} · {c.when}</div>
                <h3 style={{ fontFamily: 'var(--ds-serif)', fontSize: 16, marginTop: 6, lineHeight: 1.3, color: 'var(--ds-ink)' }}>{c.title}</h3>
                <p style={{ fontSize: 11, color: 'var(--ds-ink-mute)', marginTop: 5 }}>by <span style={{ fontWeight: 600, color: 'var(--ds-ink)' }}>{c.who}</span></p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--ds-hairline)' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="ds-btn ds-btn-sm ds-btn-ghost" style={{ padding: '5px 8px', fontSize: 10 }}>🙏 Pranam</button>
                    <button className="ds-btn ds-btn-sm ds-btn-ghost" style={{ padding: '5px 8px', fontSize: 10 }}>🌸 Tribute</button>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--ds-ink-mute)', fontFamily: 'var(--ds-mono)' }}>{c.tributes} tributes</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* SOS lives in AppShell nav — no duplicate floating button needed */

const NotifStack = () => {
  // Populated by real-time events — starts empty
  const [items, setItems] = useState<{ id: number; who: string; avatar: string; text: string; time: string; tint: string }[]>([]);
  return (
    <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 80, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340 }}>
      {items.map(n => (
        <div key={n.id} className="ds-card" style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start', borderLeft: `3px solid ${n.tint}`, animation: 'ks-slide-up 0.4s ease' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: n.tint, color: 'var(--ds-paper)', display: 'grid', placeItems: 'center', fontFamily: 'var(--ds-serif)', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{n.avatar}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12 }}><span style={{ fontWeight: 700, color: 'var(--ds-ink)' }}>{n.who}</span> <span style={{ color: 'var(--ds-ink-soft)' }}>{n.text}</span></div>
            <div style={{ fontSize: 10, color: 'var(--ds-ink-mute)', marginTop: 2, fontFamily: 'var(--ds-mono)' }}>{n.time} ago</div>
          </div>
          <button onClick={() => setItems(i => i.filter(x => x.id !== n.id))} style={{ background: 'transparent', border: 'none', color: 'var(--ds-ink-mute)', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
        </div>
      ))}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   Dashboard root
───────────────────────────────────────────────────────────── */
const Dashboard = () => {
  const { appUser } = useAuth();
  const { tr } = useLang();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showJoinSE, setShowJoinSE] = useState(false);
  const { plan } = usePlan();

  const isSalesMember = appUser ? SALES_ROLES.has(appUser.role) : false;
  const [prakritiScore, setPrakritiScore] = useState<PrakritiScore | null>(null);
  const [familyRank, setFamilyRank] = useState<FamilyRank | null>(null);
  const [samayProfile, setSamayProfile] = useState<SamayProfile | null>(null);
  const [samayRequests, setSamayRequests] = useState<SamayRequest[]>([]);
  const [nearby, setNearby] = useState<RadarMember[]>([]);
  const [timeline, setTimeline] = useState<GreenLegacyEvent[]>([]);
  const [treeSize, setTreeSize] = useState(0);
  const [dashboardTasks, setDashboardTasks] = useState<DashboardTask[]>([]);
  const [openSewa, setOpenSewa] = useState<SamayRequest | null>(null);

  const streak = (() => {
    try { return parseInt(localStorage.getItem('prakriti_streak') ?? '0', 10) || 0; } catch { return 0; }
  })();
  const panchang = useLivePanchang();

  useEffect(() => {
    const vid = resolveVanshaIdForApi(null);
    if (!vid) return;
    fetchPrakritiScore(vid).then(setPrakritiScore).catch(() => {});
    fetchFamilyRank(vid).then(setFamilyRank).catch(() => {});
    fetchSamayProfile().then(setSamayProfile).catch(() => {});
    fetchSamayRequests('local', 5).then(setSamayRequests).catch(() => {});
    fetchSamayRequests('local', 1).then(reqs => setOpenSewa(reqs[0] ?? null)).catch(() => {});
    fetchDashboardTasks().then(setDashboardTasks).catch(() => {});
    fetchRadarNearby(vid, 10).then(setNearby).catch(() => {});
    fetchGreenLegacyTimeline(vid, 5).then(setTimeline).catch(() => {});
    fetchVanshaTree(vid).then(d => setTreeSize(d.persons?.length ?? 0)).catch(() => {});
  }, [appUser?.vansha_id]);

  useEffect(() => {
    if (searchParams.get('join-team') === '1') {
      setShowJoinSE(true);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  // Suppress unused-var warnings for now; tr and plan used by other parts of app
  void tr; void plan;

  return (
    <AppShell>
      <div style={{ background: 'var(--ds-ivory)', minHeight: '100vh' }}>
        <CommunityPulseBar streak={streak} />
        {panchang?.isSpecial && <RightNowMoment panchang={panchang} />}
        <CommunityHero appUser={appUser} score={prakritiScore} familyRank={familyRank} panchang={panchang} />
        <SewaEngine samayProfile={samayProfile} samayRequests={samayRequests} />
        <KutumbRadar nearby={nearby} />
        <InviteLoop treeSize={treeSize} />
        <CommunityFeed familyRank={familyRank} timeline={timeline} panchang={panchang} dashboardTasks={dashboardTasks} openSewa={openSewa} />
        <OnThisDay />
        <Sanskaras />
        <PrideWall />
        <NotifStack />

        {isSalesMember && (
          <section style={{ padding: '24px 0', background: 'var(--ds-ivory)' }}>
            <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
              <EarningsWallet />
            </div>
          </section>
        )}

        {showJoinSE && <JoinSEModal onClose={() => setShowJoinSE(false)} />}
      </div>

      <style>{`
        @media (max-width: 1000px) {
          .dash-hero-grid  { grid-template-columns: 1fr !important; }
          .dash-sewa-grid  { grid-template-columns: 1fr !important; }
          .dash-radar-grid { grid-template-columns: 1fr !important; }
          .dash-otd-grid   { grid-template-columns: 1fr 1fr !important; }
          .dash-sk-grid    { grid-template-columns: repeat(2,1fr) !important; }
          .dash-grid       { grid-template-columns: 1fr !important; }
          .dash-pw-grid    { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 600px) {
          .dash-otd-grid   { grid-template-columns: 1fr !important; }
          .dash-sk-grid    { grid-template-columns: 1fr 1fr !important; }
          .dash-pw-grid    { grid-template-columns: 1fr !important; }
        }
        @keyframes ks-slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </AppShell>
  );
};

export default Dashboard;
