import { useState, useEffect } from 'react';
import AppShell from '@/components/shells/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchSamayProfile, type SamayProfile,
  fetchSamayTransactions, type SamayTransaction,
  fetchSamayRequests, type SamayRequest,
  createSewaRequest,
  fetchMySewaItems, fetchSewaItems, postSewaItem, type SewaItem,
  fetchSevaFundBalance, type SevaFundBalance,
} from '@/services/api';

// ── Sewa Bank categories (maps to backend CATEGORIES list) ───────────────────
const SEWA_CATS = [
  { value: 'teaching',          label: 'Teaching' },
  { value: 'cooking',           label: 'Cooking' },
  { value: 'childcare',         label: 'Childcare' },
  { value: 'eldercare',         label: 'Eldercare' },
  { value: 'repairs',           label: 'Repairs' },
  { value: 'transport',         label: 'Transport' },
  { value: 'tech',              label: 'Tech help' },
  { value: 'health',            label: 'Health' },
  { value: 'tree_planting',     label: 'Tree Planting' },
  { value: 'waste_cleanup',     label: 'Waste Cleanup' },
  { value: 'water_conservation',label: 'Water Conservation' },
  { value: 'composting',        label: 'Composting' },
  { value: 'solar_adoption',    label: 'Solar / Clean Energy' },
  { value: 'eco_awareness',     label: 'Eco Awareness' },
  { value: 'eco_volunteering',  label: 'Eco Volunteering' },
  { value: 'general',           label: 'General' },
];

const ITEM_CATS = [
  { value: 'tools',     label: 'Tools' },
  { value: 'eco_kit',   label: 'Eco Kit' },
  { value: 'seeds',     label: 'Seeds / Saplings' },
  { value: 'books',     label: 'Books' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'general',   label: 'General' },
];

const CAT_COLOR: Record<string, string> = {
  teaching: '#7adba0', cooking: 'var(--ds-saffron)', childcare: 'var(--ds-plum-rose)',
  eldercare: 'var(--ds-gold-deep)', repairs: '#60c0e8', transport: '#a48aff',
  tree_planting: '#2aa86b', waste_cleanup: 'var(--ds-saffron)', water_conservation: '#60c0e8',
  composting: '#7adba0', solar_adoption: 'var(--ds-gold)', eco_awareness: '#2aa86b',
  eco_volunteering: '#7adba0', general: 'var(--ds-ink-soft)', health: '#e88fb0',
};

// ── Transaction kind helpers ─────────────────────────────────────────────────
type LedgerKind = 'earned' | 'spent' | 'pending' | 'disputed';

function txnKind(txn: SamayTransaction, myId: string): LedgerKind {
  if (txn.status === 'disputed') return 'disputed';
  if (txn.status === 'confirmed') return txn.helper_id === myId ? 'earned' : 'spent';
  return 'pending';
}

const kindMeta: Record<LedgerKind, { color: string; tag: string; sign: string }> = {
  earned:   { color: '#7adba0',             tag: 'Earned',    sign: '+' },
  spent:    { color: 'var(--ds-saffron)',   tag: 'Spent',     sign: '−' },
  pending:  { color: 'var(--ds-gold-deep)', tag: 'In progress', sign: '·' },
  disputed: { color: 'var(--ds-plum-rose)', tag: 'Disputed',  sign: '!' },
};

// ── Log sewa modal ────────────────────────────────────────────────────────────
const LogSewaModal = ({ onClose }: { onClose: () => void }) => {
  const [form, setForm] = useState({ who: '', what: '', hours: '', category: 'general', type: 'offer' });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.what.trim() || !form.hours) return;
    setSaving(true);
    await createSewaRequest({
      title: form.what.trim(),
      request_type: form.type as 'offer' | 'need',
      scope: 'global',
      category: form.category,
      hours_estimate: parseFloat(form.hours) || undefined,
    });
    setSaving(false);
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(28,13,46,0.65)', backdropFilter: 'blur(8px)', zIndex: 200, display: 'grid', placeItems: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} className="ds-card" style={{ width: 'min(500px,100%)', padding: 30 }}>
        <h3 style={{ fontFamily: 'var(--ds-serif)', fontSize: 24, color: 'var(--ds-plum)', marginBottom: 4 }}>Log a Sewa</h3>
        <p style={{ fontSize: 13, color: 'var(--ds-ink-mute)', marginBottom: 20 }}>Post a service offer or need in the community karma economy.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input className="ds-input" placeholder="Short title (e.g. 'Teach basic composting to 5 families')"
            value={form.what} onChange={e => setForm(f => ({ ...f, what: e.target.value }))} />
          <input className="ds-input" placeholder="Who is this for? (optional — person or community group)"
            value={form.who} onChange={e => setForm(f => ({ ...f, who: e.target.value }))} />
          <div style={{ display: 'flex', gap: 10 }}>
            <select className="ds-input" style={{ flex: 1 }} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option value="offer">I can offer this</option>
              <option value="need">I need this</option>
            </select>
            <input className="ds-input" placeholder="Hours" type="number" min="0.5" step="0.5" style={{ flex: 1, maxWidth: 90 }}
              value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} />
          </div>
          <select className="ds-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            {SEWA_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="ds-btn ds-btn-ghost ds-btn-sm">Cancel</button>
          <button onClick={submit} disabled={saving || !form.what.trim() || !form.hours}
            className="ds-btn ds-btn-plum ds-btn-sm">
            {saving ? 'Posting…' : 'Post sewa →'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Offer item modal ──────────────────────────────────────────────────────────
const OfferItemModal = ({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) => {
  const [form, setForm] = useState({ title: '', description: '', category: 'general', item_type: 'lend' as 'lend' | 'donate' });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    await postSewaItem({ title: form.title.trim(), description: form.description || undefined, category: form.category, item_type: form.item_type });
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(28,13,46,0.65)', backdropFilter: 'blur(8px)', zIndex: 200, display: 'grid', placeItems: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} className="ds-card" style={{ width: 'min(460px,100%)', padding: 30 }}>
        <h3 style={{ fontFamily: 'var(--ds-serif)', fontSize: 22, color: 'var(--ds-plum)', marginBottom: 4 }}>Offer an item</h3>
        <p style={{ fontSize: 13, color: 'var(--ds-ink-mute)', marginBottom: 18 }}>Share tools, seeds, eco-kits, or books with the community.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input className="ds-input" placeholder="Item name (e.g. 'Composting drum · 120L')"
            value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <input className="ds-input" placeholder="Details (condition, pickup, etc.)"
            value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <div style={{ display: 'flex', gap: 10 }}>
            <select className="ds-input" style={{ flex: 1 }} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {ITEM_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select className="ds-input" style={{ flex: 1 }} value={form.item_type} onChange={e => setForm(f => ({ ...f, item_type: e.target.value as 'lend' | 'donate' }))}>
              <option value="lend">Lend (get back)</option>
              <option value="donate">Donate (free)</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="ds-btn ds-btn-ghost ds-btn-sm">Cancel</button>
          <button onClick={submit} disabled={saving || !form.title.trim()} className="ds-btn ds-btn-plum ds-btn-sm">
            {saving ? 'Posting…' : 'List item →'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const TimeBankPage = () => {
  const { appUser } = useAuth();
  const myId = (appUser as { id?: string } | null)?.id ?? '';

  const [tab, setTab] = useState<'ledger' | 'offers' | 'items'>('ledger');
  const [filter, setFilter] = useState<string>('all');
  const [showLog, setShowLog] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);

  // API state
  const [profile, setProfile]       = useState<SamayProfile | null>(null);
  const [txns, setTxns]             = useState<SamayTransaction[]>([]);
  const [requests, setRequests]     = useState<SamayRequest[]>([]);
  const [myItems, setMyItems]       = useState<SewaItem[]>([]);
  const [allItems, setAllItems]     = useState<SewaItem[]>([]);
  const [fund, setFund]             = useState<SevaFundBalance | null>(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    async function load() {
      const [p, t, r, mi, ai, f] = await Promise.all([
        fetchSamayProfile(),
        fetchSamayTransactions(),
        fetchSamayRequests('global', 30),
        fetchMySewaItems(),
        fetchSewaItems(),
        fetchSevaFundBalance(),
      ]);
      setProfile(p);
      setTxns(t);
      setRequests(r);
      setMyItems(mi);
      setAllItems(ai);
      setFund(f);
      setLoading(false);
    }
    load();
  }, []);

  const reloadItems = async () => {
    const [mi, ai] = await Promise.all([fetchMySewaItems(), fetchSewaItems()]);
    setMyItems(mi); setAllItems(ai);
  };

  // ── Derived values ──────────────────────────────────────────────────────────
  const balance      = profile?.total_global_credits ?? null;
  const verifiedHrs  = profile?.total_verified_hours ?? 0;
  const earnedHrs    = txns.filter(t => t.helper_id === myId && t.status === 'confirmed')
                           .reduce((s, t) => s + t.hours, 0);
  const spentHrs     = txns.filter(t => t.requester_id === myId && t.status === 'confirmed')
                           .reduce((s, t) => s + t.hours, 0);
  const openCount    = txns.filter(t => ['pending','assigned','helper_done'].includes(t.status)).length;

  const filteredTxns = txns.filter(t => {
    if (filter === 'all') return true;
    return txnKind(t, myId) === filter;
  });

  // ── Category breakdown from transactions ───────────────────────────────────
  // Group confirmed transactions by credit_type as a proxy until category join is added
  const ecoHrs   = txns.filter(t => t.status === 'confirmed' && t.credit_type === 'global').reduce((s, t) => s + t.hours, 0);
  const localHrs = txns.filter(t => t.status === 'confirmed' && t.credit_type === 'local').reduce((s, t) => s + t.hours, 0);

  return (
    <AppShell>
      {/* ── Hero — full width ─────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, var(--ds-plum) 0%, var(--ds-plum-mid) 100%)', color: 'var(--ds-ivory)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '40px 36px', fontFamily: 'var(--ds-sans)', color: 'var(--ds-ivory)' }}>
          <div style={{ position: 'absolute', top: -60, right: -40, width: 300, height: 300, background: 'radial-gradient(circle, rgba(122,219,160,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--ds-gold-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            <span className="ds-eyebrow" style={{ color: 'var(--ds-gold-light)' }}>Sewa Bank · Community Karma Economy</span>
          </div>
          <h1 style={{ fontFamily: 'var(--ds-serif)', fontSize: 38, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ds-paper)' }}>Give time, tools, or money. Get it back.</h1>
          <p style={{ marginTop: 10, fontSize: 15, color: 'rgba(255,255,255,0.7)', maxWidth: 600 }}>
            Community-powered mutual aid — hours of service, shared tools, and micro-lending for eco and social causes.{' '}
            <span className="ds-sanskrit" style={{ color: 'var(--ds-gold-light)' }}>परस्परं भावयन्तः</span> — uplift one another.
          </p>

          {/* ── Three tiles ─────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>

            {/* ── TILE 1: TIME ─────────────────────────────────────────────── */}
            <div style={{ flex: '2 1 300px', padding: '18px 22px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(212,154,31,0.3)', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 16 }}>⏱</span>
                <span className="ds-eyebrow" style={{ color: 'var(--ds-gold-light)' }}>TIME · Your sewa balance</span>
                {profile?.is_community_pillar && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#7adba0', fontFamily: 'var(--ds-mono)', fontWeight: 700 }}>⭐ PILLAR</span>
                )}
              </div>
              {loading ? (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic', marginTop: 16 }}>Loading…</div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                    <span className="ds-score-num" style={{ fontSize: 54, color: 'var(--ds-gold-light)', lineHeight: 1 }}>
                      {balance !== null ? (balance >= 0 ? `+${balance}` : balance) : '—'}
                    </span>
                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>
                      {balance !== null ? 'hours in your favour' : 'No balance yet — start offering'}
                    </span>
                  </div>
                  {verifiedHrs > 0 && (
                    <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--ds-mono)' }}>
                      {verifiedHrs} verified hours total
                      {profile?.d_score ? ` · D-score ${(profile.d_score * 100).toFixed(0)}%` : ''}
                    </div>
                  )}
                  <div style={{ marginTop: 12, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min((verifiedHrs / 25) * 100, 100)}%`, height: '100%', background: 'linear-gradient(90deg,var(--ds-saffron),var(--ds-gold))' }} />
                  </div>
                  <div style={{ marginTop: 5, fontSize: 11, fontFamily: 'var(--ds-mono)', color: 'rgba(255,255,255,0.4)' }}>
                    {Math.round(Math.min((verifiedHrs / 25) * 100, 100))}% toward Vriksh-tier (25 hr)
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    {[
                      { label: 'Earned', value: earnedHrs.toFixed(1), color: '#7adba0', unit: 'hr' },
                      { label: 'Spent', value: spentHrs.toFixed(1), color: '#e9c267', unit: 'hr' },
                      { label: 'Active', value: String(openCount), color: 'var(--ds-saffron)', unit: 'req' },
                    ].map(s => (
                      <div key={s.label} style={{ flex: 1, padding: '8px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 7, border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div style={{ fontSize: 9, fontFamily: 'var(--ds-mono)', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{s.label}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: s.color, marginTop: 3, fontFamily: 'var(--ds-serif)' }}>{s.value}<span style={{ fontSize: 10, marginLeft: 3, opacity: 0.6 }}>{s.unit}</span></div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* ── TILE 2: SEVA FUND (money) ─────────────────────────────────── */}
            <div style={{ flex: '1 1 200px', padding: '18px 22px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(122,219,160,0.25)', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 16 }}>🌱</span>
                <span className="ds-eyebrow" style={{ color: '#7adba0' }}>SEVA FUND</span>
              </div>
              {loading ? (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic', marginTop: 16 }}>Loading…</div>
              ) : fund ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                    <span className="ds-score-num" style={{ fontSize: 44, color: '#7adba0', lineHeight: 1 }}>₹{fund.total_donated.toFixed(0)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>donated to causes</div>
                  {fund.total_lent_out > 0 && (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>₹{fund.total_lent_out.toFixed(0)} lent out · ₹{fund.total_returned.toFixed(0)} returned</div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
                    <button className="ds-btn ds-btn-sm" style={{ flex: 1, background: 'rgba(122,219,160,0.15)', color: '#7adba0', border: '1px solid rgba(122,219,160,0.3)', justifyContent: 'center', fontSize: 11 }}>Donate →</button>
                    <button className="ds-btn ds-btn-sm" style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.1)', justifyContent: 'center', fontSize: 11 }}>Lend →</button>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 10, fontFamily: 'var(--ds-mono)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em' }}>Micro-lending · cause donations</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 14, lineHeight: 1.5 }}>
                    Lend money to community members for eco/social projects, or donate to a cause.
                  </div>
                  <button className="ds-btn ds-btn-sm" style={{ marginTop: 14, width: '100%', justifyContent: 'center', background: 'rgba(122,219,160,0.15)', color: '#7adba0', border: '1px solid rgba(122,219,160,0.3)', fontSize: 11 }}>Start giving →</button>
                  <div style={{ marginTop: 8, fontSize: 10, fontFamily: 'var(--ds-mono)', color: 'rgba(255,255,255,0.3)' }}>Tree drives · water projects · relief camps</div>
                </>
              )}
            </div>

            {/* ── TILE 3: TOOL / ITEM BANK ─────────────────────────────────── */}
            <div style={{ flex: '1 1 200px', padding: '18px 22px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(232,116,34,0.25)', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 16 }}>🛠</span>
                <span className="ds-eyebrow" style={{ color: 'var(--ds-saffron)' }}>TOOL BANK</span>
              </div>
              {loading ? (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic', marginTop: 16 }}>Loading…</div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                    <span className="ds-score-num" style={{ fontSize: 44, color: 'var(--ds-saffron)', lineHeight: 1 }}>
                      {allItems.length > 0 ? allItems.length : myItems.length}
                    </span>
                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
                      {allItems.length > 0 ? 'items available' : 'items shared by you'}
                    </span>
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(allItems.length > 0 ? allItems : myItems).slice(0, 3).map((item) => (
                      <div key={item.id} style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', padding: '5px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 5, border: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span>{item.item_type === 'donate' ? '🎁' : '🔄'}</span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                        <span style={{ fontSize: 9, fontFamily: 'var(--ds-mono)', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>{item.category}</span>
                      </div>
                    ))}
                    {allItems.length === 0 && myItems.length === 0 && (
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
                        Share tools, seeds, eco-kits, or books with your community.
                      </div>
                    )}
                  </div>
                  <button onClick={() => setShowItemModal(true)} className="ds-btn ds-btn-sm"
                    style={{ marginTop: 12, width: '100%', justifyContent: 'center', background: 'rgba(232,116,34,0.15)', color: 'var(--ds-saffron)', border: '1px solid rgba(232,116,34,0.3)', fontSize: 11 }}>
                    + Offer an item
                  </button>
                  <div style={{ marginTop: 6, fontSize: 10, fontFamily: 'var(--ds-mono)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>Tools · Seeds · Eco-kits · Books</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Rest of page ─────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 24px 80px', fontFamily: 'var(--ds-sans)', color: 'var(--ds-ink)' }}>

        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {([['ledger', 'My Ledger'], ['offers', 'Community Offers'], ['items', 'Tool Bank']] as [string, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k as typeof tab)} className={`ds-btn ds-btn-sm ${tab === k ? 'ds-btn-plum' : 'ds-btn-ghost'}`}>{l}</button>
            ))}
          </div>
          <button onClick={() => setShowLog(true)} className="ds-btn ds-btn-sm ds-btn-gold">+ Post sewa</button>
        </div>

        {/* ── Ledger tab ───────────────────────────────────────────────────── */}
        {tab === 'ledger' && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {([['all', 'All'], ['earned', 'Earned'], ['spent', 'Spent'], ['pending', 'In progress']] as [string, string][]).map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} className="ds-btn ds-btn-sm"
                  style={{ background: filter === k ? 'var(--ds-ivory-warm)' : 'transparent', border: '1px solid var(--ds-hairline)', color: 'var(--ds-ink-soft)', fontWeight: filter === k ? 700 : 500 }}>
                  {l}
                </button>
              ))}
            </div>
            {loading ? (
              <div className="ds-card" style={{ padding: 32, textAlign: 'center', color: 'var(--ds-ink-mute)', fontSize: 14 }}>Loading your sewa history…</div>
            ) : filteredTxns.length === 0 ? (
              <div className="ds-card" style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🤝</div>
                <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 20, color: 'var(--ds-plum)', marginBottom: 8 }}>No sewa yet</div>
                <p style={{ fontSize: 13, color: 'var(--ds-ink-mute)', marginBottom: 16 }}>Post your first offer or need in the community — every hour counts toward your Prakriti score.</p>
                <button onClick={() => setShowLog(true)} className="ds-btn ds-btn-sm ds-btn-plum">Post a sewa →</button>
              </div>
            ) : (
              <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
                {filteredTxns.map((txn, i) => {
                  const kind = txnKind(txn, myId);
                  const meta = kindMeta[kind];
                  const isHelper = txn.helper_id === myId;
                  const otherName = isHelper ? (txn.requester_name ?? 'Community member') : (txn.helper_name ?? 'Community member');
                  const what = txn.description ?? (isHelper ? 'Sewa given' : 'Sewa received');
                  const when = new Date(txn.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                  return (
                    <div key={txn.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 16, padding: '16px 20px', borderBottom: i < filteredTxns.length - 1 ? '1px solid var(--ds-hairline)' : 'none', alignItems: 'center' }}>
                      <div style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--ds-ivory-warm)', border: '1px solid var(--ds-hairline)', display: 'grid', placeItems: 'center', color: meta.color, fontSize: 14 }}>
                        {kind === 'earned' ? '→' : kind === 'spent' ? '←' : kind === 'disputed' ? '⚠' : '⋯'}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: 'var(--ds-ink)' }}>{what}</div>
                        <div style={{ fontSize: 12, color: 'var(--ds-plum)', fontWeight: 600, marginTop: 2 }}>
                          {isHelper ? '↗ to' : '↙ from'} {otherName}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ds-ink-mute)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span>{when}</span>
                          <span>·</span>
                          <span style={{ textTransform: 'capitalize' }}>{txn.credit_type}</span>
                          <span>·</span>
                          <span style={{ color: meta.color, fontWeight: 600 }}>{meta.tag}</span>
                          {txn.is_flagged && <span style={{ color: 'var(--ds-plum-rose)', fontWeight: 700 }}>⚑ flagged</span>}
                        </div>
                      </div>
                      <div className="ds-score-num" style={{ fontSize: 20, color: meta.color, fontWeight: 700 }}>
                        {meta.sign}{txn.hours}<span style={{ fontSize: 10, color: 'var(--ds-ink-mute)', marginLeft: 3, fontWeight: 400 }}>hr</span>
                      </div>
                      <button className="ds-btn ds-btn-sm ds-btn-ghost" style={{ fontSize: 11 }}>Details</button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Offers tab ───────────────────────────────────────────────────── */}
        {tab === 'offers' && (
          <>
            <div style={{ fontSize: 13, color: 'var(--ds-ink-mute)', marginBottom: 14 }}>
              Open requests from the community — accept one to earn hours.
            </div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--ds-ink-mute)', fontSize: 14 }}>Loading community offers…</div>
            ) : requests.length === 0 ? (
              <div className="ds-card" style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🌱</div>
                <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 20, color: 'var(--ds-plum)' }}>No open requests right now</div>
                <p style={{ fontSize: 13, color: 'var(--ds-ink-mute)', marginTop: 6 }}>Be the first to post a community need or offer.</p>
                <button onClick={() => setShowLog(true)} className="ds-btn ds-btn-sm ds-btn-plum" style={{ marginTop: 14 }}>Post an offer →</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }} className="tb-offers">
                {requests.map((r, i) => (
                  <div key={r.id ?? i} className="ds-card" style={{ padding: 18, position: 'relative' }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <span className="ds-tag ds-tag-plum" style={{ fontSize: 10, textTransform: 'capitalize' }}>{r.category ?? 'general'}</span>
                      <span className="ds-tag" style={{ fontSize: 10, background: r.request_type === 'offer' ? 'rgba(122,219,160,0.12)' : 'rgba(232,116,34,0.12)', color: r.request_type === 'offer' ? '#7adba0' : 'var(--ds-saffron)', border: 'none' }}>
                        {r.request_type === 'offer' ? 'Offering' : 'Needs help'}
                      </span>
                    </div>
                    <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 17, fontWeight: 700, color: 'var(--ds-ink)', lineHeight: 1.3 }}>{r.title}</div>
                    {r.description && <p style={{ fontSize: 12, color: 'var(--ds-ink-soft)', marginTop: 6, lineHeight: 1.5 }}>{r.description}</p>}
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--ds-hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                      <span style={{ color: 'var(--ds-ink-mute)' }}>{r.requester_name ?? 'Community member'}</span>
                      {r.hours_estimate && (
                        <span style={{ color: 'var(--ds-gold-deep)', fontWeight: 700, fontFamily: 'var(--ds-mono)' }}>⏱ {r.hours_estimate} hr</span>
                      )}
                    </div>
                    <button className="ds-btn ds-btn-sm ds-btn-plum" style={{ marginTop: 10, width: '100%', justifyContent: 'center', fontSize: 12 }}>
                      {r.request_type === 'offer' ? 'Request this →' : 'Accept & help →'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Tool bank tab ─────────────────────────────────────────────────── */}
        {tab === 'items' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--ds-ink-mute)' }}>
                Tools, seeds, eco-kits, and books shared by the community — lend or donate.
              </div>
              <button onClick={() => setShowItemModal(true)} className="ds-btn ds-btn-sm ds-btn-gold">+ Offer an item</button>
            </div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--ds-ink-mute)', fontSize: 14 }}>Loading item bank…</div>
            ) : allItems.length === 0 && myItems.length === 0 ? (
              <div className="ds-card" style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🛠</div>
                <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 20, color: 'var(--ds-plum)', marginBottom: 8 }}>Community Tool Bank is empty</div>
                <p style={{ fontSize: 13, color: 'var(--ds-ink-mute)', marginBottom: 16 }}>Be the first to share tools, seeds, composting kits, or books with your community.</p>
                <button onClick={() => setShowItemModal(true)} className="ds-btn ds-btn-sm ds-btn-plum">Share an item →</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }} className="tb-offers">
                {(allItems.length > 0 ? allItems : myItems).map((item, i) => (
                  <div key={item.id ?? i} className="ds-card" style={{ padding: 18, position: 'relative' }}>
                    {myItems.some(m => m.id === item.id) && (
                      <div style={{ position: 'absolute', top: 12, right: 12, fontSize: 9, fontFamily: 'var(--ds-mono)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ds-gold-deep)', fontWeight: 700 }}>Yours</div>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <span className="ds-tag ds-tag-plum" style={{ fontSize: 10, textTransform: 'capitalize' }}>{item.category}</span>
                      <span className="ds-tag" style={{ fontSize: 10, background: item.item_type === 'donate' ? 'rgba(122,219,160,0.12)' : 'rgba(212,154,31,0.12)', color: item.item_type === 'donate' ? '#7adba0' : 'var(--ds-gold-deep)', border: 'none' }}>
                        {item.item_type === 'donate' ? '🎁 Free' : '🔄 Lend'}
                      </span>
                    </div>
                    <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 17, fontWeight: 700, color: 'var(--ds-ink)', lineHeight: 1.3 }}>{item.title}</div>
                    {item.description && <p style={{ fontSize: 12, color: 'var(--ds-ink-soft)', marginTop: 6, lineHeight: 1.5 }}>{item.description}</p>}
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--ds-hairline)', fontSize: 12, color: 'var(--ds-ink-mute)' }}>
                      {item.owner_name ?? 'Community member'}
                    </div>
                    {!myItems.some(m => m.id === item.id) && (
                      <button className="ds-btn ds-btn-sm ds-btn-plum" style={{ marginTop: 10, width: '100%', justifyContent: 'center', fontSize: 12 }}>
                        {item.item_type === 'donate' ? 'Claim →' : 'Request to borrow →'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* My items summary */}
            {myItems.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div className="ds-eyebrow" style={{ marginBottom: 10 }}>Your listed items</div>
                <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
                  {myItems.map((item, i) => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 14, padding: '14px 18px', borderBottom: i < myItems.length - 1 ? '1px solid var(--ds-hairline)' : 'none', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ds-ink)' }}>{item.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--ds-ink-mute)', marginTop: 2, textTransform: 'capitalize' }}>{item.category} · {item.item_type}</div>
                      </div>
                      <span className="ds-tag" style={{ fontSize: 10, textTransform: 'capitalize', background: item.status === 'available' ? 'rgba(122,219,160,0.12)' : 'rgba(232,116,34,0.12)', color: item.status === 'available' ? '#7adba0' : 'var(--ds-saffron)', border: 'none' }}>
                        {item.status}
                      </span>
                      <button className="ds-btn ds-btn-ghost ds-btn-sm" style={{ fontSize: 11 }}>Edit</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Community activity summary ───────────────────────────────────── */}
        {txns.length > 0 && tab === 'ledger' && (
          <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }} className="tb-cats">
            {[
              { label: 'Global / Eco sewa', earned: ecoHrs, color: '#7adba0' },
              { label: 'Local / Community sewa', earned: localHrs, color: 'var(--ds-gold-deep)' },
            ].map(c => {
              const total = Math.max(ecoHrs + localHrs, 1);
              return (
                <div key={c.label} className="ds-card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--ds-serif)', fontSize: 17, fontWeight: 700 }}>{c.label}</span>
                    <span style={{ fontFamily: 'var(--ds-mono)', fontSize: 12, color: c.color, fontWeight: 700 }}>{c.earned.toFixed(1)} hr</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 4, overflow: 'hidden', marginTop: 10, background: 'var(--ds-ivory-warm)' }}>
                    <div style={{ width: `${(c.earned / total) * 100}%`, height: '100%', background: c.color, opacity: 0.85 }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showLog && <LogSewaModal onClose={() => setShowLog(false)} />}
      {showItemModal && <OfferItemModal onClose={() => setShowItemModal(false)} onSaved={reloadItems} />}

      <style>{`
        @media (max-width: 900px) {
          .tb-offers { grid-template-columns: 1fr 1fr !important; }
          .tb-cats   { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 560px) {
          .tb-offers { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AppShell>
  );
};

export default TimeBankPage;
