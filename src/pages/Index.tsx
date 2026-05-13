import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Landing from "./Landing";

const Index = () => {
  const { session, appUser, loading } = useAuth();
  const navigate = useNavigate();

  // OAuth callback lands here (redirectTo points to /).
  // Once the session + appUser are resolved:
  //   • No personal record yet (no vansha_id) → go to onboarding to create one
  //   • Personal record exists → go to /dashboard
  useEffect(() => {
    if (loading) return;
    if (!session) return;
    // appUser may still be loading — wait for it
    if (appUser === null) return;
    const onboardingExempt = new Set(["margdarshak", "admin", "superadmin", "office", "finance"]);
    if (!appUser.vansha_id && !onboardingExempt.has(appUser.role)) {
      navigate("/onboarding", { replace: true });
    } else {
      const roleHome: Record<string, string> = {
        superadmin:  '/admin',
        admin:       '/admin',
        office:      '/admin',
        finance:     '/admin',
        margdarshak: '/margdarshak',
      };
      navigate(roleHome[appUser.role] ?? '/dashboard', { replace: true });
    }
  }, [session, appUser, loading, navigate]);

  return <Landing />;
};

export default Index;
