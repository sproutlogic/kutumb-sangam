import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getApiBaseUrl } from "@/services/api";

export type UserRole = "user" | "pandit" | "admin" | "superadmin" | "np" | "zp" | "rp" | "cp" | "se";

export interface AppUser {
  id: string;
  role: UserRole;
  vansha_id: string | null;
  phone: string | null;
  full_name: string | null;
  kutumb_id: string | null;   // unique permanent ID, doubles as referral code
  kutumb_pro?: boolean;       // true = access to Kutumb Pro Community OS
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

    supabase.auth.getSession().then(async ({ data }) => {
      await syncSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      await syncSession(s);
    });

    return () => sub.subscription.unsubscribe();
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
