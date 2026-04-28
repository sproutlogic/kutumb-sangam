import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import {
  Hourglass, Home, TreePine, ShieldCheck, Search,
  HelpCircle, LogOut, CalendarDays, Radar, Archive, Receipt, Building2, Leaf, IndianRupee,
  ShoppingBag,
} from 'lucide-react';
import { useTree } from '@/contexts/TreeContext';
import { useAuth } from '@/contexts/AuthContext';
import { AppTopBar } from '@/components/shells/AppTopBar';
import { UPCOMING_SERVICES } from '@/config/upcomingServices.config';
import { fetchVanshaTree, setPersistedVanshaId } from '@/services/api';
import { backendPayloadToTreeState } from '@/services/mapVanshaPayload';

const CURRENT_VANSHA_STORAGE_KEY = 'kutumb_current_vansha_id';

const navItems = [
  { icon: Home,         labelKey: 'homeNav'          as const, path: '/dashboard' },
  { icon: TreePine,     labelKey: 'viewTree'         as const, path: '/tree' },
  // Invite is now accessed from within the Tree page, not the sidebar
  { icon: ShieldCheck,  labelKey: 'verification'     as const, path: '/verification' },
  { icon: Search,       labelKey: 'discovery'        as const, path: '/discovery' },
  { icon: CalendarDays, labelKey: 'kutumbCalendar'   as const, path: '/calendar' },
  { icon: Radar,        labelKey: 'kutumbRadar'      as const, path: '/radar' },
  { icon: Archive,      labelKey: 'legacyBox'        as const, path: '/legacy-box' },
  { icon: Receipt,      labelKey: 'transactions'     as const, path: '/transactions' },
  { icon: Leaf,         labelKey: 'haritCircleNav'   as const, path: '/harit-circle' },
  { icon: IndianRupee,  labelKey: 'mitraEarningsNav' as const, path: '/mitra-earnings' },
  { icon: Hourglass,    labelKey: 'sewaChakraNav'    as const, path: '/time-bank' },
  // ── Eco Services ──
  { icon: ShoppingBag,  labelKey: 'ecoServices'      as const, path: '/services' },
  { icon: HelpCircle,   labelKey: 'support'          as const, path: '/support' },
];

interface AppShellProps {
  children: React.ReactNode;
}

const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tr, lang } = useLang();
  const { resetTree, loadTreeState, isTreeInitialized } = useTree();
  const { appUser, signOut } = useAuth();
  const hasPro = appUser?.kutumb_pro;

  // After login the local tree state is empty (localStorage was cleared on logout).
  // Use appUser.vansha_id — which comes from the backend /api/auth/me — to fetch
  // and restore the full tree. Runs once per session when the tree is unpopulated.
  useEffect(() => {
    const vid = appUser?.vansha_id;
    if (!vid || isTreeInitialized) return;
    setPersistedVanshaId(vid);
    fetchVanshaTree(vid)
      .then((data) => loadTreeState(backendPayloadToTreeState(data)))
      .catch(() => { /* non-fatal — user can still proceed; tree may be empty */ });
  }, [appUser?.vansha_id, isTreeInitialized, loadTreeState]);

  const handleLogout = async () => {
    await signOut();
    resetTree();
    localStorage.removeItem(CURRENT_VANSHA_STORAGE_KEY);
    navigate('/');
    window.location.reload();
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <AppTopBar />
      <div className="flex min-h-0 flex-1">
        {/* Sidebar — hidden on mobile, shown md+ */}
        <aside className="hidden md:flex flex-col w-56 border-r border-border bg-card/60 py-4 px-3 gap-1 flex-shrink-0">
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {tr(item.labelKey)}
              </button>
            );
          })}

          {/* Kutumb Pro — Community OS */}
          <div className="mt-3 pt-3 border-t border-border/60">
            <p className="px-3 mb-1.5 text-[10px] font-semibold font-body tracking-widest uppercase text-muted-foreground/60">
              Community OS
            </p>
            <button
              onClick={() => navigate(hasPro ? '/org/my' : '/kutumb-pro')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body transition-colors w-full ${
                location.pathname.startsWith('/kutumb-pro') || location.pathname.startsWith('/org')
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Building2 className="w-4 h-4 flex-shrink-0" />
              <span className="truncate flex-1 text-left">{tr('kutumbProNav')}</span>
              {!hasPro && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold tracking-wide flex-shrink-0">
                  PRO
                </span>
              )}
            </button>
          </div>

          {/* Launching Soon section */}
          <div className="mt-3 pt-3 border-t border-border/60">
            <p className="px-3 mb-1.5 text-[10px] font-semibold font-body tracking-widest uppercase text-muted-foreground/60">
              {tr('launchingSoon')}
            </p>
            {UPCOMING_SERVICES.map((svc) => {
              const active = location.pathname === svc.path;
              return (
                <button
                  key={svc.id}
                  onClick={() => navigate(svc.path)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body transition-colors w-full ${
                    active
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground/70 hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  <span className="text-base leading-none">{svc.emoji}</span>
                  <span className="truncate flex-1 text-left">{svc.title[lang]}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-semibold tracking-wide flex-shrink-0">
                    SOON
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-auto pt-4 border-t border-border">
            <div className="px-3 pb-3">
              <a
                href="https://ecotech.co.in"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 tracking-[0.12em] uppercase font-body hover:underline"
              >
                Prakriti by Aarush
              </a>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors w-full"
            >
              <LogOut className="w-4 h-4" />
              {tr('logout')}
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
};

export default AppShell;
