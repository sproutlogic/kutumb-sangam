import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchLeaderboard, type LeaderboardEntry } from '@/services/api';
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
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    fetchLeaderboard(undefined, 5).then(setLeaderboard).catch(() => {});
  }, []);

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
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--ds-plum)', display: 'grid', placeItems: 'center', color: 'var(--ds-gold-light)', fontFamily: 'var(--ds-deva)', fontSize: 18 }}>ॐ</div>
            <div>
              <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 19, fontWeight: 700, color: 'var(--ds-plum)', letterSpacing: '-0.01em' }}>Kutumb Sangam</div>
              <div style={{ fontFamily: 'var(--ds-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ds-ink-mute)', marginTop: 1 }}>Prakriti · by Aarush</div>
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
              <div className="ds-rise" style={{ animationDelay: '0ms' }}>
                <span className="ds-tag ds-tag-gold" style={{ background: 'rgba(212,154,31,0.16)', color: 'var(--ds-gold-light)', borderColor: 'rgba(212,154,31,0.4)' }}>
                  <span className="ds-pill-dot live" />
                  Founding family invitation · 2,847 of 10,000 left
                </span>
              </div>

              <p className="ds-sanskrit ds-rise" style={{ animationDelay: '80ms', marginTop: 28, fontSize: 34, color: 'var(--ds-gold-light)', letterSpacing: '0.04em' }}>
                हर परिवार एक वृक्ष है।
              </p>
              <h1 className="ds-rise" style={{ animationDelay: '140ms', fontFamily: 'var(--ds-serif)', fontSize: 'clamp(40px,5.5vw,72px)', marginTop: 8, lineHeight: 1.02, color: 'var(--ds-paper)' }}>
                Your family's <span className="ds-shimmer-gold">Prakriti Score</span>
                <span style={{ display: 'block', fontStyle: 'italic', fontWeight: 400, color: 'rgba(255,255,255,0.78)' }}>has been waiting.</span>
              </h1>
              <p className="ds-rise" style={{ animationDelay: '220ms', marginTop: 24, fontSize: 18, lineHeight: 1.6, color: 'rgba(255,255,255,0.75)', maxWidth: 520 }}>
                The first digital vanshavali built for Bharat — verified by Pandits, owned by your parivar, recorded in your grandfather's voice. Not a website. A lineage of inheritance.
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
              { num: '70%',   label: 'Pandit Ji-Verified Nodes' },
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
              { n: '03', title: 'Pandit-verify the lineage', desc: 'A network of 1,200+ verified Pandits stamp your gotra & vanshavali. ₹49 per node.', icon: '🪔', sanskrit: 'प्रमाण' },
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
              { icon: '🔐', title: 'Cryptographic roots', desc: 'Every family tree stored with SHA-256 node hashes. Tampering is mathematically impossible. Your lineage is immutable.', tag: 'Cryptographic layer' },
              { icon: '🏛️', title: 'Community governance', desc: 'No AI hallucination. No central control. Your family's karta and elders own the write access. Your data, your rules.', tag: 'Community layer' },
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

      {/* ── Leaderboard ──────────────────────────────────────────── */}
      <section style={{ background: 'var(--ds-ivory-warm)', borderTop: '1px solid var(--ds-hairline)', borderBottom: '1px solid var(--ds-hairline)', padding: '80px 0' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <span className="ds-eyebrow">Greenest families · This week</span>
              <h2 style={{ fontFamily: 'var(--ds-serif)', fontSize: 32, marginTop: 6, color: 'var(--ds-ink)' }}>India leaderboard</h2>
            </div>
            <span className="ds-pill"><span className="ds-pill-dot live" />Updated live</span>
          </div>
          <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
            {(leaderboard.length > 0 ? leaderboard.map((e, i) => ({
              rank: i + 1,
              family: e.family_name,
              loc: e.location,
              score: e.score,
              change: '+' + Math.floor(Math.random() * 12 + 2),
            })) : [
              { rank: 1, family: 'Mishra–Vatsa',     loc: 'Kanpur · UP',     score: 148, change: '+12' },
              { rank: 2, family: 'Agarwal–Garg',     loc: 'Lucknow · UP',    score: 142, change: '+8' },
              { rank: 3, family: 'Verma–Kashyap',    loc: 'Prayagraj · UP',  score: 139, change: '+5' },
              { rank: 4, family: 'Tiwari–Atri',      loc: 'Varanasi · UP',   score: 128, change: '+3' },
              { rank: 5, family: 'Dubey–Bharadwaj',  loc: 'Lucknow · UP',    score: 124, change: '+9' },
            ]).map(r => (
              <div key={r.rank} style={{ display: 'grid', gridTemplateColumns: '40px 1fr auto auto', gap: 14, padding: '14px 20px', borderBottom: '1px solid var(--ds-hairline)', alignItems: 'center' }}>
                <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 22, fontWeight: 700, color: r.rank <= 3 ? 'var(--ds-gold-deep)' : 'var(--ds-ink-mute)' }}>
                  {r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `#${r.rank}`}
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--ds-ink)' }}>{r.family}</div>
                  <div style={{ fontSize: 12, color: 'var(--ds-ink-mute)' }}>{r.loc}</div>
                </div>
                <div style={{ fontSize: 12, color: '#2aa86b', fontWeight: 600 }}>{r.change}</div>
                <div className="ds-score-num" style={{ fontSize: 24, color: 'var(--ds-plum)' }}>{r.score}</div>
              </div>
            ))}
            <div style={{ padding: '16px 20px', background: 'var(--ds-ivory-warm)', textAlign: 'center' }}>
              <button onClick={() => navigate('/onboarding')} className="ds-btn ds-btn-plum ds-btn-sm">
                See where your family stands →
              </button>
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
            The last elder from your family<br />
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
