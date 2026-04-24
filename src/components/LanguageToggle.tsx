import { useLang } from '@/i18n/LanguageContext';

const LanguageToggle = () => {
  const { lang, setLang } = useLang();

  return (
    <div className="inline-flex items-center rounded-full border border-border bg-card p-0.5 text-sm font-body">
      <button
        onClick={() => setLang('en')}
        className={`px-3 py-1 rounded-full transition-all ${
          lang === 'en' ? 'gradient-hero text-primary-foreground shadow-warm' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        English
      </button>
      <button
        onClick={() => setLang('hi')}
        className={`px-3 py-1 rounded-full transition-all ${
          lang === 'hi' ? 'gradient-hero text-primary-foreground shadow-warm' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        हिन्दी
      </button>
    </div>
  );
};

export default LanguageToggle;
