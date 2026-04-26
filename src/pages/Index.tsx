import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Landing from "./Landing";

const Index = () => {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  // OAuth callback lands here (redirectTo points to /). Once the session is
  // established, send the user straight to the dashboard.
  useEffect(() => {
    if (!loading && session) {
      navigate("/dashboard", { replace: true });
    }
  }, [session, loading, navigate]);

  return <Landing />;
};

export default Index;
