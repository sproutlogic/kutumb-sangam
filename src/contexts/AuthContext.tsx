import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getApiBaseUrl } from "@/services/api";

export type UserRole = "user" | "margdarshak" | "admin" | "superadmin" | "np" | "zp" | "rp" | "cp" | "se" | "office" | "finance";

export interface AppUser {
  id: string;
  role: UserRole;
  vansha_id: string | null;
  phone: string | null;
  full_name: string | null;
  kutumb_id: string | null;      // unique permanent ID, doubles as referral code
  kutumb_pro?: boolean;          // true = access to Kutumb Pro Community OS
  onboarding_complete: boolean;  // false → must finish onboarding form before entering app
}

interface AuthState {
  session: Session | null;
  supabaseUser: User | null;
  appUser: AppUser | null;
  loading: boolean;
  supabaseReady: boolean;
  signOut: () => Promise<void>;
  refreshAppUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

async function fetchAppUser(accessToken: string): Promise<AppUser | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as AppUser;
  } catch {
    return null;
  }
}

async function upsertSession(accessToken: string): Promise<void> {
  try {
    await fetch(`${getApiBaseUrl()}/api/auth/session`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch { /* non-fatal */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const ready = supabase !== null;

  async function syncSession(s: Session | null) {
    setSession(s);
    setSupabaseUser(s?.user ?? null);
    if (s?.access_token) {
      await upsertSession(s.access_token);
      const au = await fetchAppUser(s.access_token);
      setAppUser(au);
    } else {
      setAppUser(null);
    }
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Do NOT call getSession() here. In Supabase v2 PKCE flow the OAuth callback
    // lands with a `?code=` param that hasn't been exchanged yet, so getSession()
    // returns null. That null would clear loading immediately and ProtectedRoute
    // would redirect to /signin before SIGNED_IN ever fires.
    //
    // onAuthStateChange is the single source of truth: it fires INITIAL_SESSION
    // (existing session from storage) or SIGNED_IN (after PKCE code exchange).
    // We keep loading=true until one of those fires.
    let settled = false;
    const settle = () => {
      if (!settled) {
        settled = true;
        setLoading(false);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      await syncSession(s);
      settle();
    });

    // Safety valve: if Supabase never fires (e.g. network error), unblock UI after 8s.
    const timer = setTimeout(settle, 8000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setSupabaseUser(null);
    setAppUser(null);
  }

  async function refreshAppUser() {
    if (session?.access_token) {
      const au = await fetchAppUser(session.access_token);
      setAppUser(au);
    }
  }

  return (
    <AuthContext.Provider value={{ session, supabaseUser, appUser, loading, supabaseReady: ready, signOut, refreshAppUser }}>
      {children}
    </AuthContext.Provider>
  );
}
