import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AuthShell from '@/components/shells/AuthShell';
import TrustBadge from '@/components/ui/TrustBadge';
import { Eye, EyeOff, KeyRound, Mail, ChevronDown, ChevronUp, Loader2, CheckCircle2 } from 'lucide-react';
import KutumbLogo from '@/components/ui/KutumbLogo';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const SignIn = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // After OAuth the browser does a full-page reload at the redirectTo URL.
  // Sending it to a ProtectedRoute (/dashboard) triggers the auth race: the
  // PKCE code hasn't been exchanged yet so ProtectedRoute sees session=null
  // and redirects to /signin. We send OAuth back to / (public Landing) instead;
  // Landing detects the live session and forwards to /dashboard safely.
  const postAuthPath = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  const [showEmail, setShowEmail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);

  const inputClass =
    'w-full px-4 py-2.5 rounded-lg border border-input bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-ring/30';

  // ── Google OAuth ──────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    if (!supabase) {
      toast({ title: 'Auth not configured', description: 'Set VITE_SUPABASE_ANON_KEY in .env', variant: 'destructive' });
      return;
    }
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${postAuthPath}` },
    });
    if (error) {
      toast({ title: 'Google sign-in failed', description: error.message, variant: 'destructive' });
      setGoogleLoading(false);
    }
    // On success Supabase redirects the browser — no further action needed.
  };

  // ── Email magic link ──────────────────────────────────────────────────────
  const handleEmailLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !supabase) return;
    setEmailLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}${postAuthPath}` },
    });
    setEmailLoading(false);
    if (error) {
      toast({ title: 'Could not send link', description: error.message, variant: 'destructive' });
    } else {
      setMagicLinkSent(true);
    }
  };

  // ── Email + password (for Supabase test accounts) ────────────────────────
  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    if (!supabase) {
      toast({ title: 'Auth not configured', description: 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env', variant: 'destructive' });
      return;
    }
    setPwdLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setPwdLoading(false);
    if (error) {
      toast({ title: 'Sign-in failed', description: error.message, variant: 'destructive' });
      return;
    }
    // Password flow does not reload page; redirect explicitly on success.
    navigate(postAuthPath === '/' ? '/dashboard' : postAuthPath, { replace: true });
  };

  return (
    <AuthShell>
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <KutumbLogo size={64} className="drop-shadow-lg" />
        </div>
        <h1 className="font-heading text-3xl font-bold mb-2">Welcome back</h1>
        <p className="text-muted-foreground font-body">Your family's Prakriti is waiting</p>
      </div>

      {/* Google — Primary */}
      <div className="bg-card rounded-xl p-4 shadow-card border border-border/50 space-y-3 mb-3 animate-fade-in" style={{ animationDelay: '100ms' }}>
        <button
          onClick={handleGoogle}
          disabled={googleLoading}
          className="w-full py-3.5 rounded-lg bg-white border border-gray-300 text-gray-800 font-semibold font-body shadow-sm hover:shadow-md hover:bg-gray-50 transition-all flex items-center justify-center gap-3 disabled:opacity-60"
        >
          {googleLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <GoogleIcon />}
          {googleLoading ? 'Redirecting…' : 'Continue with Google'}
        </button>
        <TrustBadge variant="encrypted" compact />
      </div>

      {/* Email magic link — Collapsible */}
      <div className="bg-card rounded-xl shadow-card border border-border/50 overflow-hidden animate-fade-in" style={{ animationDelay: '150ms' }}>
        <button
          onClick={() => setShowEmail(!showEmail)}
          className="w-full px-6 py-4 flex items-center justify-between text-sm text-muted-foreground font-body hover:bg-secondary/30 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Use email instead
          </span>
          {showEmail ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showEmail && (
          <div className="px-6 pb-6 border-t border-border/50 pt-4">
            {magicLinkSent ? (
              <div className="text-center space-y-3 py-2">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
                <p className="font-body text-sm font-medium">Check your inbox</p>
                <p className="font-body text-xs text-muted-foreground">
                  We sent a sign-in link to <strong>{email}</strong>.<br />
                  Click it to continue — no password needed.
                </p>
                <button
                  onClick={() => { setMagicLinkSent(false); setEmail(''); }}
                  className="text-xs text-primary font-body hover:underline"
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <form onSubmit={handleEmailLink} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium font-body mb-1.5">Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={inputClass}
                    required
                    disabled={emailLoading}
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={emailLoading || !email.trim()}
                  className="w-full py-2.5 rounded-lg border border-primary text-primary font-semibold font-body hover:bg-primary/5 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {emailLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Send magic link
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Email + password — for Supabase-created test / admin accounts */}
      <div className="bg-card rounded-xl shadow-card border border-border/50 overflow-hidden animate-fade-in mt-3" style={{ animationDelay: '250ms' }}>
        <button
          onClick={() => setShowPassword(!showPassword)}
          className="w-full px-6 py-4 flex items-center justify-between text-sm text-muted-foreground font-body hover:bg-secondary/30 transition-colors"
        >
          <span className="flex items-center gap-2">
            <KeyRound className="w-4 h-4" />
            Sign in with password
          </span>
          {showPassword ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showPassword && (
          <div className="px-6 pb-6 border-t border-border/50 pt-4">
            <form onSubmit={handlePassword} className="space-y-3">
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputClass} pr-10`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={pwdLoading || !email.trim() || !password}
                className="w-full py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {pwdLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Sign in
              </button>
            </form>
          </div>
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground font-body mt-6">
        First time here?{' '}
        <button onClick={() => navigate('/onboarding')} className="text-primary font-medium hover:underline">
          Claim your family's Prakriti →
        </button>
      </p>
    </AuthShell>
  );
};

export default SignIn;
