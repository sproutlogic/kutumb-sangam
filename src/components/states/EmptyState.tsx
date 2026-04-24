import { useLang } from '@/i18n/LanguageContext';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  titleKey: string;
  descKey?: string;
  icon?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({ titleKey, descKey, icon }) => {
  const { tr } = useLang();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon ?? <Inbox className="w-12 h-12 text-muted-foreground mb-4" />}
      <h3 className="font-heading text-lg font-semibold mb-1">{tr(titleKey as any)}</h3>
      {descKey && <p className="text-sm text-muted-foreground font-body">{tr(descKey as any)}</p>}
    </div>
  );
};

export default EmptyState;
