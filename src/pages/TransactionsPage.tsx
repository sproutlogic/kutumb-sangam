import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '@/components/shells/AppShell';
import { useLang } from '@/i18n/LanguageContext';
import { getApiBaseUrl } from '@/services/api';
import {
  Receipt, CreditCard, CheckCircle2, XCircle, Clock, AlertCircle,
  RefreshCw, ArrowUpCircle, ChevronDown, ChevronUp, X, Download,
  CalendarDays, ShieldCheck, IndianRupee,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentStatus = 'created' | 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded' | 'cancelled';

interface Refund {
  id: string;
  amount_paise: number;
  status: string;
  reason: string;
  created_at: string;
}

interface Transaction {
  id: string;
  payment_type: string;
  plan_id: string | null;
  description: string;
  currency: string;
  base_amount_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  total_amount_paise: number;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  status: PaymentStatus;
  failure_reason: string | null;
  created_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
  refunds: Refund[];
  invoices: { invoice_number: string } | null;
}

interface Subscription {
  id: string;
  plan_id: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  auto_renew: boolean;
  cancelled_at: string | null;
}

interface InvoiceDetail {
  invoice: {
    invoice_number: string;
    base_amount_paise: number;
    cgst_paise: number;
    sgst_paise: number;
    igst_paise: number;
    total_paise: number;
    cgst_rate: number;
    sgst_rate: number;
    igst_rate: number;
    billed_name: string | null;
    billed_email: string | null;
    billed_phone: string | null;
    gstin: string | null;
    line_items: { description: string; amount_paise: number; qty: number }[];
    issued_at: string;
  };
  payment: Transaction;
  display: { base: string; cgst: string; sgst: string; igst: string; total: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function authHeaders() {
  const token = getAuthToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const PLAN_LABELS: Record<string, string> = {
  beej: 'Beej (Free)', ankur: 'Ankur', vriksh: 'Vriksh', vansh: 'Vansh',
};

const STATUS_FILTERS = ['all', 'paid', 'pending', 'failed', 'refunded', 'cancelled'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PaymentStatus }) {
  const cfg: Record<PaymentStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    created:            { label: 'Created',   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',   icon: <Clock className="w-3 h-3" /> },
    pending:            { label: 'Pending',   cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300', icon: <RefreshCw className="w-3 h-3" /> },
    paid:               { label: 'Paid',      cls: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300', icon: <CheckCircle2 className="w-3 h-3" /> },
    failed:             { label: 'Failed',    cls: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',   icon: <XCircle className="w-3 h-3" /> },
    refunded:           { label: 'Refunded',  cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300', icon: <RefreshCw className="w-3 h-3" /> },
    partially_refunded: { label: 'Part. Refund', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300', icon: <RefreshCw className="w-3 h-3" /> },
    cancelled:          { label: 'Cancelled', cls: 'bg-secondary text-muted-foreground', icon: <X className="w-3 h-3" /> },
  };
  const { label, cls, icon } = cfg[status] ?? cfg.created;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold font-body ${cls}`}>
      {icon} {label}
    </span>
  );
}

function TaxRow({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex justify-between text-xs font-body text-muted-foreground">
      <span>{label}</span><span>{amount}</span>
    </div>
  );
}

function InvoiceModal({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const [data, setData] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/api/payments/invoice/${paymentId}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(setData)
      .catch(() => setError('Could not load invoice.'))
      .finally(() => setLoading(false));
  }, [paymentId]);

  const handlePrint = () => window.print();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card w-full max-w-lg rounded-2xl shadow-2xl border border-border/50 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" />
            <span className="font-heading font-bold text-base">Tax Invoice</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
              title="Print / Save PDF"
            >
              <Download className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          {loading && <div className="animate-pulse h-48 bg-secondary/30 rounded-xl" />}
          {error   && <p className="text-sm text-destructive font-body text-center py-8">{error}</p>}
          {data && (
            <div className="space-y-5 print:text-sm">
              {/* Invoice meta */}
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-heading text-xl font-bold text-primary">Kutumb Map</p>
                  <p className="text-xs text-muted-foreground font-body">Aarush Eco Tech</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-mono font-bold text-foreground">{data.invoice.invoice_number}</p>
                  <p className="text-xs text-muted-foreground font-body mt-0.5">
                    {formatDate(data.invoice.issued_at)}
                  </p>
                </div>
              </div>

              {/* Billing info */}
              {(data.invoice.billed_name || data.invoice.billed_email) && (
                <div className="bg-secondary/30 rounded-xl p-4">
                  <p className="text-xs font-semibold font-body text-muted-foreground mb-1.5 uppercase tracking-wide">Billed to</p>
                  {data.invoice.billed_name  && <p className="text-sm font-body font-medium">{data.invoice.billed_name}</p>}
                  {data.invoice.billed_email && <p className="text-xs text-muted-foreground font-body">{data.invoice.billed_email}</p>}
                  {data.invoice.billed_phone && <p className="text-xs text-muted-foreground font-body">{data.invoice.billed_phone}</p>}
                  {data.invoice.gstin        && <p className="text-xs font-mono font-body mt-1">GSTIN: {data.invoice.gstin}</p>}
                </div>
              )}

              {/* Line items */}
              <div className="border border-border/40 rounded-xl overflow-hidden">
                <div className="bg-secondary/20 px-4 py-2.5 grid grid-cols-3 text-[11px] font-semibold font-body text-muted-foreground uppercase tracking-wide">
                  <span className="col-span-2">Description</span>
                  <span className="text-right">Amount</span>
                </div>
                {data.invoice.line_items.map((item, i) => (
                  <div key={i} className="px-4 py-3 grid grid-cols-3 border-t border-border/30 text-sm font-body">
                    <span className="col-span-2">{item.description}</span>
                    <span className="text-right font-medium">{formatPaise(item.amount_paise)}</span>
                  </div>
                ))}
              </div>

              {/* Tax breakdown */}
              <div className="space-y-1.5 px-1">
                <TaxRow label="Subtotal" amount={data.display.base} />
                {data.invoice.cgst_paise > 0 && (
                  <TaxRow label={`CGST (${data.invoice.cgst_rate}%)`} amount={data.display.cgst} />
                )}
                {data.invoice.sgst_paise > 0 && (
                  <TaxRow label={`SGST (${data.invoice.sgst_rate}%)`} amount={data.display.sgst} />
                )}
                {data.invoice.igst_paise > 0 && (
                  <TaxRow label={`IGST (${data.invoice.igst_rate}%)`} amount={data.display.igst} />
                )}
                <div className="flex justify-between text-sm font-bold font-body border-t border-border pt-1.5 mt-1">
                  <span>Total</span><span>{data.display.total}</span>
                </div>
              </div>

              {/* Payment ref */}
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/30 rounded-xl p-4 text-xs text-green-700 dark:text-green-400 font-body space-y-0.5">
                <p className="font-semibold flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Payment confirmed</p>
                {data.payment.paid_at && <p>Date: {formatDateTime(data.payment.paid_at)}</p>}
                <p>Payment ID: <span className="font-mono">{data.payment.id.slice(0, 8).toUpperCase()}</span></p>
              </div>

              <p className="text-[10px] text-muted-foreground font-body text-center">
                This is a computer-generated invoice and does not require a physical signature.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TransactionCard({ txn, onViewInvoice }: { txn: Transaction; onViewInvoice: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasInvoice = txn.status === 'paid' && txn.invoices?.invoice_number;
  const totalRefunded = txn.refunds.reduce((s, r) => s + (r.status === 'processed' ? r.amount_paise : 0), 0);

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
      {/* Main row */}
      <div className="p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <CreditCard className="w-4.5 h-4.5 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="text-sm font-semibold font-body leading-snug">{txn.description}</p>
              {txn.plan_id && (
                <p className="text-xs text-muted-foreground font-body mt-0.5">
                  {PLAN_LABELS[txn.plan_id] ?? txn.plan_id} Plan · Annual
                </p>
              )}
            </div>
            <StatusBadge status={txn.status} />
          </div>

          <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
            <div>
              <p className="text-base font-bold font-heading text-primary">
                {formatPaise(txn.total_amount_paise)}
              </p>
              <p className="text-[11px] text-muted-foreground font-body">
                {formatPaise(txn.base_amount_paise)} + GST · {formatDate(txn.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {hasInvoice && (
                <button
                  onClick={() => onViewInvoice(txn.id)}
                  className="flex items-center gap-1 text-xs text-primary font-medium font-body hover:underline"
                >
                  <Receipt className="w-3.5 h-3.5" /> Invoice
                </button>
              )}
              <button
                onClick={() => setExpanded(e => !e)}
                className="p-1 rounded-md hover:bg-secondary transition-colors text-muted-foreground"
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/40 px-4 py-4 space-y-4 bg-secondary/10">
          {/* Tax breakdown */}
          <div className="space-y-1">
            <p className="text-[11px] font-semibold font-body text-muted-foreground uppercase tracking-wide mb-2">Tax Breakdown</p>
            <div className="flex justify-between text-xs font-body">
              <span className="text-muted-foreground">Base amount</span>
              <span>{formatPaise(txn.base_amount_paise)}</span>
            </div>
            {txn.cgst_paise > 0 && (
              <div className="flex justify-between text-xs font-body">
                <span className="text-muted-foreground">CGST ({txn.cgst_rate}%)</span>
                <span>{formatPaise(txn.cgst_paise)}</span>
              </div>
            )}
            {txn.sgst_paise > 0 && (
              <div className="flex justify-between text-xs font-body">
                <span className="text-muted-foreground">SGST ({txn.sgst_rate}%)</span>
                <span>{formatPaise(txn.sgst_paise)}</span>
              </div>
            )}
            {txn.igst_paise > 0 && (
              <div className="flex justify-between text-xs font-body">
                <span className="text-muted-foreground">IGST ({txn.igst_rate}%)</span>
                <span>{formatPaise(txn.igst_paise)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold font-body border-t border-border/40 pt-1.5">
              <span>Total paid</span>
              <span>{formatPaise(txn.total_amount_paise)}</span>
            </div>
          </div>

          {/* Timestamps */}
          <div className="space-y-1">
            <p className="text-[11px] font-semibold font-body text-muted-foreground uppercase tracking-wide mb-2">Timeline</p>
            <p className="text-xs font-body text-muted-foreground">
              Order created: <span className="text-foreground">{formatDateTime(txn.created_at)}</span>
            </p>
            {txn.paid_at && (
              <p className="text-xs font-body text-muted-foreground">
                Payment confirmed: <span className="text-green-600 font-medium">{formatDateTime(txn.paid_at)}</span>
              </p>
            )}
            {txn.cancelled_at && (
              <p className="text-xs font-body text-muted-foreground">
                Cancelled: <span className="text-foreground">{formatDateTime(txn.cancelled_at)}</span>
              </p>
            )}
          </div>

          {/* Refunds */}
          {txn.refunds.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold font-body text-muted-foreground uppercase tracking-wide mb-2">
                Refunds ({txn.refunds.length})
              </p>
              <div className="space-y-2">
                {txn.refunds.map(r => (
                  <div key={r.id} className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/30 rounded-lg px-3 py-2.5 text-xs font-body">
                    <div className="flex justify-between">
                      <span className="font-semibold text-purple-700 dark:text-purple-300">{formatPaise(r.amount_paise)}</span>
                      <span className="capitalize text-muted-foreground">{r.status}</span>
                    </div>
                    <p className="text-muted-foreground mt-0.5">{r.reason}</p>
                    <p className="text-muted-foreground mt-0.5">{formatDate(r.created_at)}</p>
                  </div>
                ))}
                {totalRefunded > 0 && (
                  <p className="text-xs font-body text-muted-foreground">
                    Total refunded: <span className="font-semibold text-foreground">{formatPaise(totalRefunded)}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {txn.failure_reason && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-body text-red-700 dark:text-red-300">{txn.failure_reason}</p>
            </div>
          )}

          {/* Invoice number */}
          {txn.invoices?.invoice_number && (
            <p className="text-xs font-body text-muted-foreground">
              Invoice: <span className="font-mono font-medium text-foreground">{txn.invoices.invoice_number}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TransactionsPage = () => {
  const { tr } = useLang();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [invoicePaymentId, setInvoicePaymentId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/api/payments/transactions`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => {
        setTransactions(d.transactions ?? []);
        setSubscription(d.current_subscription ?? null);
      })
      .catch(() => setError('Could not load transaction history.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all'
    ? transactions
    : transactions.filter(t => t.status === filter || (filter === 'refunded' && t.status === 'partially_refunded'));

  const totalPaid = transactions
    .filter(t => t.status === 'paid')
    .reduce((s, t) => s + t.total_amount_paise, 0);

  async function handleCancelSubscription() {
    if (!subscription || !confirm('Are you sure you want to cancel? You will retain access until the end of your billing period.')) return;
    setCancelling(true);
    try {
      const r = await fetch(`${getApiBaseUrl()}/api/payments/subscriptions/current`, {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ reason: 'User requested cancellation' }),
      });
      if (!r.ok) throw new Error();
      setSubscription(s => s ? { ...s, status: 'cancelled', cancelled_at: new Date().toISOString() } : null);
    } catch {
      alert('Could not cancel subscription. Please try again or contact support.');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <AppShell>
      {/* Hero */}
      <div className="relative gradient-hero text-primary-foreground py-8 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.06) 0%, transparent 55%)' }} />
        <div className="container relative flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs tracking-[0.2em] uppercase opacity-60 font-body mb-1">Account</p>
            <h1 className="font-heading text-2xl font-bold">My Transactions</h1>
          </div>
          <IndianRupee className="w-8 h-8 opacity-20" />
        </div>
        <div className="absolute inset-x-0 bottom-0 gold-line opacity-60" />
      </div>

      <div className="container py-8 space-y-6">
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-xl p-4">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            <p className="text-sm font-body text-destructive">{error}</p>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl p-5 shadow-card border border-border/50 text-center">
            <IndianRupee className="w-5 h-5 text-primary mx-auto mb-2" />
            <p className="text-xl font-bold font-heading">{formatPaise(totalPaid)}</p>
            <p className="text-xs text-muted-foreground font-body mt-0.5">Total Paid</p>
          </div>
          <div className="bg-card rounded-xl p-5 shadow-card border border-border/50 text-center">
            <Receipt className="w-5 h-5 text-primary mx-auto mb-2" />
            <p className="text-xl font-bold font-heading">{transactions.length}</p>
            <p className="text-xs text-muted-foreground font-body mt-0.5">All Orders</p>
          </div>
          <div className="col-span-2 sm:col-span-1 bg-card rounded-xl p-5 shadow-card border border-border/50 text-center">
            <ShieldCheck className="w-5 h-5 text-gold mx-auto mb-2" />
            <p className="text-base font-bold font-heading">
              {subscription ? (PLAN_LABELS[subscription.plan_id] ?? subscription.plan_id) : 'Beej (Free)'}
            </p>
            <p className="text-xs text-muted-foreground font-body mt-0.5">Active Plan</p>
          </div>
        </div>

        {/* Current subscription card */}
        {subscription && (
          <div className="bg-gradient-to-r from-primary/8 to-accent/8 rounded-xl border border-primary/20 p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-semibold font-body text-muted-foreground uppercase tracking-wide mb-1">Current Subscription</p>
                <p className="font-heading text-lg font-bold">
                  {PLAN_LABELS[subscription.plan_id] ?? subscription.plan_id} Plan
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold font-body ${
                    subscription.status === 'active'
                      ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300'
                      : 'bg-secondary text-muted-foreground'
                  }`}>
                    {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                  </span>
                </div>
              </div>
              <div className="text-right text-sm font-body">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>Started {formatDate(subscription.starts_at)}</span>
                </div>
                {subscription.ends_at && (
                  <p className="text-muted-foreground mt-0.5">
                    {subscription.cancelled_at ? 'Access until' : 'Renews'}: <span className="text-foreground font-medium">{formatDate(subscription.ends_at)}</span>
                  </p>
                )}
              </div>
            </div>
            {subscription.status === 'active' && !subscription.cancelled_at && (
              <button
                onClick={handleCancelSubscription}
                disabled={cancelling}
                className="mt-4 text-xs text-muted-foreground hover:text-destructive font-body underline-offset-2 hover:underline transition-colors disabled:opacity-50"
              >
                {cancelling ? 'Cancelling…' : 'Cancel subscription'}
              </button>
            )}
            {subscription.cancelled_at && (
              <p className="mt-3 text-xs font-body text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                Cancelled on {formatDate(subscription.cancelled_at)}. Access continues until end of period.
              </p>
            )}
          </div>
        )}

        {/* No subscription — upgrade prompt */}
        {!loading && !subscription && (
          <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl border border-primary/20 p-6 text-center">
            <ArrowUpCircle className="w-8 h-8 text-primary mx-auto mb-3" />
            <p className="font-heading text-base font-bold mb-1">No active plan</p>
            <p className="text-sm text-muted-foreground font-body mb-4">Upgrade to unlock more family members, features, and generations.</p>
            <button
              onClick={() => navigate('/upgrade')}
              className="px-6 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold font-body text-sm shadow-warm hover:opacity-90 transition-opacity"
            >
              View Plans →
            </button>
          </div>
        )}

        {/* Transaction list */}
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="font-heading text-lg font-bold">Transaction History</h2>
            {/* Filter tabs */}
            <div className="flex gap-1 flex-wrap">
              {STATUS_FILTERS.map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-body transition-colors capitalize ${
                    filter === f
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f === 'all' ? `All (${transactions.length})` : f}
                </button>
              ))}
            </div>
          </div>

          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-card rounded-xl border border-border/50 p-4 animate-pulse h-24" />
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-body text-sm">
                {filter === 'all' ? 'No transactions yet.' : `No ${filter} transactions.`}
              </p>
              {filter === 'all' && (
                <button
                  onClick={() => navigate('/upgrade')}
                  className="mt-4 text-sm text-primary font-medium font-body hover:underline"
                >
                  Upgrade your plan →
                </button>
              )}
            </div>
          )}

          <div className="space-y-3">
            {filtered.map(txn => (
              <TransactionCard key={txn.id} txn={txn} onViewInvoice={setInvoicePaymentId} />
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-center text-xs text-muted-foreground font-body py-4 border-t border-border">
          All prices in INR. GST applied as per Indian tax regulations. For billing queries, contact support@kutumbmap.com
        </p>
      </div>

      {/* Invoice modal */}
      {invoicePaymentId && (
        <InvoiceModal paymentId={invoicePaymentId} onClose={() => setInvoicePaymentId(null)} />
      )}
    </AppShell>
  );
};

export default TransactionsPage;
