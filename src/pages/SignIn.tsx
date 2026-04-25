import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import AuthShell from '@/components/shells/AuthShell';
import TrustBadge from '@/components/ui/TrustBadge';
import { Mail, ChevronDown, ChevronUp, Loader2, CheckCircle2 } from 'lucide-react';
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
  const { tr } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/time-bank';

  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);

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
      options: { redirectTo: `${window.location.origin}${from}` },
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
      options: { emailRedirectTo: `${window.location.origin}${from}` },
    });
    setEmailLoading(false);
    if (error) {
      toast({ title: 'Could not send link', description: error.message, variant: 'destructive' });
    } else {
      setMagicLinkSent(true);
    }
  };

  return (
    <AuthShell>
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <KutumbLogo size={64} className="drop-shadow-lg" />
        </div>
        <h1 className="font-heading text-3xl font-bold mb-2">{tr('signInTitle')}</h1>
        <p className="text-muted-foreground font-body">{tr('signInSubtitle')}</p>
      </div>

      {/* Google — Primary */}
      <div className="bg-card rounded-xl p-6 shadow-card border border-border/50 space-y-4 mb-4 animate-fade-in">
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

      <p className="text-center text-sm text-muted-foreground font-body mt-6">
        {tr('noAccount')}{' '}
        <button onClick={() => navigate('/onboarding')} className="text-primary font-medium hover:underline">
          {tr('signUp')}
        </button>
      </p>
    </AuthShell>
  );
};

export default SignIn;
