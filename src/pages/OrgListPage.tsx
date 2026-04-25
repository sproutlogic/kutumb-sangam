/**
 * OrgListPage — shows all orgs the current user belongs to.
 * Accessed via /org/my
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '@/components/shells/AppShell';
import { orgApi } from '@/services/orgApi';
import type { OrgSummary } from '@/services/orgApi';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Building2, Plus, Users, ArrowRight, Crown } from 'lucide-react';

const OrgListPage = () => {
  const navigate = useNavigate();
  const { appUser } = useAuth();
  const [orgs, setOrgs]     = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    orgApi.myOrgs()
      .then(setOrgs)
      .catch(err => toast({ title: 'Could not load organisations', description: err?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []);

  const hasPro = appUser?.kutumb_pro;

  return (
    <AppShell>
      <div className="container py-8 px-4 max-w-3xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
              <Building2 className="w-6 h-6 text-primary" /> My Organisations
            </h1>
            <p className="text-sm text-muted-foreground font-body mt-0.5">
              {orgs.length} organisation{orgs.length !== 1 ? 's' : ''} you're part of
            </p>
          </div>
          {hasPro && (
            <button
              onClick={() => navigate('/org/new')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-hero text-primary-foreground font-semibold font-body text-sm hover:opacity-90 transition"
            >
              <Plus className="w-4 h-4" /> New Org
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : orgs.length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="w-14 h-14 text-muted-foreground/20 mx-auto mb-4" />
            <h2 className="font-heading font-bold text-lg mb-2">No organisations yet</h2>
            <p className="text-muted-foreground font-body text-sm max-w-sm mx-auto mb-6">
              {hasPro
                ? 'Create your first organisation or join one using an invite code.'
                : 'Request access to Kutumb Pro to create and manage organisations.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {hasPro ? (
                <button
                  onClick={() => navigate('/org/new')}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl gradient-hero text-primary-foreground font-semibold font-body text-sm"
                >
                  <Plus className="w-4 h-4" /> Create Organisation
                </button>
              ) : (
                <button
                  onClick={() => navigate('/kutumb-pro')}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl gradient-hero text-primary-foreground font-semibold font-body text-sm"
                >
                  Request Access to Kutumb Pro
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {orgs.map(org => {
              const isHead = appUser?.id === org.head_user_id;
              return (
                <button
                  key={org.id}
                  onClick={() => navigate(`/org/${org.slug}`)}
                  className="w-full text-left bg-card border border-border rounded-2xl p-5 hover:border-primary/30 hover:shadow-card transition-all flex items-center gap-4"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-heading font-bold text-base truncate">{org.name}</p>
                      {isHead && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gold/10 text-gold-dark font-body font-semibold flex items-center gap-1 flex-shrink-0">
                          <Crown className="w-2.5 h-2.5" /> Leader
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground font-body">
                        {org.framework_type.charAt(0).toUpperCase() + org.framework_type.slice(1)}
                      </span>
                      {org.my_tier && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-body">
                          Your tier: T{org.my_tier}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground font-body flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {org.member_count ?? '—'} members
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </button>
              );
            })}
          </div>
        )}

        {!loading && !hasPro && orgs.length > 0 && (
          <div className="mt-6 bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center justify-between gap-3">
            <p className="text-sm font-body text-muted-foreground">
              Want to <strong>create</strong> your own organisation?
            </p>
            <button
              onClick={() => navigate('/kutumb-pro')}
              className="text-sm font-body font-semibold text-primary hover:underline flex-shrink-0"
            >
              Request Kutumb Pro →
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default OrgListPage;
