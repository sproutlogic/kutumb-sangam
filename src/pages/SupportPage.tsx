import { useState } from 'react';
import AppShell from '@/components/shells/AppShell';
import {
  HelpCircle, ChevronDown, ChevronUp, Mail, MessageCircle,
  Shield, FileText, Phone, ExternalLink, Clock,
} from 'lucide-react';

interface Faq {
  q: string;
  a: string;
}

const faqs: Faq[] = [
  {
    q: 'What is Kutumb Map?',
    a: 'Kutumb Map is a family tree and time-banking platform built on the principle of Vasudhaiv Kutumbakam — the world is one family. You can build your family tree, connect with relatives, share skills through the Samay Bank, and verify ancestry with trusted Pandits.',
  },
  {
    q: 'How do I start building my family tree?',
    a: 'Click "Start Your Journey" in the sidebar. The onboarding wizard will guide you through entering your identity details, naming your family tree (vansha), and adding close family members. It takes about 3 minutes.',
  },
  {
    q: 'What is the Samay Bank (Time Bank)?',
    a: 'The Samay Bank lets you offer your skills and spare time to family and community members. Every hour you give earns you 1 Samay Credit. You can spend credits when you need help — with teaching, cooking, repairs, eldercare, and more.',
  },
  {
    q: 'Is my family data private and secure?',
    a: 'Yes. All data is encrypted end-to-end. You control exactly what each family member can see. Private nodes are hidden from other relatives. We never sell your data and never share lineage information without your explicit consent.',
  },
  {
    q: 'What is Pandit Verification?',
    a: 'A registered Pandit reviews your ancestral details and verifies your lineage. A verified node gets a trust seal, which increases confidence in matrimonial and gotra-safe matching flows.',
  },
  {
    q: 'What are the subscription plans?',
    a: 'We have four plans: Beej (Free, up to 15 members), Ankur (₹2,100/yr, up to 100 members), Vriksh (₹4,900/yr, up to 500 members), and Vansh (₹7,900/yr, unlimited). The Ankur plan has a special pre-launch offer at ₹999 + GST for the first year.',
  },
  {
    q: 'How do I invite relatives to my family tree?',
    a: 'Go to "Invite Relative" in the sidebar. You can share a unique invite code or link. When your relative signs up using that code, they are connected to your family tree.',
  },
  {
    q: 'What is Kutumb Radar?',
    a: 'Kutumb Radar helps you discover family members near you or across the globe using location-based matching. Privacy is fully preserved — you only see what others choose to share.',
  },
  {
    q: 'Can I delete my account and data?',
    a: 'Yes. Email us at privacy@kutumbmap.com and we will permanently delete your account and all associated data within 30 days, as per our data retention policy.',
  },
  {
    q: 'What happens if the backend is unreachable?',
    a: 'The app works in a degraded mode — you can view locally cached data. API features like adding members or Samay Bank transactions require an active connection. If the error persists, please contact support.',
  },
];

function FaqItem({ faq }: { faq: Faq }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-secondary/30 transition-colors"
      >
        <span className="font-body font-medium text-sm pr-4">{faq.q}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-border/40 pt-3">
          <p className="text-sm text-muted-foreground font-body leading-relaxed">{faq.a}</p>
        </div>
      )}
    </div>
  );
}

const SupportPage = () => {
  return (
    <AppShell>
      <div className="container py-8 max-w-3xl space-y-10">

        {/* Header */}
        <div className="text-center">
          <HelpCircle className="w-12 h-12 text-primary mx-auto mb-4" />
          <h1 className="font-heading text-3xl font-bold mb-2">Support Centre</h1>
          <p className="text-muted-foreground font-body">Find answers, read our policies, or get in touch.</p>
        </div>

        {/* Contact cards */}
        <div className="grid sm:grid-cols-3 gap-4">
          <a
            href="mailto:support@kutumbmap.com"
            className="bg-card rounded-xl p-5 border border-border/50 shadow-card hover:shadow-elevated hover:-translate-y-0.5 transition-all flex flex-col items-center text-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-body font-semibold text-sm">Email Support</p>
              <p className="text-xs text-muted-foreground font-body mt-0.5">support@kutumbmap.com</p>
              <p className="text-xs text-muted-foreground font-body flex items-center justify-center gap-1 mt-1">
                <Clock className="w-3 h-3" /> Reply within 24 hrs
              </p>
            </div>
          </a>

          <a
            href="https://wa.me/919999999999"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-card rounded-xl p-5 border border-border/50 shadow-card hover:shadow-elevated hover:-translate-y-0.5 transition-all flex flex-col items-center text-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-950/40 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-body font-semibold text-sm">WhatsApp</p>
              <p className="text-xs text-muted-foreground font-body mt-0.5">Chat with us</p>
              <p className="text-xs text-muted-foreground font-body flex items-center justify-center gap-1 mt-1">
                <Clock className="w-3 h-3" /> Mon–Sat, 9am–6pm IST
              </p>
            </div>
          </a>

          <div className="bg-card rounded-xl p-5 border border-border/50 shadow-card flex flex-col items-center text-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
              <Phone className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-body font-semibold text-sm">Phone Support</p>
              <p className="text-xs text-muted-foreground font-body mt-0.5">+91 99999 99999</p>
              <p className="text-xs text-muted-foreground font-body flex items-center justify-center gap-1 mt-1">
                <Clock className="w-3 h-3" /> Mon–Fri, 10am–5pm IST
              </p>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div>
          <h2 className="font-heading text-xl font-semibold mb-4">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => <FaqItem key={i} faq={faq} />)}
          </div>
        </div>

        {/* Policies */}
        <div>
          <h2 className="font-heading text-xl font-semibold mb-4">Legal & Policies</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                icon: Shield,
                title: 'Privacy Policy',
                desc: 'How we collect, store, and protect your family data. We never sell data. Full GDPR and IT Act compliance.',
                href: '#',
              },
              {
                icon: FileText,
                title: 'Terms of Service',
                desc: 'Rules governing your use of the platform, including prohibited content and account termination policies.',
                href: '#',
              },
              {
                icon: FileText,
                title: 'Refund Policy',
                desc: '30-day full refund on annual subscriptions. Prorated refunds available after 30 days. No refund on pre-launch offers after activation.',
                href: '#',
              },
              {
                icon: Shield,
                title: 'Data Deletion',
                desc: 'Request complete removal of your data at any time. Email privacy@kutumbmap.com. Processed within 30 days.',
                href: 'mailto:privacy@kutumbmap.com',
              },
            ].map((policy, i) => (
              <a
                key={i}
                href={policy.href}
                className="bg-card rounded-xl p-5 border border-border/50 shadow-card hover:shadow-elevated hover:-translate-y-0.5 transition-all flex gap-4"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <policy.icon className="w-4.5 h-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-1">
                    <p className="font-body font-semibold text-sm">{policy.title}</p>
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground font-body leading-relaxed">{policy.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* About */}
        <div className="bg-secondary/40 rounded-2xl p-6 border border-border/50 text-center">
          <p className="font-heading font-bold text-lg mb-1">Kutumb Map</p>
          <p className="text-sm text-muted-foreground font-body mb-2">
            Built by Aarush Eco Tech · Rooted in the spirit of Vasudhaiv Kutumbakam
          </p>
          <p className="text-xs text-muted-foreground font-body italic">
            "वसुधैव कुटुम्बकम् — The world is one family."
          </p>
        </div>

      </div>
    </AppShell>
  );
};

export default SupportPage;
