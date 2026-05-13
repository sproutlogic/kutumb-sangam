import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, AlertTriangle, Check, LogOut } from 'lucide-react';
import { useTree } from '@/contexts/TreeContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePlan } from '@/contexts/PlanContext';
import { useLang } from '@/i18n/LanguageContext';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  fetchVanshaTree,
  setPersistedVanshaId,
  type AppNotification,
} from '@/services/api';
import { backendPayloadToTreeState } from '@/services/mapVanshaPayload';
import KutumbFooter from '@/components/shells/KutumbFooter';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';

/* ── SOS helpers ──────────────────────────────────────────────────────────── */
const SOS_CONTACTS_KEY = 'kutumb_sos_contacts';
const CURRENT_VANSHA_STORAGE_KEY = 'kutumb_current_vansha_id';

function getSavedSosContacts(): string[] | null {
  try {
    const raw = localStorage.getItem(SOS_CONTACTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}
function saveSosContacts(ids: string[]) {
  try { localStorage.setItem(SOS_CONTACTS_KEY, JSON.stringify(ids)); } catch { /* quota */ }
}

/* ── Nav links ────────────────────────────────────────────────────────────── */
const NAV_LINKS = [
  { label: 'Dashboard',    path: '/dashboard' },
  { label: 'Vanshavali',   path: '/vanshavali' },
  { label: 'Time Bank',    path: '/time-bank' },
  { label: 'Eco Panchang', path: '/eco-panchang' },
  { label: 'Settings',     path: '/settings' },
];

/* ── Broadcast template chips ─────────────────────────────────────────────── */
const BROADCAST_TEMPLATES = [
  '🪔 Puja invite',
  '🎂 Birthday wish',
  '📍 Location share',
  '🚨 Family emergency',
  '🎙️ Smriti request',
];

/* ═══════════════════════════════════════════════════════════════════════════ */

interface AppShellProps { children: React.ReactNode }

const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tr } = useLang();
  const { appUser, signOut } = useAuth();
  const { hasEntitlement, plan } = usePlan();
  const { state, pushActivity, isTreeInitialized, resetTree, loadTreeState } = useTree();

  /* ── Load tree on login ─────────────────────────────────────────────────── */
  useEffect(() => {
    const vid = appUser?.vansha_id;
    if (!vid || isTreeInitialized) return;
    setPersistedVanshaId(vid);
    fetchVanshaTree(vid)
      .then((data) => loadTreeState(backendPayloadToTreeState(data)))
      .catch(() => { /* non-fatal */ });
  }, [appUser?.vansha_id, isTreeInitialized, loadTreeState]);

  /* ── Logout ─────────────────────────────────────────────────────────────── */
  const handleLogout = async () => {
    await signOut();
    resetTree();
    localStorage.removeItem(CURRENT_VANSHA_STORAGE_KEY);
    navigate('/');
    window.location.reload();
  };

  /* ── Notifications ──────────────────────────────────────────────────────── */
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const unread = notifs.filter((n) => !n.read).length;

  useEffect(() => {
    if (!appUser) return;
    fetchNotifications(20).then(setNotifs);
    const t = setInterval(() => fetchNotifications(20).then(setNotifs), 120_000);
    return () => clearInterval(t);
  }, [appUser]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifsOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setNotifs((p) => p.map((n) => ({ ...n, read: true })));
  }
  async function handleMarkOne(id: string) {
    await markNotificationRead(id);
    setNotifs((p) => p.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  /* ── Broadcast modal ────────────────────────────────────────────────────── */
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [audience, setAudience] = useState('all');
  const [channel, setChannel] = useState('whatsapp');
  const [bcSending, setBcSending] = useState(false);
  const [bcSent, setBcSent] = useState(false);
  const canAnnounce = hasEntitlement('treeAnnounce');

  const sendBroadcast = () => {
    if (!broadcastMsg.trim()) return;
    if (!canAnnounce) { toast({ title: 'Upgrade to broadcast', description: 'Broadcast requires a higher plan.' }); return; }
    setBcSending(true);
    pushActivity('activityTreeBroadcast', { message: broadcastMsg.trim().slice(0, 500), audience, channel });
    setTimeout(() => {
      setBcSending(false);
      setBcSent(true);
      toast({ title: tr('announceSentTitle'), description: tr('announceSentDesc') });
      setTimeout(() => { setBroadcastOpen(false); setBcSent(false); setBroadcastMsg(''); }, 1400);
    }, 900);
  };

  /* ── SOS ────────────────────────────────────────────────────────────────── */
  const [sosOpen, setSosOpen] = useState(false);
  const [sosNote, setSosNote] = useState('');
  const [sosSending, setSosSending] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingSosAfterSetup, setPendingSosAfterSetup] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canSos = hasEntitlement('sosAlerts');
  const sosLimit = plan.sosNodeLimit ?? 0;
  const pickableNodes = state.nodes.filter((n) => n.id !== state.currentUserId);

  function openSosSetup(andSendAfter = false) {
    setSelectedIds(getSavedSosContacts() ?? []);
    setPendingSosAfterSetup(andSendAfter);
    setSetupOpen(true);
  }
  function saveSetupAndProceed() {
    saveSosContacts(selectedIds);
    setSetupOpen(false);
    if (pendingSosAfterSetup) { setSosOpen(true); }
    else { toast({ title: 'SOS contacts saved', description: `${selectedIds.length} contact(s) configured.` }); }
  }
  function toggleContact(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= sosLimit) return prev;
      return [...prev, id];
    });
  }
  const handleSosDown = () => {
    if (!canSos) return;
    longPressTimer.current = setTimeout(() => openSosSetup(false), 800);
  };
  const handleSosUp = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };
  const handleSosClick = () => {
    if (!canSos) { toast({ title: tr('sosLockedTitle'), description: tr('sosLockedDesc') }); navigate('/upgrade'); return; }
    if (!isTreeInitialized || !state.currentUserId) { toast({ title: tr('sosNoTree'), description: tr('sosNoTreeDesc'), variant: 'destructive' }); return; }
    const saved = getSavedSosContacts();
    if (!saved || saved.length === 0) { openSosSetup(true); return; }
    setSosOpen(true);
  };
  const sendSos = () => {
    setSosSending(true);
    const contactIds = getSavedSosContacts() ?? [];
    const recipientIds = contactIds.filter((id) => state.nodes.some((n) => n.id === id));
    const names = recipientIds.map((id) => state.nodes.find((n) => n.id === id)?.name ?? id).join(', ');
    const finish = (lat: string, lon: string) => {
      pushActivity('activitySosSent', { count: String(recipientIds.length), names: names.slice(0, 400), lat, lon, note: sosNote.slice(0, 300) });
      toast({ title: tr('sosSentTitle'), description: tr('sosSentDesc').replace('{n}', String(recipientIds.length)) });
      setSosOpen(false); setSosNote(''); setSosSending(false);
    };
    if (!navigator.geolocation) { finish('', ''); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => finish(String(pos.coords.latitude), String(pos.coords.longitude)),
      () => finish('', ''),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  };

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Navigation bar (reference style) ─────────────────────────────── */}
      <nav style={{
        background: 'var(--ds-surface, rgba(252,250,244,0.97))',
        borderBottom: '1px solid var(--ds-border, rgba(74,33,104,0.12))',
        position: 'sticky', top: 0, zIndex: 40,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}>
        <div style={{
          maxWidth: 1280, margin: '0 auto',
          display: 'flex', alignItems: 'center',
          padding: '0 24px', height: 70, gap: 20,
        }}>

          {/* Logo */}
          <button
            onClick={() => navigate('/dashboard')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <img src="/prakriti.svg" alt="Prakriti" style={{ height: 40, width: 'auto' }} />
            <img src="/prakriti-text-logo.svg" alt="" style={{ height: 28, width: 'auto', maxWidth: 160 }} />
          </button>

          {/* Nav links — centre */}
          <div style={{ display: 'flex', gap: 2, flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
            {NAV_LINKS.map(({ label, path }) => {
              const active = location.pathname === path;
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  style={{
                    padding: '7px 15px', borderRadius: 8, fontSize: 14,
                    fontWeight: active ? 600 : 500,
                    background: active ? 'rgba(46,19,70,0.08)' : 'transparent',
                    color: active ? 'var(--ds-plum, #2e1346)' : 'var(--ds-muted, rgba(46,19,70,0.55))',
                    border: 'none', cursor: 'pointer', transition: 'all 0.12s',
                    fontFamily: 'var(--ds-sans, inherit)',
                  }}
                >
                  {label}
                </button>
              );
            })}
            {appUser?.role === 'margdarshak' && (
              <button
                onClick={() => navigate('/margdarshak')}
                style={{
                  padding: '7px 15px', borderRadius: 8, fontSize: 14, fontWeight: 500,
                  background: location.pathname === '/margdarshak' ? 'rgba(46,19,70,0.08)' : 'transparent',
                  color: location.pathname === '/margdarshak' ? 'var(--ds-plum, #2e1346)' : 'var(--ds-muted, rgba(46,19,70,0.55))',
                  border: 'none', cursor: 'pointer', transition: 'all 0.12s',
                }}
              >
                Pandit Ji
              </button>
            )}
          </div>

          {/* Right actions */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>

            {/* Broadcast to entire tree — gold, reference style */}
            <button
              onClick={() => setBroadcastOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'linear-gradient(180deg, #e9c267, #d49a1f)',
                color: '#1c0d2e', fontWeight: 700, fontSize: 13,
                padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                boxShadow: '0 0 0 1px rgba(212,154,31,0.3), 0 4px 14px -4px rgba(212,154,31,0.5)',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 11l18-8-8 18-2-8-8-2z"/>
              </svg>
              Broadcast to entire tree
            </button>

            {/* Notifications bell */}
            {appUser && (
              <div ref={notifRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setNotifsOpen((v) => !v)}
                  style={{
                    position: 'relative', width: 36, height: 36, borderRadius: 8,
                    background: 'transparent', border: '1px solid var(--ds-border, rgba(74,33,104,0.12))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}
                >
                  <Bell style={{ width: 16, height: 16, color: 'var(--ds-muted, rgba(46,19,70,0.55))' }} />
                  {unread > 0 && (
                    <span style={{
                      position: 'absolute', top: -4, right: -4,
                      minWidth: 16, height: 16, borderRadius: 9999,
                      background: '#ef4444', color: '#fff', fontSize: 9,
                      fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                    }}>
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>

                {notifsOpen && (
                  <div style={{
                    position: 'absolute', right: 0, top: 44, zIndex: 50, width: 320,
                    background: 'var(--ds-surface, #faf7f0)',
                    border: '1px solid var(--ds-border, rgba(74,33,104,0.12))',
                    borderRadius: 12, boxShadow: '0 8px 32px -8px rgba(28,13,46,0.18)',
                    overflow: 'hidden',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--ds-border, rgba(74,33,104,0.12))' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ds-text, #1c0d2e)' }}>Notifications</span>
                      {unread > 0 && (
                        <button onClick={handleMarkAllRead} style={{ fontSize: 10, color: 'var(--ds-gold, #d49a1f)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                      {notifs.length === 0 ? (
                        <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 12, color: 'var(--ds-muted, rgba(46,19,70,0.55))' }}>
                          No notifications yet.
                        </div>
                      ) : notifs.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleMarkOne(n.id)}
                          style={{
                            width: '100%', textAlign: 'left', padding: '10px 16px',
                            borderBottom: '1px solid rgba(74,33,104,0.06)',
                            background: !n.read ? 'rgba(46,19,70,0.04)' : 'transparent',
                            border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'flex-start', gap: 8,
                          }}
                        >
                          {!n.read && <span style={{ marginTop: 5, width: 6, height: 6, borderRadius: '50%', background: 'var(--ds-gold, #d49a1f)', flexShrink: 0 }} />}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--ds-text, #1c0d2e)', margin: 0 }}>{n.title}</p>
                            {n.body && <p style={{ fontSize: 11, color: 'var(--ds-muted, rgba(46,19,70,0.55))', marginTop: 2 }}>{n.body}</p>}
                            <p style={{ fontSize: 10, color: 'rgba(74,33,104,0.4)', marginTop: 3 }}>
                              {new Date(n.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SOS */}
            <button
              onClick={handleSosClick}
              onMouseDown={handleSosDown}
              onMouseUp={handleSosUp}
              onMouseLeave={handleSosUp}
              onTouchStart={handleSosDown}
              onTouchEnd={handleSosUp}
              title={canSos ? 'Tap: send SOS · Hold: change contacts' : 'Upgrade to use SOS'}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: 'rgba(239,68,68,0.1)', color: '#dc2626',
                border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <AlertTriangle style={{ width: 14, height: 14 }} />
              SOS
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              title="Sign out"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: 8,
                background: 'transparent', border: '1px solid var(--ds-border, rgba(74,33,104,0.12))',
                cursor: 'pointer', color: 'var(--ds-muted, rgba(46,19,70,0.55))',
              }}
            >
              <LogOut style={{ width: 15, height: 15 }} />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Main content (full width, no sidebar) ───────────────────────── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
      <KutumbFooter />

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Broadcast modal */}
      {broadcastOpen && (
        <div
          onClick={() => !bcSending && setBroadcastOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(28,13,46,0.55)', backdropFilter: 'blur(8px)', zIndex: 200, display: 'grid', placeItems: 'center', padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(560px, 100%)', background: 'var(--ds-surface, #faf7f0)', borderRadius: 16, padding: 28, position: 'relative', boxShadow: '0 24px 64px -12px rgba(28,13,46,0.28)' }}
          >
            <button
              onClick={() => setBroadcastOpen(false)}
              style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: '50%', background: 'rgba(74,33,104,0.08)', border: '1px solid var(--ds-border, rgba(74,33,104,0.12))', display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 16 }}
            >×</button>

            <span style={{ fontSize: 10, fontFamily: 'var(--ds-mono, monospace)', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ds-gold, #d49a1f)' }}>Broadcast · entire tree</span>
            <h3 style={{ fontFamily: 'var(--ds-serif, serif)', fontSize: 24, marginTop: 6, color: 'var(--ds-plum, #2e1346)', marginBottom: 4 }}>Send to your parivar</h3>
            <p style={{ fontSize: 13, color: 'var(--ds-muted, rgba(46,19,70,0.55))', marginTop: 0 }}>Reaches all members across generations. Delivered via chosen channel.</p>

            {/* Audience */}
            <div style={{ marginTop: 16 }}>
              <label style={{ fontSize: 11, fontFamily: 'var(--ds-mono)', color: 'var(--ds-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Audience</label>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {[['all','Entire tree'],['elders','Elders only'],['immediate','Immediate'],['cousins','Cousins']].map(([k, l]) => (
                  <button key={k} onClick={() => setAudience(k)}
                    style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: audience === k ? 'none' : '1px solid var(--ds-border)', background: audience === k ? 'var(--ds-plum, #2e1346)' : 'transparent', color: audience === k ? '#fff' : 'var(--ds-muted)' }}
                  >{l}</button>
                ))}
              </div>
            </div>

            {/* Channel */}
            <div style={{ marginTop: 14 }}>
              <label style={{ fontSize: 11, fontFamily: 'var(--ds-mono)', color: 'var(--ds-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Channel</label>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {[['whatsapp','WhatsApp'],['sms','SMS'],['app','In-app only'],['voice','Voice call']].map(([k, l]) => (
                  <button key={k} onClick={() => setChannel(k)}
                    style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: channel === k ? 700 : 500, cursor: 'pointer', border: '1px solid var(--ds-border)', background: channel === k ? 'rgba(232,116,34,0.08)' : 'transparent', color: 'var(--ds-text, #1c0d2e)' }}
                  >{l}</button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div style={{ marginTop: 14 }}>
              <label style={{ fontSize: 11, fontFamily: 'var(--ds-mono)', color: 'var(--ds-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Message</label>
              <textarea
                value={broadcastMsg}
                onChange={(e) => setBroadcastMsg(e.target.value)}
                placeholder="e.g. Saturday 7pm — Satyanarayan katha at our place. All cousins please come."
                rows={4}
                style={{ marginTop: 8, width: '100%', borderRadius: 8, border: '1px solid var(--ds-border)', padding: '10px 12px', fontFamily: 'inherit', fontSize: 13, resize: 'vertical', background: 'rgba(74,33,104,0.03)', color: 'var(--ds-text)', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {BROADCAST_TEMPLATES.map((t) => (
                  <button key={t} onClick={() => setBroadcastMsg(t.replace(/^[\S]+ /, ''))}
                    style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, background: 'transparent', border: '1px solid var(--ds-border)', cursor: 'pointer', color: 'var(--ds-muted)' }}
                  >{t}</button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
              {bcSent && <span style={{ fontSize: 13, color: '#2aa86b', fontWeight: 600 }}>✓ Broadcast queued</span>}
              <button onClick={() => setBroadcastOpen(false)} disabled={bcSending}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--ds-border)', background: 'transparent', cursor: 'pointer', fontSize: 13 }}
              >Cancel</button>
              <button onClick={sendBroadcast} disabled={bcSending || !broadcastMsg.trim()}
                style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--ds-plum, #2e1346)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: bcSending || !broadcastMsg.trim() ? 0.5 : 1 }}
              >{bcSending ? 'Sending…' : 'Send →'}</button>
            </div>
          </div>
        </div>
      )}

      {/* SOS Contact Setup Modal */}
      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="font-body sm:max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-heading">{tr('sosSetupTitle')}</DialogTitle>
            <DialogDescription>{tr('sosSetupDesc')}</DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground px-1">
            {tr('sosSetupLimit').replace('{n}', String(sosLimit))}{' '}
            <span className="font-semibold text-foreground">{selectedIds.length}/{sosLimit} selected</span>
          </p>
          <div className="overflow-y-auto flex-1 space-y-1 pr-1 -mr-1">
            {pickableNodes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No family members yet. Add members first.</p>
            ) : pickableNodes.map((node) => {
              const selected = selectedIds.includes(node.id);
              const atLimit = selectedIds.length >= sosLimit && !selected;
              return (
                <button key={node.id} type="button" disabled={atLimit} onClick={() => toggleContact(node.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${selected ? 'border-destructive/50 bg-destructive/8 text-foreground' : atLimit ? 'border-border/30 bg-secondary/20 text-muted-foreground/50 cursor-not-allowed' : 'border-border/50 bg-card hover:bg-secondary/30 text-foreground'}`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${selected ? 'border-destructive bg-destructive' : 'border-border'}`}>
                    {selected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{node.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{node.relation}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/50 mt-2">
            <button type="button" className="rounded-md border border-border px-4 py-2 text-sm" onClick={() => setSetupOpen(false)}>{tr('cancel')}</button>
            <button type="button" disabled={selectedIds.length === 0} className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50" onClick={saveSetupAndProceed}>{tr('sosSetupSave')}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SOS Send Modal */}
      <Dialog open={sosOpen} onOpenChange={setSosOpen}>
        <DialogContent className="font-body sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">{tr('sosDialogTitle')}</DialogTitle>
            <DialogDescription>{tr('sosDialogDesc')}</DialogDescription>
          </DialogHeader>
          {(() => {
            const saved = getSavedSosContacts() ?? [];
            const names = saved.map((id) => state.nodes.find((n) => n.id === id)?.name).filter(Boolean);
            return names.length > 0 ? (
              <div className="rounded-lg bg-destructive/8 border border-destructive/20 px-3 py-2">
                <p className="text-xs font-semibold text-destructive mb-1">Alerting {names.length} contact(s):</p>
                <p className="text-xs text-muted-foreground">{names.join(', ')}</p>
                <button type="button" className="text-[11px] text-primary hover:underline mt-1" onClick={() => { setSosOpen(false); openSosSetup(true); }}>Change contacts</button>
              </div>
            ) : null;
          })()}
          <textarea value={sosNote} onChange={(e) => setSosNote(e.target.value)} placeholder={tr('sosNotePlaceholder')} className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" maxLength={300} />
          <DialogFooter className="gap-2 sm:gap-0">
            <button type="button" className="rounded-md border border-border px-4 py-2 text-sm" onClick={() => setSosOpen(false)}>{tr('cancel')}</button>
            <button type="button" disabled={sosSending} className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50" onClick={sendSos}>{sosSending ? '…' : tr('sosSend')}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default AppShell;
