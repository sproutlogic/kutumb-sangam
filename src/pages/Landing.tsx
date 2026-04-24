import { useNavigate } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import { Shield, Users, ScrollText, Lock, Eye, Fingerprint, TreePine, UserPlus, ShieldCheck } from 'lucide-react';

const Landing = () => {
  const navigate = useNavigate();
  const { tr } = useLang();

  const features = [
    { icon: Shield, title: tr('featurePrivacy'), desc: tr('featurePrivacyDesc') },
    { icon: ScrollText, title: tr('featurePandit'), desc: tr('featurePanditDesc') },
    { icon: Users, title: tr('featureInvite'), desc: tr('featureInviteDesc') },
  ];

  const trustCards = [
    { icon: Lock, title: tr('trustCard1Title'), desc: tr('trustCard1Desc') },
    { icon: Fingerprint, title: tr('trustCard2Title'), desc: tr('trustCard2Desc') },
    { icon: Eye, title: tr('trustCard3Title'), desc: tr('trustCard3Desc') },
  ];

  const steps = [
    { num: '01', icon: TreePine, title: tr('step1Title'), desc: tr('step1Desc') },
    { num: '02', icon: UserPlus, title: tr('step2Title'), desc: tr('step2Desc') },
    { num: '03', icon: ShieldCheck, title: tr('step3Title'), desc: tr('step3Desc') },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden gradient-hero text-primary-foreground">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, rgba(255,255,255,0.2) 0%, transparent 60%)' }} />
        {/* Banyan tree SVG silhouette */}
        <div className="absolute inset-0 flex items-end justify-center opacity-[0.06] pointer-events-none">
          <svg viewBox="0 0 400 300" className="w-[600px] h-[450px]" fill="currentColor">
            <path d="M200 20 C200 20 160 60 140 100 C120 140 100 160 80 200 C60 240 50 260 60 280 L340 280 C350 260 340 240 320 200 C300 160 280 140 260 100 C240 60 200 20 200 20Z" />
            <rect x="185" y="200" width="30" height="80" rx="4" />
            <ellipse cx="130" cy="280" rx="20" ry="6" opacity="0.5" />
            <ellipse cx="270" cy="280" rx="20" ry="6" opacity="0.5" />
          </svg>
        </div>
        <div className="container relative py-24 md:py-36 text-center">
          {/* Premium eyebrow badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground/90 text-xs tracking-[0.25em] uppercase font-body mb-6 animate-fade-in backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-gold inline-block" />
            {tr('kutumbMap')}
          </div>
          <h1 className="font-heading text-4xl md:text-6xl font-bold leading-tight mb-6 max-w-3xl mx-auto animate-fade-in" style={{ animationDelay: '100ms' }}>
            {tr('tagline')}
          </h1>
          <p className="text-lg md:text-xl opacity-80 max-w-2xl mx-auto mb-10 font-body leading-relaxed animate-fade-in" style={{ animationDelay: '200ms' }}>
            {tr('heroSubtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in" style={{ animationDelay: '300ms' }}>
            <button
              onClick={() => navigate('/onboarding')}
              className="shimmer px-8 py-3.5 rounded-lg gradient-gold text-white font-semibold font-body shadow-gold hover:opacity-90 transition-all hover:-translate-y-0.5"
            >
              {tr('startTree')}
            </button>
            <button
              onClick={() => navigate('/code')}
              className="px-8 py-3.5 rounded-lg border border-primary-foreground/30 text-primary-foreground font-semibold font-body hover:bg-primary-foreground/10 transition-all backdrop-blur-sm"
            >
              {tr('haveCode')}
            </button>
          </div>
        </div>
      </section>

      {/* Gold separator line */}
      <div className="gold-line" />

      {/* Features */}
      <section className="container py-20 md:py-28">
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <div
              key={i}
              className="bg-card rounded-xl p-8 shadow-card hover:shadow-elevated transition-all hover:-translate-y-1 border border-border/50 animate-fade-in"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="w-12 h-12 rounded-lg gradient-hero flex items-center justify-center mb-5">
                <f.icon className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="font-heading text-xl font-semibold mb-3">{f.title}</h3>
              <p className="text-muted-foreground font-body leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Gold separator line */}
      <div className="gold-line" />

      {/* Trust & Security */}
      <section className="bg-secondary/30 border-y border-border/50">
        <div className="container py-20 md:py-28">
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-center mb-4">{tr('trustSecurityTitle')}</h2>
          <p className="text-muted-foreground font-body text-center mb-12 max-w-xl mx-auto">{tr('encryptedDesc')}</p>
          <div className="grid md:grid-cols-3 gap-8">
            {trustCards.map((c, i) => (
              <div key={i} className="bg-card rounded-xl p-8 shadow-card border border-border/50 text-center animate-fade-in" style={{ animationDelay: `${i * 120}ms` }}>
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
                  <c.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-heading text-lg font-semibold mb-3">{c.title}</h3>
                <p className="text-sm text-muted-foreground font-body leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="container py-20 md:py-28">
        <div className="text-center mb-12">
          <h2 className="font-heading text-3xl md:text-4xl font-bold">{tr('howItWorks')}</h2>
          <div className="gold-line mx-auto mt-4" style={{ maxWidth: '120px' }} />
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((s, i) => (
            <div key={i} className="text-center animate-fade-in" style={{ animationDelay: `${i * 150}ms` }}>
              <span className="text-5xl font-heading font-bold text-primary/15">{s.num}</span>
              <div className="w-14 h-14 rounded-xl gradient-hero flex items-center justify-center mx-auto mb-4 -mt-4 shadow-warm">
                <s.icon className="w-7 h-7 text-primary-foreground" />
              </div>
              <h3 className="font-heading text-xl font-semibold mb-2">{s.title}</h3>
              <p className="text-sm text-muted-foreground font-body leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Social Proof */}
      <section className="gradient-warm border-t border-border/50">
        <div className="gold-line opacity-80" />
        <div className="container py-16 text-center">
          <h2 className="font-heading text-2xl font-bold mb-2">{tr('socialProofTitle')}</h2>
          <div className="gold-line mx-auto mb-10" style={{ maxWidth: '80px' }} />
          <div className="flex flex-wrap justify-center gap-14">
            {[
              { value: tr('familiesCount'), label: tr('familiesLabel') },
              { value: tr('membersCount'), label: tr('membersLabel') },
              { value: tr('verificationsCount'), label: tr('verificationsLabel') },
            ].map((s, i) => (
              <div key={i} className="animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
                <p className="text-3xl md:text-4xl font-bold font-heading text-primary">{s.value}</p>
                {s.label && <p className="text-xs tracking-widest uppercase text-muted-foreground font-body mt-1">{s.label}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container text-center text-sm text-muted-foreground font-body">
          {tr('footerCopy')}
        </div>
      </footer>
    </div>
  );
};

export default Landing;
