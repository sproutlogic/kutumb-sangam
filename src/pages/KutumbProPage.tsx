/**
 * KutumbProPage — landing page for Kutumb Pro Community OS.
 *
 * If the user already has kutumb_pro=true  → show "Create / Manage orgs" CTA.
 * If not                                   → show features + "Request Access" enquiry form.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '@/components/shells/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { orgApi, type EnquiryPayload } from '@/services/orgApi';
import { toast } from '@/hooks/use-toast';
import { ORG_FRAMEWORKS, FRAMEWORK_ORDER } from '@/config/orgFrameworks.config';
import {
  Building2, Users, Layers, Coins, Star, ArrowRight,
  CheckCircle2, Send, ChevronDown, ChevronUp,
} from 'lucide-react';

/* ── Feature pills shown in hero ── */
const FEATURES = [
  { icon: Layers, text: '5-tier hierarchy with custom titles' },
  { icon: Users, text: 'Member invitation by ID or open link' },
  { icon: Coins, text: 'Org-local currency & credits' },
  { icon: Star, text: 'Service ratings within your org' },
  { icon: Building2, text: 'Works for temples, trusts, RWAs, parties & more' },
];

/* ── Enquiry form ── */
function EnquiryForm() {
  const { appUser } = useAuth();
  const [form, setForm] = useState<EnquiryPayload>({
    contact_name:    appUser?.full_name ?? '',
    contact_email:   '',
    contact_phone:   '',
    org_name:        '',
    framework_type:  'custom',
    org_description: '',
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

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <CheckCircle2 className="w-14 h-14 text-green-500" />
        <h3 className="font-heading text-xl font-bold">Request received!</h3>
        <p className="text-muted-foreground font-body max-w-sm text-sm">
          Our team will review your request and reach out within 2 business days.
          Once approved, you can create your organisation directly from this page.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold font-body text-muted-foreground mb-1 block">
            Your name *
          </label>
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
            value={form.contact_name}
            onChange={e => set('contact_name', e.target.value)}
            placeholder="Full name"
            required
          />
        </div>
        <div>
          <label className="text-xs font-semibold font-body text-muted-foreground mb-1 block">
            Email *
          </label>
          <input
            type="email"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
            value={form.contact_email}
            onChange={e => set('contact_email', e.target.value)}
            placeholder="you@email.com"
            required
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold font-body text-muted-foreground mb-1 block">
            Phone (optional)
          </label>
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
            value={form.contact_phone}
            onChange={e => set('contact_phone', e.target.value)}
            placeholder="+91 98765 43210"
          />
        </div>
        <div>
          <label className="text-xs font-semibold font-body text-muted-foreground mb-1 block">
            Expected members
          </label>
          <input
            type="number"
            min={1}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
            value={form.expected_members ?? ''}
            onChange={e => set('expected_members', parseInt(e.target.value) || 0)}
            placeholder="e.g. 150"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold font-body text-muted-foreground mb-1 block">
          Organisation name *
        </label>
        <input
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
          value={form.org_name}
          onChange={e => set('org_name', e.target.value)}
          placeholder="e.g. Sunrise Welfare Trust"
          required
        />
      </div>

      <div>
        <label className="text-xs font-semibold font-body text-muted-foreground mb-1 block">
          Organisation type *
        </label>
        <select
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
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
        <label className="text-xs font-semibold font-body text-muted-foreground mb-1 block">
          Brief description (optional)
        </label>
        <textarea
          rows={3}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
          value={form.org_description}
          onChange={e => set('org_description', e.target.value)}
          placeholder="What does your organisation do? Who are your members?"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full gradient-hero text-primary-foreground rounded-xl py-3 font-semibold font-body text-sm flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60"
      >
        {loading
          ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Submitting…</>
          : <><Send className="w-4 h-4" /> Request Access</>}
      </button>

      <p className="text-center text-[11px] text-muted-foreground font-body">
        No pricing asked yet. Our team will reach out to understand your needs.
      </p>
    </form>
  );
}

/* ── Main page ── */
const KutumbProPage = () => {
  const navigate = useNavigate();
  const { appUser } = useAuth();
  const hasPro = appUser?.kutumb_pro;
  const [showForm, setShowForm] = useState(false);

  return (
    <AppShell>
      <div className="container py-8 px-4 max-w-4xl mx-auto">

        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20">
            <Building2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold font-body text-primary">Kutumb Pro — Community OS</span>
          </div>
          <h1 className="font-heading text-3xl font-bold mb-3">
            Run your community<br />the dignified way
          </h1>
          <div className="gold-line mx-auto mb-4" style={{ maxWidth: 80 }} />
          <p className="text-muted-foreground font-body max-w-xl mx-auto">
            A complete operating system for spiritual organisations, political networks,
            NGOs, educational bodies, and resident welfare groups — built on the Kutumb ecosystem.
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {FEATURES.map((f, i) => (
            <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border text-sm font-body">
              <f.icon className="w-4 h-4 text-primary flex-shrink-0" />
              <span>{f.text}</span>
            </div>
          ))}
        </div>

        {/* Framework showcase */}
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 mb-10">
          {FRAMEWORK_ORDER.map(ft => {
            const fw = ORG_FRAMEWORKS[ft];
            return (
              <div key={ft} className="bg-card border border-border rounded-2xl p-5">
                <div className="text-2xl mb-2">{fw.emoji}</div>
                <h3 className="font-heading font-bold text-base mb-1">{fw.label}</h3>
                <p className="text-xs text-muted-foreground font-body mb-3">{fw.tagline}</p>
                <div className="flex flex-wrap gap-1">
                  {fw.tiers.map((t, i) => (
                    <span
                      key={i}
                      className={`text-[10px] px-2 py-0.5 rounded-full font-body font-medium
                        ${i === 0 || i === 4
                          ? 'bg-primary/10 text-primary'
                          : 'bg-secondary text-muted-foreground'}`}
                    >
                      T{i + 1}: {t}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground/70 font-body mt-3 italic">
                  {fw.currencyEmoji} {fw.currencyName} · {fw.exampleUse}
                </p>
              </div>
            );
          })}
        </div>

        {/* CTA section */}
        {hasPro ? (
          <div className="bg-card border border-primary/30 rounded-2xl p-8 text-center shadow-warm">
            <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-3" />
            <h2 className="font-heading text-xl font-bold mb-2">Kutumb Pro is active</h2>
            <p className="text-muted-foreground font-body text-sm mb-6">
              You can create and manage your community organisations.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => navigate('/org/new')}
                className="gradient-hero text-primary-foreground rounded-xl px-6 py-3 font-semibold font-body text-sm flex items-center gap-2 hover:opacity-90 transition"
              >
                <Building2 className="w-4 h-4" />
                Create New Organisation
              </button>
              <button
                onClick={() => navigate('/org/my')}
                className="border border-border rounded-xl px-6 py-3 font-semibold font-body text-sm flex items-center gap-2 hover:bg-secondary transition"
              >
                <Users className="w-4 h-4" />
                My Organisations
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-8 shadow-card">
            <div className="text-center mb-6">
              <h2 className="font-heading text-xl font-bold mb-2">Request Access</h2>
              <p className="text-muted-foreground font-body text-sm max-w-sm mx-auto">
                Kutumb Pro is available by invitation. Tell us about your community
                and our team will reach out.
              </p>
            </div>

            {!showForm ? (
              <div className="flex justify-center">
                <button
                  onClick={() => setShowForm(true)}
                  className="gradient-hero text-primary-foreground rounded-xl px-8 py-3 font-semibold font-body text-sm flex items-center gap-2 hover:opacity-90 transition"
                >
                  <Building2 className="w-4 h-4" />
                  Request Access
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-5">
                  <h3 className="font-heading font-semibold text-base">Your organisation details</h3>
                  <button
                    onClick={() => setShowForm(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                </div>
                <EnquiryForm />
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default KutumbProPage;
