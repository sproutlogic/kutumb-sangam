import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Leaf, Heart, TreePine, ChevronDown } from 'lucide-react';
import { fetchLeaderboard, type LeaderboardEntry } from '@/services/api';
import { MovementBelief } from '@/components/prakriti/MovementBelief';

function shortRegionLabel(region: string): string {
  const parts = region.trim().split(/\s+/);
  if (parts.length >= 2) return parts.map((p) => p[0]).join('').toUpperCase();
  if (region.length <= 4) return region.toUpperCase();
  return region.slice(0, 3).toUpperCase();
}

const Landing = () => {
  const navigate = useNavigate();
  const [surname, setSurname] = useState('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [scoreCardCity, setScoreCardCity] = useState('Kanpur');
  const [scoreCardRegion, setScoreCardRegion] = useState('Uttar Pradesh');
  const [scoreCardRankCity, setScoreCardRankCity] = useState(
    () => Math.floor(Math.random() * 141) + 5,
  );
  const [scoreCardRankState, setScoreCardRankState] = useState(
    () => Math.floor(Math.random() * 651) + 28,
  );

  useEffect(() => {
    fetchLeaderboard(undefined, 5).then(setLeaderboard);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    fetch('https://get.geojs.io/v1/ip/geo.json', { signal: ac.signal })
      .then((r) => r.json())
      .then((data: { city?: string; region?: string }) => {
        if (typeof data.city === 'string' && data.city.trim()) {
          setScoreCardCity(data.city.trim());
        }
        if (typeof data.region === 'string' && data.region.trim()) {
          setScoreCardRegion(data.region.trim());
        }
        setScoreCardRankCity(Math.floor(Math.random() * 141) + 5);
        setScoreCardRankState(Math.floor(Math.random() * 651) + 28);
      })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  const handleClaim = () => {
    const q = surname.trim() ? `?surname=${encodeURIComponent(surname.trim())}` : '';
    navigate(`/onboarding${q}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Nav ────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 py-4 bg-background/80 backdrop-blur-md border-b border-border/40">
        <a href="https://ecotech.co.in" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-xl font-heading font-bold text-primary">Prakriti</span>
          <span className="text-xs tracking-[0.15em] uppercase text-muted-foreground font-body">by Aarush</span>
        </a>
        <div className="hidden sm:flex items-center text-xs font-body text-muted-foreground">
          <span>Welcome to fastest growing family network</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/signin')}
            className="px-4 py-2 text-sm font-semibold font-body text-foreground hover:text-primary transition-colors"
          >
            Sign In
          </button>
          <button
            onClick={() => navigate('/onboarding')}
            className="px-5 py-2 rounded-lg gradient-hero text-primary-foreground text-sm font-semibold font-body shadow-warm hover:opacity-90 transition-opacity"
          >
            Claim Free
          </button>
        </div>
      </nav>

      {/* ── Hero — The Claim ────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden gradient-hero text-primary-foreground pt-[65px]">
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: `radial-gradient(circle at 20% 30%, white 0%, transparent 50%),
                            radial-gradient(circle at 80% 70%, white 0%, transparent 50%)`
        }} />
        <div className="absolute inset-0 flex items-end justify-center opacity-[0.07] pointer-events-none">
          <svg viewBox="0 0 600 400" className="w-full max-w-4xl" fill="currentColor">
            <path d="M300 30 C280 60 240 90 200 130 C160 170 120 200 100 250 C80 300 70 340 80 380 L520 380 C530 340 520 300 500 250 C480 200 440 170 400 130 C360 90 320 60 300 30Z" />
            <rect x="285" y="280" width="30" height="100" rx="5" />
            <path d="M150 200 C130 160 110 140 80 120 C110 140 130 160 150 200Z" />
            <path d="M450 200 C470 160 490 140 520 120 C490 140 470 160 450 200Z" />
          </svg>
        </div>

        <div className="container relative text-center px-6 py-20 max-w-3xl mx-auto">
          <div className="inline-block px-6 py-3 rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 backdrop-blur-sm mb-8 animate-fade-in">
            <p className="font-heading text-2xl md:text-3xl font-bold tracking-wider text-primary-foreground/90 mb-1">
              वसुधैव कुटुम्बकम्
            </p>
            <p className="text-sm text-primary-foreground/70 font-body italic tracking-wide">Every family a forest.</p>
          </div>

          <h1 className="font-heading text-4xl md:text-6xl font-bold leading-tight mb-4 animate-fade-in" style={{ animationDelay: '100ms' }}>
            Your family's Prakriti Score —<br />
            <span className="text-gold">claimed or unclaimed.</span>
          </h1>

          <p className="text-lg md:text-xl opacity-80 max-w-xl mx-auto mb-10 font-body leading-relaxed animate-fade-in" style={{ animationDelay: '200ms' }}>
            Har parivar ek vriksh hai
            <br />
            Kya aapka vriksh dikhta hai?
          </p>

          {/* Surname + Gotra input */}
          <div className="bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 rounded-2xl p-6 max-w-md mx-auto mb-6 animate-fade-in" style={{ animationDelay: '300ms' }}>
            <p className="text-sm font-body text-primary-foreground/70 mb-3">Enter your family name to check your Prakriti →</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={surname}
                onChange={e => setSurname(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleClaim()}
                placeholder="Your surname (e.g. Sharma)"
                className="flex-1 px-4 py-3 rounded-xl bg-primary-foreground/20 border border-primary-foreground/30 text-primary-foreground placeholder:text-primary-foreground/40 font-body text-sm focus:outline-none focus:border-primary-foreground/60"
              />
              <button
                onClick={handleClaim}
                className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold font-body text-sm transition-all hover:-translate-y-0.5 shadow-lg whitespace-nowrap"
              >
                Check →
              </button>
            </div>
            <p className="text-xs font-body text-primary-foreground/50 mt-2">
              Founding Family status — free, forever · No credit card
            </p>
          </div>

          <button
            onClick={() => navigate('/onboarding')}
            className="shimmer px-8 py-4 rounded-xl gradient-gold text-white font-semibold font-body text-lg shadow-gold hover:opacity-90 transition-all hover:-translate-y-0.5 animate-fade-in"
            style={{ animationDelay: '400ms' }}
          >
            Claim your family's Prakriti — free
          </button>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 opacity-40 animate-bounce">
            <span className="text-xs font-body tracking-widest uppercase">Explore</span>
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
      </section>

      <div className="gold-line" />

      {/* ── Recognised & Supported By ───────────────────────────────── */}
      <section className="bg-white border-b border-border/40 py-6">
        <div className="w-full px-6">
          <p className="text-center text-[10px] font-semibold font-body tracking-[0.25em] uppercase text-muted-foreground mb-5">
            Recognised &amp; Supported By
          </p>
          <div className="flex items-center justify-between w-full">
            {[
              { src: '/logo-SIL-by-Citi.webp',     alt: 'Startup India Lab by Citi' },
              { src: '/logo-startup-india.webp',   alt: 'Startup India — DPIIT Recognised' },
              { src: '/logo-SIIC-iit-kanpur.webp', alt: 'SIIC IIT Kanpur — Incubated Startup' },
              { src: '/logo-start-in-up.webp',     alt: 'Start in UP — Govt. of Uttar Pradesh' },
              { src: '/logo-AIIDE-Coe.webp',       alt: 'AIIDE Centre of Excellence' },
            ].map(({ src, alt }) => (
              <div key={src} className="flex-1 flex items-center justify-center px-4 py-2">
                <img src={src} alt={alt} className="h-12 w-full object-contain" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="gold-line" />

      {/* ── Score Card Preview — Show Don't Tell ────────────────────── */}
      <section className="container py-16 md:py-20 px-6">
        <div className="text-center mb-10">
          <p className="text-xs font-body tracking-[0.3em] uppercase text-muted-foreground mb-3">Your family's identity score</p>
          <h2 className="font-heading text-2xl md:text-3xl font-bold mb-3">What is a Prakriti Score?</h2>
          <p className="text-muted-foreground font-body max-w-xl mx-auto">
            Tree depth + eco-actions + Pandit-verified ceremonies + Smriti recordings — your family's living score.
          </p>
        </div>

        {/* Static sample score card */}
        <div className="max-w-sm mx-auto">
          <div className="rounded-2xl border border-border/60 bg-card shadow-elevated overflow-hidden">
            <div className="gradient-hero text-primary-foreground p-6 text-center">
              <p className="text-xs font-body tracking-[0.2em] uppercase opacity-70 mb-1">Prakriti Score</p>
              <p className="font-heading text-6xl font-bold mb-1">78</p>
              <p className="text-sm font-body opacity-80">
                Higher than 71% of families in {scoreCardRegion}
              </p>
              <p className="text-xs font-body opacity-60 mt-1">
                #{scoreCardRankCity} in {scoreCardCity} · #{scoreCardRankState} in{' '}
                {shortRegionLabel(scoreCardRegion)}
              </p>
            </div>
            <div className="p-4 grid grid-cols-4 gap-2 text-center text-xs font-body">
              {[
                { label: 'Tree Depth', val: '4 gen', icon: '🌳' },
                { label: 'Eco-Actions', val: '23', icon: '🌱' },
                { label: 'Ceremonies', val: '6', icon: '🪔' },
                { label: 'Smriti', val: '2 rec', icon: '🎙️' },
              ].map(({ label, val, icon }) => (
                <div key={label} className="bg-secondary/40 rounded-lg p-2">
                  <p className="text-base mb-0.5">{icon}</p>
                  <p className="font-semibold text-foreground">{val}</p>
                  <p className="text-muted-foreground leading-tight">{label}</p>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4">
              <button
                onClick={() => navigate('/onboarding')}
                className="w-full py-3 rounded-xl gradient-hero text-primary-foreground font-semibold font-body text-sm hover:opacity-90 transition-opacity"
              >
                See what your family scores →
              </button>
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground font-body mt-3 italic">Sample score — claim yours free</p>
        </div>
      </section>

      <div className="gold-line" />

      {/* ── Leaderboard Preview — The FOMO ──────────────────────────── */}
      <section className="bg-secondary/30 border-y border-border/50 py-16 px-6">
        <div className="container max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <p className="text-xs font-body tracking-[0.3em] uppercase text-muted-foreground mb-3">Weekly event — updated every Monday</p>
            <h2 className="font-heading text-2xl md:text-3xl font-bold mb-2">India's greenest families this week</h2>
            <p className="text-muted-foreground font-body text-sm">Where does yours stand?</p>
          </div>

          <div className="space-y-3 mb-6">
            {leaderboard.length > 0 ? leaderboard.map((entry, i) => (
              <div key={entry.vansha_id} className={`flex items-center gap-4 bg-card rounded-xl px-4 py-3 border border-border/50 ${i === 0 ? 'ring-2 ring-amber-400/50' : ''}`}>
                <span className="w-7 text-center font-heading font-bold text-lg text-muted-foreground">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold font-body text-sm truncate">{entry.family_name}</p>
                  <p className="text-xs text-muted-foreground font-body">{entry.location}</p>
                </div>
                <span className="font-heading font-bold text-primary text-lg">{entry.score}</span>
              </div>
            )) : (
              /* Placeholder while loading */
              [['Sharma–Kashyap', 'Kanpur, UP', 142], ['Gupta–Shandilya', 'Lucknow, UP', 138], ['Verma–Bharadwaj', 'Prayagraj, UP', 127]].map(([name, loc, score], i) => (
                <div key={i} className={`flex items-center gap-4 bg-card rounded-xl px-4 py-3 border border-border/50 ${i === 0 ? 'ring-2 ring-amber-400/50' : ''}`}>
                  <span className="w-7 text-center font-heading font-bold text-lg text-muted-foreground">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold font-body text-sm">{name}</p>
                    <p className="text-xs text-muted-foreground font-body">{loc}</p>
                  </div>
                  <span className="font-heading font-bold text-primary text-lg">{score}</span>
                </div>
              ))
            )}
            {/* Blurred rows hinting at more */}
            <div className="flex items-center gap-4 bg-card rounded-xl px-4 py-3 border border-border/50 blur-[3px] select-none pointer-events-none">
              <span className="w-7 text-center font-heading font-bold text-lg text-muted-foreground">#4</span>
              <div className="flex-1">
                <p className="font-semibold font-body text-sm">████████ family</p>
                <p className="text-xs text-muted-foreground font-body">██████, UP</p>
              </div>
              <span className="font-heading font-bold text-primary text-lg">███</span>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground font-body mb-4">Sign up to see your gotra's rank</p>
          <div className="text-center">
            <button
              onClick={() => navigate('/onboarding')}
              className="px-8 py-3 rounded-xl gradient-hero text-primary-foreground font-semibold font-body hover:opacity-90 transition-opacity"
            >
              Where does your family stand?
            </button>
          </div>
        </div>
      </section>

      <div className="gold-line" />

      {/* ── How It Works — 3 Steps ──────────────────────────────────── */}
      <section className="container py-16 md:py-20 px-6">
        <div className="text-center mb-10">
          <p className="text-xs font-body tracking-[0.3em] uppercase text-muted-foreground mb-3">Simple. Permanent. Yours.</p>
          <h2 className="font-heading text-2xl md:text-3xl font-bold">Three steps to your family's Prakriti</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-3xl mx-auto">
          {[
            { icon: TreePine, step: '01', title: 'Build your Banyan tree', desc: 'Ancestors as roots. Your generation as branches. New births as flowers. Roots first.' },
            { icon: Leaf,     step: '02', title: 'Log your eco-actions', desc: 'Plant a tree. Run a drive. Get peer-vouched. Your Prakriti Score rises with every act.' },
            { icon: Heart,    step: '03', title: 'Share your Score Card', desc: 'One tap to WhatsApp. Your family\'s identity, visible to the world and to kin searching for you.' },
          ].map(({ icon: Icon, step, title, desc }, i) => (
            <div key={i} className="text-center animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-4">
                <Icon className="w-7 h-7 text-primary-foreground" />
              </div>
              <p className="text-xs font-body tracking-[0.2em] uppercase text-muted-foreground mb-1">{step}</p>
              <h3 className="font-heading font-semibold text-lg mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground font-body leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="gold-line" />

      {/* ── Prakriti Smriti — Urgency Hook ──────────────────────────── */}
      <section className="bg-stone-950 text-stone-100 py-16 px-6 text-center">
        <p className="text-xs font-body tracking-[0.3em] uppercase text-stone-500 mb-4">Prakriti Smriti</p>
        <h2 className="font-heading text-2xl md:text-4xl font-bold mb-4 max-w-2xl mx-auto leading-snug">
          Ghar ke buzurg, parivar ki jad hote hain
        </h2>
        <p className="text-stone-300 font-body text-base md:text-lg max-w-xl mx-auto mb-3">
          Unki yaadein aur baatein
          <br />
          agli peedhi ke liye amulya hoti hain
        </p>
        <p className="text-stone-500 font-body text-sm italic max-w-md mx-auto mb-8">
          Voice. Stories. Blessing. In their language. their voice For your grandchildren and the coming generations
        </p>
        <button
          onClick={() => navigate('/onboarding')}
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold font-body text-lg transition-all hover:-translate-y-0.5 shadow-lg"
        >
          🎙️ Start recording — free
        </button>
      </section>

      <div className="gold-line" />

      {/* ── Ecosystem — Trust Signals ────────────────────────────────── */}
      <section className="container py-16 px-6">
        <div className="text-center mb-10">
          <p className="text-xs font-body tracking-[0.3em] uppercase text-muted-foreground mb-3">The Prakriti Ecosystem</p>
          <h2 className="font-heading text-2xl md:text-3xl font-bold">Built on community trust</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
          {[
            { icon: '🛕', title: 'Mandir Mitra', desc: '5 temples. 10,000 families. Your ceremony logged in real time.' },
            { icon: '🙏', title: 'Prakriti Margdarshak', desc: '25 Pandits logging ceremonies. Your Prakriti rises with every ritual.' },
            { icon: '👴', title: 'Parivar Pramukh', desc: 'Respected elders earning with their community. 25% commission, auto-paid.' },
          ].map(({ icon, title, desc }, i) => (
            <div key={i} className="bg-card rounded-2xl p-6 border border-border/50 shadow-card text-center animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
              <p className="text-3xl mb-3">{icon}</p>
              <h3 className="font-heading font-semibold text-base mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground font-body leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Founding Belief — Full Width POV ────────────────────────── */}
      <MovementBelief variant="soft" />

      {/* ── Final CTA — The Fear Close ───────────────────────────────── */}
      <section className="gradient-hero text-primary-foreground">
        <div className="gold-line opacity-50" />
        <div className="container py-20 md:py-28 text-center px-6">
          <p className="text-primary-foreground/60 font-body tracking-[0.3em] uppercase text-xs mb-4">Before the forest falls</p>
          <h2 className="font-heading text-3xl md:text-5xl font-bold mb-6 max-w-2xl mx-auto leading-snug">
            The last elder from your family<br />
            has already left us.<br />
            <span className="text-gold">Don't let the next one go unrecorded.</span>
          </h2>
          <p className="text-primary-foreground/70 font-body text-lg mb-10 max-w-xl mx-auto">
            Founding Family status — free, forever. No credit card.
          </p>
          <button
            onClick={() => navigate('/onboarding')}
            className="shimmer px-10 py-4 rounded-xl gradient-gold text-white font-semibold font-body text-lg shadow-gold hover:opacity-90 transition-all"
          >
            🌱 Plant your family's first root — free
          </button>
          <div className="mt-4">
            <button
              onClick={() => navigate('/code')}
              className="text-sm text-primary-foreground/40 hover:text-primary-foreground/70 transition-colors font-body"
            >
              Have an invite code? →
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 bg-background">
        <div className="container text-center text-sm text-muted-foreground font-body">
          <p className="font-heading font-semibold text-foreground mb-1">Prakriti by Aarush Eco Tech</p>
          <p className="text-xs opacity-70 mb-3">prakriti.ecotech.co.in</p>
          <div className="flex justify-center gap-6 text-xs mb-3">
            <button onClick={() => navigate('/signin')} className="hover:text-foreground transition-colors">Sign In</button>
            <a href="https://ecotech.co.in" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">About</a>
          </div>
          <p>© {new Date().getFullYear()} Aarush Eco Tech. All rights reserved.</p>
          <p className="mt-2 text-xs italic opacity-70">वसुधैव कुटुम्बकम् — The world is one family.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
