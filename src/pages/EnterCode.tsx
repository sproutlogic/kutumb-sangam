import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import AuthShell from '@/components/shells/AuthShell';

const MOCK_CODES: Record<string, string> = {
  'KTM-FAM-29A7X': 'branch',
  'KTM-REF-8B3YZ': 'referral',
  'KTM-PND-4C1WQ': 'pandit',
};

const EnterCode = () => {
  const { tr } = useLang();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    const type = MOCK_CODES[trimmed];
    if (type) {
      navigate(`/code/${trimmed}`);
    } else {
      // Explicit error — no silent fallthrough
      setError(tr('invalidCode'));
    }
  };

  return (
    <AuthShell>
      <div className="text-center mb-8">
        <span className="text-4xl mb-4 block">🔑</span>
        <h1 className="font-heading text-3xl font-bold mb-2">{tr('enterCodeTitle')}</h1>
        <p className="text-muted-foreground font-body">{tr('enterCodeSubtitle')}</p>
      </div>
      <form onSubmit={handleSubmit} className="bg-card rounded-xl p-8 shadow-card border border-border/50 space-y-5">
        <div>
          <input
            value={code}
            onChange={e => { setCode(e.target.value); setError(''); }}
            placeholder={tr('codePlaceholder')}
            className="w-full px-4 py-3 rounded-lg border border-input bg-background font-body text-center text-lg tracking-wider focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          {error && <p className="text-destructive text-sm mt-2 font-body text-center">{error}</p>}
        </div>
        <button
          type="submit"
          className="w-full py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity"
        >
          {tr('submitCode')}
        </button>
        <div className="text-center">
          <p className="text-xs text-muted-foreground font-body mt-3">
            Demo codes: KTM-FAM-29A7X · KTM-REF-8B3YZ · KTM-PND-4C1WQ
          </p>
        </div>
      </form>
    </AuthShell>
  );
};

export default EnterCode;
