/**
 * WorkspaceContext — tracks whether the user is in "personal" mode or
 * viewing an org dashboard.  Components can read `workspace` and switch
 * context without triggering a full navigation.
 *
 * Org-specific data (name, slug, tier aliases, currency) is cached here so
 * that every nested component does not have to re-fetch.
 */

import {
  createContext, useContext, useState, useCallback,
  type ReactNode,
} from 'react';

export interface OrgWorkspace {
  slug:          string;
  id:            string;
  name:          string;
  framework_type: string;
  tier_aliases:  [string, string, string, string, string];
  currency_name: string;
  currency_emoji: string;
  my_tier:       number;
  my_l_credits:  number;
  is_head:       boolean;
}

interface WorkspaceState {
  mode:         'personal' | 'org';
  org:          OrgWorkspace | null;
  switchToOrg:  (org: OrgWorkspace) => void;
  switchToPersonal: () => void;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be inside <WorkspaceProvider>');
  return ctx;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'personal' | 'org'>('personal');
  const [org, setOrg]   = useState<OrgWorkspace | null>(null);

  const switchToOrg = useCallback((o: OrgWorkspace) => {
    setOrg(o);
    setMode('org');
  }, []);

  const switchToPersonal = useCallback(() => {
    setMode('personal');
    setOrg(null);
  }, []);

  return (
    <WorkspaceContext.Provider value={{ mode, org, switchToOrg, switchToPersonal }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
