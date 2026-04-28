import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/contexts/AuthContext";

interface Props {
  children: React.ReactNode;
  requiredRole?: UserRole;
}

// Roles that bypass the onboarding gate (they have separate KYC flows)
const ONBOARDING_EXEMPT: Set<string> = new Set(["margdarshak", "admin", "superadmin", "office", "finance"]);

export default function ProtectedRoute({ children, requiredRole }: Props) {
  const { session, appUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  // Recovery-safe gate:
  // Any normal user without vansha_id must go through onboarding, regardless of
  // onboarding_complete flag. This lets users repair accounts where the flag
  // was set but the tree link is missing.
  if (
    appUser &&
    !appUser.vansha_id &&
    !ONBOARDING_EXEMPT.has(appUser.role)
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  if (requiredRole && appUser?.role !== requiredRole && appUser?.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
