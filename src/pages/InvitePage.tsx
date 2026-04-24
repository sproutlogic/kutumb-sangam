import { useState, useMemo } from 'react';
import { useLang } from '@/i18n/LanguageContext';
import { useTree } from '@/contexts/TreeContext';
import AppShell from '@/components/shells/AppShell';
import { Users, Copy, Check, Link2, TreePine, UserPlus, Share2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type InviteType = 'general' | 'node' | 'tree';

function generateCode(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${code}`;
}

const InvitePage = () => {
  const { tr } = useLang();
  const { state, isTreeInitialized } = useTree();
  const [inviteType, setInviteType] = useState<InviteType>('general');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [copied, setCopied] = useState(false);

  const inviteTypes: { type: InviteType; icon: typeof Users; labelKey: string; descKey: string }[] = [
    { type: 'general', icon: Share2, labelKey: 'inviteGeneral', descKey: 'inviteGeneralDesc' },
    { type: 'node', icon: UserPlus, labelKey: 'inviteToNode', descKey: 'inviteToNodeDesc' },
    { type: 'tree', icon: TreePine, labelKey: 'inviteToTree', descKey: 'inviteToTreeDesc' },
  ];

  const handleGenerate = () => {
    let prefix = 'KTM-GEN';
    if (inviteType === 'node') prefix = 'KTM-NOD';
    if (inviteType === 'tree') prefix = 'KTM-TRE';
    const code = generateCode(prefix);
    setGeneratedCode(code);
    setCopied(false);
  };

  const inviteLink = useMemo(() => {
    if (!generatedCode) return '';
    const base = window.location.origin;
    const params = new URLSearchParams({ code: generatedCode, type: inviteType });
    if (inviteType === 'node' && selectedNodeId) params.set('nodeId', selectedNodeId);
    if (inviteType === 'tree' && state.treeName) params.set('tree', state.treeName);
    return `${base}/code?${params.toString()}`;
  }, [generatedCode, inviteType, selectedNodeId, state.treeName]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: tr('codeCopied'), description: text });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: tr('errorGeneric') });
    }
  };

  const handleShare = async () => {
    if (navigator.share && inviteLink) {
      try {
        await navigator.share({
          title: tr('kutumbMap'),
          text: `${tr('inviteShareText')} ${generatedCode}`,
          url: inviteLink,
        });
      } catch { /* user cancelled */ }
    } else {
      handleCopy(inviteLink);
    }
  };

  return (
    <AppShell>
      <div className="container py-8 max-w-lg space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">{tr('inviteRelative')}</h1>
          <p className="text-muted-foreground font-body mt-1">{tr('invitePageDesc')}</p>
        </div>

        {/* Invite Type Selector */}
        <div className="space-y-3">
          {inviteTypes.map(({ type, icon: Icon, labelKey, descKey }) => (
            <button
              key={type}
              onClick={() => { setInviteType(type); setGeneratedCode(''); }}
              className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                inviteType === type
                  ? 'border-primary bg-primary/5 shadow-warm'
                  : 'border-border/50 bg-card hover:border-primary/30'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                inviteType === type ? 'gradient-hero' : 'bg-secondary'
              }`}>
                <Icon className={`w-5 h-5 ${inviteType === type ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-body font-semibold text-sm">{tr(labelKey as any)}</p>
                <p className="text-xs text-muted-foreground font-body mt-0.5">{tr(descKey as any)}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Node Selector for "node" type */}
        {inviteType === 'node' && isTreeInitialized && (
          <div className="bg-card rounded-xl p-5 shadow-card border border-border/50">
            <label className="block text-sm font-medium font-body mb-1.5">{tr('selectNodeToInvite')}</label>
            <select
              value={selectedNodeId}
              onChange={e => setSelectedNodeId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-input bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
            >
              <option value="">{tr('selectParent')}</option>
              {state.nodes.map(n => (
                <option key={n.id} value={n.id}>{n.name} ({n.relation})</option>
              ))}
            </select>
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={inviteType === 'node' && !selectedNodeId && isTreeInitialized}
          className="w-full py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {tr('generateInviteCode')}
        </button>

        {/* Generated Code + Link */}
        {generatedCode && (
          <div className="bg-card rounded-xl p-6 shadow-card border border-border/50 space-y-4 animate-fade-in">
            <div className="text-center">
              <p className="text-xs text-muted-foreground font-body mb-2">{tr('yourInviteCode')}</p>
              <div className="flex items-center justify-center gap-3">
                <span className="font-heading text-2xl font-bold tracking-wider text-primary">{generatedCode}</span>
                <button
                  onClick={() => handleCopy(generatedCode)}
                  className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground font-body mb-2">{tr('inviteLinkLabel')}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 rounded-lg bg-secondary/50 text-xs font-mono text-muted-foreground truncate">
                  {inviteLink}
                </div>
                <button
                  onClick={() => handleCopy(inviteLink)}
                  className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex-shrink-0"
                >
                  <Link2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <button
              onClick={handleShare}
              className="w-full py-2.5 rounded-lg border-2 border-primary text-primary font-semibold font-body text-sm hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4" />
              {tr('shareInvite')}
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default InvitePage;
