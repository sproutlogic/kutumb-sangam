import { useEffect, useState } from 'react';
import { Wallet, TrendingUp, Users, Copy, CheckCheck } from 'lucide-react';
import { getApiBaseUrl } from '@/services/api';
import { useLang } from '@/i18n/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';

interface WalletData {
  role: string;
  referral_code: string;
  personal_sales: number;
  team_sales: number;
  rate_per_sale: number;
  estimated_earnings: number;
  application_status: string | null;
}

function getAuthToken(): string {
  try {
    const keys = Object.keys(localStorage).filter(k => k.endsWith('-auth-token'));
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (raw) { const p = JSON.parse(raw); if (p?.access_token) return p.access_token; }
    }
  } catch { /* ignore */ }
  return '';
}

export function EarningsWallet() {
  const { tr } = useLang();
  const { appUser } = useAuth();
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    fetch(`${getApiBaseUrl()}/api/sales/wallet`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Canonical ID: always prefer kutumb_id from auth; fall back to wallet
  // referral_code. Never expose a raw UUID.
  const displayCode = appUser?.kutumb_id ?? data?.referral_code ?? null;

  function copyCode() {
    if (!displayCode) return;
    navigator.clipboard.writeText(displayCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) {
    return (
      <div className="bg-card rounded-xl p-5 shadow-card border border-border/50 animate-pulse h-32" />
    );
  }

  if (!data) return null;

  // Only show for sales roles
  const salesRoles = ['se', 'cp', 'rp', 'zp', 'np', 'admin', 'superadmin'];
  if (!salesRoles.includes(data.role)) return null;

  return (
    <div className="bg-gradient-to-br from-primary/8 to-accent/8 rounded-xl p-5 shadow-card border border-primary/20 animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <Wallet className="w-5 h-5 text-primary" />
        <h3 className="font-heading font-bold text-base">{tr('seWalletTitle')}</h3>
        <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold uppercase">
          {data.role}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-card/70 rounded-lg p-3 text-center border border-border/30">
          <p className="text-xl font-bold font-heading text-primary">
            ₹{data.estimated_earnings.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-muted-foreground font-body mt-0.5">{tr('seEstimatedEarnings')}</p>
        </div>
        <div className="bg-card/70 rounded-lg p-3 text-center border border-border/30">
          <div className="flex items-center justify-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-green-500" />
            <p className="text-xl font-bold font-heading">{data.personal_sales}</p>
          </div>
          <p className="text-[10px] text-muted-foreground font-body mt-0.5">{tr('sePersonalSales')}</p>
        </div>
        <div className="bg-card/70 rounded-lg p-3 text-center border border-border/30">
          <div className="flex items-center justify-center gap-1">
            <Users className="w-3.5 h-3.5 text-accent" />
            <p className="text-xl font-bold font-heading">{data.team_sales}</p>
          </div>
          <p className="text-[10px] text-muted-foreground font-body mt-0.5">{tr('seTeamSales')}</p>
        </div>
      </div>

      {/* Rate note */}
      {data.rate_per_sale > 0 && (
        <p className="text-xs text-muted-foreground font-body mb-3">
          ₹{data.rate_per_sale} {tr('seRatePerSale')}
        </p>
      )}

      {/* Referral code — only shown once kutumb_id is assigned */}
      {displayCode && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-card/80 rounded-lg px-3 py-2 border border-border/40">
              <p className="text-[10px] text-muted-foreground font-body mb-0.5">{tr('seYourReferralCode')}</p>
              <p className="text-sm font-mono font-bold tracking-widest text-primary">{displayCode}</p>
            </div>
            <button
              onClick={copyCode}
              className="p-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors text-primary"
              title={tr('copy')}
            >
              {copied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground font-body mt-2">{tr('seReferralCodeHint')}</p>
        </>
      )}
    </div>
  );
}
