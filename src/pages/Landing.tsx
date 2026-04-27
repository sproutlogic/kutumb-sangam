import { useNavigate } from 'react-router-dom';
import { Leaf, Clock, Globe2, Heart, TreePine, Sun, Droplets, Wind } from 'lucide-react';

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Top Nav ───────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 py-4 bg-background/80 backdrop-blur-md border-b border-border/40">
        <a href="https://ecotech.co.in" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-xl font-heading font-bold text-primary">Prakriti</span>
          <span className="text-xs tracking-[0.15em] uppercase text-muted-foreground font-body">by Aarush</span>
        </a>
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
            Join Free
          </button>
        </div>
      </nav>

      {/* ── Hero: Vasudhaiv Kutumbakam ────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden gradient-hero text-primary-foreground pt-16">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: `radial-gradient(circle at 20% 30%, white 0%, transparent 50%),
                            radial-gradient(circle at 80% 70%, white 0%, transparent 50%)`
        }} />
        {/* Large banyan silhouette */}
        <div className="absolute inset-0 flex items-end justify-center opacity-[0.05] pointer-events-none">
          <svg viewBox="0 0 600 400" className="w-full max-w-4xl" fill="currentColor">
            <path d="M300 30 C280 60 240 90 200 130 C160 170 120 200 100 250 C80 300 70 340 80 380 L520 380 C530 340 520 300 500 250 C480 200 440 170 400 130 C360 90 320 60 300 30Z" />
            <rect x="285" y="280" width="30" height="100" rx="5" />
            <ellipse cx="200" cy="380" rx="30" ry="8" opacity="0.4" />
            <ellipse cx="400" cy="380" rx="30" ry="8" opacity="0.4" />
            <path d="M150 200 C130 160 110 140 80 120 C110 140 130 160 150 200Z" />
            <path d="M450 200 C470 160 490 140 520 120 C490 140 470 160 450 200Z" />
          </svg>
        </div>

        <div className="container relative text-center px-6 py-20">
          {/* Shloka */}
          <div className="inline-block px-6 py-3 rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 backdrop-blur-sm mb-8 animate-fade-in">
            <p className="font-heading text-2xl md:text-3xl font-bold tracking-wider text-primary-foreground/90 mb-1">
              वसुधैव कुटुम्बकम्
            </p>
            <p className="text-sm text-primary-foreground/70 font-body italic tracking-wide">
              Vasudhaiv Kutumbakam
            </p>
          </div>

          <h1 className="font-heading text-4xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6 max-w-4xl mx-auto animate-fade-in" style={{ animationDelay: '100ms' }}>
            The World Is<br />
            <span className="text-gold">One Family</span>
          </h1>

          <p className="text-lg md:text-xl opacity-80 max-w-2xl mx-auto mb-4 font-body leading-relaxed animate-fade-in" style={{ animationDelay: '200ms' }}>
            Build your <strong>Harit Vanshavali</strong> — your family's green legacy across generations.
            Earn Eco-Sewa Credits, earn your Prakriti Score, and preserve what matters most.
          </p>
          <p className="text-base md:text-lg opacity-60 max-w-xl mx-auto mb-10 font-body italic animate-fade-in" style={{ animationDelay: '250ms' }}>
            "One who is rooted in the self, sees all beings as kin, and the world as one home."
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in" style={{ animationDelay: '300ms' }}>
            <button
              onClick={() => navigate('/onboarding')}
              className="shimmer px-8 py-4 rounded-xl gradient-gold text-white font-semibold font-body text-lg shadow-gold hover:opacity-90 transition-all hover:-translate-y-0.5"
            >
              Start Your Green Journey
            </button>
            <button
              onClick={() => navigate('/signin')}
              className="px-8 py-4 rounded-xl border border-primary-foreground/30 text-primary-foreground font-semibold font-body text-lg hover:bg-primary-foreground/10 transition-all backdrop-blur-sm"
            >
              Sign In
            </button>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 opacity-40 animate-bounce">
            <span className="text-xs font-body tracking-widest uppercase">Explore</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </section>

      {/* Gold separator */}
      <div className="gold-line" />

      {/* ── Recognised & Supported By ─────────────────────────────── */}
      <section className="bg-secondary/20 border-b border-border/40 py-6">
        <div className="container px-6">
          <p className="text-center text-[10px] font-semibold font-body tracking-[0.25em] uppercase text-muted-foreground mb-5">
            Recognised &amp; Supported By
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
            {/* Startup India */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card shadow-sm">
                <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none" aria-hidden="true">
                  <circle cx="16" cy="16" r="15" fill="#FF671F"/>
                  <path d="M10 22 Q16 8 22 22" stroke="white" strokeWidth="2" fill="none"/>
                  <circle cx="16" cy="11" r="2" fill="white"/>
                </svg>
                <div>
                  <p className="text-xs font-bold font-body text-foreground leading-tight">Startup India</p>
                  <p className="text-[9px] text-muted-foreground font-body">DPIIT Recognised</p>
                </div>
              </div>
            </div>
            {/* IIT Kanpur SIIC */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card shadow-sm">
                <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary font-bold text-[10px] font-body">IIT</span>
                </div>
                <div>
                  <p className="text-xs font-bold font-body text-foreground leading-tight">IIT Kanpur SIIC</p>
                  <p className="text-[9px] text-muted-foreground font-body">Incubated Startup</p>
                </div>
              </div>
            </div>
            {/* MSME */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card shadow-sm">
                <div className="w-7 h-7 rounded bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center flex-shrink-0">
                  <span className="text-emerald-700 dark:text-emerald-300 font-bold text-[9px] font-body">GOI</span>
                </div>
                <div>
                  <p className="text-xs font-bold font-body text-foreground leading-tight">MSME Certified</p>
                  <p className="text-[9px] text-muted-foreground font-body">Govt. of India</p>
                </div>
              </div>
            </div>
            {/* Aarush Eco Tech */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 shadow-sm">
                <Leaf className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="text-xs font-bold font-body text-emerald-800 dark:text-emerald-200 leading-tight">Aarush Eco Tech</p>
                  <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-body">ecotech.co.in</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── The Vision ────────────────────────────────────────────── */}
      <section className="container py-20 md:py-28 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs tracking-[0.2em] uppercase font-body mb-6">
            <Globe2 className="w-3.5 h-3.5" />
            The Vision
          </div>
          <h2 className="font-heading text-3xl md:text-4xl font-bold mb-6">
            Why Vasudhaiv Kutumbakam Matters Now More Than Ever
          </h2>
          <p className="text-muted-foreground font-body text-lg leading-relaxed mb-6">
            In an age of fragmentation — where borders divide, screens disconnect, and communities scatter —
            the ancient wisdom of Vasudhaiv Kutumbakam calls us back to our deepest truth:
            <strong className="text-foreground"> we are all one family</strong>.
          </p>
          <p className="text-muted-foreground font-body text-lg leading-relaxed mb-6">
            This isn't merely a philosophical ideal. It is a living practice — a way of seeing every
            neighbour as kin, every stranger as cousin, every community as an extension of your own
            family tree rooted in the same soil.
          </p>
          <p className="text-muted-foreground font-body text-lg leading-relaxed">
            Prakriti by Aarush Eco Tech exists to make this vision tangible — through your Harit Vanshavali, Eco-Sewa Credits, and Prakriti Score. Discover, reconnect, and nurture the invisible threads that bind you to the great human family, starting with your own.
          </p>
        </div>
      </section>

      <div className="gold-line" />

      {/* ── Nature & Environment ──────────────────────────────────── */}
      <section className="bg-secondary/30 border-y border-border/50">
        <div className="container py-20 md:py-28 px-6">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 text-xs tracking-[0.2em] uppercase font-body mb-6">
              <Leaf className="w-3.5 h-3.5" />
              Nature & Environment
            </div>
            <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4">
              Earth Is Our Shared Home
            </h2>
            <p className="text-muted-foreground font-body max-w-2xl mx-auto">
              Vasudhaiv Kutumbakam begins with the recognition that we do not merely live
              <em> on</em> Earth — we live <em>as</em> Earth. Our family cannot thrive when the
              planet suffers.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Leaf,
                color: 'text-green-600',
                bg: 'bg-green-50 dark:bg-green-950/30',
                title: 'Rooted in Nature',
                desc: 'Every family tree is a living metaphor. Like a banyan, our roots run deep into the earth — nourishing and nourished by the world around us.',
              },
              {
                icon: Droplets,
                color: 'text-blue-600',
                bg: 'bg-blue-50 dark:bg-blue-950/30',
                title: 'Shared Waters',
                desc: 'The rivers that sustained our ancestors flow through all of us. Environmental stewardship is not duty — it is family care at its grandest scale.',
              },
              {
                icon: Sun,
                color: 'text-amber-600',
                bg: 'bg-amber-50 dark:bg-amber-950/30',
                title: 'One Sun, One Sky',
                desc: 'The same sun that rises over your home rises over every home on Earth. Our fate is as shared as the light that sustains all life.',
              },
              {
                icon: Wind,
                color: 'text-purple-600',
                bg: 'bg-purple-50 dark:bg-purple-950/30',
                title: 'Breath of Life',
                desc: 'Every breath connects you to every living being. The air our grandparents breathed is the air our grandchildren will breathe.',
              },
            ].map((card, i) => (
              <div key={i} className={`rounded-2xl p-6 border border-border/40 animate-fade-in ${card.bg}`} style={{ animationDelay: `${i * 100}ms` }}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 bg-white dark:bg-card/50`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <h3 className="font-heading font-semibold text-lg mb-2">{card.title}</h3>
                <p className="text-sm text-muted-foreground font-body leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="gold-line" />

      {/* ── Time: The Most Precious Currency ─────────────────────── */}
      <section className="container py-20 md:py-28 px-6">
        <div className="grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs tracking-[0.2em] uppercase font-body mb-6">
              <Leaf className="w-3.5 h-3.5" />
              Eco-Sewa Exchange
            </div>
            <h2 className="font-heading text-3xl md:text-4xl font-bold mb-6">
              Eco-Service is the World's Most Precious Currency
            </h2>
            <p className="text-muted-foreground font-body text-lg leading-relaxed mb-5">
              Every hour of community service — tree planting, waste segregation, clean-up drives —
              earns you <strong className="text-foreground">Eco-Sewa Credits</strong>. Eco-activities earn a 1.5× bonus multiplier.
            </p>
            <p className="text-muted-foreground font-body text-lg leading-relaxed mb-5">
              Teaching, cooking, eldercare, repairs — all accepted in the <strong className="text-foreground">Eco-Sewa Exchange</strong>.
              Your family's Prakriti Score rises with every act of service.
            </p>
          </div>
          <div className="space-y-4">
            {[
              { icon: '🌱', title: 'Plant a tree at Van Mahotsav', credit: 'Earn 1.5× Eco-Sewa Credits' },
              { icon: '♻️', title: 'Run a waste segregation drive', credit: 'Earn 1.5× Eco-Sewa Credits' },
              { icon: '🎓', title: 'Teach a skill to the community', credit: 'Earn 1 Eco-Sewa Credit' },
              { icon: '🤝', title: 'Spend credits when you need help', credit: 'The family gives back' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4 bg-card rounded-xl p-4 border border-border/50 shadow-card animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
                <span className="text-3xl flex-shrink-0">{item.icon}</span>
                <div>
                  <p className="font-semibold font-body text-sm">{item.title}</p>
                  <p className="text-xs text-primary font-body font-medium">{item.credit}</p>
                </div>
              </div>
            ))}
            <button
              onClick={() => navigate('/onboarding')}
              className="w-full py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity"
            >
              Join the Eco-Sewa Exchange →
            </button>
          </div>
        </div>
      </section>

      <div className="gold-line" />

      {/* ── Family at the Core ────────────────────────────────────── */}
      <section className="bg-secondary/30 border-y border-border/50">
        <div className="container py-20 md:py-28 px-6">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs tracking-[0.2em] uppercase font-body mb-6">
              <Heart className="w-3.5 h-3.5" />
              The Role of Family
            </div>
            <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4">
              The Family is the First Circle of Kutumbakam
            </h2>
            <p className="text-muted-foreground font-body max-w-2xl mx-auto text-lg">
              You cannot love the world without first learning to love your family.
              The practice of Vasudhaiv Kutumbakam begins at home — in your vansha.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: TreePine,
                title: 'Build Your Harit Vanshavali',
                desc: 'Create your family\'s multi-generational environmental legacy. Trees planted, drives organised, Eco-Credits earned — all recorded in your Harit Vanshavali.',
              },
              {
                icon: Heart,
                title: 'Paryavaran Mitra Verified',
                desc: 'Eco-Ambassadors verify your ancestral data and lead Vriksha Pratishtha & Jal Puja ceremonies. Your lineage — authenticated, honoured, and green.',
              },
              {
                icon: Globe2,
                title: 'Connect Beyond Borders',
                desc: 'Discover relatives across cities, countries, and continents. The Kutumb Radar uncovers the invisible threads that connect you to kin worldwide.',
              },
            ].map((card, i) => (
              <div key={i} className="bg-card rounded-2xl p-8 border border-border/50 shadow-card hover:shadow-elevated hover:-translate-y-1 transition-all animate-fade-in" style={{ animationDelay: `${i * 120}ms` }}>
                <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center mb-5">
                  <card.icon className="w-6 h-6 text-primary-foreground" />
                </div>
                <h3 className="font-heading text-xl font-semibold mb-3">{card.title}</h3>
                <p className="text-muted-foreground font-body leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────── */}
      <section className="gradient-hero text-primary-foreground">
        <div className="gold-line opacity-50" />
        <div className="container py-20 md:py-28 text-center px-6">
          <p className="text-primary-foreground/60 font-body tracking-[0.3em] uppercase text-xs mb-4">Begin Today</p>
          <h2 className="font-heading text-3xl md:text-5xl font-bold mb-6 max-w-2xl mx-auto">
            Join the Family That Spans the World
          </h2>
          <p className="text-primary-foreground/70 font-body text-lg mb-10 max-w-xl mx-auto">
            Every family tree you build, every hour you share, every connection you discover —
            is Vasudhaiv Kutumbakam made real.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate('/onboarding')}
              className="shimmer px-10 py-4 rounded-xl gradient-gold text-white font-semibold font-body text-lg shadow-gold hover:opacity-90 transition-all"
            >
              Start Your Journey
            </button>
            <button
              onClick={() => navigate('/code')}
              className="px-10 py-4 rounded-xl border border-primary-foreground/30 text-primary-foreground font-semibold font-body text-lg hover:bg-primary-foreground/10 transition-all"
            >
              I Have an Invite Code
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 bg-background">
        <div className="container text-center text-sm text-muted-foreground font-body">
          <p className="font-heading font-semibold text-foreground mb-1">Prakriti by Aarush Eco Tech</p>
          <p className="text-xs opacity-70 mb-1">prakriti.ecotech.co.in</p>
          <p>© {new Date().getFullYear()} Aarush Eco Tech. All rights reserved.</p>
          <p className="mt-2 text-xs italic opacity-70">वसुधैव कुटुम्बकम् — The world is one family.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
