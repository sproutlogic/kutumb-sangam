import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useLang } from '@/i18n/LanguageContext';

interface ConsentToggleProps {
  fieldLabel: string;
  defaultEnabled?: boolean;
  onChange?: (enabled: boolean) => void;
}

const ConsentToggle = ({ fieldLabel, defaultEnabled = true, onChange }: ConsentToggleProps) => {
  const [enabled, setEnabled] = useState(defaultEnabled);
  const { tr } = useLang();

  const toggle = () => {
    setEnabled(!enabled);
    onChange?.(!enabled);
  };

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${enabled ? 'border-primary/30 bg-primary/5' : 'border-border bg-secondary/30'}`}>
      <button onClick={toggle} className="relative w-10 h-5 rounded-full transition-colors flex-shrink-0" style={{ background: enabled ? 'hsl(var(--primary))' : 'hsl(var(--muted))' }}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium font-body text-foreground truncate">{fieldLabel}</p>
        <p className="text-[10px] text-muted-foreground font-body">{tr('sakshiConsentDesc')}</p>
      </div>
      {enabled ? <Eye className="w-3.5 h-3.5 text-primary flex-shrink-0" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
    </div>
  );
};

export default ConsentToggle;
