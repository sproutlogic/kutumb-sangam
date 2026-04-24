import { useLang } from '@/i18n/LanguageContext';
import AppShell from '@/components/shells/AppShell';
import { HelpCircle } from 'lucide-react';

const SupportPage = () => {
  const { tr } = useLang();

  const faqs = [
    { q: tr('faq1Q'), a: tr('faq1A') },
    { q: tr('faq2Q'), a: tr('faq2A') },
    { q: tr('faq3Q'), a: tr('faq3A') },
  ];

  return (
    <AppShell>
      <div className="container py-8 max-w-2xl space-y-8">
        <div className="text-center">
          <HelpCircle className="w-12 h-12 text-primary mx-auto mb-4" />
          <h1 className="font-heading text-3xl font-bold">{tr('supportTitle')}</h1>
        </div>

        {/* FAQ */}
        <div className="space-y-4">
          <h2 className="font-heading text-xl font-semibold">{tr('faqTitle')}</h2>
          {faqs.map((faq, i) => (
            <div key={i} className="bg-card rounded-xl p-5 shadow-card border border-border/50">
              <p className="font-body font-medium mb-2">{faq.q}</p>
              <p className="text-sm text-muted-foreground font-body">{faq.a}</p>
            </div>
          ))}
        </div>

        {/* Policy links */}
        <div className="grid sm:grid-cols-3 gap-4">
          {(['privacyPolicy', 'termsOfService', 'contactUs'] as const).map(key => (
            <div key={key} className="bg-card rounded-xl p-5 shadow-card border border-border/50 text-center">
              <p className="font-body font-medium mb-2">{tr(key)}</p>
              <p className="text-xs text-muted-foreground font-body">{tr('policyPlaceholder')}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
};

export default SupportPage;
