import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import KutumbFooter from '@/components/shells/KutumbFooter';

/* ── Mandala SVG backdrop ────────────────────────────────── */
const Mandala = () => (
  <svg viewBox="0 0 800 800" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 1100, height: 1100, opacity: 0.05, pointerEvents: 'none' }} stroke="var(--ds-gold-light)" fill="none" strokeWidth="0.6">
    {Array.from({ length: 48 }).map((_, i) => (
      <line key={i} x1="400" y1="400" x2={400 + 380 * Math.cos(i * Math.PI / 24)} y2={400 + 380 * Math.sin(i * Math.PI / 24)} />
    ))}
    {[60, 140, 220, 300, 380].map(r => <circle key={r} cx="400" cy="400" r={r} />)}
    {Array.from({ length: 12 }).map((_, i) => {
      const a = i * Math.PI / 6;
      return <circle key={i} cx={400 + 200 * Math.cos(a)} cy={400 + 200 * Math.sin(a)} r="60" />;
    })}
  </svg>
);

/* ── Banyan silhouette ───────────────────────────────────── */
const Banyan = ({ color = 'currentColor' }) => (
  <svg viewBox="0 0 600 500" style={{ width: '100%', height: '100%' }} fill={color} aria-hidden>
    <path d="M295 480 L295 240 Q280 220 285 200 Q290 175 300 160 Q310 175 315 200 Q320 220 305 240 L305 480 Z" opacity="0.85" />
    <path d="M260 380 Q255 420 258 480" stroke={color} strokeWidth="2" fill="none" opacity="0.4" />
    <path d="M340 380 Q345 420 342 480" stroke={color} strokeWidth="2" fill="none" opacity="0.4" />
    <ellipse cx="300" cy="140" rx="90" ry="70" opacity="0.55" />
    <ellipse cx="200" cy="180" rx="80" ry="60" opacity="0.5" />
    <ellipse cx="400" cy="180" rx="80" ry="60" opacity="0.5" />
    <ellipse cx="150" cy="240" rx="60" ry="40" opacity="0.4" />
    <ellipse cx="450" cy="240" rx="60" ry="40" opacity="0.4" />
  </svg>
);

const Landing = () => {
  const navigate = useNavigate();
  const [surname, setSurname] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [animScore, setAnimScore] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [region, setRegion] = useState('');
  useEffect(() => {
    if (!revealed) return;
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      if (i >= finalScore) { setAnimScore(finalScore); clearInterval(id); }
      else setAnimScore(i);
    }, 18);
    return () => clearInterval(id);
  }, [revealed, finalScore]);

  const compute = () => {
    if (!surname.trim()) { navigate('/onboarding'); return; }
    const seed = surname.toLowerCase().split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const s = 42 + (seed % 38);
    setFinalScore(s);
    setRevealed(true);
  };

  const tier = finalScore >= 70 ? 'Vansh-tier' : finalScore >= 55 ? 'Vriksh-tier' : 'Ankur-tier';
  const tierColor = finalScore >= 70 ? 'var(--ds-gold)' : finalScore >= 55 ? 'var(--ds-plum-rose)' : 'var(--ds-saffron)';
  const percentile = revealed ? Math.min(99, 60 + (finalScore - 50)) : 0;

  return (
    <div style={{ fontFamily: 'var(--ds-sans)', color: 'var(--ds-ink)', background: 'var(--ds-ivory)', minHeight: '100vh' }}>

      {/* ── Nav ──────────────────────────────────────────────────── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(250,246,238,0.88)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--ds-hairline)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', maxWidth: 1440, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/prakriti.svg" alt="Prakriti" style={{ width: 32, height: 32, objectFit: 'contain' }} />
            <div>
              <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 19, fontWeight: 700, color: 'var(--ds-plum)', letterSpacing: '-0.01em' }}>Prakriti</div>
              <div style={{ fontFamily: 'var(--ds-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ds-ink-mute)', marginTop: 1 }}>AARUSH</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => navigate('/signin')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: 'var(--ds-ink-soft)' }}>
              Sign in
            </button>
            <button onClick={() => navigate('/onboarding')} className="ds-btn ds-btn-sm ds-btn-plum">
              Claim free →
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(180deg, var(--ds-plum-deep) 0%, var(--ds-plum) 60%, var(--ds-plum-mid) 100%)', color: 'var(--ds-paper)', paddingTop: 80, paddingBottom: 120 }}>
        <Mandala />
        <div style={{ position: 'absolute', bottom: -40, left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: 1100, height: 540, opacity: 0.06, pointerEvents: 'none', color: 'var(--ds-gold-light)' }}>
          <Banyan color="currentColor" />
        </div>

        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px', position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.9fr', gap: 60, alignItems: 'center' }} className="landing-hero-grid">
            <div>
              <p className="ds-sanskrit ds-rise" style={{ animationDelay: '80ms', marginTop: 0, fontSize: 34, color: 'var(--ds-gold-light)', letterSpacing: '0.04em' }}>
                हर परिवार एक वृक्ष है।
              </p>
              <h1 className="ds-rise" style={{ animationDelay: '140ms', fontFamily: 'var(--ds-serif)', fontSize: 'clamp(40px,5.5vw,72px)', marginTop: 8, lineHeight: 1.02, color: 'var(--ds-paper)' }}>
                Build your family's <span className="ds-shimmer-gold">Vanshavali</span>
                <span style={{ display: 'block', fontStyle: 'italic', fontWeight: 400, color: 'rgba(255,255,255,0.78)' }}>— join your Kutumb.</span>
              </h1>
              <p className="ds-rise" style={{ animationDelay: '220ms', marginTop: 24, fontSize: 18, lineHeight: 1.6, color: 'rgba(255,255,255,0.75)', maxWidth: 520 }}>
                India's first invitation-only digital Vanshavali — Pandit-verified, owned by your parivar, recorded in your grandfather's voice. Build your living family tree and connect with your Kutumb across generations.
              </p>

              <div id="claim" className="ds-rise" style={{ animationDelay: '320ms', marginTop: 36, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(212,154,31,0.25)', borderRadius: 14, padding: 6, maxWidth: 520 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'stretch', flexWrap: 'wrap' }}>
                  <input
                    className="ds-input"
                    placeholder="Your surname"
                    value={surname}
                    onChange={e => setSurname(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && compute()}
                    style={{ flex: '2 1 180px', minWidth: 140, background: 'rgba(255,255,255,0.08)', border: 'none', color: 'var(--ds-paper)', fontSize: 16, padding: '14px 16px' }}
                  />
                  <select
                    value={region}
                    onChange={e => setRegion(e.target.value)}
                    style={{ flex: '1 1 120px', background: 'rgba(255,255,255,0.08)', border: 'none', color: region ? 'var(--ds-paper)' : 'rgba(255,255,255,0.5)', fontSize: 14, padding: '14px 12px', borderRadius: 8 }}
                  >
                    <option value="" style={{ color: '#222' }}>Region (optional)</option>
                    {['Uttar Pradesh','Rajasthan','Gujarat','Maharashtra','Karnataka','Bengal','Bihar','NRI / Overseas'].map(r => (
                      <option key={r} value={r} style={{ color: '#222' }}>{r}</option>
                    ))}
                  </select>
                  <button className="ds-btn ds-btn-gold" onClick={compute} style={{ flex: '1 1 130px' }}>
                    Reveal score →
                  </button>
                </div>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 10, paddingLeft: 8 }}>
                  ✓ Free forever &nbsp;·&nbsp; ✓ No credit card &nbsp;·&nbsp; ✓ Pandit-verified
                </p>
              </div>

              <div className="ds-rise" style={{ animationDelay: '400ms', marginTop: 28, display: 'flex', alignItems: 'center', gap: 18, color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>
                <div style={{ display: 'flex' }}>
                  {['SK', 'RG', 'VA', 'MJ', 'PL'].map((initials, i) => (
                    <div key={i} style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, hsl(${20 + i * 40} 60% 50%), hsl(${i * 60} 50% 35%))`, border: '2px solid var(--ds-plum-deep)', marginLeft: i === 0 ? 0 : -10, display: 'grid', placeItems: 'center', fontSize: 11, color: '#fff', fontWeight: 600 }}>
                      {initials}
                    </div>
                  ))}
                </div>
                <span><strong style={{ color: 'var(--ds-gold-light)' }}>14,238 families</strong> claimed in the last 7 days</span>
              </div>
            </div>

            {/* Score reveal card */}
            <div style={{ position: 'relative' }}>
              <div style={{ background: 'var(--ds-paper)', borderRadius: 8, padding: 0, overflow: 'hidden', boxShadow: '0 24px 80px -20px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,154,31,0.3)' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--ds-hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--ds-ivory-warm)' }}>
                  <div>
                    <div className="ds-eyebrow">Prakriti Score · Live</div>
                    <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 18, marginTop: 4, color: 'var(--ds-plum)' }}>
                      {revealed ? `Parivar ${surname}` : 'Awaiting your surname...'}
                    </div>
                  </div>
                  <span className="ds-pill"><span className="ds-pill-dot live" />Live</span>
                </div>
                <div style={{ padding: '36px 32px 24px', textAlign: 'center', background: revealed ? 'linear-gradient(180deg, var(--ds-paper), var(--ds-ivory))' : 'var(--ds-paper)' }}>
                  {revealed ? (
                    <>
                      <div className="ds-score-num" style={{ fontSize: 140, color: 'var(--ds-plum)', lineHeight: 1, letterSpacing: '-0.05em' }}>
                        {animScore}<span style={{ fontSize: 32, color: 'var(--ds-ink-mute)', fontWeight: 400 }}>/100</span>
                      </div>
                      <div style={{ marginTop: 6, color: 'var(--ds-ink-soft)', fontSize: 14 }}>
                        Higher than <strong style={{ color: 'var(--ds-plum)' }}>{percentile}%</strong> of families in India
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <span className="ds-tag" style={{ background: 'rgba(212,154,31,0.12)', color: tierColor, borderColor: tierColor }}>
                          ★ {tier} eligible
                        </span>
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: '40px 0', color: 'var(--ds-ink-mute)' }}>
                      <div style={{ fontSize: 90, color: 'var(--ds-hairline-strong)', fontFamily: 'var(--ds-serif)', letterSpacing: '-0.04em' }}>—</div>
                      <p style={{ fontSize: 13, marginTop: 8 }}>Enter your surname to reveal a sample score.</p>
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid var(--ds-hairline)', background: 'var(--ds-paper)' }}>
                  {[
                    { label: 'Tree depth', v: revealed ? '4 gen' : '—', icon: '🌳' },
                    { label: 'Eco-actions', v: revealed ? String(Math.floor(finalScore / 4)) : '—', icon: '🌱' },
                    { label: 'Ceremonies', v: revealed ? String(Math.floor(finalScore / 12)) : '—', icon: '🪔' },
                    { label: 'Smriti', v: revealed ? '2 rec' : '—', icon: '🎙️' },
                  ].map(({ label, v, icon }) => (
                    <div key={label} style={{ padding: '16px 8px', textAlign: 'center', borderRight: '1px solid var(--ds-hairline)' }}>
                      <div style={{ fontSize: 18 }}>{icon}</div>
                      <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4, color: 'var(--ds-plum)' }}>{v}</div>
                      <div style={{ fontSize: 11, color: 'var(--ds-ink-mute)', marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '20px 24px', background: 'var(--ds-ivory)', borderTop: '1px solid var(--ds-hairline)', display: 'flex', gap: 10 }}>
                  <button onClick={() => navigate('/onboarding')} className="ds-btn ds-btn-plum" style={{ flex: 1, justifyContent: 'center' }}>
                    {revealed ? `Claim ${surname} parivar →` : 'Claim yours free →'}
                  </button>
                </div>
              </div>
              <div style={{ position: 'absolute', top: -18, right: -18, transform: 'rotate(8deg)', background: 'var(--ds-saffron)', color: '#fff', padding: '8px 14px', borderRadius: 6, fontFamily: 'var(--ds-mono)', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, boxShadow: '0 8px 24px rgba(232,116,34,0.4)' }}>
                Sample card
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust bar ────────────────────────────────────────────── */}
      <section style={{ background: 'var(--ds-paper)', borderTop: '1px solid var(--ds-hairline)', borderBottom: '1px solid var(--ds-hairline)', padding: '28px 0' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
          <div className="ds-eyebrow" style={{ textAlign: 'center', marginBottom: 22 }}>Recognised &amp; Supported By</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 24, alignItems: 'center' }} className="landing-trust-grid">
            {[
              { src: '/logo-SIL-by-Citi.webp',     alt: 'Startup India Lab — Citi' },
              { src: '/logo-startup-india.webp',   alt: 'Startup India · DPIIT' },
              { src: '/logo-SIIC-iit-kanpur.webp', alt: 'SIIC IIT Kanpur' },
              { src: '/logo-start-in-up.webp',     alt: 'Start in UP' },
              { src: '/logo-AIIDE-Coe.webp',       alt: 'AIIDE CoE' },
            ].map(l => (
              <div key={l.src} style={{ display: 'grid', placeItems: 'center', filter: 'grayscale(0.3)', opacity: 0.85 }}>
                <img src={l.src} alt={l.alt} style={{ height: 48, objectFit: 'contain', maxWidth: '100%' }} loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── KPI strip ────────────────────────────────────────────── */}
      <section style={{ background: 'var(--ds-plum-deep)', color: 'var(--ds-paper)', padding: '32px 0' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }} className="landing-kpi-grid">
            {[
              { num: '1000+', label: 'Families Onboarding Daily' },
              { num: '70%',   label: 'Pandit Ji-Verified Members' },
              { num: '🛕',   label: 'Temple Trust Villages' },
              { num: '🇮🇳',  label: 'Pan-India Network' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center', padding: '8px 12px' }}>
                <div className="ds-score-num" style={{ fontSize: 42, color: 'var(--ds-gold-light)', lineHeight: 1 }}>{s.num}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6, letterSpacing: '0.04em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section style={{ padding: '120px 0', background: 'var(--ds-ivory)' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 64px' }}>
            <span className="ds-eyebrow">Four steps · Forty-five seconds each</span>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 'clamp(36px,4vw,56px)', marginTop: 16, color: 'var(--ds-ink)' }}>
              From a single name<br />to a <em style={{ color: 'var(--ds-gold-deep)' }}>living inheritance</em>.
            </h2>
            <p style={{ marginTop: 18, fontSize: 17, color: 'var(--ds-ink-soft)' }}>
              No subscription trap. No upfront ₹999. Pay only for what each family member needs.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }} className="landing-how-grid">
            {[
              { n: '01', title: 'Plant your first root', desc: 'Add yourself, your father, your gotra. 90 seconds. Free, no card.', icon: '🌱', sanskrit: 'बीज' },
              { n: '02', title: 'Grow the parivar', desc: 'Invite parents, dadaji, nanaji. Each adds their own branch — collaborative, not centralized.', icon: '🌳', sanskrit: 'अंकुर' },
              { n: '03', title: 'Pandit-verify the lineage', desc: 'A network of 1,200+ verified Pandits stamp your gotra & vanshavali. ₹49 per person.', icon: '🪔', sanskrit: 'प्रमाण' },
              { n: '04', title: 'Record the elders', desc: 'Smriti — voice recordings of dadaji-dadiji. ₹9 per recording. Saved 100 years.', icon: '🎙️', sanskrit: 'स्मृति' },
            ].map(s => (
              <div key={s.n} className="ds-card" style={{ padding: 28, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 18, right: 20, fontFamily: 'var(--ds-mono)', fontSize: 11, letterSpacing: '0.15em', color: 'var(--ds-ink-mute)' }}>{s.n}</div>
                <div style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--ds-ivory-warm)', border: '1px solid var(--ds-hairline-strong)', display: 'grid', placeItems: 'center', fontSize: 26 }}>{s.icon}</div>
                <div className="ds-sanskrit" style={{ marginTop: 18, fontSize: 22, color: 'var(--ds-plum-rose)' }}>{s.sanskrit}</div>
                <h3 style={{ marginTop: 6, fontSize: 21, fontFamily: 'var(--ds-serif)', color: 'var(--ds-ink)' }}>{s.title}</h3>
                <p style={{ marginTop: 8, color: 'var(--ds-ink-soft)', fontSize: 14, lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why trust us ─────────────────────────────────────────── */}
      <section style={{ background: 'var(--ds-plum-deep)', color: 'var(--ds-paper)', padding: '120px 0', position: 'relative', overflow: 'hidden' }}>
        <Mandala />
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px', position: 'relative', zIndex: 2 }}>
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 72px' }}>
            <span className="ds-eyebrow" style={{ color: 'var(--ds-gold-light)' }}>Trust architecture</span>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 'clamp(36px,4.5vw,60px)', marginTop: 16, color: 'var(--ds-paper)' }}>
              Your family's data is <em style={{ color: 'var(--ds-gold-light)' }}>sacred</em>.<br />We treat it that way.
            </h2>
            <p style={{ marginTop: 18, fontSize: 17, color: 'rgba(255,255,255,0.7)' }}>
              Three layers of trust — verified by humans, locked by cryptography, governed by your community.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }} className="landing-trust-arch-grid">
            {[
              { icon: '🪔', title: 'Pandit verification', desc: '1,200+ verified Pandits across India stamp your gotra, ceremonies, and lineage. Every node traceable to a human expert.', tag: 'Human layer' },
              { icon: '🔒', title: 'Your Privacy', desc: 'You control exactly who sees what. Set per-member privacy levels — hide dates, blur photos, restrict elders\' profiles. Your tree, your rules. No one outside your family can see your data.', tag: 'Your Privacy' },
              { icon: '🏛️', title: 'Community governance', desc: "No AI hallucination. No central control. Your family's karta and elders own the write access. Your data, your rules.", tag: 'Community layer' },
            ].map(t => (
              <div key={t.title} style={{ padding: 28, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(212,154,31,0.2)', borderRadius: 8 }}>
                <div style={{ fontSize: 36, marginBottom: 16 }}>{t.icon}</div>
                <span className="ds-tag ds-tag-gold" style={{ background: 'rgba(212,154,31,0.1)', color: 'var(--ds-gold-light)', borderColor: 'rgba(212,154,31,0.3)' }}>{t.tag}</span>
                <h3 style={{ fontFamily: 'var(--ds-serif)', fontSize: 22, marginTop: 14, color: 'var(--ds-paper)' }}>{t.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,0.65)', marginTop: 8 }}>{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section style={{ padding: '120px 0', background: 'var(--ds-ivory-warm)', position: 'relative' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 56px' }}>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 'clamp(36px,4vw,56px)', marginTop: 0, color: 'var(--ds-ink)' }}>
              It's your own <em style={{ color: 'var(--ds-saffron)' }}>Family Account</em>.<br />Not a social media chat group.
            </h2>
            <p style={{ marginTop: 18, fontSize: 17, color: 'var(--ds-ink-soft)', maxWidth: 600, margin: '18px auto 0' }}>
              A private, secure space that belongs to your parivar — with tools built for the way Indian families actually work.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }} className="landing-sachet-grid">
            {[
              { name: 'Add a relative', desc: 'Build your family tree freely. Invite parents, grandparents, cousins — each on their own branch.', icon: '➕' },
              { name: 'Pandit-verify a member', desc: 'Lock gotra, vanshavali. A verified Pandit stamps your lineage permanently.', icon: '🪔' },
              { name: 'Smriti voice recording', desc: "Record dadaji's stories and blessings. Preserved for generations to come.", icon: '🎙️' },
              { name: 'Log a ceremony', desc: 'Mundan, vivah, shraddh — every ritual stamped and stored in your family timeline.', icon: '🪷' },
              { name: 'Kundali matching', desc: 'For matrimony. Gotra + nakshatra + 36-guna — done the traditional way.', icon: '⊛' },
              { name: 'Generate vanshavali PDF', desc: 'Print-ready vanshavali in Sanskrit + English — pandit-stamped, shareable.', icon: '📜' },
            ].map(s => (
              <div key={s.name} className="ds-card" style={{ padding: 24 }}>
                <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--ds-ivory-warm)', border: '1px solid var(--ds-hairline-strong)', display: 'grid', placeItems: 'center', fontSize: 24 }}>{s.icon}</div>
                <h3 style={{ fontFamily: 'var(--ds-serif)', fontSize: 18, marginTop: 18, color: 'var(--ds-ink)' }}>{s.name}</h3>
                <p style={{ fontSize: 13, color: 'var(--ds-ink-soft)', marginTop: 8, lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Engagement mechanics ──────────────────────────────────── */}
      <section style={{ padding: '120px 0', background: 'var(--ds-paper)' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 56px' }}>
            <span className="ds-eyebrow">Live · Daily engagement</span>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 'clamp(36px,4vw,56px)', marginTop: 16, color: 'var(--ds-ink)' }}>
              Building your tree becomes a <em style={{ color: 'var(--ds-gold-deep)' }}>family ritual</em>.
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr 1fr', gap: 18 }} className="landing-eng-grid">
            {/* Streak */}
            <div className="ds-card" style={{ padding: 28, background: 'linear-gradient(180deg, var(--ds-plum-deep), var(--ds-plum))', color: 'var(--ds-paper)', border: 'none' }}>
              <span className="ds-eyebrow" style={{ color: 'var(--ds-gold-light)' }}>Parivar streak</span>
              <div className="ds-score-num" style={{ fontSize: 84, color: 'var(--ds-gold-light)', lineHeight: 1, marginTop: 10 }}>260<span style={{ fontSize: 24, color: 'rgba(255,255,255,0.5)' }}> days</span></div>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>One small act per day — a memory, a photo, an eco-action. Together with your kin.</p>
              <div style={{ display: 'flex', gap: 5, marginTop: 18 }}>
                {Array.from({ length: 14 }).map((_, i) => (
                  <div key={i} style={{ flex: 1, height: 32, borderRadius: 3, background: i < 9 ? 'var(--ds-gold)' : 'rgba(255,255,255,0.1)' }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                <span>Mon</span><span>Sun</span>
              </div>
            </div>
            {/* Badges */}
            <div className="ds-card" style={{ padding: 28 }}>
              <span className="ds-eyebrow">Earned this month</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                {[
                  { n: 'Vansh-pati', e: '👑', t: '5 generations' },
                  { n: 'Smriti-keeper', e: '🎙️', t: '10 recordings' },
                  { n: 'Eco-rakshak', e: '🌱', t: '25 trees planted' },
                  { n: 'Dharm-dhwaj', e: '🪔', t: '12 ceremonies' },
                ].map(b => (
                  <div key={b.n} style={{ textAlign: 'center', padding: 14, borderRadius: 8, background: 'var(--ds-ivory-warm)', border: '1px solid var(--ds-hairline)' }}>
                    <div style={{ fontSize: 34 }}>{b.e}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, color: 'var(--ds-plum)' }}>{b.n}</div>
                    <div style={{ fontSize: 11, color: 'var(--ds-ink-mute)', marginTop: 2 }}>{b.t}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* Community pulse */}
            <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--ds-hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="ds-eyebrow">Pulse · last 5 minutes</span>
                <span className="ds-pill"><span className="ds-pill-dot live" />Live</span>
              </div>
              {[
                { who: 'Sharma–Kashyap', what: "recorded grandfather's voice", when: 'just now', i: '🎙️' },
                { who: 'Verma parivar', what: 'pandit-verified 3 members', when: '1m ago', i: '🪔' },
                { who: 'Mishra (Kanpur)', what: 'planted 5 trees · +12 score', when: '2m ago', i: '🌱' },
                { who: 'Agarwal–Garg', what: 'completed mundan ritual', when: '3m ago', i: '🪷' },
                { who: 'Tiwari (Varanasi)', what: 'invited 8 cousins', when: '4m ago', i: '➕' },
              ].map((e, i) => (
                <div key={i} style={{ padding: '14px 22px', borderBottom: '1px solid var(--ds-hairline)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 18 }}>{e.i}</div>
                  <div style={{ flex: 1, fontSize: 13 }}>
                    <div><strong style={{ color: 'var(--ds-plum)' }}>{e.who}</strong> {e.what}</div>
                    <div style={{ fontSize: 11, color: 'var(--ds-ink-mute)', marginTop: 2 }}>{e.when}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Sewa Chakra (Time Bank preview) ──────────────────────── */}
      <section style={{ padding: '120px 0', background: 'var(--ds-ivory)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'flex-start' }} className="landing-sewa-grid">
            <div style={{ position: 'sticky', top: 120 }}>
              <span className="ds-eyebrow">Sewa Chakra · Time Bank</span>
              <p className="ds-sanskrit" style={{ fontSize: 30, marginTop: 18, color: 'var(--ds-plum-rose)', lineHeight: 1.3 }}>सेवा का मूल्य,<br />सेवा से होता है।</p>
              <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 'clamp(36px,4vw,56px)', marginTop: 18, lineHeight: 1.05, color: 'var(--ds-ink)' }}>
                Give one hour to your community.<br /><em style={{ color: 'var(--ds-gold-deep)' }}>Earn one hour back —</em><br />from anyone, for anything.
              </h2>
              <p style={{ marginTop: 18, fontSize: 17, color: 'var(--ds-ink-soft)', lineHeight: 1.6, maxWidth: 480 }}>
                Sewa Chakra is Prakriti's community time bank. Every hour you give — to a neighbour, an elder, a stranger in your gotra — is logged as one Sewa hour. Redeem it from anyone in your kutumb, any time. A doctor's hour equals a carpenter's hour. <strong>No money. Just community.</strong>
              </p>
              <div className="ds-card" style={{ padding: 24, marginTop: 32, background: 'linear-gradient(135deg, rgba(212,154,31,0.08), var(--ds-paper))', border: '1px solid var(--ds-gold)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14 }}>
                  <div>
                    <div className="ds-eyebrow" style={{ color: 'var(--ds-gold-deep)' }}>Your sewa balance</div>
                    <div className="ds-score-num" style={{ fontSize: 64, color: 'var(--ds-gold-deep)', lineHeight: 1, marginTop: 6 }}>18<span style={{ fontSize: 18, color: 'var(--ds-ink-mute)' }}> hrs</span></div>
                    <div style={{ fontSize: 12, color: 'var(--ds-ink-mute)', marginTop: 4 }}>7 hrs to <strong>Sewa-rakshak</strong> badge</div>
                  </div>
                  <svg viewBox="0 0 80 80" style={{ width: 80, height: 80 }}>
                    <circle cx="40" cy="40" r="32" fill="none" stroke="var(--ds-hairline-strong)" strokeWidth="6" />
                    <circle cx="40" cy="40" r="32" fill="none" stroke="var(--ds-gold)" strokeWidth="6" strokeDasharray="145 201" transform="rotate(-90 40 40)" strokeLinecap="round" />
                    <text x="40" y="46" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--ds-gold-deep)">72%</text>
                  </svg>
                </div>
                <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--ds-hairline)', display: 'flex', gap: 10 }}>
                  <button onClick={() => navigate('/time-bank')} className="ds-btn ds-btn-plum ds-btn-sm" style={{ flex: 1 }}>Offer 1 hour →</button>
                  <button onClick={() => navigate('/time-bank')} className="ds-btn-ghost ds-btn-sm" style={{ flex: 1 }}>Request help</button>
                </div>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div className="ds-eyebrow">Available near you · Lucknow</div>
                <span className="ds-pill"><span className="ds-pill-dot live" />4 active</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { who: 'Vidya Aunty · 62', what: 'Will help with mundan pooja prep', earned: 14, away: '2.4 km', gotra: 'Shandilya', avail: 'Sat morning' },
                  { who: 'Pt. Suresh ji · 71', what: 'Reads kundali · 30 yrs experience', earned: 48, away: '5.1 km', gotra: 'Vatsa', avail: 'Daily 6–9 AM' },
                  { who: 'Kavita Bua · 55', what: 'Teaches mehndi, traditional songs', earned: 22, away: '1.2 km', gotra: 'Garg', avail: 'Sun afternoon' },
                  { who: 'Mohan Chacha · 68', what: 'Carpentry · havan-kund repair', earned: 31, away: '3.7 km', gotra: 'Kashyap', avail: 'Weekdays' },
                ].map((s, i) => (
                  <div key={i} className="ds-card" style={{ padding: 20, display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div style={{ width: 54, height: 54, borderRadius: '50%', background: `linear-gradient(135deg, ${i % 2 ? '#c45a8e' : '#5a3878'}, ${i % 2 ? '#6a2a52' : '#2e1346'})`, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: 'var(--ds-serif)', fontSize: 20, fontWeight: 700, flexShrink: 0 }}>{s.who[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--ds-serif)', fontSize: 16, fontWeight: 600, color: 'var(--ds-plum)' }}>{s.who}</span>
                        <span className="ds-tag ds-tag-plum" style={{ fontSize: 10 }}>{s.gotra}</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--ds-ink-soft)', marginTop: 4 }}>{s.what}</div>
                      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: 'var(--ds-ink-mute)', fontFamily: 'var(--ds-mono)' }}>
                        <span>📍 {s.away}</span><span>🕓 {s.avail}</span><span style={{ color: 'var(--ds-gold-deep)' }}>⊛ {s.earned}h banked</span>
                      </div>
                    </div>
                    <button onClick={() => navigate('/time-bank')} className="ds-btn ds-btn-sm" style={{ background: 'var(--ds-saffron)', color: '#fff', whiteSpace: 'nowrap', flexShrink: 0 }}>Request →</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Prakriti Panchang preview ─────────────────────────────── */}
      <section style={{ padding: '120px 0', background: '#0d0716', color: 'var(--ds-paper)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top, rgba(74,33,104,0.4), transparent 60%), radial-gradient(circle at 80% 20%, rgba(212,154,31,0.1), transparent 40%)' }} />
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px', position: 'relative' }}>
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 64px' }}>
            <span className="ds-eyebrow" style={{ color: 'var(--ds-gold-light)' }}>Prakriti Panchang · Cosmic calendar</span>
            <p className="ds-sanskrit" style={{ fontSize: 32, marginTop: 20, color: 'var(--ds-gold-light)', lineHeight: 1.3 }}>हर तिथि,<br />एक अवसर है।</p>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 'clamp(36px,4.5vw,56px)', marginTop: 18, color: 'var(--ds-paper)', lineHeight: 1.05 }}>
              Your family's calendar,<br /><em style={{ color: '#ff8a4a' }}>aligned with the cosmos.</em>
            </h2>
          </div>
          {/* Today card */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(212,154,31,0.3)', padding: 32, borderRadius: 12, marginBottom: 32, color: 'var(--ds-paper)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 32, alignItems: 'center' }} className="landing-panchang-today">
              <div style={{ position: 'relative', width: 140, height: 140 }}>
                <svg viewBox="0 0 140 140" style={{ width: '100%', height: '100%' }}>
                  <circle cx="70" cy="70" r="62" fill="none" stroke="rgba(212,154,31,0.2)" strokeWidth="1" strokeDasharray="2 4" />
                  <circle cx="70" cy="70" r="50" fill="none" stroke="var(--ds-gold-light)" strokeWidth="1.5" />
                  <text x="70" y="62" textAnchor="middle" fontSize="11" fill="var(--ds-gold-light)" fontFamily="var(--ds-mono)" letterSpacing="0.15em">VAISHAKH</text>
                  <text x="70" y="84" textAnchor="middle" fontSize="32" fill="var(--ds-paper)" fontFamily="var(--ds-serif)" fontWeight="700">03</text>
                  <text x="70" y="100" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.5)" fontFamily="var(--ds-mono)">SHUKLA</text>
                </svg>
              </div>
              <div>
                <div className="ds-eyebrow" style={{ color: 'var(--ds-gold-light)' }}>Today · 1 May 2026 · Akshay Tritiya</div>
                <h3 style={{ fontSize: 28, marginTop: 8, color: 'var(--ds-paper)', fontFamily: 'var(--ds-serif)' }}>Vaishakh Shukla Tritiya · Rohini Nakshatra</h3>
                <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                  {[['Yoga', 'Siddhi', true], ['Karana', 'Vanija', false], ['Prakriti', 'Vrishabh', true], ['Tone', 'Shubh', true]].map(([k, v, good]) => (
                    <div key={k as string} style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: `1px solid ${good ? 'rgba(122,219,160,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--ds-mono)' }}>{k}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: good ? '#7adba0' : 'var(--ds-paper)', marginTop: 2 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: '18px 20px', borderRadius: 8, background: 'linear-gradient(135deg, rgba(232,116,34,0.18), rgba(212,154,31,0.1))', border: '1px solid rgba(232,116,34,0.4)', maxWidth: 240 }}>
                <div style={{ fontSize: 11, fontFamily: 'var(--ds-mono)', letterSpacing: '0.12em', color: 'var(--ds-gold-light)', textTransform: 'uppercase' }}>Right now · 4h window</div>
                <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 17, marginTop: 6, color: 'var(--ds-paper)', lineHeight: 1.3 }}>Akshay Tritiya — most auspicious day for new beginnings.</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 6, lineHeight: 1.5 }}>Plant a sapling, start a Smriti, or log your family's Prakriti sankalp today.</div>
                <button onClick={() => navigate('/eco-panchang')} className="ds-btn ds-btn-sm" style={{ marginTop: 12, background: 'var(--ds-saffron)', color: '#fff', width: '100%', justifyContent: 'center', fontWeight: 600 }}>Log Prakriti sankalp →</button>
              </div>
            </div>
          </div>
          {/* Upcoming */}
          <div className="ds-eyebrow" style={{ color: 'var(--ds-gold-light)', marginBottom: 14 }}>Upcoming for your parivar</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }} className="landing-panchang-grid">
            {[
              { date: 'May 12', name: 'Buddha Purnima', glyph: '🌕', what: 'Full moon · nature purification day', cta: 'Record Smriti from a family member', cost: 9, urgency: 'In 11 days', accent: 'var(--ds-plum-rose)' },
              { date: 'May 26', name: 'Ganga Dussehra', glyph: '🌊', what: 'Sacred river day · environmental sankalp', cta: 'Log a river-cleanup eco-action', cost: 0, urgency: 'In 25 days', accent: 'var(--ds-saffron)' },
              { date: 'Jun 6', name: 'Nirjala Ekadashi', glyph: '🪷', what: 'Most powerful ekadashi · vrat & vriksh-seva', cta: 'Plant 11 saplings · log on Prakriti', cost: 0, urgency: 'In 36 days', accent: 'var(--ds-plum)' },
              { date: 'Jun 21', name: 'World Forest Day', glyph: '🌳', what: 'Global tree day aligns with Prakriti score', cta: 'Join family tree-planting drive', cost: 0, urgency: 'In 51 days', accent: 'var(--ds-gold-deep)' },
            ].map((u, i) => (
              <div key={i} style={{ padding: 22, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: 'var(--ds-paper)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 34 }}>{u.glyph}</div>
                  <div style={{ fontFamily: 'var(--ds-mono)', fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em', textAlign: 'right' }}>{u.urgency}</div>
                </div>
                <div style={{ fontFamily: 'var(--ds-mono)', fontSize: 11, color: u.accent, letterSpacing: '0.12em', marginTop: 14, textTransform: 'uppercase' }}>{u.date}</div>
                <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 18, color: 'var(--ds-paper)', marginTop: 4, fontWeight: 600 }}>{u.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6, lineHeight: 1.5, flex: 1 }}>{u.what}</div>
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--ds-paper)', flex: 1, lineHeight: 1.4 }}>{u.cta}</span>
                    <span style={{ fontFamily: 'var(--ds-serif)', fontSize: 16, fontWeight: 700, color: u.accent, whiteSpace: 'nowrap' }}>{u.cost === 0 ? 'Free' : `₹${u.cost}`}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <button onClick={() => navigate('/eco-panchang')} className="ds-btn ds-btn-gold">📅 Sync Panchang to family calendar — free</button>
          </div>
        </div>
      </section>

      {/* ── Kutumb Radar preview ──────────────────────────────────── */}
      <section style={{ padding: '120px 0', background: 'var(--ds-ivory-warm)', position: 'relative' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 56px' }}>
            <span className="ds-eyebrow">Kutumb Radar · Arrival discovery</span>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 'clamp(36px,4vw,56px)', marginTop: 16, lineHeight: 1.05, color: 'var(--ds-ink)' }}>
              Arrived somewhere new?<br /><em style={{ color: 'var(--ds-gold-deep)' }}>Find your kutumb.</em>
            </h2>
            <p style={{ marginTop: 18, fontSize: 17, color: 'var(--ds-ink-soft)', lineHeight: 1.6 }}>When you land in a new city, Kutumb Radar scans your tree and suggests members from your parivar and gotra who live nearby — waiting to welcome you.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 48, alignItems: 'center' }} className="landing-radar-grid">
            <div style={{ position: 'relative', aspectRatio: '1/1', maxWidth: 560, margin: '0 auto', width: '100%' }}>
              <svg viewBox="0 0 600 600" style={{ width: '100%', height: '100%' }}>
                <defs>
                  <radialGradient id="radarFade2" cx="50%" cy="50%">
                    <stop offset="0%" stopColor="var(--ds-plum)" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="var(--ds-plum)" stopOpacity="0" />
                  </radialGradient>
                  <linearGradient id="radarSweep" x1="50%" y1="50%" x2="100%" y2="50%">
                    <stop offset="0%" stopColor="var(--ds-gold)" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="var(--ds-gold)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <circle cx="300" cy="300" r="270" fill="url(#radarFade2)" />
                {[80, 150, 215, 270].map((r, i) => (
                  <circle key={r} cx="300" cy="300" r={r} fill="none" stroke="var(--ds-plum)" strokeOpacity={0.18} strokeWidth="1" strokeDasharray={i === 3 ? '2 6' : ''} />
                ))}
                {[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
                  const rad = (a - 90) * Math.PI / 180;
                  return <line key={a} x1="300" y1="300" x2={300 + 270 * Math.cos(rad)} y2={300 + 270 * Math.sin(rad)} stroke="var(--ds-plum)" strokeOpacity="0.07" strokeWidth="1" />;
                })}
                <text x="300" y="218" textAnchor="middle" fontSize="9" fill="var(--ds-ink-mute)" fontFamily="var(--ds-mono)" letterSpacing="0.18em">IMMEDIATE</text>
                <text x="300" y="148" textAnchor="middle" fontSize="9" fill="var(--ds-ink-mute)" fontFamily="var(--ds-mono)" letterSpacing="0.18em">EXTENDED</text>
                <text x="300" y="83" textAnchor="middle" fontSize="9" fill="var(--ds-ink-mute)" fontFamily="var(--ds-mono)" letterSpacing="0.18em">SAMAJ</text>
                <text x="300" y="28" textAnchor="middle" fontSize="9" fill="var(--ds-ink-mute)" fontFamily="var(--ds-mono)" letterSpacing="0.18em">DIASPORA</text>
                <g style={{ transformOrigin: '300px 300px', animation: 'ks-radar-sweep 8s linear infinite' }}>
                  <path d="M 300 300 L 570 300 A 270 270 0 0 0 555 220 Z" fill="url(#radarSweep)" opacity="0.5" />
                </g>
                <circle cx="300" cy="300" r="28" fill="var(--ds-plum-deep)" stroke="var(--ds-gold)" strokeWidth="2" />
                <text x="300" y="297" textAnchor="middle" fontSize="9" fill="var(--ds-gold-light)" fontFamily="var(--ds-mono)" letterSpacing="0.15em">YOU</text>
                <text x="300" y="312" textAnchor="middle" fontSize="11" fill="var(--ds-paper)" fontFamily="var(--ds-serif)" fontWeight="600">Anjali</text>
                {[
                  { angle: 30, ring: 1, urgent: true },
                  { angle: 110, ring: 1, urgent: false },
                  { angle: 200, ring: 2, urgent: false },
                  { angle: 280, ring: 2, urgent: true },
                  { angle: 60, ring: 2, urgent: false },
                  { angle: 150, ring: 3, urgent: false },
                  { angle: 240, ring: 3, urgent: false },
                  { angle: 340, ring: 3, urgent: false },
                  { angle: 20, ring: 4, urgent: false },
                ].map((b, i) => {
                  const ringR = [0, 80, 150, 215, 270];
                  const r = (ringR[b.ring] + ringR[b.ring - 1]) / 2 + 8;
                  const rad = (b.angle - 90) * Math.PI / 180;
                  const x = 300 + r * Math.cos(rad);
                  const y = 300 + r * Math.sin(rad);
                  const color = b.urgent ? 'var(--ds-saffron)' : b.ring === 1 ? 'var(--ds-plum)' : b.ring === 2 ? 'var(--ds-plum-rose)' : b.ring === 3 ? 'var(--ds-gold-deep)' : 'var(--ds-ink-soft)';
                  return (
                    <g key={i} transform={`translate(${x},${y})`}>
                      {b.urgent && <circle r="14" fill={color} opacity="0.18" style={{ animation: 'ks-radar-pulse 2s ease-in-out infinite' }} />}
                      <circle r="6" fill={color} stroke="var(--ds-paper)" strokeWidth="2" />
                    </g>
                  );
                })}
              </svg>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div className="ds-eyebrow">Nearby tree members · Mumbai</div>
                <span className="ds-pill"><span className="ds-pill-dot live" />Scanning</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { name: 'Ramesh Sharma · Andheri', what: 'Same gotra · Kashyap · 1.2 km away', urgent: true, action: 'Say namaste →', ring: 1 },
                  { name: 'Priya Verma · Bandra', what: 'Cousin 3rd degree · 2.8 km', urgent: false, action: 'Connect →', ring: 2 },
                  { name: 'Suresh Mishra · Dadar', what: 'Same vansha · Atri · 4.1 km', urgent: false, action: 'Connect →', ring: 2 },
                  { name: 'Kavita Tiwari · Powai', what: 'Gotra-kin · Bharadwaj · 6.7 km', urgent: false, action: 'Connect →', ring: 3 },
                  { name: 'Kashyap samaj · Mumbai', what: '38 members in this city from your tree', urgent: false, action: 'View all →', ring: 3 },
                ].map((b, i) => (
                  <div key={i} className="ds-card" style={{ padding: 16, display: 'flex', gap: 14, alignItems: 'center', border: b.urgent ? '1px solid var(--ds-gold)' : '1px solid var(--ds-hairline)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: b.urgent ? 'var(--ds-gold-deep)' : 'var(--ds-plum-rose)', flexShrink: 0, boxShadow: b.urgent ? '0 0 0 4px rgba(212,154,31,0.2)' : 'none' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--ds-serif)', fontWeight: 600, color: 'var(--ds-plum)', fontSize: 15 }}>{b.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--ds-ink-soft)', marginTop: 2 }}>{b.what}</div>
                    </div>
                    <button onClick={() => navigate('/dashboard')} className="ds-btn ds-btn-sm" style={{ background: b.urgent ? 'var(--ds-gold)' : 'var(--ds-ivory-warm)', color: b.urgent ? 'var(--ds-plum-deep)' : 'var(--ds-plum)', whiteSpace: 'nowrap', fontSize: 11, flexShrink: 0 }}>{b.action}</button>
                  </div>
                ))}
              </div>
              <div className="ds-card" style={{ marginTop: 16, padding: 16, background: 'linear-gradient(135deg, var(--ds-plum-deep), var(--ds-plum))', border: 'none', color: 'var(--ds-paper)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div className="ds-eyebrow" style={{ color: 'var(--ds-gold-light)' }}>Pro · ₹49/mo · cancel anytime</div>
                  <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 16, color: 'var(--ds-paper)', marginTop: 4, lineHeight: 1.4 }}>Auto-scan on arrival · WhatsApp alerts when kin are nearby</div>
                </div>
                <button onClick={() => navigate('/upgrade')} className="ds-btn ds-btn-sm ds-btn-gold" style={{ whiteSpace: 'nowrap' }}>Enable →</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Ecosystem trust signals ───────────────────────────────── */}
      <section style={{ padding: '80px 0', background: 'var(--ds-ivory)' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <span className="ds-eyebrow">The Prakriti Ecosystem</span>
            <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 36, marginTop: 12, color: 'var(--ds-ink)' }}>Built on community trust</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }} className="landing-eco-grid">
            {[
              { icon: '🛕', title: 'Mandir Mitra', desc: 'Temples logging your ceremonies in real time. Every puja recorded and verifiable on-chain.' },
              { icon: '🙏', title: 'Prakriti Margdarshak', desc: '1,200+ Pandits verifying lineage across India. Your gotra, stamped by a human expert.' },
              { icon: '👴', title: 'Parivar Pramukh', desc: 'Respected elders earning commission for bringing their community onto the platform.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="ds-card" style={{ padding: 28, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>{icon}</div>
                <h3 style={{ fontFamily: 'var(--ds-serif)', fontSize: 20, color: 'var(--ds-ink)', marginBottom: 10 }}>{title}</h3>
                <p style={{ fontSize: 14, color: 'var(--ds-ink-soft)', lineHeight: 1.7 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────── */}
      <section style={{ background: 'linear-gradient(180deg, var(--ds-plum-deep), var(--ds-plum))', color: 'var(--ds-paper)', padding: '100px 0', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <Mandala />
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px', position: 'relative', zIndex: 2 }}>
          <p style={{ fontFamily: 'var(--ds-mono)', fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 20 }}>Before the forest falls</p>
          <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 'clamp(32px,4.5vw,60px)', marginBottom: 24, lineHeight: 1.1 }}>
            The last member from your family<br />
            has already left us.<br />
            <span style={{ color: 'var(--ds-gold-light)', fontStyle: 'italic' }}>Don't let the next one go unrecorded.</span>
          </h2>
          <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.65)', marginBottom: 36 }}>
            Founding Family status — free, forever. No credit card.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/onboarding')} className="ds-btn ds-btn-gold ds-btn-lg">
              🌱 Plant your family's first root — free
            </button>
            <button onClick={() => navigate('/signin')} className="ds-btn ds-btn-ghost ds-btn-lg" style={{ color: 'var(--ds-paper)', borderColor: 'rgba(255,255,255,0.3)' }}>
              Sign in →
            </button>
          </div>
          <div style={{ marginTop: 16 }}>
            <button onClick={() => navigate('/code')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
              Have an invite code? →
            </button>
          </div>
        </div>
      </section>

      <KutumbFooter />

      <style>{`
        @media (max-width: 1000px) {
          .landing-hero-grid { grid-template-columns: 1fr !important; }
          .landing-kpi-grid  { grid-template-columns: 1fr 1fr !important; }
          .landing-how-grid  { grid-template-columns: 1fr 1fr !important; }
          .landing-trust-arch-grid { grid-template-columns: 1fr !important; }
          .landing-eco-grid  { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 600px) {
          .landing-trust-grid { grid-template-columns: repeat(3,1fr) !important; }
          .landing-kpi-grid   { grid-template-columns: 1fr !important; }
          .landing-how-grid   { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};

export default Landing;
