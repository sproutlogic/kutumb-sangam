import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/contexts/AuthContext";

interface Props {
  children: React.ReactNode;
  requiredRole?: UserRole;
}

// Roles that bypass the onboarding gate (they have separate KYC flows)
const ONBOARDING_EXEMPT: Set<string> = new Set(["pandit", "admin", "superadmin"]);

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

  // Gate: authenticated but onboarding not complete → send to onboarding form.
  // appUser may briefly be null while fetching; only block when we have the row.
  // If vansha_id is already set the user has an existing tree — treat as complete
  // even if the DB column is NULL (migration 017 not yet applied).
  if (
    appUser &&
    !appUser.onboarding_complete &&
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
