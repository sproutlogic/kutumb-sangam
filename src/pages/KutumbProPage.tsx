/**
 * KutumbProPage — Premium product homepage for Kutumb Pro Community OS.
 *
 * Full-page marketing experience. Sections:
 *   Hero → Core Benefits → Org Frameworks → Power Features → Who It's For → Access Form
 *
 * If kutumb_pro=true  → hero shows "Create / Manage Orgs" CTAs + footer CTA.
 * If kutumb_pro=false → hero + access form at bottom.
 */

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '@/components/shells/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { orgApi, type EnquiryPayload } from '@/services/orgApi';
import { toast } from '@/hooks/use-toast';
import { ORG_FRAMEWORKS, FRAMEWORK_ORDER, type FrameworkType } from '@/config/orgFrameworks.config';

const FRAMEWORK_BENEFITS: Record<FrameworkType, string[]> = {
  spiritual:  ['Seva coordination & booking', 'Devotee engagement tools', 'Punya credit system', 'Spiritual event calendar'],
  political:  ['Booth-level network management', 'Volunteer outreach tracking', 'Grievance mapping', 'Constituency event tools'],
  ngo:        ['Volunteer hour tracking', 'Beneficiary support workflows', 'Donor engagement layer', 'Impact credit system'],
  university: ['Alumni mentorship network', 'Merit-based recognition', 'Career & placement tools', 'Student council structure'],
  rwa:        ['Resident directory & invites', 'Maintenance request tracking', 'Community service board', 'Polls & announcements'],
  custom:     ['Fully custom role hierarchy', 'Define your own currency', 'Any use case supported', 'Start from scratch or template'],
};
import {
  Building2, Users, Layers, Coins, Star, ArrowRight,
  CheckCircle2, Send, Shield, Zap, Network, Award,
  Sparkles, Crown, BarChart3, MessageSquare, Key,
  LogIn, Globe, Lock,
} from 'lucide-react';

/* ─────────────────────────────────────────────
   DATA
───────────────────────────────────────────── */

const CORE_BENEFITS = [
  {
    icon: Layers,
    subtitle: '5-Tier Hierarchy',
    title: 'Your Community Structure',
    description:
      'Define your own roles — Acharya to Shishya, Chancellor to Scholar, President to Resident. Every org type ships dignified defaults that you can fully customise.',
  },
  {
    icon: Coins,
    subtitle: 'Org-Local Currency',
    title: 'Your Own Economy',
    description:
      'Issue Punya points, Seva credits, or Merit tokens within your community. Drive engagement, reward service, track contributions — all inside your org.',
  },
  {
    icon: Star,
    subtitle: 'Service Ratings',
    title: 'Trust & Reputation',
    description:
      'Members rate services and interactions within your org. Build a reputation layer that creates accountability and surfaces your best contributors.',
  },
];

const POWER_FEATURES = [
  { icon: Users,        title: 'Flexible Invitations',  desc: 'Invite by Kutumb ID or share an open link. Set approval flows for new member join requests.' },
  { icon: Network,      title: 'Multi-Org Networks',    desc: 'An individual can belong to multiple orgs simultaneously. Build federated community networks.' },
  { icon: BarChart3,    title: 'Org Analytics',         desc: 'Member engagement, service activity, and currency flows — visual dashboards built right in.' },
  { icon: Shield,       title: 'Permission Layers',     desc: 'Each tier carries configurable access. Granular controls for content, currency, and invites.' },
  { icon: MessageSquare,title: 'Org-Local Services',    desc: 'Publish services within your org. Members can request, rate, and pay in org currency.' },
  { icon: Globe,        title: 'Public Org Profiles',   desc: 'A public page for your org on the Kutumb network. Discoverable, trustworthy, permanent.' },
];

const PERSONAS = [
  { emoji: '🪔', title: 'Spiritual Leaders',    uses: ['Seva coordination', 'Devotee hierarchy', 'Ashram currency (Punya)'] },
  { emoji: '🏛️', title: 'Political Organisers', uses: ['Booth-level networks', 'Volunteer outreach', 'Grievance mapping'] },
  { emoji: '🤝', title: 'NGO Directors',        uses: ['Volunteer tracking', 'Beneficiary support', 'Donor engagement'] },
  { emoji: '🎓', title: 'Educational Leaders',  uses: ['Alumni networks', 'Mentorship layers', 'Merit recognition'] },
  { emoji: '🏘️', title: 'RWA Committees',       uses: ['Resident management', 'Maintenance coordination', 'Community services'] },
  { emoji: '✨', title: 'Any Org Leader',        uses: ['Custom structure', 'Custom currency', 'Your rules, your community'] },
];

/* ─────────────────────────────────────────────
   ENQUIRY FORM
───────────────────────────────────────────── */

function EnquiryForm({ dark = false }: { dark?: boolean }) {
  const { appUser } = useAuth();
  const [form, setForm] = useState<EnquiryPayload>({
    contact_name:     appUser?.full_name ?? '',
    contact_email:    '',
    contact_phone:    '',
    org_name:         '',
    framework_type:   'custom',
    org_description:  '',
    expected_members: undefined,
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading]     = useState(false);

  function set(key: keyof EnquiryPayload, val: string | number) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contact_name.trim() || !form.contact_email.trim() || !form.org_name.trim()) {
      toast({ title: 'Please fill in all required fields.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await orgApi.enquire(form);
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: 'Could not submit', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const inputCls = dark
    ? 'w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-body text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400/50 backdrop-blur-sm'
    : 'w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40';

  const labelCls = dark
    ? 'text-xs font-semibold font-body text-white/60 mb-1.5 block'
    : 'text-xs font-semibold font-body text-muted-foreground mb-1.5 block';

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-5 py-12 text-center">
        <div className="w-20 h-20 rounded-3xl gradient-gold flex items-center justify-center shadow-gold">
          <CheckCircle2 className="w-10 h-10 text-white" />
        </div>
        <h3 className={`font-heading text-2xl font-bold ${dark ? 'text-white' : ''}`}>
          Request received!
        </h3>
        <p className={`font-body max-w-sm text-sm leading-relaxed ${dark ? 'text-white/60' : 'text-muted-foreground'}`}>
          Our team will review your request and reach out within 48 hours.
          Once approved, you can create your organisation directly from this page.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Your name *</label>
          <input
            className={inputCls}
            value={form.contact_name}
            onChange={e => set('contact_name', e.target.value)}
            placeholder="Full name"
            required
          />
        </div>
        <div>
          <label className={labelCls}>Email *</label>
          <input
            type="email"
            className={inputCls}
            value={form.contact_email}
            onChange={e => set('contact_email', e.target.value)}
            placeholder="you@email.com"
            required
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Phone (optional)</label>
          <input
            className={inputCls}
            value={form.contact_phone}
            onChange={e => set('contact_phone', e.target.value)}
            placeholder="+91 98765 43210"
          />
        </div>
        <div>
          <label className={labelCls}>Expected members</label>
          <input
            type="number"
            min={1}
            className={inputCls}
            value={form.expected_members ?? ''}
            onChange={e => set('expected_members', parseInt(e.target.value) || 0)}
            placeholder="e.g. 150"
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Organisation name *</label>
        <input
          className={inputCls}
          value={form.org_name}
          onChange={e => set('org_name', e.target.value)}
          placeholder="e.g. Sunrise Welfare Trust"
          required
        />
      </div>

      <div>
        <label className={labelCls}>Organisation type *</label>
        <select
          className={inputCls}
          value={form.framework_type}
          onChange={e => set('framework_type', e.target.value)}
        >
          {FRAMEWORK_ORDER.map(ft => {
            const fw = ORG_FRAMEWORKS[ft];
            return (
              <option key={ft} value={ft}>
                {fw.emoji} {fw.label} — {fw.tagline}
              </option>
            );
          })}
        </select>
      </div>

      <div>
        <label className={labelCls}>Brief description (optional)</label>
        <textarea
          rows={3}
          className={inputCls + ' resize-none'}
          value={form.org_description}
          onChange={e => set('org_description', e.target.value)}
          placeholder="What does your organisation do? Who are your members?"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full gradient-gold text-white rounded-xl py-4 font-semibold font-body text-sm flex items-center justify-center gap-2 hover:opacity-90 transition shadow-gold disabled:opacity-60"
      >
        {loading
          ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Submitting…</>
          : <><Send className="w-4 h-4" /> Submit Access Request</>}
      </button>

      <p className={`text-center text-[11px] font-body ${dark ? 'text-white/40' : 'text-muted-foreground'}`}>
        No pricing commitments yet. Our team will reach out to understand your needs.
      </p>
    </form>
  );
}

/* ─────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────── */

const KutumbProPage = () => {
  const navigate   = useNavigate();
  const { appUser } = useAuth();
  const hasPro     = appUser?.kutumb_pro;
  const formRef    = useRef<HTMLDivElement>(null);

  function scrollToForm() {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <AppShell>
      {/* Full-width layout — AppShell main has no padding, so sections control their own */}
      <div className="min-h-screen overflow-x-hidden">

        {/* ══════════════════════════════════════
            HERO
        ══════════════════════════════════════ */}
        <section className="gradient-hero relative overflow-hidden">

          {/* Decorative rings */}
          <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
            <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full border border-white/[0.06]" />
            <div className="absolute -top-16 -right-16 w-[300px] h-[300px] rounded-full border border-white/[0.04]" />
            <div className="absolute top-1/2 -left-40 w-[400px] h-[400px] rounded-full border border-white/[0.04]" />
            {/* Vertical gold accent lines */}
            <div className="absolute bottom-0 left-[20%] w-px h-48 bg-gradient-to-t from-amber-400/0 via-amber-400/25 to-amber-400/0" />
            <div className="absolute bottom-0 left-[50%] w-px h-64 bg-gradient-to-t from-amber-400/0 via-amber-400/20 to-amber-400/0" />
            <div className="absolute bottom-0 left-[75%] w-px h-36 bg-gradient-to-t from-amber-400/0 via-amber-400/18 to-amber-400/0" />
            {/* Sanskrit watermark */}
            <div className="absolute -bottom-4 right-4 font-heading text-[120px] leading-none text-white/[0.03] select-none">
              कुटुम्बम्
            </div>
          </div>

          {/* ── Top nav strip ── */}
          <div className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5 max-w-7xl mx-auto">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 gradient-gold rounded-lg flex items-center justify-center shadow-gold">
                <Crown className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-white/90 font-heading text-lg font-semibold tracking-wide">Kutumb Pro</span>
              <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-body font-semibold tracking-widest border border-amber-400/30">
                COMMUNITY OS
              </span>
            </div>

            {/* Pro Login / Go to Dashboard */}
            {hasPro ? (
              <button
                onClick={() => navigate('/org/my')}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/[0.18] border border-white/20 text-white rounded-full px-5 py-2 text-sm font-body font-medium backdrop-blur-sm transition"
              >
                <LogIn className="w-3.5 h-3.5" />
                My Organisations
              </button>
            ) : (
              <button
                onClick={scrollToForm}
                className="flex items-center gap-2 gradient-gold text-white rounded-full px-5 py-2 text-sm font-body font-semibold shadow-gold hover:opacity-90 transition"
              >
                <Key className="w-3.5 h-3.5" />
                Get Access
              </button>
            )}
          </div>

          {/* ── Hero content ── */}
          <div className="relative z-10 px-6 md:px-10 pt-14 pb-20 text-center max-w-5xl mx-auto">
            <div className="inline-flex items-center gap-2 mb-7 px-4 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.15] backdrop-blur-sm">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-sm font-body font-medium text-white/80">Complete Operating System for Communities</span>
            </div>

            <h1 className="font-heading text-4xl sm:text-6xl md:text-7xl font-bold text-white leading-[1.05] mb-6">
              Run your community<br />
              <span
                className="text-transparent bg-clip-text"
                style={{ backgroundImage: 'linear-gradient(135deg, hsl(42 88% 56%), hsl(38 82% 70%))' }}
              >
                the dignified way
              </span>
            </h1>

            <div className="gold-line mx-auto mb-7" style={{ maxWidth: 80 }} />

            <p className="text-white/65 font-body text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-12">
              A complete operating system for spiritual organisations, political networks,
              NGOs, educational bodies, and resident welfare groups — built on the Kutumb ecosystem.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              {hasPro ? (
                <>
                  <button
                    onClick={() => navigate('/org/new')}
                    className="gradient-gold text-white rounded-2xl px-8 py-4 font-semibold font-body text-base flex items-center gap-2.5 shadow-gold hover:opacity-90 transition-all hover:-translate-y-0.5"
                  >
                    <Building2 className="w-5 h-5" />
                    Create Organisation
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate('/org/my')}
                    className="bg-white/10 hover:bg-white/[0.18] border border-white/25 text-white rounded-2xl px-8 py-4 font-semibold font-body text-base flex items-center gap-2.5 backdrop-blur-sm transition-all hover:-translate-y-0.5"
                  >
                    <Users className="w-5 h-5" />
                    My Organisations
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={scrollToForm}
                    className="gradient-gold text-white rounded-2xl px-8 py-4 font-semibold font-body text-base flex items-center gap-2.5 shadow-gold hover:opacity-90 transition-all hover:-translate-y-0.5 shimmer"
                  >
                    <Sparkles className="w-5 h-5" />
                    Request Access
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate('/org/join/code')}
                    className="bg-white/10 hover:bg-white/[0.18] border border-white/25 text-white rounded-2xl px-8 py-4 font-semibold font-body text-base flex items-center gap-2.5 backdrop-blur-sm transition-all hover:-translate-y-0.5"
                  >
                    <Key className="w-5 h-5" />
                    Join an Org
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── Stats strip ── */}
          <div className="relative z-10 border-t border-white/[0.10] bg-black/20 backdrop-blur-sm">
            <div className="max-w-5xl mx-auto px-6 py-6 grid grid-cols-2 md:grid-cols-4 divide-x divide-white/10">
              {[
                { number: '6',     label: 'Org Frameworks' },
                { number: '5',     label: 'Hierarchy Tiers' },
                { number: '6+',    label: 'Currency Types' },
                { number: '∞',     label: 'Members per Org' },
              ].map((stat, i) => (
                <div key={i} className="text-center px-4 py-1">
                  <div className="font-heading text-2xl md:text-3xl font-bold text-amber-400">{stat.number}</div>
                  <div className="text-white/50 font-body text-xs mt-0.5 tracking-wide">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════
            CORE BENEFITS
        ══════════════════════════════════════ */}
        <section className="py-24 px-6 md:px-10 bg-background">
          <div className="max-w-6xl mx-auto">

            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="text-sm font-body font-semibold text-primary">What you get</span>
              </div>
              <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4">
                Built for communities that<br />
                <span className="text-primary">take themselves seriously</span>
              </h2>
              <div className="gold-line mx-auto mb-5" style={{ maxWidth: 60 }} />
              <p className="text-muted-foreground font-body max-w-xl mx-auto leading-relaxed">
                Every feature is designed for the unique needs of Indian and South Asian community structures —
                with the dignity, hierarchy, and trust they deserve.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {CORE_BENEFITS.map((benefit, i) => (
                <div
                  key={i}
                  className="bg-card border border-border rounded-2xl p-8 shadow-card hover:shadow-elevated hover:-translate-y-1 transition-all duration-300 group"
                >
                  <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <benefit.icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="text-[11px] font-body font-bold text-amber-600 uppercase tracking-widest mb-2">
                    {benefit.subtitle}
                  </div>
                  <h3 className="font-heading text-xl font-bold mb-3">{benefit.title}</h3>
                  <p className="text-muted-foreground font-body text-sm leading-relaxed">{benefit.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════
            ORG FRAMEWORKS
        ══════════════════════════════════════ */}
        <section className="py-24 px-6 md:px-10" style={{ backgroundColor: 'hsl(290 18% 95%)' }}>
          <div className="max-w-6xl mx-auto">

            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                <Building2 className="w-3.5 h-3.5 text-primary" />
                <span className="text-sm font-body font-semibold text-primary">Org Frameworks</span>
              </div>
              <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4">
                One platform. Every community.
              </h2>
              <div className="gold-line mx-auto mb-5" style={{ maxWidth: 60 }} />
              <p className="text-muted-foreground font-body max-w-xl mx-auto leading-relaxed">
                Choose a dignified framework with pre-set titles, currency, and structure —
                then make every role name, tier, and token your own.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {FRAMEWORK_ORDER.map(ft => {
                const fw = ORG_FRAMEWORKS[ft];
                return (
                  <div
                    key={ft}
                    className="bg-card border border-border rounded-2xl p-6 shadow-card hover:shadow-elevated hover:-translate-y-1 transition-all duration-300 group flex flex-col"
                  >
                    {/* Header */}
                    <div className="flex items-start gap-4 mb-5">
                      <div className="w-12 h-12 gradient-hero rounded-xl flex items-center justify-center text-xl flex-shrink-0 group-hover:scale-105 transition-transform duration-300">
                        {fw.emoji}
                      </div>
                      <div>
                        <h3 className="font-heading font-bold text-base">{fw.label}</h3>
                        <p className="text-xs text-muted-foreground font-body mt-0.5">{fw.tagline}</p>
                      </div>
                    </div>

                    {/* Benefits */}
                    <ul className="mb-5 space-y-2">
                      {FRAMEWORK_BENEFITS[ft].map((benefit, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm font-body text-muted-foreground">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                          {benefit}
                        </li>
                      ))}
                    </ul>

                    {/* Currency */}
                    <div className="mt-auto pt-4 border-t border-border">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[10px] text-muted-foreground font-body uppercase tracking-widest">
                            Currency
                          </div>
                          <div className="text-sm font-body font-semibold text-foreground mt-0.5">
                            {fw.currencyEmoji} {fw.currencyName}
                          </div>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-body text-right max-w-[130px] italic leading-relaxed">
                          {fw.exampleUse}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════
            POWER FEATURES (dark gradient)
        ══════════════════════════════════════ */}
        <section className="py-24 px-6 md:px-10 gradient-hero relative overflow-hidden">

          {/* Background decorations */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-40 right-0 w-[500px] h-[500px] rounded-full bg-white/[0.02] translate-x-1/3" />
            <div className="absolute -bottom-40 left-0 w-[400px] h-[400px] rounded-full bg-white/[0.02] -translate-x-1/3" />
          </div>

          <div className="relative z-10 max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-sm font-body font-medium text-white/85">Platform Capabilities</span>
              </div>
              <h2 className="font-heading text-3xl md:text-4xl font-bold text-white mb-4">
                Everything your community<br />
                <span
                  className="text-transparent bg-clip-text"
                  style={{ backgroundImage: 'linear-gradient(135deg, hsl(42 88% 56%), hsl(38 82% 70%))' }}
                >
                  needs to operate
                </span>
              </h2>
              <div className="gold-line mx-auto mb-5" style={{ maxWidth: 60 }} />
              <p className="text-white/55 font-body max-w-xl mx-auto leading-relaxed">
                Kutumb Pro is not a directory. It's an operating system for your community —
                with tools for every layer of your structure.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {POWER_FEATURES.map((feature, i) => (
                <div
                  key={i}
                  className="bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 rounded-2xl p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 group"
                >
                  <div className="w-11 h-11 gradient-gold rounded-xl flex items-center justify-center mb-4 shadow-gold group-hover:scale-110 transition-transform duration-300">
                    <feature.icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="font-heading font-bold text-white text-base mb-2">{feature.title}</h3>
                  <p className="text-white/55 font-body text-sm leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════
            WHO IT'S FOR
        ══════════════════════════════════════ */}
        <section className="py-24 px-6 md:px-10 bg-background">
          <div className="max-w-6xl mx-auto">

            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                <Users className="w-3.5 h-3.5 text-primary" />
                <span className="text-sm font-body font-semibold text-primary">For Communities Like Yours</span>
              </div>
              <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4">
                If you lead a community,<br />
                <span className="text-primary">Kutumb Pro is for you</span>
              </h2>
              <div className="gold-line mx-auto" style={{ maxWidth: 60 }} />
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {PERSONAS.map((persona, i) => (
                <div
                  key={i}
                  className="bg-card border border-border rounded-2xl p-6 shadow-card hover:shadow-elevated hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="text-4xl mb-4 leading-none">{persona.emoji}</div>
                  <h3 className="font-heading font-bold text-base mb-4">{persona.title}</h3>
                  <ul className="space-y-2">
                    {persona.uses.map((use, j) => (
                      <li key={j} className="flex items-center gap-2.5 text-sm font-body text-muted-foreground">
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                        {use}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════
            ACCESS CTA / FORM
        ══════════════════════════════════════ */}
        <section ref={formRef} className="py-24 px-6 md:px-10 gradient-hero relative overflow-hidden">

          {/* Decorations */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-10 right-10 w-72 h-72 rounded-full bg-white/[0.02] border border-white/[0.06]" />
            <div className="absolute bottom-10 left-10 w-56 h-56 rounded-full bg-white/[0.02] border border-white/[0.06]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-white/[0.01] border border-white/[0.04]" />
          </div>

          <div className="relative z-10 max-w-2xl mx-auto">
            {hasPro ? (
              /* ── Pro user: Dashboard CTAs ── */
              <div className="text-center">
                <div className="w-20 h-20 gradient-gold rounded-3xl flex items-center justify-center mx-auto mb-7 shadow-gold">
                  <Crown className="w-10 h-10 text-white" />
                </div>
                <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-white/10 border border-white/20">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-sm font-body font-medium text-white/85">Pro Access Active</span>
                </div>
                <h2 className="font-heading text-3xl md:text-4xl font-bold text-white mb-4">
                  Kutumb Pro is Active
                </h2>
                <p className="text-white/60 font-body mb-10 leading-relaxed">
                  You have full access to create and manage organisations on the Kutumb network.
                  Build your community OS today.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    onClick={() => navigate('/org/new')}
                    className="gradient-gold text-white rounded-2xl px-8 py-4 font-semibold font-body text-base flex items-center gap-2.5 shadow-gold hover:opacity-90 transition-all hover:-translate-y-0.5"
                  >
                    <Building2 className="w-5 h-5" />
                    Create New Organisation
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate('/org/my')}
                    className="bg-white/10 hover:bg-white/[0.18] border border-white/25 text-white rounded-2xl px-8 py-4 font-semibold font-body text-base flex items-center gap-2.5 transition-all hover:-translate-y-0.5"
                  >
                    <Users className="w-5 h-5" />
                    My Organisations
                  </button>
                </div>
              </div>
            ) : (
              /* ── Non-pro user: Access form ── */
              <div className="bg-white/[0.07] backdrop-blur-xl border border-white/15 rounded-3xl p-8 md:p-10 shadow-warm">
                <div className="text-center mb-8">
                  <div className="w-16 h-16 gradient-gold rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-gold">
                    <Lock className="w-8 h-8 text-white" />
                  </div>
                  <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-white/10 border border-white/20">
                    <Award className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-sm font-body font-medium text-white/85">By Invitation Only</span>
                  </div>
                  <h2 className="font-heading text-2xl md:text-3xl font-bold text-white mb-3">
                    Request Access to Kutumb Pro
                  </h2>
                  <p className="text-white/55 font-body text-sm max-w-sm mx-auto leading-relaxed">
                    Kutumb Pro is curated and available by invitation. Tell us about your community
                    and our team will reach out within 48 hours.
                  </p>
                </div>

                <EnquiryForm dark />
              </div>
            )}
          </div>
        </section>

        {/* ══════════════════════════════════════
            FOOTER STRIP
        ══════════════════════════════════════ */}
        <div className="bg-foreground/[0.97] py-8 px-6 text-center">
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <div className="w-6 h-6 gradient-gold rounded-md flex items-center justify-center">
              <Crown className="w-3 h-3 text-white" />
            </div>
            <span className="font-heading font-semibold text-white text-base">Kutumb Pro</span>
            <span className="text-white/30 font-body text-sm">·</span>
            <span className="font-heading text-white/50 text-sm">Community OS</span>
          </div>
          <p className="text-white/35 font-body text-xs tracking-wide">
            वसुधैव कुटुम्बकम् — The world is one family
          </p>
        </div>

      </div>
    </AppShell>
  );
};

export default KutumbProPage;
