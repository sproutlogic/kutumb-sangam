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
  fetchPanchangCalendar, type PanchangCalendarRow,
  fetchSamayProfile, type SamayProfile,
  fetchSamayRequests, type SamayRequest,
  fetchRadarNearby, type RadarMember,
  fetchGreenLegacyTimeline, type GreenLegacyEvent,
  fetchGauravGatha, submitGauravGatha, type GauravGathaEntry,
  fetchVanshaTree,
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
  yoga: string | null;
  sunriseStr: string | null;
  isSpecial: boolean;
  specialFlag: string | null;
  ecoPlant: string | null;
  ecoWater: string | null;
  ecoCommunity: string | null;
  ecoAvoid: string | null;
  ecoObserve: string | null;
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
        yoga: api?.yoga ?? null,
        sunriseStr,
        isSpecial: !!api?.special_flag,
        specialFlag: api?.special_flag ?? null,
        ecoPlant: (ecoRec.plant ?? merged.plant_action) || null,
        ecoWater: (ecoRec.water ?? merged.water_action) || null,
        ecoCommunity: (ecoRec.community ?? merged.community_action) || null,
        ecoAvoid: (ecoRec.avoid ?? merged.avoid_action) || null,
        ecoObserve: (ecoRec.observe ?? merged.nature_observation) || null,
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
const GG_FEATURE_CARDS = [
  { who: 'Kutumb Map', kind: 'वंश वृक्ष', title: 'अपने परिवार का डिजिटल वंश वृक्ष बनाएं — पीढ़ियों की विरासत एक जगह सुरक्षित', img: '🌳', when: 'Feature', tone: '#2a8068' },
  { who: 'Time Bank', kind: 'सेवा चक्र', title: 'समय दें, समय पाएं — समुदाय की मदद करें और अपना सेवा खाता बनाएं', img: '🤝', when: 'Feature', tone: 'var(--ds-plum-rose)' },
  { who: 'Eco Actions', kind: 'प्राकृति स्कोर', title: 'हर पर्यावरण कार्य पर अंक अर्जित करें — पंचांग के अनुसार दोगुना पुण्य', img: '🌿', when: 'Feature', tone: '#2a8068' },
  { who: 'Family Calendar', kind: 'कुटुम्ब पंचांग', title: 'परिवार के जन्मदिन, वर्षगांठ और पुण्य तिथियां — पंचांग से जुड़ी एक जगह', img: '📅', when: 'Feature', tone: 'var(--ds-saffron)' },
  { who: 'Nearby Kin', kind: 'कुटुम्ब राडार', title: 'आस-पास के परिवारजन खोजें — एक ही शहर में बिछड़े रिश्तेदार मिलाएं', img: '📡', when: 'Feature', tone: '#a64a8e' },
  { who: 'Heritage Wall', kind: 'गौरव गाथा', title: 'परिवार की उपलब्धियां हमेशा के लिए — हर साल इसी तारीख को स्मरण करें', img: '🪔', when: 'Feature', tone: 'var(--ds-gold-deep)' },
];

const CommunityHero = ({ appUser, score, familyRank, panchang, userPersonNode, gauravGatha }: {
  appUser: { full_name?: string | null } | null;
  score: PrakritiScore | null;
  familyRank: FamilyRank | null;
  panchang: LivePanchang | null;
  userPersonNode: Record<string, unknown> | null;
  gauravGatha: GauravGathaEntry[];
}) => {
  const navigate = useNavigate();
  void score; void panchang;
  const firstName = appUser?.full_name?.split(' ')[0] ?? 'there';
  const str = (key: string) => String(userPersonNode?.[key] ?? '').trim() || null;
  const gotra = str('gotra');
  const moolNiwas = str('mool_niwas') || str('ancestral_place');

  // Map live gaurav gatha entries to card shape; fall back to Hindi feature cards
  const liveCards = gauravGatha.slice(0, 6).map(e => ({
    img: e.img,
    kind: e.kind,
    title: e.title,
    who: e.who,
    when: new Date(e.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    tone: e.tone,
  }));
  const ggCards = liveCards.length >= 3 ? liveCards : GG_FEATURE_CARDS;

  const totalPages = Math.ceil(ggCards.length / 3);
  const [ggPage, setGgPage] = useState(0);

  useEffect(() => {
    if (ggCards.length <= 3) return;
    const timer = setInterval(() => setGgPage(p => (p + 1) % totalPages), 5000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ggCards.length]);

  const startIdx = ggPage * 3;
  const visibleGG = [0, 1, 2].map(i => ggCards[(startIdx + i) % ggCards.length]);

  return (
    <section style={{ background: 'linear-gradient(180deg,var(--ds-plum-deep),var(--ds-plum) 80%)', color: 'var(--ds-paper)', padding: '40px 0 48px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
          <div>
            <div className="ds-eyebrow" style={{ color: 'var(--ds-gold-light)' }}>Kutumb Gaurav Gatha · live</div>
            <h1 style={{ fontFamily: 'var(--ds-serif)', fontSize: 'clamp(24px,3vw,38px)', marginTop: 6 }}>
              Namaste, <span style={{ fontStyle: 'italic', color: 'var(--ds-gold-light)' }}>{firstName}</span>
            </h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {gotra && <span className="ds-pill" style={{ background: 'rgba(212,154,31,0.12)', borderColor: 'rgba(212,154,31,0.35)', color: 'var(--ds-gold-light)', fontSize: 10 }}>{gotra} गोत्र</span>}
              {moolNiwas && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', alignSelf: 'center' }}>({moolNiwas})</span>}
              {familyRank && <span className="ds-pill" style={{ background: 'rgba(122,219,160,0.08)', borderColor: 'rgba(122,219,160,0.25)', color: '#7adba0', fontSize: 10 }}>#{familyRank.city_rank} {familyRank.city ?? ''}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => navigate('/invite')} className="ds-btn ds-btn-ghost ds-btn-sm" style={{ color: 'var(--ds-paper)', borderColor: 'rgba(255,255,255,0.25)' }}>Invite →</button>
            <button onClick={() => navigate('/tree')} className="ds-btn ds-btn-gold ds-btn-sm">Open tree →</button>
          </div>
        </div>

        {/* Rotating Gaurav Gatha tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }} className="dash-hero-grid">
          {visibleGG.map((c, i) => (
            <div key={`${ggPage}-${i}`} className="ds-card" style={{ padding: '18px 20px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${c.tone}55`, color: 'var(--ds-paper)', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 160 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 26, flexShrink: 0 }}>{c.img}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontFamily: 'var(--ds-mono)', color: c.tone, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{c.kind}</div>
                  <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 14, color: 'var(--ds-gold-light)', marginTop: 4, lineHeight: 1.35 }}>{c.title}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>by {c.who}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--ds-mono)' }}>{c.when}</span>
                <button className="ds-btn ds-btn-sm" style={{ fontSize: 10, padding: '3px 8px', background: 'rgba(255,255,255,0.06)', color: 'var(--ds-gold-light)', border: '1px solid rgba(212,154,31,0.25)' }}>🙏 Pranam</button>
              </div>
            </div>
          ))}
        </div>

        {/* Page dots */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 14 }}>
            {Array.from({ length: totalPages }).map((_, i) => (
              <div key={i} onClick={() => setGgPage(i)} style={{ width: 6, height: 6, borderRadius: '50%', background: i === ggPage ? 'var(--ds-gold)' : 'rgba(255,255,255,0.25)', cursor: 'pointer', transition: 'background 0.2s' }} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

/* ─────────────────────────────────────────────────────────────
   4. Dashboard Info Row — Notice · Date in History · Todo Calendar
───────────────────────────────────────────────────────────── */

/** Format ISO date as "4 May" — day + month, no year. */
function fmtDayMonth(dateStr: string): string {
  if (dateStr.length < 10) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch { return ''; }
}

const DashboardInfoRow = ({ persons, panchang }: {
  persons: Record<string, unknown>[];
  panchang: LivePanchang | null;
}) => {
  const navigate = useNavigate();
  const today = new Date();
  const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Date-in-history: birthdays, anniversaries, punya tithis from family
  const todayEvents: Array<{ name: string; type: string; icon: string; date: string }> = [];
  persons.forEach(p => {
    const nameStr = [p.first_name, p.last_name].filter(Boolean).join(' ') || String(p.name ?? '—');
    const dob = String(p.date_of_birth ?? '');
    if (dob.length >= 10 && dob.slice(5, 7) + '-' + dob.slice(8, 10) === todayMD) {
      todayEvents.push({ name: nameStr, type: 'Birthday', icon: '🎂', date: fmtDayMonth(dob) });
    }
    const anniv = String(p.marriage_anniversary ?? '');
    if (anniv.length >= 10 && anniv.slice(5, 7) + '-' + anniv.slice(8, 10) === todayMD) {
      todayEvents.push({ name: nameStr, type: 'Anniversary', icon: '💐', date: fmtDayMonth(anniv) });
    }
    const swarg = String(p.swargwas_date ?? '');
    if (swarg.length >= 10 && swarg.slice(5, 7) + '-' + swarg.slice(8, 10) === todayMD) {
      todayEvents.push({ name: nameStr, type: 'Punya Tithi', icon: '🕯️', date: fmtDayMonth(swarg) });
    }
  });

  // This-week events for todo calendar
  const weekEvents: Array<{ name: string; type: string; icon: string; daysAway: number }> = [];
  for (let d = 1; d <= 7; d++) {
    const fd = new Date(today); fd.setDate(fd.getDate() + d);
    const fmd = `${String(fd.getMonth() + 1).padStart(2, '0')}-${String(fd.getDate()).padStart(2, '0')}`;
    persons.forEach(p => {
      const nameStr = [p.first_name, p.last_name].filter(Boolean).join(' ') || String(p.name ?? '');
      if (!nameStr) return;
      const dob = String(p.date_of_birth ?? '');
      if (dob.length >= 10 && dob.slice(5, 7) + '-' + dob.slice(8, 10) === fmd) {
        weekEvents.push({ name: nameStr, type: 'Birthday', icon: '🎂', daysAway: d });
      }
      const anniv = String(p.marriage_anniversary ?? '');
      if (anniv.length >= 10 && anniv.slice(5, 7) + '-' + anniv.slice(8, 10) === fmd) {
        weekEvents.push({ name: nameStr, type: 'Anniversary', icon: '💐', daysAway: d });
      }
    });
  }

  return (
    <section style={{ padding: '20px 0', background: 'var(--ds-ivory)', borderBottom: '1px solid var(--ds-hairline)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }} className="dash-info-grid">

        {/* Tile 1: Notice — from broadcast */}
        <div className="ds-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span className="ds-eyebrow">📢 Notice</span>
            <span className="ds-pill"><span className="ds-pill-dot live" />Live</span>
          </div>
          <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 15, color: 'var(--ds-ink)', lineHeight: 1.4 }}>
            सामुदायिक सूचना
          </div>
          <p style={{ fontSize: 13, color: 'var(--ds-ink-soft)', marginTop: 6, lineHeight: 1.5 }}>
            Kutumb Sangam वार्षिक उत्सव 15 जून को। अपने परिवार को आमंत्रित करें।
          </p>
          <div style={{ fontSize: 11, color: 'var(--ds-ink-mute)', marginTop: 10 }}>2 hours ago · Community</div>
        </div>

        {/* Tile 2: Date in History */}
        <div className="ds-card" style={{ padding: 20 }}>
          <div style={{ marginBottom: 10 }}>
            <span className="ds-eyebrow">📅 Aaj Ki Tithiyan</span>
            <div style={{ fontSize: 11, color: 'var(--ds-ink-mute)', marginTop: 2 }}>
              {today.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
            </div>
          </div>
          {todayEvents.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {todayEvents.slice(0, 3).map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: 'var(--ds-ivory-warm)', border: '1px solid var(--ds-hairline)' }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{e.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 14, color: 'var(--ds-ink)', fontWeight: 600 }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ds-ink-mute)' }}>{e.type}{e.date ? ` · ${e.date}` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--ds-ink-mute)', fontStyle: 'italic', marginTop: 8, lineHeight: 1.5 }}>
              No family events today. Add marriage anniversaries and punya tithis in your profile.
            </p>
          )}
        </div>

        {/* Tile 3: This Week — upcoming family events + panchang */}
        <div className="ds-card" style={{ padding: 20 }}>
          <div style={{ marginBottom: 10 }}>
            <span className="ds-eyebrow">📋 This Week</span>
            <div style={{ fontSize: 11, color: 'var(--ds-ink-mute)', marginTop: 2 }}>Upcoming events &amp; eco-actions</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {weekEvents.slice(0, 3).map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{e.icon}</span>
                <span style={{ flex: 1, color: 'var(--ds-ink)' }}>{e.name} · {e.type}</span>
                <span style={{ fontSize: 10, color: 'var(--ds-ink-mute)', fontFamily: 'var(--ds-mono)', flexShrink: 0 }}>
                  {e.daysAway === 1 ? 'Tomorrow' : `${e.daysAway}d`}
                </span>
              </div>
            ))}
            {panchang?.ecoPlant && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, paddingTop: weekEvents.length > 0 ? 6 : 0, borderTop: weekEvents.length > 0 ? '1px solid var(--ds-hairline)' : 'none' }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>🌱</span>
                <span style={{ flex: 1, color: 'var(--ds-ink-soft)' }}>{panchang.ecoPlant}</span>
                <span style={{ fontSize: 10, color: '#2a8068', fontFamily: 'var(--ds-mono)', flexShrink: 0 }}>Today</span>
              </div>
            )}
            {weekEvents.length === 0 && !panchang?.ecoPlant && (
              <p style={{ fontSize: 12, color: 'var(--ds-ink-mute)', fontStyle: 'italic' }}>Add family dates to see upcoming events.</p>
            )}
          </div>
          <button onClick={() => navigate('/calendar')} className="ds-btn ds-btn-sm ds-btn-ghost" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}>Open calendar →</button>
        </div>
      </div>
    </section>
  );
};

/* ─────────────────────────────────────────────────────────────
   5. Sewa Engine — time bank as HERO, not buried third tile
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
              Apna kutumb badhao — <span style={{ fontStyle: 'italic', color: 'var(--ds-gold-deep)' }}>milke aage badhein.</span>
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

const CommunityFeed = ({ timeline }: {
  timeline: GreenLegacyEvent[];
}) => {
  const navigate = useNavigate();
  const feed = timeline.slice(0, 8).map(e => ({
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
            <div style={{ padding: '32px 22px', textAlign: 'center' }}>
              <button onClick={() => navigate('/eco-panchang')} className="ds-btn ds-btn-sm ds-btn-plum">Log an action →</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

/* ─────────────────────────────────────────────────────────────
   8. Eco-Auspicious Days Ahead — real panchang calendar data
───────────────────────────────────────────────────────────── */

const OTDAY_SPECIAL_LABELS: Record<string, string> = {
  ekadashi: 'एकादशी', purnima: 'पूर्णिमा', amavasya: 'अमावस्या',
  pradosh: 'प्रदोष', chaturthi: 'चतुर्थी', ashtami: 'अष्टमी',
  navami: 'नवमी', sankranti: 'संक्रांति',
};
const OTDAY_SPECIAL_ICONS: Record<string, string> = {
  ekadashi: '🌿', purnima: '🌕', amavasya: '🌑', pradosh: '🪔',
  chaturthi: '🐘', ashtami: '⚔️', navami: '🙏', sankranti: '🌞',
};
const OTDAY_SPECIAL_TONES: Record<string, string> = {
  purnima: '#d4a01f', amavasya: '#5c5c8a', ekadashi: '#2a8068',
  pradosh: 'var(--ds-plum-rose)', chaturthi: '#9c4e00',
};
const OTDAY_ECO_DESC: Record<string, string> = {
  ekadashi: 'Fast from grains, plant a tulsi or donate food. Ideal for eco-pledges.',
  purnima: 'Full moon — peak energy for tree planting and water conservation.',
  amavasya: 'Ancestors\' day — clean a water body or feed birds and animals.',
  pradosh: 'Twilight rite — light a lamp near a tree; offer water to its roots.',
  chaturthi: 'Ganesh tithi — start a new eco-project or begin composting.',
  ashtami: 'Mid-paksha — water birds and animals; observe local biodiversity.',
  navami: 'Navami energy — organise a community clean-up or tree circle.',
  sankranti: 'Solar transition — ideal day for sowing seeds and new beginnings.',
};

const OnThisDay = () => {
  const navigate = useNavigate();
  const todayLabel = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'long' });
  const [auspicious, setAuspicious] = useState<PanchangCalendarRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const from = new Date().toISOString().slice(0, 10);
    const to   = new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10);
    fetchPanchangCalendar(from, to)
      .then(rows => {
        const specials = rows.filter(r => r.special_flag);
        setAuspicious(specials.slice(0, 4));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Build display items from real calendar data
  const items = auspicious.map(r => {
    const flag     = r.special_flag ?? 'default';
    const tithiRec = r.tithis as Record<string, string> | undefined;
    const tithiName = tithiRec?.name_sanskrit || tithiRec?.name_common || OTDAY_SPECIAL_LABELS[flag] || flag;
    const daysAway = Math.round(
      (new Date(r.gregorian_date + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0)) / 86400000,
    );
    const dateStr = new Date(r.gregorian_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return {
      yr:   daysAway === 0 ? 'आज' : daysAway === 1 ? 'कल' : `${daysAway} दिन बाद`,
      who:  `${OTDAY_SPECIAL_LABELS[flag] ?? flag} · ${dateStr}`,
      text: OTDAY_ECO_DESC[flag] ?? 'Auspicious tithi for eco-actions and community service.',
      tithi: tithiName,
      icon: OTDAY_SPECIAL_ICONS[flag] ?? '🌾',
      cta:  'Log eco-action',
      tone: OTDAY_SPECIAL_TONES[flag] ?? 'var(--ds-gold-deep)',
    };
  });

  return (
    <section style={{ padding: '72px 0', background: 'linear-gradient(180deg,#f4ecdb,var(--ds-ivory))' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="ds-eyebrow" style={{ color: 'var(--ds-gold-deep)' }}>Eco-auspicious days ahead · {todayLabel}</span>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 32, marginTop: 6, color: 'var(--ds-ink)' }}>
              Upcoming <span style={{ fontStyle: 'italic', color: 'var(--ds-plum-rose)' }}>special tithis</span> for action
            </h2>
          </div>
          <button onClick={() => navigate('/eco-panchang')} className="ds-btn ds-btn-sm ds-btn-ghost">Open full calendar →</button>
        </div>
        {!loaded ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }} className="dash-otd-grid">
            {[0,1,2,3].map(i => (
              <div key={i} className="ds-card" style={{ padding: 22, height: 140, background: 'rgba(212,154,31,0.04)', border: '1px solid rgba(212,154,31,0.15)' }} />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }} className="dash-otd-grid">
            {items.map((it, i) => (
              <div key={i} className="ds-card" style={{ padding: 22, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 10, right: 14, fontSize: 11, fontFamily: 'var(--ds-mono)', fontWeight: 700, color: it.tone, opacity: 0.8, letterSpacing: '0.05em' }}>{it.yr}</div>
                <div style={{ fontSize: 32, marginBottom: 10 }}>{it.icon}</div>
                <div className="ds-eyebrow" style={{ color: it.tone }}>{it.who}</div>
                <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 13, fontWeight: 600, color: 'var(--ds-plum)', marginTop: 3 }}>{it.tithi}</div>
                <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.4, color: 'var(--ds-ink)', position: 'relative' }}>{it.text}</p>
                <button onClick={() => navigate('/eco-panchang')} className="ds-btn ds-btn-sm ds-btn-plum" style={{ marginTop: 14 }}>{it.cta}</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="ds-card" style={{ padding: 32, textAlign: 'center', color: 'var(--ds-ink-mute)', fontSize: 13 }}>
            No upcoming special tithis found. <button onClick={() => navigate('/eco-panchang')} className="ds-btn ds-btn-sm ds-btn-ghost" style={{ marginLeft: 8 }}>Open calendar →</button>
          </div>
        )}
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
const KIND_OPTIONS = ['Achievement', 'Service', 'Ecology', 'Wisdom', 'Craft', 'Community'];

const PrideWall = ({ entries, onSubmitSuccess }: {
  entries: GauravGathaEntry[];
  onSubmitSuccess: () => void;
}) => {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTitle, setShareTitle] = useState('');
  const [shareWho, setShareWho] = useState('');
  const [shareKind, setShareKind] = useState('Achievement');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const todayMD = `${String(new Date().getMonth() + 1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`;

  const todayCards = entries.filter(e => {
    const d = new Date(e.created_at);
    const md = `${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return md === todayMD;
  });

  const visible = entries.filter(e => !dismissed.includes(e.id));

  const handleSubmit = async () => {
    if (!shareTitle.trim() || !shareWho.trim()) { setSubmitError('कृपया सभी जानकारी भरें।'); return; }
    setSubmitting(true);
    setSubmitError('');
    try {
      await submitGauravGatha({ title: shareTitle.trim(), who: shareWho.trim(), kind: shareKind });
      setShareOpen(false);
      setShareTitle(''); setShareWho(''); setShareKind('Achievement');
      onSubmitSuccess();
    } catch {
      setSubmitError('Submit नहीं हो पाया — कृपया दोबारा कोशिश करें।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section style={{ padding: '40px 0 56px', background: 'var(--ds-ivory)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="ds-eyebrow">Garv · Kutumb Gaurav Gatha</span>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 32, marginTop: 6, color: 'var(--ds-ink)' }}>Your kutumb's <span style={{ fontStyle: 'italic', color: 'var(--ds-gold-deep)' }}>gauravgaatha</span></h2>
            <p style={{ fontSize: 14, color: 'var(--ds-ink-soft)', marginTop: 6, maxWidth: 580 }}>Permanent achievements — not status updates. Every year, on this date.</p>
          </div>
          <button onClick={() => setShareOpen(true)} className="ds-btn ds-btn-sm ds-btn-plum">+ Share yours</button>
        </div>

        {/* Share modal */}
        {shareOpen && (
          <div onClick={() => setShareOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(28,13,46,0.55)', backdropFilter: 'blur(8px)', zIndex: 200, display: 'grid', placeItems: 'center', padding: 24 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 'min(520px,100%)', background: 'var(--ds-paper)', borderRadius: 16, padding: 28, boxShadow: '0 24px 64px -12px rgba(28,13,46,0.28)' }}>
              <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 22, color: 'var(--ds-plum)', marginBottom: 4 }}>Share a Gaurav Gatha</div>
              <p style={{ fontSize: 13, color: 'var(--ds-ink-soft)', marginBottom: 16 }}>What has your kutumb achieved? It will appear on the wall immediately.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontFamily: 'var(--ds-mono)', color: 'var(--ds-ink-soft)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>उपलब्धि (Achievement)</label>
                  <textarea value={shareTitle} onChange={e => setShareTitle(e.target.value)} placeholder="e.g. Badi Dadi ji taught 200 children to read — Meerpur village, 1978." rows={3} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--ds-hairline)', padding: '10px 12px', fontFamily: 'inherit', fontSize: 13, resize: 'vertical', background: 'var(--ds-ivory-warm)', boxSizing: 'border-box', marginTop: 4 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontFamily: 'var(--ds-mono)', color: 'var(--ds-ink-soft)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>किसने (Who)</label>
                  <input value={shareWho} onChange={e => setShareWho(e.target.value)} placeholder="e.g. Badi Dadi ji · Mathura" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--ds-hairline)', padding: '9px 12px', fontFamily: 'inherit', fontSize: 13, background: 'var(--ds-ivory-warm)', boxSizing: 'border-box', marginTop: 4 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontFamily: 'var(--ds-mono)', color: 'var(--ds-ink-soft)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>प्रकार (Kind)</label>
                  <select value={shareKind} onChange={e => setShareKind(e.target.value)} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--ds-hairline)', padding: '9px 12px', fontFamily: 'inherit', fontSize: 13, background: 'var(--ds-ivory-warm)', boxSizing: 'border-box', marginTop: 4 }}>
                    {KIND_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              </div>
              {submitError && <p style={{ fontSize: 12, color: '#c0392b', marginTop: 10 }}>{submitError}</p>}
              <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                <button onClick={() => { setShareOpen(false); setSubmitError(''); }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--ds-hairline)', background: 'transparent', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button onClick={handleSubmit} disabled={submitting} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--ds-plum)', color: '#fff', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: submitting ? 0.7 : 1 }}>{submitting ? 'Submitting…' : 'Submit →'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Today in history */}
        {todayCards.length > 0 && (
          <div style={{ marginBottom: 28, padding: '18px 22px', borderRadius: 12, background: 'linear-gradient(135deg,rgba(212,154,31,0.08),rgba(74,33,104,0.04))', border: '1px solid rgba(212,154,31,0.25)' }}>
            <div className="ds-eyebrow" style={{ color: 'var(--ds-gold-deep)', marginBottom: 12 }}>आज की गौरवगाथा · इसी तारीख को हर साल</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {todayCards.map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', borderRadius: 8, background: 'var(--ds-paper)', border: `1px solid ${c.tone}33` }}>
                  <div style={{ fontSize: 28 }}>{c.img}</div>
                  <div>
                    <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 14, fontWeight: 600, color: 'var(--ds-ink)' }}>{c.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--ds-ink-mute)', marginTop: 2 }}>by {c.who}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--ds-ink-soft)', fontSize: 15 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏆</div>
            <p>अभी कोई गौरव गाथा नहीं है।<br />सबसे पहले अपनी कुटुम्ब की उपलब्धि share करें!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }} className="dash-pw-grid">
            {visible.map((c, i) => (
              <div key={c.id} className="ds-card" style={{ padding: 0, overflow: 'hidden', position: 'relative', border: i === 0 ? '1.5px solid var(--ds-gold)' : '1px solid var(--ds-hairline)' }}>
                {i === 0 && <div style={{ position: 'absolute', top: 14, right: 14, padding: '4px 10px', borderRadius: 999, background: 'linear-gradient(135deg,var(--ds-gold-light),var(--ds-gold))', color: 'var(--ds-plum-deep)', fontSize: 9, fontFamily: 'var(--ds-mono)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', zIndex: 2 }}>★ Latest</div>}
                <button onClick={() => setDismissed(d => [...d, c.id])} style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.25)', border: 'none', color: '#fff', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 13, display: 'grid', placeItems: 'center', zIndex: 3 }}>×</button>
                <div style={{ height: 120, background: `linear-gradient(135deg,${c.tone},var(--ds-plum-deep))`, display: 'grid', placeItems: 'center', fontSize: 54 }}>{c.img}</div>
                <div style={{ padding: 18 }}>
                  <div className="ds-eyebrow" style={{ color: c.tone }}>{c.kind} · {new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  <h3 style={{ fontFamily: 'var(--ds-serif)', fontSize: 16, marginTop: 6, lineHeight: 1.3, color: 'var(--ds-ink)' }}>{c.title}</h3>
                  <p style={{ fontSize: 11, color: 'var(--ds-ink-mute)', marginTop: 5 }}>by <span style={{ fontWeight: 600, color: 'var(--ds-ink)' }}>{c.who}</span></p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--ds-hairline)' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="ds-btn ds-btn-sm ds-btn-ghost" style={{ padding: '5px 8px', fontSize: 10 }}>🙏 Pranam</button>
                      <button className="ds-btn ds-btn-sm ds-btn-ghost" style={{ padding: '5px 8px', fontSize: 10 }}>🌸 Tribute</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
  const [gauravGatha, setGauravGatha] = useState<GauravGathaEntry[]>([]);
  const [treeSize, setTreeSize] = useState(0);
  const [userPersonNode, setUserPersonNode] = useState<Record<string, unknown> | null>(null);
  const [vanshaPersons, setVanshaPersons] = useState<Record<string, unknown>[]>([]);

  const streak = (() => {
    try { return parseInt(localStorage.getItem('prakriti_streak') ?? '0', 10) || 0; } catch { return 0; }
  })();
  const [kidsEnabled, setKidsEnabled] = useState(() => {
    try { return localStorage.getItem('prakriti_kids_section') === '1'; } catch { return false; }
  });
  const panchang = useLivePanchang();

  const refreshGauravGatha = () => {
    const vid = resolveVanshaIdForApi(null);
    if (vid) fetchGauravGatha(vid).then(setGauravGatha).catch(() => {});
  };

  useEffect(() => {
    const vid = resolveVanshaIdForApi(null);
    if (!vid) return;
    fetchPrakritiScore(vid).then(setPrakritiScore).catch(() => {});
    fetchFamilyRank(vid).then(setFamilyRank).catch(() => {});
    fetchSamayProfile().then(setSamayProfile).catch(() => {});
    fetchSamayRequests('local', 5).then(setSamayRequests).catch(() => {});
    fetchRadarNearby(vid, 10).then(setNearby).catch(() => {});
    fetchGreenLegacyTimeline(vid, 5).then(setTimeline).catch(() => {});
    fetchGauravGatha(vid).then(setGauravGatha).catch(() => {});
    fetchVanshaTree(vid).then(d => {
      const persons = d.persons as Record<string, unknown>[];
      setTreeSize(persons.length ?? 0);
      setVanshaPersons(persons);
      const root = persons.find(p => (p.relative_gen_index as number) === 0) ?? persons[0] ?? null;
      setUserPersonNode(root);
    }).catch(() => {});
  }, [appUser?.vansha_id]);

  useEffect(() => {
    if (searchParams.get('join-team') === '1') {
      setShowJoinSE(true);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  void tr; void plan; void streak;

  return (
    <AppShell>
      <div style={{ background: 'var(--ds-ivory)', minHeight: '100vh' }}>
        {panchang?.isSpecial && <RightNowMoment panchang={panchang} />}
        <CommunityHero appUser={appUser} score={prakritiScore} familyRank={familyRank} panchang={panchang} userPersonNode={userPersonNode} gauravGatha={gauravGatha} />
        <DashboardInfoRow persons={vanshaPersons} panchang={panchang} />
        <SewaEngine samayProfile={samayProfile} samayRequests={samayRequests} />
        <PrideWall entries={gauravGatha} onSubmitSuccess={refreshGauravGatha} />
        <KutumbRadar nearby={nearby} />
        <InviteLoop treeSize={treeSize} />
        <CommunityFeed timeline={timeline} />
        <OnThisDay />
        <Sanskaras />

        {/* Kids section toggle */}
        <section style={{ padding: '24px 0', background: 'var(--ds-ivory)', borderTop: '1px solid var(--ds-hairline)' }}>
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <span className="ds-eyebrow">Chote Sheron Ke Liye</span>
              <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 18, color: 'var(--ds-ink)', marginTop: 4 }}>
                Apne bachon ka apna corner — <span style={{ fontStyle: 'italic', color: 'var(--ds-plum-rose)' }}>activate karein</span>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <span style={{ fontSize: 13, color: 'var(--ds-ink-soft)' }}>{kidsEnabled ? 'On' : 'Off'}</span>
              <div onClick={() => {
                const next = !kidsEnabled;
                setKidsEnabled(next);
                try { localStorage.setItem('prakriti_kids_section', next ? '1' : '0'); } catch {}
              }} style={{ width: 44, height: 24, borderRadius: 12, background: kidsEnabled ? 'var(--ds-plum-rose)' : 'var(--ds-hairline-strong)', position: 'relative', transition: 'background 0.25s', cursor: 'pointer', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 3, left: kidsEnabled ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.25s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
              </div>
            </label>
          </div>
          {kidsEnabled && (
            <div style={{ maxWidth: 1240, margin: '16px auto 0', padding: '0 24px' }}>
              <div className="ds-card" style={{ padding: 28, background: 'linear-gradient(135deg,rgba(255,182,193,0.12),rgba(255,220,150,0.08))', border: '1px solid rgba(255,150,150,0.25)' }}>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 48 }}>🦁</div>
                  <div>
                    <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 22, color: 'var(--ds-plum)', fontWeight: 700 }}>Chote Sheron Ki Duniya</div>
                    <p style={{ fontSize: 14, color: 'var(--ds-ink-soft)', marginTop: 6, lineHeight: 1.5 }}>Your children's space — stories, milestones, heritage passed forward. <em>Wiring in progress — add a child to your tree to activate.</em></p>
                    <button onClick={() => {}} className="ds-btn ds-btn-sm ds-btn-plum" style={{ marginTop: 12 }}>Add child to tree →</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

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
          .dash-info-grid  { grid-template-columns: 1fr !important; }
          .dash-sewa-grid  { grid-template-columns: 1fr !important; }
          .dash-radar-grid { grid-template-columns: 1fr !important; }
          .dash-otd-grid   { grid-template-columns: 1fr 1fr !important; }
          .dash-sk-grid    { grid-template-columns: repeat(2,1fr) !important; }
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
