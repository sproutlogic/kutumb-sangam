import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTree } from '@/contexts/TreeContext';
import { usePlan } from '@/contexts/PlanContext';
import { useLang } from '@/i18n/LanguageContext';
import AppShell from '@/components/shells/AppShell';
import { JoinSEModal } from '@/components/sales/JoinSEModal';
import { EarningsWallet } from '@/components/sales/EarningsWallet';
import {
  resolveVanshaIdForApi, fetchPrakritiScore, type PrakritiScore,
  fetchFamilyRank, type FamilyRank,
} from '@/services/api';

const SALES_ROLES = new Set(['se', 'cp', 'rp', 'zp', 'np', 'admin', 'superadmin']);

/* ── Streak Ribbon — sticky 7-day ────────────────────────────── */
const StreakRibbon = ({ streak }: { streak: number }) => {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const today = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const done = days.map((_, i) => i < today);
  return (
    <section style={{ padding: '16px 0', background: 'linear-gradient(90deg, var(--ds-plum-deep), var(--ds-plum) 50%, var(--ds-plum-deep))', color: 'var(--ds-paper)', position: 'sticky', top: 64, zIndex: 50, borderBottom: '1px solid rgba(212,154,31,0.2)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 24, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative', width: 48, height: 48, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <svg width="48" height="48" viewBox="0 0 48 48" style={{ position: 'absolute' }}>
              <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
              <circle cx="24" cy="24" r="20" fill="none" stroke="var(--ds-gold)" strokeWidth="3" strokeDasharray="125.6" strokeDashoffset={125.6 * (1 - Math.min(streak / 30, 1))} transform="rotate(-90 24 24)" strokeLinecap="round" />
            </svg>
            <span style={{ fontFamily: 'var(--ds-serif)', fontWeight: 700, fontSize: 18, color: 'var(--ds-gold-light)' }}>{streak}</span>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{streak}-day <span style={{ color: 'var(--ds-gold-light)', fontFamily: 'var(--ds-serif)', fontStyle: 'italic' }}>Nitya</span> streak</div>
            <div style={{ fontSize: 11, opacity: 0.65 }}>One small kin act each day · keeps the diya lit</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {days.map((d, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: done[i] ? 'linear-gradient(135deg, var(--ds-gold-light), var(--ds-gold))' : i === today ? 'rgba(212,154,31,0.15)' : 'rgba(255,255,255,0.06)', border: i === today && !done[i] ? '1.5px dashed var(--ds-gold-light)' : 'none', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: done[i] ? 'var(--ds-plum-deep)' : 'rgba(255,255,255,0.5)' }}>
                {done[i] ? '🪔' : i === today ? '?' : ''}
              </div>
              <span style={{ fontSize: 9, fontFamily: 'var(--ds-mono)', opacity: i === today ? 1 : 0.4, color: i === today ? 'var(--ds-gold-light)' : 'var(--ds-paper)' }}>{d}</span>
            </div>
          ))}
        </div>
        <button className="ds-btn ds-btn-sm ds-btn-gold">🎙️ Record today's Smriti →</button>
      </div>
    </section>
  );
};

/* ── Pal Stories — 24h disappearing moments ─────────────────── */
const PalStories = ({ familyName }: { familyName: string }) => {
  const [open, setOpen] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);

  const stories = [
    { who: 'You', ring: 'gold', avatar: 'Y', label: 'Add pal', isAdd: true },
    { who: 'Dadiji', ring: 'live', avatar: 'द', label: 'Aashirvaad · 12s', kind: 'voice', text: '"Beta, aaj ka din shubh hai. Sab kaam siddh honge."', tint: '#7a3a8e' },
    { who: 'Pita ji', ring: 'live', avatar: 'P', label: 'Tulsi puja · 2h', kind: 'photo', text: 'Morning tulsi aarti — 47 years unbroken', tint: 'var(--ds-saffron)' },
    { who: 'Chacha ji', ring: 'live', avatar: 'C', label: 'Family trip', kind: 'photo', text: 'Family at weekend getaway', tint: '#2a8068' },
    { who: 'Pt. Ramesh', ring: 'gold', avatar: 'पं', label: "Today's muhurat", kind: 'note', text: '10:48–11:32 AM · Abhijit · best for new starts', tint: 'var(--ds-gold-deep)' },
  ];

  useEffect(() => {
    if (open === null) return;
    setProgress(0);
    const id = setInterval(() => setProgress(p => {
      if (p >= 100) { clearInterval(id); setOpen(o => o !== null && o < stories.length - 1 ? o + 1 : null); return 0; }
      return p + 1.4;
    }), 60);
    return () => clearInterval(id);
  }, [open]);

  const cur = open !== null ? stories[open] : null;

  return (
    <section style={{ padding: '24px 0 8px', background: 'var(--ds-ivory)', borderBottom: '1px solid var(--ds-hairline)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <span className="ds-eyebrow">Pal · today</span>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 22, marginTop: 4 }}>Family moments <span style={{ fontStyle: 'italic', color: 'var(--ds-gold-deep)', fontWeight: 400 }}>that vanish at sunset</span></h2>
          </div>
          <span style={{ fontSize: 11, fontFamily: 'var(--ds-mono)', color: 'var(--ds-ink-mute)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Tap to view</span>
        </div>
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8 }}>
          {stories.map((s, i) => (
            <button key={i} onClick={() => !s.isAdd && setOpen(i)} style={{ flexShrink: 0, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 78 }}>
              <div style={{ position: 'relative', width: 64, height: 64, borderRadius: '50%', padding: 3, background: s.ring === 'live' ? 'conic-gradient(from 180deg, var(--ds-saffron), var(--ds-gold), var(--ds-plum-rose), var(--ds-saffron))' : s.ring === 'gold' ? 'linear-gradient(135deg, var(--ds-gold-light), var(--ds-gold-deep))' : 'linear-gradient(135deg, #2a8068, #7adba0)' }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--ds-ivory)', display: 'grid', placeItems: 'center', color: 'var(--ds-plum)', fontFamily: 'var(--ds-serif)', fontWeight: 700, fontSize: 22 }}>
                  {s.isAdd ? <span style={{ fontSize: 28, color: 'var(--ds-gold-deep)', fontWeight: 300 }}>+</span> : s.avatar}
                </div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--ds-ink-soft)', fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>{s.who}</span>
              <span style={{ fontSize: 9, color: 'var(--ds-ink-mute)', fontFamily: 'var(--ds-mono)', textAlign: 'center' }}>{s.label}</span>
            </button>
          ))}
        </div>
      </div>
      {cur && !cur.isAdd && (
        <div onClick={() => setOpen(null)} style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 400, display: 'grid', placeItems: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(420px, 100%)', height: 'min(720px, 92vh)', background: `linear-gradient(180deg, ${cur.tint}, var(--ds-plum-deep))`, borderRadius: 14, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', color: 'var(--ds-paper)' }}>
            <div style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', gap: 4, zIndex: 10 }}>
              {stories.map((_, i) => i === 0 ? null : (
                <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
                  {i === open && <div style={{ width: `${progress}%`, height: '100%', background: 'var(--ds-paper)' }} />}
                  {i < (open ?? 0) && <div style={{ width: '100%', height: '100%', background: 'var(--ds-paper)' }} />}
                </div>
              ))}
            </div>
            <div style={{ padding: '30px 18px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'grid', placeItems: 'center', fontFamily: 'var(--ds-serif)', fontWeight: 700, fontSize: 16 }}>{cur.avatar}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{cur.who}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{cur.label}</div>
              </div>
              <button onClick={() => setOpen(null)} style={{ background: 'transparent', color: 'var(--ds-paper)', border: 'none', fontSize: 24, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 30, textAlign: 'center' }}>
              {cur.kind === 'voice' && <p style={{ fontFamily: 'var(--ds-serif)', fontSize: 24, lineHeight: 1.4, fontStyle: 'italic' }}>{cur.text}</p>}
              {cur.kind === 'photo' && <div><div style={{ width: 240, height: 240, borderRadius: 12, background: `linear-gradient(135deg, ${cur.tint}, rgba(255,255,255,0.1))`, border: '2px solid rgba(255,255,255,0.3)', display: 'grid', placeItems: 'center', fontSize: 64, marginBottom: 18 }}>📷</div><p style={{ fontFamily: 'var(--ds-serif)', fontSize: 20, fontStyle: 'italic' }}>{cur.text}</p></div>}
              {cur.kind === 'note' && <p style={{ fontFamily: 'var(--ds-serif)', fontSize: 24, lineHeight: 1.4, fontStyle: 'italic' }}>{cur.text}</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

/* ── Dash Hero — score + today's date + todo ─────────────────── */
const DashHero = ({ appUser, score, familyRank }: {
  appUser: { full_name?: string | null } | null;
  score: PrakritiScore | null;
  familyRank: FamilyRank | null;
}) => {
  const navigate = useNavigate();
  const displayScore = score?.total_score ?? 78;
  const familyName = appUser?.full_name?.split(' ').slice(-1)[0] ?? 'Parivar';
  const [todos, setTodos] = useState([
    { icon: '🌱', t: 'Plant a sapling · Akshaya Tritiya 2× day', done: false, src: 'eco' },
    { icon: '🪔', t: 'Light a single ghee diya, no waste', done: true, src: 'eco' },
    { icon: '🌳', t: 'Vat Savitri reminder · 4 days', done: false, src: 'panchang' },
    { icon: '☎️', t: 'Call dadaji about Smriti recording', done: false, src: 'self' },
    { icon: '📜', t: 'Review vanshavali draft from Pt. Ramesh', done: true, src: 'self' },
  ]);
  const [newTask, setNewTask] = useState('');
  const doneCnt = todos.filter(t => t.done).length;

  return (
    <section style={{ background: 'linear-gradient(180deg, var(--ds-plum-deep), var(--ds-plum) 80%)', color: 'var(--ds-paper)', padding: '40px 0 80px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
          <div>
            <div className="ds-eyebrow" style={{ color: 'var(--ds-gold-light)' }}>Welcome back</div>
            <h1 style={{ fontFamily: 'var(--ds-serif)', fontSize: 'clamp(28px,3.6vw,48px)', marginTop: 8, color: 'var(--ds-paper)' }}>
              Namaste, <span style={{ fontStyle: 'italic', color: 'var(--ds-gold-light)' }}>{familyName}</span> parivar.
            </h1>
            <p style={{ marginTop: 10, fontSize: 15, color: 'rgba(255,255,255,0.65)' }}>
              Your family's nature score is live · <span style={{ color: 'var(--ds-gold-light)' }}>2 verifications pending</span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => navigate('/invite')} className="ds-btn ds-btn-ghost ds-btn-sm" style={{ color: 'var(--ds-paper)', borderColor: 'rgba(255,255,255,0.25)' }}>Invite kin</button>
            <button onClick={() => navigate('/tree')} className="ds-btn ds-btn-gold ds-btn-sm">Open tree →</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 18, marginTop: 40 }} className="dash-hero-grid">
          {/* Score card */}
          <div className="ds-card" style={{ padding: 28, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(212,154,31,0.3)', color: 'var(--ds-paper)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="ds-eyebrow" style={{ color: 'var(--ds-gold-light)' }}>Prakriti score</span>
              <span className="ds-pill" style={{ background: 'rgba(122,219,160,0.12)', borderColor: 'rgba(122,219,160,0.3)', color: '#7adba0' }}>↑ +6 this week</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, marginTop: 18 }}>
              <div className="ds-score-num" style={{ fontSize: 110, color: 'var(--ds-gold-light)', lineHeight: 1 }}>{displayScore}</div>
              <div style={{ paddingBottom: 18, color: 'rgba(255,255,255,0.55)' }}>
                <div style={{ fontSize: 14 }}>/100</div>
                {familyRank && <div style={{ fontSize: 12, marginTop: 4 }}>#{familyRank.city_rank} in {familyRank.city ?? 'your city'}</div>}
                {familyRank && <div style={{ fontSize: 12 }}>#{familyRank.state_rank} in {familyRank.state ?? 'your state'}</div>}
              </div>
            </div>
            <div style={{ marginTop: 18, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <div style={{ width: `${displayScore}%`, height: '100%', background: 'linear-gradient(90deg,var(--ds-saffron),var(--ds-gold))' }} />
            </div>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--ds-mono)' }}>
              <span>Beej</span><span>Ankur</span><span>Vriksh</span><span>Vansh</span>
            </div>
          </div>

          {/* Today calendar */}
          <div className="ds-card" style={{ padding: 24, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--ds-paper)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="ds-eyebrow" style={{ color: 'rgba(255,255,255,0.55)' }}>Today</span>
              <span className="ds-pill" style={{ background: 'rgba(122,219,160,0.12)', borderColor: 'rgba(122,219,160,0.3)', color: '#7adba0' }}><span className="ds-pill-dot live" />Auspicious day</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 14 }}>
              <div className="ds-score-num" style={{ fontSize: 80, color: 'var(--ds-gold-light)', lineHeight: 1 }}>{new Date().getDate()}</div>
              <div>
                <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 22, color: 'var(--ds-paper)', lineHeight: 1.1 }}>{new Date().toLocaleString('en-IN', { month: 'long' })}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>{new Date().toLocaleString('en-IN', { weekday: 'long' })} · {new Date().getFullYear()}</div>
              </div>
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
              <div className="ds-sanskrit" style={{ color: 'var(--ds-gold-light)', fontSize: 14, marginBottom: 4 }}>वैशाख शुक्ल तृतीया</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Sunrise · Sunset</span><span>05:42 · 18:51</span></div>
            </div>
            <button onClick={() => navigate('/eco-panchang')} className="ds-btn ds-btn-sm" style={{ marginTop: 14, background: 'var(--ds-gold)', color: 'var(--ds-plum-deep)', fontWeight: 700, width: '100%', justifyContent: 'center' }}>Open panchang →</button>
          </div>

          {/* Auto Todo */}
          <div className="ds-card" style={{ padding: 24, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--ds-paper)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="ds-eyebrow" style={{ color: 'rgba(255,255,255,0.55)' }}>Today's to-do</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--ds-mono)' }}>{doneCnt} of {todos.length} done</span>
            </div>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              {todos.map((td, i) => (
                <label key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input type="checkbox" checked={td.done} onChange={() => setTodos(t => t.map((x, j) => j === i ? { ...x, done: !x.done } : x))} style={{ marginTop: 3, accentColor: 'var(--ds-gold)' }} />
                  <span style={{ fontSize: 13, color: td.done ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.85)', textDecoration: td.done ? 'line-through' : 'none', flex: 1, lineHeight: 1.4 }}>
                    <span style={{ marginRight: 6 }}>{td.icon}</span>{td.t}
                  </span>
                  <span style={{ fontSize: 9, fontFamily: 'var(--ds-mono)', textTransform: 'uppercase', color: td.src === 'eco' ? '#7adba0' : td.src === 'panchang' ? 'var(--ds-gold-light)' : 'rgba(255,255,255,0.4)', flexShrink: 0, marginTop: 3 }}>{td.src}</span>
                </label>
              ))}
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 6 }}>
              <input value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="+ Add your own task" style={{ flex: 1, padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--ds-paper)', fontSize: 12, fontFamily: 'inherit' }} />
              <button onClick={() => { if (newTask.trim()) { setTodos(t => [...t, { icon: '✅', t: newTask, done: false, src: 'self' }]); setNewTask(''); } }} className="ds-btn ds-btn-sm" style={{ background: 'var(--ds-gold)', color: 'var(--ds-plum-deep)', fontWeight: 700, padding: '8px 12px' }}>Add</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ── Live Tiles — Radar / Time Bank / Eco Panchang ───────────── */
const LiveTiles = () => {
  const navigate = useNavigate();
  const tiles = [
    {
      key: 'radar', path: '/radar',
      eyebrow: 'Kutumb Radar', title: '3 kin within 10 km',
      sub: 'Rahul Sharma 2.3 km · Priya Verma 5.1 km · Amit Kumar 8.7 km',
      cta: 'Open radar →', accent: 'var(--ds-plum-rose)', live: true,
      glyph: <svg viewBox="0 0 80 80" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="40" cy="40" r="32" opacity="0.25" /><circle cx="40" cy="40" r="22" opacity="0.4" /><circle cx="40" cy="40" r="12" opacity="0.6" /><circle cx="40" cy="40" r="2" fill="currentColor" /><circle cx="56" cy="30" r="3" fill="var(--ds-saffron)" stroke="none" /><circle cx="28" cy="52" r="3" fill="var(--ds-gold)" stroke="none" /></svg>,
    },
    {
      key: 'time-bank', path: '/time-bank',
      eyebrow: 'Sewa Time Bank', title: '14 hrs banked',
      sub: '2 owed to Bua ji · 5 owed by Verma parivar · 1 request open',
      cta: 'View ledger →', accent: 'var(--ds-gold-deep)', live: false,
      glyph: <svg viewBox="0 0 80 80" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="40" cy="40" r="30" opacity="0.4" /><path d="M40 22 L40 40 L52 48" strokeLinecap="round" /><circle cx="40" cy="40" r="2" fill="currentColor" /></svg>,
    },
    {
      key: 'eco-panchang', path: '/eco-panchang',
      eyebrow: 'Eco Panchang · Today', title: 'Akshaya Tritiya',
      sub: 'Plant a tree · Tithi: Tritiya · Nakshatra: Rohini · 2× Prakriti',
      cta: 'See today →', accent: '#7adba0', live: true,
      glyph: <svg viewBox="0 0 80 80" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="40" cy="40" r="14" opacity="0.5" />{Array.from({ length: 12 }).map((_, i) => { const a = (i * 30) * Math.PI / 180; return <line key={i} x1={40 + 18 * Math.cos(a)} y1={40 + 18 * Math.sin(a)} x2={40 + 26 * Math.cos(a)} y2={40 + 26 * Math.sin(a)} opacity="0.6" strokeLinecap="round" />; })}</svg>,
    },
  ];
  return (
    <section style={{ padding: '8px 0 24px', background: 'var(--ds-ivory)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="ds-eyebrow">Live now</span>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 26, marginTop: 6, color: 'var(--ds-ink)' }}>Around your parivar</h2>
          </div>
          <span className="ds-pill"><span className="ds-pill-dot live" />Synced 12s ago</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }} className="dash-live-tiles">
          {tiles.map(t => (
            <button key={t.key} onClick={() => navigate(t.path)} className="ds-card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, textDecoration: 'none', position: 'relative', overflow: 'hidden', cursor: 'pointer', background: 'var(--ds-paper)', border: '1px solid var(--ds-hairline)', textAlign: 'left', width: '100%' }}>
              <div style={{ position: 'absolute', top: -10, right: -10, opacity: 0.18, color: t.accent }}>{t.glyph}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                <span className="ds-eyebrow" style={{ color: t.accent }}>{t.eyebrow}</span>
                {t.live && <span className="ds-pill"><span className="ds-pill-dot live" />Live</span>}
              </div>
              <div style={{ position: 'relative' }}>
                <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 24, fontWeight: 700, color: 'var(--ds-ink)', letterSpacing: '-0.01em' }}>{t.title}</div>
                <p style={{ fontSize: 12, color: 'var(--ds-ink-mute)', marginTop: 6, lineHeight: 1.5 }}>{t.sub}</p>
              </div>
              <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: t.accent, borderBottom: `1px solid ${t.accent}`, paddingBottom: 1 }}>{t.cta}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ── Next Actions — 4 quick wins ─────────────────────────────── */
const NextActions = () => {
  const navigate = useNavigate();
  const actions = [
    { title: "Verify dadaji's gotra", sub: 'Pt. Ramesh Mishra · 2hr response', cta: '₹49', icon: '🪔', color: 'var(--ds-saffron)', urgent: true, path: '/verification' },
    { title: "Record dadiji's aashirvaad", sub: '5min · Voice in her language', cta: '₹9 / min', icon: '🎙️', color: 'var(--ds-plum-rose)', path: '/legacy-box' },
    { title: 'Add 3 missing cousins', sub: 'WhatsApp invite · auto-sync', cta: 'Free', icon: '➕', color: 'var(--ds-ink-soft)', path: '/invite' },
    { title: 'Generate vanshavali PDF', sub: 'Print-ready · pandit stamped', cta: '₹149', icon: '📜', color: 'var(--ds-gold-deep)', path: '/tree' },
  ];
  return (
    <section style={{ padding: '72px 0', background: 'var(--ds-ivory)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="ds-eyebrow">Next actions</span>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 32, marginTop: 6, color: 'var(--ds-ink)' }}>Four quick wins for your parivar</h2>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }} className="dash-next-actions">
          {actions.map(a => (
            <div key={a.title} className="ds-card" style={{ padding: 22, position: 'relative' }}>
              {a.urgent && <div style={{ position: 'absolute', top: 14, right: 14, fontSize: 10, fontFamily: 'var(--ds-mono)', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--ds-saffron)', fontWeight: 700 }}>Priority</div>}
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--ds-ivory-warm)', border: '1px solid var(--ds-hairline)', display: 'grid', placeItems: 'center', fontSize: 22 }}>{a.icon}</div>
              <h3 style={{ fontSize: 16, marginTop: 14, fontFamily: 'var(--ds-sans)', fontWeight: 700, color: 'var(--ds-ink)' }}>{a.title}</h3>
              <p style={{ fontSize: 12, color: 'var(--ds-ink-mute)', marginTop: 4 }}>{a.sub}</p>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--ds-serif)', fontWeight: 700, fontSize: 18, color: a.color }}>{a.cta}</span>
                <button onClick={() => navigate(a.path)} className="ds-btn ds-btn-sm ds-btn-plum">Do it →</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ── On This Day ─────────────────────────────────────────────── */
const OnThisDay = () => {
  const items = [
    { yr: '1962', who: 'Pita ji', text: 'Born today · turning 63 next year', icon: '🎂', cta: 'Send aashirvaad', tone: '#7a3a8e' },
    { yr: '1947', who: 'Pardada', text: 'Reached Kanpur from Lahore · 78 years ago', icon: '🚂', cta: 'Hear the story →', tone: '#9a6e16' },
    { yr: '2018', who: 'Family', text: 'Last Holi all 23 of us were together', icon: '📷', cta: 'Open album →', tone: 'var(--ds-saffron)' },
    { yr: '1989', who: 'Dadiji', text: 'Recorded the gotra mantra · listen now', icon: '🎙️', cta: 'Play 47s', tone: 'var(--ds-plum)' },
  ];
  const today = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'long' });
  return (
    <section style={{ padding: '72px 0', background: 'linear-gradient(180deg, #f4ecdb, var(--ds-ivory))', position: 'relative' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="ds-eyebrow" style={{ color: 'var(--ds-gold-deep)' }}>On this day · in your parivar</span>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 32, marginTop: 6, color: 'var(--ds-ink)' }}>The {today} <span style={{ fontStyle: 'italic', color: 'var(--ds-plum-rose)' }}>has happened before</span></h2>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }} className="dash-otd-grid">
          {items.map((it, i) => (
            <div key={i} className="ds-card" style={{ padding: 22, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -10, right: -10, fontSize: 80, opacity: 0.06, fontFamily: 'var(--ds-serif)', color: it.tone, fontWeight: 700 }}>{it.yr}</div>
              <div style={{ fontSize: 32, marginBottom: 10 }}>{it.icon}</div>
              <div className="ds-eyebrow" style={{ color: it.tone }}>{it.yr} · {it.who}</div>
              <p style={{ fontSize: 14, marginTop: 8, fontFamily: 'var(--ds-serif)', lineHeight: 1.4, color: 'var(--ds-ink)', position: 'relative' }}>{it.text}</p>
              <button className="ds-btn ds-btn-sm ds-btn-plum" style={{ marginTop: 14 }}>{it.cta}</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ── Sanskaras — achievements ────────────────────────────────── */
const Sanskaras = () => {
  const tiers = [
    { name: 'Gotra Keeper', icon: '🪔', sub: 'Verified 4 generations', earned: true, rare: 'Common' },
    { name: 'Smriti Voice', icon: '🎙️', sub: 'Recorded 60 min audio', earned: true, rare: 'Uncommon' },
    { name: 'Vat Vriksh', icon: '🌳', sub: 'Planted 7 saplings', earned: true, rare: 'Uncommon' },
    { name: 'Karta', icon: '👑', sub: 'Lead 8 family members', earned: true, rare: 'Rare' },
    { name: 'Sangam', icon: '🌊', sub: 'Connect 2 partner trees', earned: false, rare: 'Rare', progress: 50 },
    { name: 'Vansh-Setu', icon: '🌉', sub: 'Trace 6 generations', earned: false, rare: 'Epic', progress: 67 },
    { name: 'Yagna Patron', icon: '🔥', sub: 'Sponsor 3 community rites', earned: false, rare: 'Epic', progress: 33 },
    { name: 'Akshaya', icon: '♾️', sub: '365-day nitya streak', earned: false, rare: 'Mythic', progress: 1.9 },
  ];
  const rarityColor: Record<string, string> = { Common: 'var(--ds-ink-mute)', Uncommon: '#2a8068', Rare: 'var(--ds-plum-rose)', Epic: 'var(--ds-saffron)', Mythic: 'var(--ds-gold-deep)' };
  return (
    <section style={{ padding: '72px 0', background: 'var(--ds-plum-deep)', color: 'var(--ds-paper)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 20% 50%, rgba(212,154,31,0.08), transparent 50%)' }} />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="ds-eyebrow" style={{ color: 'var(--ds-gold-light)' }}>Sanskaras · earned &amp; sought</span>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 32, marginTop: 6, color: 'var(--ds-paper)' }}>Mark your <span style={{ fontStyle: 'italic', color: 'var(--ds-gold-light)' }}>journey</span> in the parivar</h2>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ padding: '10px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--ds-mono)', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Earned</div>
              <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 24, color: 'var(--ds-gold-light)' }}>4 <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>/ 24</span></div>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }} className="dash-sk-grid">
          {tiers.map(t => (
            <div key={t.name} style={{ padding: 18, borderRadius: 10, background: t.earned ? 'linear-gradient(180deg, rgba(212,154,31,0.1), rgba(212,154,31,0.02))' : 'rgba(255,255,255,0.03)', border: t.earned ? '1px solid rgba(212,154,31,0.4)' : '1px dashed rgba(255,255,255,0.12)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 36, filter: t.earned ? 'none' : 'grayscale(1) opacity(0.4)' }}>{t.icon}</div>
                <span style={{ fontSize: 9, fontFamily: 'var(--ds-mono)', letterSpacing: '0.15em', textTransform: 'uppercase', color: rarityColor[t.rare], fontWeight: 700 }}>{t.rare}</span>
              </div>
              <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 18, marginTop: 10, color: t.earned ? 'var(--ds-gold-light)' : 'rgba(255,255,255,0.7)' }}>{t.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{t.sub}</div>
              {!t.earned && t.progress != null && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${t.progress}%`, height: '100%', background: 'var(--ds-gold)' }} />
                  </div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--ds-mono)', color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>{t.progress}% complete</div>
                </div>
              )}
              {t.earned && <div style={{ marginTop: 10, fontSize: 10, fontFamily: 'var(--ds-mono)', color: '#7adba0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>✓ Inherited</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ── Parivar Feed + Leaderboard ──────────────────────────────── */
const DashGrid = ({ familyRank }: { familyRank: FamilyRank | null }) => {
  const navigate = useNavigate();
  const feed = [
    { who: 'Anjali (you)', what: 'invited 4 cousins to the tree', when: '2 hours ago', icon: '➕', delta: '+8 score' },
    { who: 'Pita ji', what: 'recorded a 6-min Smriti about the 1947 migration', when: 'yesterday', icon: '🎙️', delta: '+12 score' },
    { who: 'Pt. Ramesh Mishra', what: "verified dadaji's gotra (Kashyap)", when: 'yesterday', icon: '🪔', delta: '+15 score' },
    { who: 'Chacha ji', what: 'planted 5 trees · logged with photo proof', when: '3 days ago', icon: '🌱', delta: '+5 score' },
    { who: 'Bua ji', what: 'added 2 cousins to the Bharadwaj branch', when: '4 days ago', icon: '🌳', delta: '+4 score' },
  ];
  return (
    <section style={{ padding: '24px 0 80px', background: 'var(--ds-ivory)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }} className="dash-grid">
          <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--ds-hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="ds-eyebrow">Parivar feed · last 7 days</span>
                <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 20, marginTop: 4, color: 'var(--ds-plum)' }}>What your family has been up to</div>
              </div>
            </div>
            {feed.map((e, i) => (
              <div key={i} style={{ padding: '18px 22px', borderBottom: '1px solid var(--ds-hairline)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ fontSize: 22, width: 40, height: 40, borderRadius: 8, background: 'var(--ds-ivory-warm)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{e.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14 }}><strong style={{ color: 'var(--ds-plum)' }}>{e.who}</strong> {e.what}</div>
                  <div style={{ fontSize: 12, color: 'var(--ds-ink-mute)', marginTop: 2 }}>{e.when}</div>
                </div>
                <span className="ds-tag ds-tag-green" style={{ flexShrink: 0 }}>{e.delta}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="ds-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span className="ds-eyebrow">Your city rank</span>
                <span className="ds-pill"><span className="ds-pill-dot live" />Live</span>
              </div>
              {familyRank && (
                <div style={{ padding: '12px 14px', borderRadius: 6, background: 'rgba(212,154,31,0.1)', border: '1px solid rgba(212,154,31,0.3)', marginBottom: 12 }}>
                  <div style={{ fontFamily: 'var(--ds-mono)', fontSize: 11, color: 'var(--ds-gold-deep)' }}>Your position</div>
                  <div style={{ display: 'flex', gap: 20, marginTop: 6 }}>
                    <div><span style={{ fontFamily: 'var(--ds-serif)', fontSize: 28, fontWeight: 700, color: 'var(--ds-plum)' }}>#{familyRank.city_rank}</span><span style={{ fontSize: 12, color: 'var(--ds-ink-mute)', marginLeft: 4 }}>in {familyRank.city ?? 'city'}</span></div>
                    <div><span style={{ fontFamily: 'var(--ds-serif)', fontSize: 28, fontWeight: 700, color: 'var(--ds-plum)' }}>#{familyRank.state_rank}</span><span style={{ fontSize: 12, color: 'var(--ds-ink-mute)', marginLeft: 4 }}>in {familyRank.state ?? 'state'}</span></div>
                  </div>
                </div>
              )}
              <button onClick={() => navigate('/leaderboard')} className="ds-btn ds-btn-sm ds-btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>See full leaderboard →</button>
            </div>
            <div className="ds-card" style={{ padding: 20, background: 'linear-gradient(180deg,#142822,#0d1d18)', color: 'var(--ds-paper)', border: 'none' }}>
              <span className="ds-eyebrow" style={{ color: '#7adba0' }}>Eco Panchang · today</span>
              <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 22, marginTop: 10, color: 'var(--ds-paper)' }}>Akshaya Tritiya</div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>Most auspicious day to plant a tree. Counts 2× toward your Prakriti.</p>
              <button onClick={() => navigate('/eco-panchang')} className="ds-btn ds-btn-sm" style={{ marginTop: 14, background: '#7adba0', color: '#0a1f17', fontWeight: 700 }}>Log a planting →</button>
            </div>
            <div className="ds-card" style={{ padding: 20 }}>
              <span className="ds-eyebrow">Smriti queue</span>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { who: 'Dadaji Ramnath', topic: 'Partition story', sec: 258 },
                  { who: 'Nani ji Saroj', topic: 'Family recipes', sec: 0 },
                ].map(s => (
                  <div key={s.who} style={{ padding: 12, borderRadius: 6, border: '1px solid var(--ds-hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{s.who}</div>
                      <div style={{ fontSize: 11, color: 'var(--ds-ink-mute)' }}>{s.topic}</div>
                    </div>
                    {s.sec > 0 ? <span className="ds-tag ds-tag-gold">{Math.floor(s.sec / 60)}:{String(s.sec % 60).padStart(2, '0')}</span> : <button onClick={() => navigate('/legacy-box')} className="ds-btn ds-btn-sm ds-btn-plum">Record</button>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ── Privacy Matrix ───────────────────────────────────────────── */
const PrivacyMatrix = () => {
  const [members, setMembers] = useState([
    { name: 'Dadaji Ramnath', role: 'Elder', loc: false, tree: true, smriti: true, finance: false },
    { name: 'Pita ji', role: 'Karta', loc: true, tree: true, smriti: true, finance: true },
    { name: 'Mata ji', role: 'Karti', loc: true, tree: true, smriti: true, finance: true },
    { name: 'You', role: 'Self', loc: true, tree: true, smriti: true, finance: true },
    { name: 'Bhabhi', role: 'In-law', loc: false, tree: true, smriti: false, finance: false },
    { name: 'Aanya (16)', role: 'Minor', loc: false, tree: true, smriti: false, finance: false },
  ]);
  const toggle = (i: number, k: string) => setMembers(m => m.map((x, j) => j === i ? { ...x, [k]: !x[k as keyof typeof x] } : x));
  const Sw = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
    <button onClick={onClick} style={{ width: 36, height: 20, borderRadius: 10, background: on ? 'var(--ds-plum)' : 'var(--ds-hairline-strong)', position: 'relative', border: 'none', cursor: 'pointer', transition: 'background .15s', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--ds-paper)', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  );
  return (
    <section style={{ padding: '24px 0 80px', background: 'var(--ds-ivory)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="ds-eyebrow">Privacy matrix</span>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 26, marginTop: 6, color: 'var(--ds-ink)' }}>Who sees what · per member</h2>
            <p style={{ fontSize: 13, color: 'var(--ds-ink-mute)', marginTop: 6 }}>Each member's data stays theirs. The Karta can suggest defaults; the member always has final say.</p>
          </div>
        </div>
        <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 14, padding: '12px 22px', background: 'var(--ds-ivory-warm)', borderBottom: '1px solid var(--ds-hairline)', fontFamily: 'var(--ds-mono)', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--ds-ink-mute)' }}>
            <span>Member</span><span>Location</span><span>In tree</span><span>Smriti audio</span><span>Finance</span>
          </div>
          {members.map((m, i) => (
            <div key={m.name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 14, padding: '14px 22px', borderBottom: i < members.length - 1 ? '1px solid var(--ds-hairline)' : 'none', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--ds-ivory-warm)', border: '1px solid var(--ds-hairline-strong)', display: 'grid', placeItems: 'center', color: 'var(--ds-plum)', fontFamily: 'var(--ds-serif)', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{m.name.charAt(0)}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ds-ink-mute)' }}>{m.role}</div>
                </div>
              </div>
              <Sw on={m.loc} onClick={() => toggle(i, 'loc')} />
              <Sw on={m.tree} onClick={() => toggle(i, 'tree')} />
              <Sw on={m.smriti} onClick={() => toggle(i, 'smriti')} />
              <Sw on={m.finance} onClick={() => toggle(i, 'finance')} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ── SOS Button — floating ───────────────────────────────────── */
const SOSButton = () => {
  const [open, setOpen] = useState(false);
  const [held, setHeld] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const startHold = () => {
    let t = 0;
    ref.current = setInterval(() => { t += 50; setHeld(t); if (t >= 1500) { clearInterval(ref.current!); setOpen(true); setHeld(0); } }, 50);
  };
  const endHold = () => { if (ref.current) clearInterval(ref.current); setHeld(0); };
  const pct = Math.min(100, (held / 1500) * 100);
  return (
    <>
      <button onMouseDown={startHold} onMouseUp={endHold} onMouseLeave={endHold} onTouchStart={startHold} onTouchEnd={endHold}
        style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 90, width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #d12d2d, #a01010)', color: '#fff', boxShadow: '0 0 0 4px rgba(209,45,45,0.18), 0 12px 32px -8px rgba(209,45,45,0.6)', display: 'grid', placeItems: 'center', fontFamily: 'var(--ds-mono)', fontWeight: 700, fontSize: 14, letterSpacing: '0.1em', cursor: 'pointer', border: 'none' }}
        title="Hold for 1.5s to broadcast SOS">
        <span style={{ position: 'relative', zIndex: 2 }}>SOS</span>
        {pct > 0 && <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(rgba(255,255,255,0.5) ${pct}%, transparent 0)`, zIndex: 1 }} />}
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(28,13,46,0.7)', backdropFilter: 'blur(8px)', zIndex: 300, display: 'grid', placeItems: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} className="ds-card" style={{ width: 'min(520px,100%)', padding: 28, border: '2px solid #d12d2d' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#d12d2d', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontFamily: 'var(--ds-mono)', fontSize: 14 }}>SOS</div>
              <div>
                <div className="ds-eyebrow" style={{ color: '#d12d2d' }}>Emergency broadcast</div>
                <h3 style={{ fontFamily: 'var(--ds-serif)', fontSize: 24, color: 'var(--ds-plum)' }}>Alert your parivar now</h3>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ds-ink-soft)', marginTop: 12 }}>This will share your live location and send alerts to all emergency contacts and the 3 nearest kin on Radar.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
              {['🩺 Medical', '🚓 Safety', '🔥 Fire', '🚗 Stranded'].map(t => (
                <button key={t} className="ds-btn ds-btn-sm ds-btn-ghost" style={{ justifyContent: 'center' }}>{t}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setOpen(false)} className="ds-btn ds-btn-ghost ds-btn-sm">Cancel</button>
              <button className="ds-btn ds-btn-sm" style={{ background: '#d12d2d', color: '#fff', fontWeight: 700 }}>Broadcast SOS now →</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/* ── Dashboard ───────────────────────────────────────────────── */
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

  const streak = (() => {
    try { return parseInt(localStorage.getItem('prakriti_streak') ?? '0', 10) || 0; } catch { return 0; }
  })();

  useEffect(() => {
    const vid = resolveVanshaIdForApi(null);
    if (!vid) return;
    fetchPrakritiScore(vid).then(setPrakritiScore).catch(() => {});
    fetchFamilyRank(vid).then(setFamilyRank).catch(() => {});
  }, [appUser?.vansha_id]);

  useEffect(() => {
    if (searchParams.get('join-team') === '1') {
      setShowJoinSE(true);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  return (
    <AppShell>
      <div style={{ background: 'var(--ds-ivory)', minHeight: '100vh' }}>
        <StreakRibbon streak={streak} />
        <PalStories familyName={appUser?.full_name?.split(' ').slice(-1)[0] ?? 'Parivar'} />
        <DashHero appUser={appUser} score={prakritiScore} familyRank={familyRank} />
        <LiveTiles />
        <NextActions />
        <OnThisDay />
        <Sanskaras />
        <DashGrid familyRank={familyRank} />
        <PrivacyMatrix />
        <SOSButton />

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
          .dash-hero-grid     { grid-template-columns: 1fr !important; }
          .dash-live-tiles    { grid-template-columns: 1fr !important; }
          .dash-next-actions  { grid-template-columns: 1fr 1fr !important; }
          .dash-otd-grid      { grid-template-columns: 1fr 1fr !important; }
          .dash-sk-grid       { grid-template-columns: repeat(2,1fr) !important; }
          .dash-grid          { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 600px) {
          .dash-next-actions  { grid-template-columns: 1fr !important; }
          .dash-otd-grid      { grid-template-columns: 1fr !important; }
          .dash-sk-grid       { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </AppShell>
  );
};

export default Dashboard;
