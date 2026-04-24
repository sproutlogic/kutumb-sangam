import { useNavigate, useLocation } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import { useTree } from '@/contexts/TreeContext';
import LanguageToggle from './LanguageToggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Home, TreePine, UserPlus, ShieldCheck, Search, Heart,
  ArrowUpCircle, HelpCircle, LogOut, Menu, User,
} from 'lucide-react';
import KutumbLogo from '@/components/ui/KutumbLogo';

const AppHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tr } = useLang();
  const { resetTree, isTreeInitialized } = useTree();
  const isDashboard = location.pathname === '/dashboard';
  const isAuthPage = ['/', '/signin', '/onboarding'].includes(location.pathname);

  const handleLogoClick = () => {
    if (isTreeInitialized) {
      navigate('/dashboard');
    } else {
      navigate('/');
    }
  };

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

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-card/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <button onClick={handleLogoClick} className="flex items-center gap-2.5 group">
          <KutumbLogo size={32} className="transition-transform duration-200 group-hover:scale-105" />
          <span className="font-heading text-xl font-semibold text-foreground group-hover:text-primary transition-colors">
            {tr('kutumbMap')}
          </span>
        </button>
        <div className="flex items-center gap-3">
          <LanguageToggle />

          {/* Dropdown nav — shown when user is in the app (not on auth pages) */}
          {!isAuthPage && isTreeInitialized && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-2 rounded-lg border border-border/50 hover:bg-secondary transition-colors">
                  <Menu className="w-5 h-5 text-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {navItems.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <DropdownMenuItem
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className={`flex items-center gap-3 cursor-pointer ${active ? 'text-primary font-medium' : ''}`}
                    >
                      <item.icon className="w-4 h-4" />
                      {tr(item.labelKey)}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogoClick}
                  className="flex items-center gap-3 cursor-pointer text-destructive"
                >
                  <LogOut className="w-4 h-4" />
                  {tr('logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Sign in for non-dashboard unauthenticated */}
          {!isDashboard && !isTreeInitialized && (
            <button
              onClick={() => navigate('/signin')}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors font-body"
            >
              {tr('signIn')}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
