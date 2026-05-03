/**
 * /eco-panchang — Eco-Panchang Calendar + Prakriti Insights
 * Visual design: Heritage editorial (design bundle)
 * Data: GET /api/panchang/today + /api/panchang/calendar (Prokerala live)
 */

import { useEffect, useState } from 'react';
import AppShell from '@/components/shells/AppShell';
import {
  fetchTodayPanchang,
  fetchPanchangCalendar,
  type TodayPanchang,
  type PanchangCalendarRow,
} from '@/services/api';

/* ── helpers ─────────────────────────────────────────────────── */
function todayStr() { return new Date().toISOString().slice(0, 10); }
function pad2(n: number) { return String(n).padStart(2, '0'); }
function daysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function firstDayOfWeek(year: number, month: number) { return new Date(year, month, 1).getDay(); }
function monthDateStr(y: number, m: number, d: number) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }
function capitalize(s: string | null | undefined) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'; }

function parseTsToHHMM(ts: string | number | null | undefined): string {
  if (ts == null || ts === '') return '—';
  try {
    const num = Number(ts);
    // Prokerala returns Unix epoch seconds (e.g. 1746329160)
    const d = !isNaN(num) && num > 1_000_000_000
      ? new Date(num * 1000)
      : new Date(String(ts));
    if (isNaN(d.getTime())) return '—';
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  } catch { return '—'; }
}

function daysFromToday(dateStr: string): number {
  const diff = new Date(dateStr).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.round(diff / 86_400_000);
}

interface Deed { icon: string; what: string; score: string; done: boolean; }

const DEFAULT_DEEDS: Deed[] = [
  { icon: '🌱', what: 'Plant a native tree',      score: '+12', done: false },
  { icon: '💧', what: 'Restore one water source', score: '+10', done: false },
  { icon: '🪔', what: 'Light a single ghee diya', score: '+3',  done: true  },
  { icon: '🥣', what: 'Donate grain — anna daan', score: '+6',  done: false },
];

const ECO_ALERTS = [
  { c: 'var(--ds-saffron)',    t: 'AQI Kanpur 168',     s: "Unhealthy · don't burn waste today" },
  { c: '#2aa86b',              t: 'Light rain forecast', s: 'Good day for sapling transplant' },
  { c: 'var(--ds-gold-deep)',  t: 'Solar peak 11:40',    s: 'Run pump / heater off-grid window' },
];

/* Only these flags count as major vrats / festivals */
const MAJOR_FLAGS = new Set(['purnima', 'amavasya', 'ekadashi', 'pradosh', 'chaturthi', 'sankranti']);

const GLYPH_MAP: Record<string, string> = {
  ekadashi: '🌿', purnima: '🌕', amavasya: '🌑', pradosh: '🌙',
  chaturthi: '🐘', navami: '⚔️', sankranti: '☀️', ashtami: '⚔️',
};
const KIND_MAP: Record<string, string> = {
  ekadashi: 'Vrat', purnima: 'Purnima', amavasya: 'Amavasya',
  pradosh: 'Pradosh Vrat', chaturthi: 'Chaturthi', sankranti: 'Sankranti',
};

const EcoPanchangPage = () => {
  const [panchang, setPanchang]   = useState<TodayPanchang | null>(null);
  const [rows, setRows]           = useState<PanchangCalendarRow[]>([]);
  const [upcoming, setUpcoming]   = useState<PanchangCalendarRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<string>(todayStr());
  const [deeds, setDeeds]         = useState<Deed[]>(DEFAULT_DEEDS);
  const [locLabel, setLocLabel]   = useState<string>('');

  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  /* ── Fetch today's panchang — use geolocation, Ujjain fallback ── */
  useEffect(() => {
    const doFetch = (lat?: number, lon?: number) => {
      fetchTodayPanchang(lat, lon).then(data => {
        if (data) {
          setPanchang(data);
          const rec = data.eco_recommendation;
          if (rec) {
            setDeeds([
              { icon: '🌱', what: rec.plant     || 'Plant a native tree',      score: '+12', done: false },
              { icon: '💧', what: rec.water     || 'Restore one water source', score: '+10', done: false },
              { icon: '🌿', what: rec.observe   || 'Observe nature today',     score: '+5',  done: false },
              { icon: '🤝', what: rec.community || 'Community eco-action',     score: '+6',  done: false },
            ]);
          }
        }
      }).finally(() => setLoading(false));
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      // 5 s hard timeout so the page never hangs waiting for permission
      const fallbackTimer = setTimeout(() => {
        setLocLabel('Ujjain (default)');
        doFetch();
      }, 5000);

      navigator.geolocation.getCurrentPosition(
        pos => {
          clearTimeout(fallbackTimer);
          setLocLabel('Your location');
          doFetch(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          clearTimeout(fallbackTimer);
          setLocLabel('Ujjain (default)');
          doFetch();
        },
        { timeout: 4500, maximumAge: 300_000 },
      );
    } else {
      setLocLabel('Ujjain (default)');
      doFetch();
    }
  }, []);

  /* ── Fetch calendar for current month ───────────────────── */
  useEffect(() => {
    const startDate = `${year}-${pad2(month + 1)}-01`;
    const endDate   = `${year}-${pad2(month + 1)}-${pad2(daysInMonth(year, month))}`;
    fetchPanchangCalendar(startDate, endDate)
      .then(data => setRows(data))
      .catch(() => setRows([]));
  }, [year, month]);

  /* ── Fetch major vrats in next 30 days ───────────────────── */
  useEffect(() => {
    const start = new Date();
    const end   = new Date(); end.setDate(end.getDate() + 30);
    fetchPanchangCalendar(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10))
      .then(data => setUpcoming(
        data.filter(r => r.special_flag != null && MAJOR_FLAGS.has(r.special_flag))
      ))
      .catch(() => setUpcoming([]));
  }, []);

  /* ── Derived display values ──────────────────────────────── */
  const rowMap      = Object.fromEntries(rows.map(r => [r.gregorian_date, r]));
  const dayCount    = daysInMonth(year, month);
  const firstDay    = firstDayOfWeek(year, month);
  const monthName   = new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const selectedRow = rowMap[selected];

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  const todayTithi     = panchang?.tithi?.name_common ?? '—';
  const todayNakshatra = panchang?.nakshatra ?? '—';
  const todayPaksha    = capitalize(panchang?.paksha);
  const todaySunrise   = parseTsToHHMM(panchang?.sunrise_ts);
  const todaySunset    = parseTsToHHMM(panchang?.sunset_ts);
  const todayMasa      = panchang?.masa ?? '';
  const todaySamvat    = panchang?.samvat_year;

  const avoidItems: string[] = panchang?.eco_recommendation?.avoid
    ? panchang.eco_recommendation.avoid.split(/[,;]/).map(s => s.trim()).filter(Boolean)
    : ['Felling trees', 'Buying single-use plastic', 'Wasting cooked food'];

  /* ── Build upcoming tiles from API rows ─────────────────── */
  const upcomingTiles = upcoming.slice(0, 6).map(r => {
    const flag      = r.special_flag ?? '';
    const days      = daysFromToday(r.gregorian_date);
    const dateLabel = new Date(r.gregorian_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    return {
      date:    dateLabel,
      daysAgo: days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days} days`,
      name:    r.tithis?.name_common ?? capitalize(flag),
      glyph:   GLYPH_MAP[flag] ?? '🌿',
      kind:    KIND_MAP[flag]  ?? 'Vrat',
      note:    r.tithis?.eco_significance ?? `Observe ${r.tithis?.name_common ?? capitalize(flag)} today`,
    };
  });

  return (
    <AppShell>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px', fontFamily: 'var(--ds-sans)', color: 'var(--ds-ink)' }}>

        {/* ── Today hero ──────────────────────────────────────── */}
        <div style={{ background: 'linear-gradient(160deg, #0d1d18 0%, #142822 50%, #1c0d2e 100%)', color: 'var(--ds-ivory)', padding: '40px 36px', borderRadius: 16, position: 'relative', overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ position: 'absolute', top: -40, right: -30, width: 280, height: 280, background: 'radial-gradient(circle, rgba(122,219,160,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -60, left: -30, width: 240, height: 240, background: 'radial-gradient(circle, rgba(212,154,31,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 32, position: 'relative' }} className="ep-hero-grid">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                <span className="ds-eyebrow" style={{ color: '#7adba0' }}>Eco Panchang · Today</span>
                <span className="ds-pill" style={{ background: 'rgba(122,219,160,0.15)', borderColor: 'rgba(122,219,160,0.3)', color: '#7adba0' }}><span className="ds-pill-dot live" />Live</span>
                {locLabel && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--ds-mono)' }}>📍 {locLabel}</span>}
              </div>
              {loading ? (
                <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', marginTop: 12 }}>Loading panchang data…</div>
              ) : (
                <>
                  <div className="ds-sanskrit" style={{ fontSize: 22, color: 'var(--ds-gold-light)', marginTop: 2 }}>
                    {panchang?.tithi?.tithi_number
                      ? `${todayPaksha} पक्ष · तिथि ${panchang.tithi.tithi_number}${todayMasa ? ` · ${todayMasa}` : ''}`
                      : 'अक्षय तृतीया'}
                  </div>
                  <h1 style={{ fontFamily: 'var(--ds-serif)', fontSize: 52, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ds-paper)', marginTop: 6 }}>{todayTithi}</h1>
                  <p style={{ marginTop: 14, fontSize: 15, color: 'rgba(255,255,255,0.72)', maxWidth: 520, lineHeight: 1.6 }}>
                    {panchang?.eco_recommendation?.primary || 'Anything begun today is said never to diminish. Plant the soil that feeds your grandchildren.'}
                  </p>
                  <div style={{ marginTop: 22, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {todaySamvat && <span className="ds-tag" style={{ background: 'rgba(212,154,31,0.18)', color: 'var(--ds-gold-light)', borderColor: 'rgba(212,154,31,0.4)' }}>VS {todaySamvat}</span>}
                    <span className="ds-tag" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)', borderColor: 'rgba(255,255,255,0.12)' }}>Nakshatra · {todayNakshatra}</span>
                    <span className="ds-tag" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)', borderColor: 'rgba(255,255,255,0.12)' }}>{todayPaksha} Paksha</span>
                    {panchang?.yoga && <span className="ds-tag" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)', borderColor: 'rgba(255,255,255,0.12)' }}>Yoga · {panchang.yoga}</span>}
                  </div>
                </>
              )}
            </div>

            {/* 4 stat tiles: Sunrise, Sunset, Paksha, Nakshatra */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignContent: 'center' }}>
              {[
                { l: 'Sunrise',   v: todaySunrise,            s: locLabel || 'IST golden hour' },
                { l: 'Sunset',    v: todaySunset,             s: locLabel || 'orange hour' },
                { l: 'Paksha',    v: todayPaksha,             s: 'lunar phase' },
                { l: 'Nakshatra', v: todayNakshatra.slice(0, 9), s: 'moon station' },
              ].map(s => (
                <div key={s.l} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}>
                  <span className="ds-eyebrow" style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10 }}>{s.l}</span>
                  <div className="ds-score-num" style={{ fontSize: 26, color: 'var(--ds-paper)', marginTop: 6, lineHeight: 1 }}>{s.v}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{s.s}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Deeds + alerts ──────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 24 }} className="ep-deeds-grid">
          <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--ds-hairline)' }}>
              <span className="ds-eyebrow">Today's eco-deeds</span>
              <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 22, marginTop: 4, color: 'var(--ds-plum)' }}>What counts double today</div>
            </div>
            {deeds.map((d, i) => (
              <div key={i} style={{ padding: '14px 22px', borderBottom: i < deeds.length - 1 ? '1px solid var(--ds-hairline)' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--ds-ivory-warm)', border: '1px solid var(--ds-hairline)', display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0 }}>{d.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ds-ink)', textDecoration: d.done ? 'line-through' : 'none', opacity: d.done ? 0.5 : 1 }}>{d.what}</div>
                </div>
                <span className="ds-tag ds-tag-gold">{d.score}</span>
                <button onClick={() => setDeeds(ds => ds.map((x, j) => j === i ? { ...x, done: !x.done } : x))} style={{ width: 34, height: 34, borderRadius: 6, border: d.done ? 'none' : '2px solid var(--ds-hairline-strong)', background: d.done ? '#2aa86b' : 'transparent', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 15, flexShrink: 0 }}>
                  {d.done ? '✓' : ''}
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ECO_ALERTS.map((a, i) => (
              <div key={i} style={{ padding: '12px 16px 12px 22px', borderRadius: 10, border: `1px solid ${a.c}30`, background: `${a.c}08`, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 4, height: 32, borderRadius: 2, background: a.c }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: a.c }}>{a.t}</div>
                <div style={{ fontSize: 12, color: 'var(--ds-ink-mute)', marginTop: 2 }}>{a.s}</div>
              </div>
            ))}
            <div style={{ padding: '14px 18px', borderRadius: 10, background: 'var(--ds-ivory-warm)', border: '1px solid var(--ds-hairline)' }}>
              <div className="ds-eyebrow">Today's to-avoid</div>
              <ul style={{ marginTop: 8, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {avoidItems.map(a => (
                  <li key={a} style={{ fontSize: 13, color: 'var(--ds-ink-soft)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ color: '#d12d2d', fontWeight: 700, flexShrink: 0 }}>✗</span> {a}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ── Month calendar (compact) ─────────────────────────── */}
        <div className="ds-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--ds-hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="ds-eyebrow">Eco calendar</span>
              <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 20, marginTop: 2, color: 'var(--ds-plum)' }}>{monthName}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={prevMonth} className="ds-btn ds-btn-ghost ds-btn-sm">←</button>
              <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }} className="ds-btn ds-btn-ghost ds-btn-sm">Today</button>
              <button onClick={nextMonth} className="ds-btn ds-btn-ghost ds-btn-sm">→</button>
            </div>
          </div>

          <div style={{ padding: '10px 14px' }}>
            {/* Day-of-week headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: 10, fontFamily: 'var(--ds-mono)', color: 'var(--ds-ink-mute)', padding: '3px 0', letterSpacing: '0.08em' }}>{d}</div>
              ))}
            </div>
            {/* Day cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: dayCount }, (_, i) => {
                const day      = i + 1;
                const dateStr  = monthDateStr(year, month, day);
                const row      = rowMap[dateStr];
                const isToday    = dateStr === todayStr();
                const isSelected = dateStr === selected;
                const tithiName  = row?.tithis?.name_common ?? '';
                const isSpecial  = row?.special_flag != null && MAJOR_FLAGS.has(row.special_flag);

                return (
                  <button
                    key={day}
                    onClick={() => setSelected(dateStr)}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 6,
                      border: isSelected
                        ? '2px solid var(--ds-plum)'
                        : isToday
                          ? '2px solid var(--ds-gold)'
                          : '1px solid var(--ds-hairline)',
                      background: isSelected
                        ? 'var(--ds-plum)'
                        : isToday
                          ? 'rgba(212,154,31,0.1)'
                          : isSpecial
                            ? 'rgba(42,168,107,0.08)'
                            : 'transparent',
                      color: isSelected ? 'var(--ds-paper)' : 'var(--ds-ink)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '3px 2px',
                      gap: 1,
                      minHeight: 38,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: isToday || isSelected ? 700 : 500, fontFamily: 'var(--ds-serif)', lineHeight: 1 }}>{day}</span>
                    {tithiName && (
                      <span style={{ fontSize: 7, fontFamily: 'var(--ds-mono)', color: isSelected ? 'rgba(255,255,255,0.65)' : isSpecial ? '#2aa86b' : 'var(--ds-ink-mute)', textAlign: 'center', lineHeight: 1.1, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                        {tithiName.slice(0, 5)}
                      </span>
                    )}
                    {isSpecial && !isSelected && <span style={{ fontSize: 8, lineHeight: 1 }}>🌿</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected day detail strip */}
          {selectedRow && (
            <div style={{ padding: '14px 18px', borderTop: '1px solid var(--ds-hairline)', background: 'var(--ds-ivory-warm)' }}>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <div className="ds-eyebrow">{selected}</div>
                  <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 18, color: 'var(--ds-plum)', marginTop: 2 }}>{selectedRow.tithis?.name_common ?? '—'}</div>
                </div>
                {selectedRow.nakshatra && <div><div className="ds-eyebrow">Nakshatra</div><div style={{ fontSize: 15, marginTop: 2, fontWeight: 600 }}>{selectedRow.nakshatra}</div></div>}
                {selectedRow.sunrise_ts && <div><div className="ds-eyebrow">Sunrise</div><div style={{ fontSize: 15, marginTop: 2, fontWeight: 600 }}>{parseTsToHHMM(selectedRow.sunrise_ts)}</div></div>}
                {selectedRow.paksha && <div><div className="ds-eyebrow">Paksha</div><div style={{ fontSize: 15, marginTop: 2, fontWeight: 600 }}>{capitalize(selectedRow.paksha)}</div></div>}
                {selectedRow.masa_name && <div><div className="ds-eyebrow">Masa</div><div style={{ fontSize: 15, marginTop: 2, fontWeight: 600 }}>{selectedRow.masa_name}</div></div>}
              </div>
            </div>
          )}
        </div>

        {/* ── Major vrats & festivals — next 30 days ───────────── */}
        {upcomingTiles.length > 0 && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <span className="ds-eyebrow">Next 30 days</span>
              <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 26, marginTop: 4, color: 'var(--ds-ink)' }}>Major vrats &amp; festivals</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }} className="ep-upcoming-grid">
              {upcomingTiles.map((e, i) => (
                <div key={i} className="ds-card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 32 }}>{e.glyph}</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ds-gold-deep)' }}>{e.date}</div>
                      <div style={{ fontSize: 11, color: 'var(--ds-ink-mute)', marginTop: 2 }}>{e.daysAgo}</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 17, fontWeight: 700, color: 'var(--ds-ink)', marginTop: 10 }}>{e.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ds-saffron)', fontWeight: 600, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{e.kind}</div>
                  <p style={{ fontSize: 12, color: 'var(--ds-ink-soft)', marginTop: 6, lineHeight: 1.5 }}>{e.note}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 880px) {
          .ep-hero-grid     { grid-template-columns: 1fr !important; }
          .ep-deeds-grid    { grid-template-columns: 1fr !important; }
          .ep-upcoming-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 560px) {
          .ep-upcoming-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AppShell>
  );
};

export default EcoPanchangPage;
