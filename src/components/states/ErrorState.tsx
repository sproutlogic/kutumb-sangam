import { useLang } from '@/i18n/LanguageContext';
import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  messageKey?: string;
}

const ErrorState: React.FC<ErrorStateProps> = ({ messageKey = 'errorGeneric' }) => {
  const { tr } = useLang();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
      <p className="font-body text-muted-foreground">{tr(messageKey as any)}</p>
    </div>
  );
};

export default ErrorState;
