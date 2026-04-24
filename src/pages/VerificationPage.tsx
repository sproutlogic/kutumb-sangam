import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePlan } from '@/contexts/PlanContext';
import { useLang } from '@/i18n/LanguageContext';
import { useTree } from '@/contexts/TreeContext';
import AppShell from '@/components/shells/AppShell';
import LockedState from '@/components/states/LockedState';
import { ShieldCheck, Clock, CheckCircle2, Send, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getPersistedVanshaId, requestPanditVerification } from '@/services/api';

const VerificationPage = () => {
  const { hasEntitlement } = usePlan();
  const { tr } = useLang();
  const { state, requestVerification } = useTree();
  const [saving, setSaving] = useState(false);
  const [searchParams] = useSearchParams();
  const vanshaId = useMemo(
    () => (searchParams.get('vansha_id') ?? import.meta.env.VITE_DEFAULT_VANSHA_ID ?? getPersistedVanshaId() ?? '').trim(),
    [searchParams],
  );

  if (!hasEntitlement('panditVerification')) {
    return <LockedState titleKey="verificationLockedTitle" descKey="verificationLockedDesc" />;
  }

  const selfNode = state.nodes.find(n => n.id === state.currentUserId);
  const currentTier = selfNode?.verificationTier || 'self-declared';

  // Check if there's already a pending verify-request for self
  const pendingRequest = state.pendingActions.find(
    a => a.nodeId === state.currentUserId && a.type === 'verify-request' && a.status === 'pending'
  );
  const isApproved = currentTier === 'expert-verified' || currentTier === 'community-endorsed';

  const tierLabels: Record<string, string> = {
    'self-declared':       tr('selfDeclared'),
    'expert-verified':     tr('expertVerified'),
    'community-endorsed':  tr('communityEndorsed'),
  };

  const tierColors: Record<string, string> = {
    'self-declared':      'text-muted-foreground border-muted bg-muted/30',
    'expert-verified':    'text-amber-700 border-amber-400 bg-amber-50',
    'community-endorsed': 'text-primary border-primary bg-primary/5',
  };

  const handleRequestVerification = async () => {
    if (!selfNode) return;
    try {
      setSaving(true);
      await requestPanditVerification({
        vansha_id: vanshaId,
        node_id: selfNode.id,
        requested_by: state.currentUserId || selfNode.id,
      });
      requestVerification(selfNode.id);
      toast.success(tr('verificationSubmitted'), {
        description: tr('verificationPendingDesc'),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr('errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    { label: tr('verifyStep1'), done: true },
    { label: tr('verifyStep2'), done: !!pendingRequest || isApproved },
    { label: tr('verifyStep3'), done: isApproved },
  ];

  return (
    <AppShell>
      <div className="container py-8 max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full gradient-hero flex items-center justify-center mx-auto mb-4 shadow-warm">
            <ShieldCheck className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="font-heading text-3xl font-bold mb-2">{tr('verificationTitle')}</h1>
          <p className="text-muted-foreground font-body">{tr('verificationDesc')}</p>
        </div>

        {/* Current tier badge */}
        <div className="bg-card rounded-xl p-5 shadow-card border border-border/50 mb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground font-body mb-3">
            {tr('currentVerificationTier')}
          </p>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${tierColors[currentTier] ?? tierColors['self-declared']}`}>
            <ShieldCheck className="w-4 h-4" />
            <span className="text-sm font-semibold font-body">{tierLabels[currentTier] ?? currentTier}</span>
          </div>
        </div>

        {/* Progress tracker */}
        <div className="bg-card rounded-xl p-5 shadow-card border border-border/50 mb-4 space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${s.done ? 'gradient-hero text-primary-foreground' : 'border-2 border-border text-muted-foreground'}`}>
                {s.done ? '✓' : i + 1}
              </div>
              <span className={`text-sm font-body ${s.done ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Action area */}
        <div className="bg-card rounded-xl p-8 shadow-card border border-border/50 text-center space-y-4">
          {isApproved ? (
            <div className="space-y-3 animate-fade-in">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-heading text-lg font-bold">{tr('verificationApprovedTitle')}</h3>
              <p className="text-sm text-muted-foreground font-body">{tr('verificationApprovedDesc')}</p>
            </div>
          ) : pendingRequest ? (
            <div className="space-y-3 animate-fade-in">
              <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
                <Clock className="w-7 h-7 text-amber-600" />
              </div>
              <h3 className="font-heading text-lg font-bold">{tr('verificationPending')}</h3>
              <p className="text-sm text-muted-foreground font-body">{tr('verificationPendingDesc')}</p>
              <div className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 font-body">
                <AlertCircle className="w-3.5 h-3.5" />
                {tr('awaitingPanditReview')}
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground font-body">{tr('panditWillVerify')}</p>
              <button
                onClick={() => void handleRequestVerification()}
                disabled={saving}
                className="w-full py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-all hover:-translate-y-px flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {tr('requestVerification')}
                  </>
                )}
              </button>
            </>
          )}
          <p className="text-xs text-muted-foreground font-body">{tr('verificationDisclaimer')}</p>
        </div>
      </div>
    </AppShell>
  );
};

export default VerificationPage;
