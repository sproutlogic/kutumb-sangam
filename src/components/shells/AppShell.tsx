import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import {
  TreePine, Home, UserPlus, ShieldCheck, Search, Heart, HelpCircle, ArrowUpCircle, LogOut,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTree } from '@/contexts/TreeContext';
import { AppTopBar } from '@/components/shells/AppTopBar';
import { UPCOMING_SERVICES } from '@/config/upcomingServices.config';

const navItems = [
  { icon: Home, labelKey: 'dashboardTitle' as const, path: '/dashboard' },
  { icon: TreePine, labelKey: 'viewTree' as const, path: '/tree' },
  { icon: UserPlus, labelKey: 'inviteRelative' as const, path: '/invite' },
  { icon: ShieldCheck, labelKey: 'verification' as const, path: '/verification' },
  { icon: Search, labelKey: 'discovery' as const, path: '/discovery' },
  { icon: Heart, labelKey: 'matrimony' as const, path: '/matrimony' },
  { icon: ArrowUpCircle, labelKey: 'upgradePlan' as const, path: '/upgrade' },
  { icon: HelpCircle, labelKey: 'support' as const, path: '/support' },
];

interface AppShellProps {
  children: React.ReactNode;
}

const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tr, lang } = useLang();
  const { resetTree } = useTree();

  const handleLogout = () => {
    resetTree();
    localStorage.clear();
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
        {/* Launching Soon section */}
        <div className="mt-3 pt-3 border-t border-border/60">
          <p className="px-3 mb-1.5 text-[10px] font-semibold font-body tracking-widest uppercase text-muted-foreground/60">
            {tr('launchingSoon')}
          </p>
          {UPCOMING_SERVICES.map((svc) => {
            const dest = svc.isLive ? (svc.livePath ?? svc.path) : svc.path;
            const active = location.pathname === dest;
            return (
              <button
                key={svc.id}
                onClick={() => navigate(dest)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body transition-colors w-full ${
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground/70 hover:bg-secondary hover:text-foreground'
                }`}
              >
                <span className="text-base leading-none">{svc.emoji}</span>
                <span className="truncate flex-1 text-left">{svc.title[lang]}</span>
                {!svc.isLive && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-semibold tracking-wide flex-shrink-0">
                    SOON
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-auto pt-4 border-t border-border">
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
