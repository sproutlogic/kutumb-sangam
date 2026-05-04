import { useState, useEffect } from 'react';
import AppShell from '@/components/shells/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import {
  Palette, User, Bell, Lock, UserCheck,
  Database, Check, Download, ArrowRightLeft, Trash2, Loader2,
} from 'lucide-react';
import { fetchVanshaTree, getApiBaseUrl, isValidVanshaUuid } from '@/services/api';

// ── Toggle ──────────────────────────────────────────────────────────────────
function Toggle({ defaultOn }: { defaultOn: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      onClick={() => setOn(!on)}
      aria-checked={on}
      role="switch"
      className="relative flex-shrink-0 w-10 h-[22px] rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      style={{ background: on ? 'var(--color-primary, #0e3528)' : '#d1d5db' }}
    >
      <span
        className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all duration-150"
        style={{ left: on ? 20 : 2 }}
      />
    </button>
  );
}

// ── PaletteSwatch ───────────────────────────────────────────────────────────
const PALETTES = [
  { v: 'emerald', l: 'Emerald',  s: 'Tulsi · prosperity (default)', colors: ['#08221b','#0e3528','#2a8068','#7adba0'] },
  { v: 'plum',    l: 'Plum',     s: 'Royal · ancestral',            colors: ['#1c0d2e','#2e1346','#7a3a8e','#d49a1f'] },
  { v: 'saffron', l: 'Saffron',  s: 'Renunciation · fire',          colors: ['#2a0e08','#4a1a10','#b04a26','#e87422'] },
  { v: 'indigo',  l: 'Indigo',   s: 'Night sky · cosmic',           colors: ['#0a1230','#131e4d','#3a4f9a','#d49a1f'] },
];

function PaletteSwatch({ pal, active, onClick }: { pal: typeof PALETTES[0]; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative text-left rounded-xl p-4 border transition-all duration-150 hover:-translate-y-0.5"
      style={{
        border: active ? '2px solid rgb(46,19,70)' : '1px solid #e6dcc4',
        boxShadow: active ? '0 12px 30px -10px rgba(46,19,70,0.25)' : '0 1px 0 rgba(28,13,46,0.04), 0 8px 28px -12px rgba(28,13,46,0.12)',
        background: 'white',
      }}
    >
      {active && (
        <span className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: 'rgb(46,19,70)' }}>
          <Check className="w-3 h-3" />
        </span>
      )}
      <div className="flex h-16 rounded-lg overflow-hidden mb-3">
        {pal.colors.map((c, i) => <div key={i} className="flex-1" style={{ background: c }} />)}
      </div>
      <p className="font-semibold text-sm text-foreground">{pal.l}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{pal.s}</p>
    </button>
  );
}

// ── Section wrapper ─────────────────────────────────────────────────────────
function Section({ id, label, title, children }: { id: string; label: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24">
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">{label}</p>
      <h2 className="font-heading text-2xl font-semibold mt-1.5 mb-5">{title}</h2>
      {children}
    </div>
  );
}

interface TreeProfile {
  fullName: string;
  gotra: string;
  moolNiwas: string;
}

interface FamilyMargdarshak {
  id: string;
  full_name: string | null;
  status: string;
}

// ── SettingsPage ─────────────────────────────────────────────────────────────
const SettingsPage = () => {
  const { appUser } = useAuth();
  const [palette, setPaletteState] = useState<string>(() => {
    try { return localStorage.getItem('ks_palette') || 'emerald'; } catch { return 'emerald'; }
  });
  const [density, setDensity] = useState<string>('comfortable');
  const [treeProfile, setTreeProfile] = useState<TreeProfile | null>(null);
  const [margdarshaks, setMargdarshaks] = useState<FamilyMargdarshak[] | null>(null);
  const [margdarshakLoading, setMargdarshakLoading] = useState(false);

  useEffect(() => {
    const vid = appUser?.vansha_id;
    if (!vid || !isValidVanshaUuid(vid)) return;
    fetchVanshaTree(vid)
      .then(payload => {
        const persons = payload.persons as Record<string, unknown>[];
        // Find the node that belongs to this user: prefer owner_id match with relation=self,
        // then any owner_id match, then the anchor (gen 0), then first person.
        const uid = appUser?.id ?? '';
        const root =
          persons.find(p => String(p.owner_id ?? '') === uid && String(p.relation ?? '').toLowerCase() === 'self') ??
          persons.find(p => String(p.owner_id ?? '') === uid) ??
          persons.find(p => (p.relative_gen_index as number) === 0) ??
          persons[0];
        if (!root) return;
        const first = String(root.first_name ?? '').trim();
        const mid   = String(root.middle_name ?? '').trim();
        const last  = String(root.last_name ?? '').trim();
        const parts = [first, mid, last].filter(Boolean);
        setTreeProfile({
          fullName:  parts.join(' ') || appUser?.full_name || 'Not set',
          gotra:     String(root.gotra ?? '').trim() || '—',
          moolNiwas: String(root.mool_niwas ?? '').trim() || '—',
        });
      })
      .catch(() => { /* tree fetch is best-effort */ });
  }, [appUser?.vansha_id]);

  useEffect(() => {
    const vid = appUser?.vansha_id;
    if (!vid) return;
    setMargdarshakLoading(true);
    const token = (() => {
      try {
        const keys = Object.keys(localStorage).filter(k => k.includes('supabase') && k.includes('auth'));
        for (const key of keys) {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw) as { access_token?: string };
          if (parsed?.access_token) return parsed.access_token;
        }
      } catch { /* ignore */ }
      return '';
    })();
    fetch(`${getApiBaseUrl()}/api/margdarshak/family`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() as Promise<FamilyMargdarshak[]> : Promise.resolve([]))
      .then(data => setMargdarshaks(data))
      .catch(() => setMargdarshaks([]))
      .finally(() => setMargdarshakLoading(false));
  }, [appUser?.vansha_id]);

  const applyPalette = (p: string) => {
    setPaletteState(p);
    try { localStorage.setItem('ks_palette', p); } catch { /* ignore */ }
    document.body.setAttribute('data-palette', p);
  };

  const applyDensity = (d: string) => {
    setDensity(d);
    document.body.setAttribute('data-density', d);
  };

  const SECTIONS = [
    { id: 'appearance',   label: 'Theme' },
    { id: 'account',      label: 'Account & profile' },
    { id: 'notifs',       label: 'Notifications' },
    { id: 'privacy',      label: 'Privacy & sharing' },
    { id: 'margdarshaks', label: 'Connected Margdarshaks' },
    { id: 'data',         label: 'Data & export' },
  ];

  const NOTIFS = [
    ['Daily nitya streak nudge',                 '7am · "Don\'t lose your streak"',           true ],
    ['Pal stories from kin',                      'When elders or close cousins post',          true ],
    ['On This Day · ancestor reminders',          'Birthdays, milestones, anniversaries',       true ],
    ['Sewa Chakra — new requests in your skill', 'Within 10 km · matching tags',               true ],
    ['Radar — kin enters 5 km',                  'Live geofence alert',                        false],
    ['Margdarshak verification updates',          'Status changes only',                        true ],
    ['Eco Panchang — daily action',              'Sunrise notification',                       true ],
    ['Marketing & sachet offers',                'Maximum 1/week',                             false],
  ] as [string, string, boolean][];

  const PRIVACY = [
    ['Show on Radar to extended kin',             '3rd-degree cousins and beyond',                       false],
    ['Allow in-laws to see Smriti audio',         'Fine-grained control per recording in Tree',          true ],
    ['Public Pride Wall mirror',                  'Show selected achievements outside family',           false],
    ['Vanshavali in temple registers',            'Mandir Mitra integration · Temple Trusts',            true ],
  ] as [string, string, boolean][];

  const DATA_ACTIONS = [
    { label: 'Export', sub: 'Download full vanshavali (PDF) · A2 print-ready · margdarshak-stamped · ₹149', icon: Download },
    { label: 'Archive', sub: 'Export all Smriti recordings as ZIP', icon: Database },
    { label: 'Leave', sub: 'Transfer Karta role or delete account', icon: ArrowRightLeft },
  ];

  const displayName = treeProfile?.fullName ?? appUser?.full_name ?? 'Not set';

  return (
    <AppShell>
      {/* Hero */}
      <div className="bg-primary text-primary-foreground px-6 py-10">
        <div className="max-w-5xl mx-auto">
          <p className="font-mono text-[10px] tracking-[0.22em] uppercase opacity-70 mb-2">Vyavastha · Settings</p>
          <h1 className="font-heading text-3xl md:text-4xl font-bold">
            Tune your <em>parivar</em> experience
          </h1>
          <p className="mt-2 text-sm opacity-65">Theme, notifications, privacy. Saved across all your devices.</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="flex gap-10 items-start">

          {/* Sticky sidebar nav */}
          <aside className="hidden lg:flex flex-col gap-0.5 w-52 flex-shrink-0 sticky top-20">
            {SECTIONS.map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                className="text-[13px] px-3 py-2.5 rounded-lg font-body font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border-l-2 border-transparent"
                style={{ scrollBehavior: 'smooth' }}
              >
                {label}
              </a>
            ))}
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0 flex flex-col gap-14">

            {/* ── Appearance ── */}
            <Section id="appearance" label="Appearance" title="Choose your theme">
              <p className="text-sm text-muted-foreground mb-5">
                The whole platform takes on this palette. Emerald is our default — chosen for prosperity and the tulsi leaf.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {PALETTES.map(p => (
                  <PaletteSwatch key={p.v} pal={p} active={palette === p.v} onClick={() => applyPalette(p.v)} />
                ))}
              </div>
              <div className="mt-5 p-4 rounded-lg bg-secondary/50 border border-border/50 flex items-center gap-4">
                <Palette className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">Density</p>
                  <p className="text-xs text-muted-foreground">How tightly elements pack on screen</p>
                </div>
                <div className="flex gap-2">
                  {(['compact','comfortable','spacious'] as const).map(d => (
                    <button
                      key={d}
                      onClick={() => applyDensity(d)}
                      className="px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wide border transition-colors"
                      style={{
                        background: density === d ? '#0e3528' : 'white',
                        color: density === d ? 'white' : '#4a3d52',
                        borderColor: density === d ? '#0e3528' : '#e6dcc4',
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </Section>

            {/* ── Account ── */}
            <Section id="account" label="Account & profile" title="Who you are in the parivar">
              <div className="bg-card rounded-xl border border-border/50 shadow-card p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {[
                    ['Full name',       displayName],
                    ['Gotra',           treeProfile?.gotra     ?? '—'],
                    ['Vansh ID',        appUser?.kutumb_id     || appUser?.vansha_id || 'KS-XXXX-XXXX'],
                    ['Role in parivar', appUser?.role          || 'Member'],
                    ['Phone',           appUser?.phone         || 'Not linked'],
                    ['Native place',    treeProfile?.moolNiwas ?? '—'],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-1">{label}</p>
                      <p className="text-sm font-semibold text-foreground">{val}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            {/* ── Notifications ── */}
            <Section id="notifs" label="Notifications" title="What pings you, when">
              <div className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
                {NOTIFS.map(([label, sub, defaultOn], i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-2.5 ${i < NOTIFS.length - 1 ? 'border-b border-border/40' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold leading-tight">{label}</p>
                      <p className="text-[11px] text-muted-foreground leading-tight">{sub}</p>
                    </div>
                    <Toggle defaultOn={defaultOn} />
                  </div>
                ))}
              </div>
            </Section>

            {/* ── Privacy ── */}
            <Section id="privacy" label="Privacy & sharing" title="Your data is yours">
              <div className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
                {PRIVACY.map(([label, sub, defaultOn], i) => (
                  <div key={i} className={`flex items-center justify-between gap-4 px-5 py-4 ${i < PRIVACY.length - 1 ? 'border-b border-border/40' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                    </div>
                    <Toggle defaultOn={defaultOn} />
                  </div>
                ))}
              </div>
            </Section>

            {/* ── Connected Margdarshaks ── */}
            <Section id="margdarshaks" label="Connected Margdarshaks" title="Your verified guides">
              <div className="bg-card rounded-xl border border-border/50 shadow-card p-6">
                {margdarshakLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading…</span>
                  </div>
                ) : margdarshaks && margdarshaks.length > 0 ? (
                  <div className="flex flex-col gap-3 mb-5">
                    {margdarshaks.map(m => (
                      <div key={m.id} className="flex items-center gap-4">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <UserCheck className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{m.full_name ?? 'Margdarshak'}</p>
                          <p className="text-xs text-muted-foreground capitalize">{m.status}</p>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold tracking-wide uppercase">
                          {m.status === 'active' ? 'Active' : 'Verifying'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 mb-5 text-muted-foreground">
                    <User className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm">No Margdarshak linked yet. Connect one to verify your family tree.</p>
                  </div>
                )}
                <button className="w-full py-2.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors font-body">
                  + Connect a new Margdarshak
                </button>
              </div>
            </Section>

            {/* ── Data ── */}
            <Section id="data" label="Your data" title="Export, archive, leave">
              <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 flex flex-col gap-4">
                {DATA_ACTIONS.map(({ label, sub, icon: Icon }) => (
                  <div key={label} className="flex items-center justify-between gap-4 py-1">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                      </div>
                    </div>
                    <span className="flex-shrink-0 text-[11px] px-2.5 py-1 rounded-full bg-secondary text-muted-foreground font-medium border border-border/50">
                      Coming soon
                    </span>
                  </div>
                ))}
              </div>
            </Section>

          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default SettingsPage;
