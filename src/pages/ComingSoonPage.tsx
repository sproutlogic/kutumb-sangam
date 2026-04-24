import { useParams, useNavigate } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { UPCOMING_SERVICES } from '@/config/upcomingServices.config';
import AppShell from '@/components/shells/AppShell';
import { ArrowLeft, Bell, Rocket } from 'lucide-react';

const ComingSoonPage = () => {
  const { serviceId } = useParams<{ serviceId: string }>();
  const navigate = useNavigate();
  const { lang, tr } = useLang();
  const { toast } = useToast();

  const service = UPCOMING_SERVICES.find((s) => s.id === serviceId);

  if (!service) {
    return (
      <AppShell>
        <div className="container py-16 text-center">
          <p className="text-muted-foreground font-body">{tr('pageNotFound')}</p>
          <button onClick={() => navigate('/dashboard')} className="mt-4 text-primary font-medium font-body hover:underline">
            {tr('backToDashboard')}
          </button>
        </div>
      </AppShell>
    );
  }

  const { icon: Icon, emoji, title, tagline, desc } = service;
  const others = UPCOMING_SERVICES.filter((s) => s.id !== service.id);

  const handleNotify = () => {
    toast({
      title: tr('notifyMeSuccess'),
      description: tr('notifyMeSuccessDesc'),
    });
  };

  return (
    <AppShell>
      <div className="container max-w-2xl py-10 space-y-8">
        {/* Back */}
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground font-body transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {tr('backToDashboard')}
        </button>

        {/* Hero card */}
        <div className="bg-card rounded-2xl border border-border/60 shadow-card overflow-hidden">
          {/* Gradient banner */}
          <div className="gradient-hero px-8 py-10 text-primary-foreground relative overflow-hidden">
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.08) 0%, transparent 55%)' }}
            />
            <div className="relative flex items-start gap-5">
              <div className="w-14 h-14 rounded-2xl bg-primary-foreground/15 border border-primary-foreground/25 flex items-center justify-center flex-shrink-0 text-2xl">
                {emoji}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary-foreground/15 border border-primary-foreground/25 font-semibold font-body uppercase tracking-wide">
                    {tr('launchingSoon')}
                  </span>
                </div>
                <h1 className="font-heading text-3xl font-bold mb-1">{title[lang]}</h1>
                <p className="text-sm opacity-80 font-body">{tagline[lang]}</p>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="px-8 py-6 space-y-6">
            <p className="text-base font-body leading-relaxed text-foreground/90">{desc[lang]}</p>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleNotify}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity"
              >
                <Bell className="w-4 h-4" />
                {tr('notifyMe')}
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-border bg-secondary text-foreground font-semibold font-body hover:bg-secondary/80 transition-colors"
              >
                {tr('backToDashboard')}
              </button>
            </div>
          </div>
        </div>

        {/* Other upcoming services */}
        <div>
          <h2 className="font-heading text-base font-semibold mb-3 flex items-center gap-2 text-muted-foreground">
            <Rocket className="w-4 h-4" />
            {tr('moreComingSoon')}
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {others.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(s.isLive ? (s.livePath ?? s.path) : s.path)}
                className="flex items-center gap-3 bg-card rounded-xl p-4 border border-border/50 hover:border-primary/30 hover:shadow-card transition-all text-left"
              >
                <span className="text-xl">{s.emoji}</span>
                <div className="min-w-0">
                  <p className="font-semibold font-body text-sm truncate">{s.title[lang]}</p>
                  <p className="text-xs text-muted-foreground font-body truncate">{s.tagline[lang]}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default ComingSoonPage;
