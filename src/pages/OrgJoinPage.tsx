/**
 * OrgJoinPage — user lands here with an invite code from a link.
 * Accessed via /org/join/:code
 * Shows org preview and a "Join" button.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '@/components/shells/AppShell';
import { orgApi } from '@/services/orgApi';
import { toast } from '@/hooks/use-toast';
import { Building2, CheckCircle2, Users } from 'lucide-react';

const OrgJoinPage = () => {
  const { code } = useParams<{ code: string }>();
  const navigate  = useNavigate();
  const [joining, setJoining] = useState(false);
  const [joined, setJoined]   = useState(false);
  const [orgSlug, setOrgSlug] = useState('');

  useEffect(() => {
    // Prefetch nothing — server will return preview on POST; keep it simple.
  }, [code]);

  async function handleJoin() {
    if (!code) return;
    setJoining(true);
    try {
      const res = await orgApi.join(code);
      setOrgSlug(res.org_slug);
      setJoined(true);
      toast({ title: 'Welcome! You have joined the organisation.' });
    } catch (err: any) {
      toast({ title: 'Could not join', description: err?.message, variant: 'destructive' });
    } finally {
      setJoining(false);
    }
  }

  return (
    <AppShell>
      <div className="container py-16 px-4 max-w-md mx-auto text-center">
        {joined ? (
          <>
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="font-heading text-2xl font-bold mb-2">You're in!</h1>
            <p className="text-muted-foreground font-body mb-6">
              You've successfully joined the organisation.
            </p>
            <button
              onClick={() => navigate(`/org/${orgSlug}`)}
              className="gradient-hero text-primary-foreground rounded-xl px-8 py-3 font-semibold font-body text-sm hover:opacity-90 transition"
            >
              Go to Organisation Dashboard →
            </button>
          </>
        ) : (
          <>
            <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5">
              <Building2 className="w-10 h-10 text-primary" />
            </div>
            <h1 className="font-heading text-2xl font-bold mb-2">
              You're invited to join an organisation
            </h1>
            <p className="text-muted-foreground font-body text-sm mb-2">
              Invite code: <span className="font-mono font-bold text-foreground">{code}</span>
            </p>
            <p className="text-muted-foreground font-body text-sm mb-8">
              Click below to accept the invitation and join the organisation's member network.
            </p>
            <button
              onClick={handleJoin}
              disabled={joining}
              className="gradient-hero text-primary-foreground rounded-xl px-8 py-3 font-semibold font-body text-sm hover:opacity-90 transition disabled:opacity-60 flex items-center gap-2 mx-auto"
            >
              {joining
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Joining…</>
                : <><Users className="w-4 h-4" /> Accept & Join</>}
            </button>
          </>
        )}
      </div>
    </AppShell>
  );
};

export default OrgJoinPage;
