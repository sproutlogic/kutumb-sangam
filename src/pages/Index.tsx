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
  //   • Personal record exists → go to /eco-sewa (the new app home)
  useEffect(() => {
    if (loading) return;
    if (!session) return;
    // appUser may still be loading — wait for it
    if (appUser === null) return;
    if (!appUser.vansha_id) {
      navigate("/onboarding", { replace: true });
    } else {
      navigate("/eco-sewa", { replace: true });
    }
  }, [session, appUser, loading, navigate]);

  // Prevent Landing flash during OAuth callback/session hydration.
  if (loading || session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <Landing />;
};

export default Index;
