import { useState } from 'react';
import AppShell from '@/components/shells/AppShell';
import { useAuth } from '@/contexts/AuthContext';

type LedgerKind = 'earned' | 'spent' | 'pending' | 'request';

interface LedgerRow {
  id: number;
  kind: LedgerKind;
  who: string;
  what: string;
  hours: number;
  when: string;
  category: string;
  status: string;
}

const LEDGER: LedgerRow[] = [
  { id: 1, kind: 'earned',  who: 'Bua ji',          what: 'Cooked dal-baati for Holi gathering',     hours: 3.0, when: '2 days ago',  category: 'Cooking',   status: 'settled'   },
  { id: 2, kind: 'spent',   who: 'Verma parivar',   what: 'Tutored Aanya in Sanskrit (4 sessions)', hours: 4.0, when: 'last week',   category: 'Tutoring',  status: 'settled'   },
  { id: 3, kind: 'earned',  who: 'Pt. Ramesh',      what: 'Helped set up Satyanarayan puja',        hours: 2.5, when: 'last week',   category: 'Ritual',    status: 'settled'   },
  { id: 4, kind: 'pending', who: 'Mausi ji',        what: 'Eldercare for dadiji while travelling',  hours: 6.0, when: 'tomorrow',    category: 'Eldercare', status: 'scheduled' },
  { id: 5, kind: 'earned',  who: 'Joshi parivar',   what: 'Stitched ceremonial dupattas',           hours: 5.0, when: '2 weeks ago', category: 'Crafts',    status: 'settled'   },
  { id: 6, kind: 'spent',   who: 'Tripathi parivar',what: 'Borrowed cook for housewarming',         hours: 3.0, when: '3 weeks ago', category: 'Cooking',   status: 'settled'   },
  { id: 7, kind: 'request', who: 'You',             what: 'Request: Hindi calligraphy for invite',  hours: 2.0, when: 'open',        category: 'Crafts',    status: 'open'      },
];

const OFFERS = [
  { who: 'Mausi Sushma', cat: 'Eldercare', desc: 'Available 2 hrs/day to sit with elders. Reads Ramayan aloud.', rate: 1, dist: '2.3 km', avail: 'Mon–Fri', mine: false },
  { who: 'Pt. Vyas',     cat: 'Ritual',    desc: 'Will help set up small pujas, no fee — bank as time.',         rate: 1, dist: '5.1 km', avail: 'Evenings', mine: false },
  { who: 'Aanya (16)',   cat: 'Tutoring',  desc: 'Will tutor classes 6–8 in math and English.',                  rate: 1, dist: '1.4 km', avail: 'After 5pm', mine: false },
  { who: 'Verma chachi', cat: 'Cooking',   desc: 'Can prep festival sweets in batches of 50.',                   rate: 2, dist: '3.0 km', avail: 'Sat', mine: false },
  { who: 'Ravi bhaiya',  cat: 'Crafts',    desc: 'Wood carving for mandir frames, will exchange for cooking.',   rate: 2, dist: '8.2 km', avail: 'Weekends', mine: false },
  { who: 'You',          cat: 'Tutoring',  desc: 'Sanskrit basics, 1hr sessions. 2 takers waiting.',            rate: 1, dist: '—',     avail: 'Wed/Fri', mine: true },
];

const CATEGORIES = [
  { cat: 'Cooking',     earned: 8, spent: 5, color: 'var(--ds-saffron)' },
  { cat: 'Eldercare',   earned: 6, spent: 0, color: 'var(--ds-plum-rose)' },
  { cat: 'Ritual',      earned: 5, spent: 2, color: 'var(--ds-gold-deep)' },
  { cat: 'Tutoring',    earned: 4, spent: 4, color: '#2aa86b' },
  { cat: 'Crafts',      earned: 5, spent: 0, color: 'var(--ds-plum)' },
  { cat: 'Travel help', earned: 0, spent: 3, color: 'var(--ds-ink-soft)' },
];

const kindMeta: Record<LedgerKind, { color: string; tag: string; sign: string; dir: 'in' | 'out' }> = {
  earned:  { color: '#2aa86b',              tag: 'Earned',    sign: '+', dir: 'in'  },
  spent:   { color: 'var(--ds-saffron)',    tag: 'Spent',     sign: '−', dir: 'out' },
  pending: { color: 'var(--ds-gold-deep)', tag: 'Scheduled', sign: '·', dir: 'in'  },
  request: { color: 'var(--ds-plum-rose)', tag: 'Request',   sign: '?', dir: 'out' },
};

const TimeBankPage = () => {
  const { appUser } = useAuth();
  const [tab, setTab] = useState<'ledger' | 'offers' | 'categories'>('ledger');
  const [filter, setFilter] = useState<string>('all');
  const [showLog, setShowLog] = useState(false);

  const balance = 14;
  const earned = 28;
  const spent = 14;
  const pending = 3;

  const filtered = LEDGER.filter(r => filter === 'all' || r.kind === filter);

  return (
    <AppShell>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px', fontFamily: 'var(--ds-sans)', color: 'var(--ds-ink)' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, var(--ds-plum) 0%, var(--ds-plum-mid) 100%)', color: 'var(--ds-ivory)', padding: '40px 36px', borderRadius: 16, position: 'relative', overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ position: 'absolute', top: -60, right: -40, width: 280, height: 280, background: 'radial-gradient(circle, rgba(212,154,31,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--ds-gold-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            <span className="ds-eyebrow" style={{ color: 'var(--ds-gold-light)' }}>Sewa Time Bank</span>
          </div>
          <h1 style={{ fontFamily: 'var(--ds-serif)', fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ds-paper)' }}>Exchange hours, not money</h1>
          <p style={{ marginTop: 10, fontSize: 15, color: 'rgba(255,255,255,0.7)', maxWidth: 560 }}>
            Cooking, eldercare, rituals, tutoring. The old village economy, ledgered.{' '}
            <span className="ds-sanskrit" style={{ color: 'var(--ds-gold-light)' }}>परस्परं भावयन्तः</span> — uplift one another.
          </p>

          {/* Balance row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 14, marginTop: 32 }} className="tb-summary">
            <div style={{ padding: '18px 22px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(212,154,31,0.3)', borderRadius: 10 }}>
              <span className="ds-eyebrow" style={{ color: 'var(--ds-gold-light)' }}>Your balance</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
                <span className="ds-score-num" style={{ fontSize: 64, color: 'var(--ds-gold-light)', lineHeight: 1 }}>+{balance}</span>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>hours owed to you</span>
              </div>
              <div style={{ marginTop: 14, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                <div style={{ width: '56%', height: '100%', background: 'linear-gradient(90deg,var(--ds-saffron),var(--ds-gold))' }} />
              </div>
              <div style={{ marginTop: 6, fontSize: 11, fontFamily: 'var(--ds-mono)', color: 'rgba(255,255,255,0.5)' }}>56% toward Vriksh-tier (25 hr)</div>
            </div>
            {[
              { label: 'Earned', value: earned, color: '#7adba0', sub: 'lifetime' },
              { label: 'Spent', value: spent, color: '#e9c267', sub: 'lifetime' },
              { label: 'Open requests', value: pending, color: 'var(--ds-saffron)', sub: 'this month' },
            ].map(s => (
              <div key={s.label} style={{ padding: '18px 22px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}>
                <span className="ds-eyebrow" style={{ color: 'rgba(255,255,255,0.55)' }}>{s.label}</span>
                <div className="ds-score-num" style={{ fontSize: 38, color: s.color, lineHeight: 1, marginTop: 10 }}>{s.value}<span style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginLeft: 6 }}>hr</span></div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 6, fontFamily: 'var(--ds-mono)' }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {([['ledger', 'Ledger'], ['offers', 'Offers around you'], ['categories', 'Categories']] as [string, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k as typeof tab)} className={`ds-btn ds-btn-sm ${tab === k ? 'ds-btn-plum' : 'ds-btn-ghost'}`}>{l}</button>
            ))}
          </div>
          <button onClick={() => setShowLog(true)} className="ds-btn ds-btn-sm ds-btn-gold">+ Log a sewa</button>
        </div>

        {/* Ledger tab */}
        {tab === 'ledger' && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {([['all', 'All'], ['earned', 'Earned'], ['spent', 'Spent'], ['pending', 'Scheduled'], ['request', 'Open requests']] as [string, string][]).map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} className="ds-btn ds-btn-sm" style={{ background: filter === k ? 'var(--ds-ivory-warm)' : 'transparent', border: '1px solid var(--ds-hairline)', color: 'var(--ds-ink-soft)', fontWeight: filter === k ? 700 : 500 }}>{l}</button>
              ))}
            </div>
            <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
              {filtered.map((r, i) => {
                const meta = kindMeta[r.kind];
                return (
                  <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 18, padding: '18px 22px', borderBottom: i < filtered.length - 1 ? '1px solid var(--ds-hairline)' : 'none', alignItems: 'center' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--ds-ivory-warm)', border: '1px solid var(--ds-hairline)', display: 'grid', placeItems: 'center', color: meta.color }}>
                      {meta.dir === 'in' ? '→' : '←'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: 'var(--ds-ink)' }}>
                        <strong style={{ color: 'var(--ds-plum)' }}>{r.who}</strong> · {r.what}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ds-ink-mute)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span>{r.when}</span>
                        <span>·</span>
                        <span>{r.category}</span>
                        <span>·</span>
                        <span style={{ color: meta.color, fontWeight: 600 }}>{meta.tag}</span>
                      </div>
                    </div>
                    <div className="ds-score-num" style={{ fontSize: 22, color: meta.color, fontWeight: 700 }}>{meta.sign}{r.hours}<span style={{ fontSize: 11, color: 'var(--ds-ink-mute)', marginLeft: 4, fontWeight: 400 }}>hr</span></div>
                    <button className="ds-btn ds-btn-sm ds-btn-ghost">{r.status === 'open' ? 'Accept' : 'Details'}</button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Offers tab */}
        {tab === 'offers' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }} className="tb-offers">
            {OFFERS.map((o, i) => (
              <div key={i} className="ds-card" style={{ padding: 18, position: 'relative' }}>
                {o.mine && <div style={{ position: 'absolute', top: 14, right: 14, fontSize: 10, fontFamily: 'var(--ds-mono)', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--ds-gold-deep)', fontWeight: 700 }}>Your offer</div>}
                <span className="ds-tag ds-tag-plum">{o.cat}</span>
                <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 18, fontWeight: 700, color: 'var(--ds-ink)', marginTop: 10 }}>{o.who}</div>
                <p style={{ fontSize: 13, color: 'var(--ds-ink-soft)', marginTop: 6, lineHeight: 1.5 }}>{o.desc}</p>
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--ds-hairline)', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ds-ink-mute)' }}>
                  <span>{o.dist} · {o.avail}</span>
                  <span style={{ color: 'var(--ds-gold-deep)', fontWeight: 700, fontFamily: 'var(--ds-mono)' }}>{o.rate} hr : 1 hr</span>
                </div>
                {!o.mine && <button className="ds-btn ds-btn-sm ds-btn-plum" style={{ marginTop: 12, width: '100%', justifyContent: 'center' }}>Request →</button>}
              </div>
            ))}
          </div>
        )}

        {/* Categories tab */}
        {tab === 'categories' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }} className="tb-cats">
            {CATEGORIES.map(c => {
              const total = Math.max(c.earned + c.spent, 1);
              return (
                <div key={c.cat} className="ds-card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--ds-serif)', fontSize: 18, fontWeight: 700 }}>{c.cat}</span>
                    <span style={{ fontFamily: 'var(--ds-mono)', fontSize: 12, color: c.color, fontWeight: 700 }}>+{c.earned - c.spent} hr</span>
                  </div>
                  <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 12, background: 'var(--ds-ivory-warm)' }}>
                    <div style={{ width: `${(c.earned / total) * 100}%`, background: c.color, opacity: 0.85 }} />
                    <div style={{ width: `${(c.spent / total) * 100}%`, background: c.color, opacity: 0.35 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--ds-ink-mute)', fontFamily: 'var(--ds-mono)' }}>
                    <span>Earned {c.earned}</span><span>Spent {c.spent}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Log sewa modal */}
        {showLog && (
          <div onClick={() => setShowLog(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(28,13,46,0.6)', backdropFilter: 'blur(8px)', zIndex: 200, display: 'grid', placeItems: 'center', padding: 24 }}>
            <div onClick={e => e.stopPropagation()} className="ds-card" style={{ width: 'min(480px,100%)', padding: 28 }}>
              <h3 style={{ fontFamily: 'var(--ds-serif)', fontSize: 24, color: 'var(--ds-plum)' }}>Log a sewa</h3>
              <p style={{ fontSize: 13, color: 'var(--ds-ink-mute)', marginTop: 4 }}>Record a service you gave or received in the parivar economy.</p>
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input className="ds-input" placeholder="Who did you help? (name)" />
                <input className="ds-input" placeholder="What service? (e.g. cooked for Holi)" />
                <div style={{ display: 'flex', gap: 10 }}>
                  <input className="ds-input" placeholder="Hours" type="number" style={{ flex: 1 }} />
                  <select className="ds-input" style={{ flex: 1 }}>
                    <option>Cooking</option>
                    <option>Eldercare</option>
                    <option>Tutoring</option>
                    <option>Ritual</option>
                    <option>Crafts</option>
                    <option>Travel help</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowLog(false)} className="ds-btn ds-btn-ghost ds-btn-sm">Cancel</button>
                <button onClick={() => setShowLog(false)} className="ds-btn ds-btn-plum ds-btn-sm">Log sewa →</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 1000px) {
          .tb-summary { grid-template-columns: 1fr 1fr !important; }
          .tb-offers, .tb-cats { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 560px) {
          .tb-summary { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AppShell>
  );
};

export default TimeBankPage;
