import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Megaphone, Radio, Check, Bell } from "lucide-react";
import { useLang } from "@/i18n/LanguageContext";
import { usePlan } from "@/contexts/PlanContext";
import { useTree } from "@/contexts/TreeContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from "@/services/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const SOS_CONTACTS_KEY = "kutumb_sos_contacts";

function getSavedSosContacts(): string[] | null {
  try {
    const raw = localStorage.getItem(SOS_CONTACTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveSosContacts(ids: string[]) {
  try {
    localStorage.setItem(SOS_CONTACTS_KEY, JSON.stringify(ids));
  } catch { /* quota / private mode */ }
}

/**
 * Top bar: SOS (subscription), centre announce broadcast (Vansh), plan upsell.
 */
export function AppTopBar() {
  const { tr } = useLang();
  const navigate = useNavigate();
  const { hasEntitlement, planId, plan } = usePlan();
  const { state, pushActivity, isTreeInitialized } = useTree();
  const { appUser } = useAuth();

  // ── Notifications ──────────────────────────────────────────────────────────
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const unread = notifs.filter((n) => !n.read).length;

  useEffect(() => {
    if (!appUser) return;
    fetchNotifications(20).then(setNotifs);
    // Refresh every 2 minutes
    const timer = setInterval(() => fetchNotifications(20).then(setNotifs), 120_000);
    return () => clearInterval(timer);
  }, [appUser]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  async function handleMarkOne(id: string) {
    await markNotificationRead(id);
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }

  // SOS state
  const [sosOpen, setSosOpen] = useState(false);
  const [sosNote, setSosNote] = useState("");
  const [sending, setSending] = useState(false);

  // SOS contact setup state (shown on first press)
  const [setupOpen, setSetupOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingSosAfterSetup, setPendingSosAfterSetup] = useState(false);

  // Announce state
  const [announce, setAnnounce] = useState("");

  // Long-press to reconfigure SOS contacts
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canSos = hasEntitlement("sosAlerts");
  const canAnnounce = hasEntitlement("treeAnnounce");
  const sosLimit = plan.sosNodeLimit ?? 0;
  const senderId = state.currentUserId;

  // Members available to pick as SOS contacts (everyone except self)
  const pickableNodes = state.nodes.filter((n) => n.id !== senderId);

  function openSosSetup(andSendAfter = false) {
    const saved = getSavedSosContacts();
    setSelectedIds(saved ?? []);
    setPendingSosAfterSetup(andSendAfter);
    setSetupOpen(true);
  }

  function saveSetupAndProceed() {
    saveSosContacts(selectedIds);
    setSetupOpen(false);
    if (pendingSosAfterSetup) {
      setSosOpen(true);
    } else {
      toast({ title: "SOS contacts saved", description: `${selectedIds.length} contact(s) configured.` });
    }
  }

  function toggleContact(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= sosLimit) return prev; // at limit
      return [...prev, id];
    });
  }

  const handleSosButtonDown = () => {
    if (!canSos) return;
    // Long press (800ms) → reconfigure contacts
    longPressTimer.current = setTimeout(() => {
      openSosSetup(false);
    }, 800);
  };

  const handleSosButtonUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleSosClick = () => {
    if (!canSos) {
      toast({ title: tr("sosLockedTitle"), description: tr("sosLockedDesc") });
      navigate("/upgrade");
      return;
    }
    if (!isTreeInitialized || !senderId) {
      toast({ title: tr("sosNoTree"), description: tr("sosNoTreeDesc"), variant: "destructive" });
      return;
    }

    const saved = getSavedSosContacts();
    // First press ever OR no contacts configured → show setup
    if (!saved || saved.length === 0) {
      openSosSetup(true);
      return;
    }
    setSosOpen(true);
  };

  const sendSos = () => {
    setSending(true);
    const contactIds = getSavedSosContacts() ?? [];
    const recipientIds = contactIds.filter((id) => state.nodes.some((n) => n.id === id));
    const names = recipientIds
      .map((id) => state.nodes.find((n) => n.id === id)?.name ?? id)
      .join(", ");

    const finish = (lat: string, lon: string) => {
      pushActivity("activitySosSent", {
        count: String(recipientIds.length),
        names: names.slice(0, 400),
        lat,
        lon,
        note: sosNote.slice(0, 300),
      });
      toast({
        title: tr("sosSentTitle"),
        description: tr("sosSentDesc").replace("{n}", String(recipientIds.length)),
      });
      setSosOpen(false);
      setSosNote("");
      setSending(false);
    };

    if (!navigator.geolocation) {
      finish("", "");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => finish(String(pos.coords.latitude), String(pos.coords.longitude)),
      () => finish("", ""),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  };

  const sendAnnounce = () => {
    const t = announce.trim();
    if (!t || !canAnnounce) return;
    pushActivity("activityTreeBroadcast", { message: t.slice(0, 500) });
    toast({ title: tr("announceSentTitle"), description: tr("announceSentDesc") });
    setAnnounce("");
  };

  return (
    <>
      <header className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-card/95 px-2 md:px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:w-[180px] md:flex-none">
          <button
            type="button"
            onClick={() => navigate(isTreeInitialized ? '/dashboard' : '/')}
            className="inline-flex items-center"
            aria-label="Prakriti home"
          >
            <img src="/prakriti.svg" alt="Prakriti" className="h-7 w-auto" />
          </button>
        </div>

        <div className="flex min-w-0 flex-[2] items-center justify-center px-1">
          {canAnnounce ? (
            <div className="flex w-full max-w-xl items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-2 py-1">
              <Megaphone className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <input
                type="text"
                value={announce}
                onChange={(e) => setAnnounce(e.target.value)}
                placeholder={tr("announcePlaceholder")}
                className="min-w-0 flex-1 bg-transparent text-xs font-body text-foreground placeholder:text-muted-foreground focus:outline-none"
                maxLength={500}
              />
              <button
                type="button"
                onClick={sendAnnounce}
                disabled={!announce.trim()}
                className="shrink-0 rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground disabled:opacity-40"
              >
                {tr("announceSend")}
              </button>
            </div>
          ) : (
            <div className="hidden items-center gap-1 text-[10px] text-muted-foreground sm:flex">
              <Radio className="h-3 w-3" aria-hidden />
              <span>{tr("announceLockedHint")}</span>
              <button
                type="button"
                onClick={() => navigate("/upgrade")}
                className="text-primary underline underline-offset-2"
              >
                {tr("upgradePlan")}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-1 items-center justify-end gap-2 md:w-[180px] md:flex-none">
          <a
            href="https://ecotech.co.in"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center"
            aria-label="Aarush Eco Tech"
          >
            <img src="/logo.svg" alt="Aarush Eco Tech" className="h-7 w-auto" />
          </a>
          {planId === "beej" && (
            <button
              type="button"
              onClick={() => navigate("/upgrade")}
              className="hidden text-[10px] text-muted-foreground underline hover:text-foreground sm:inline"
            >
              {tr("privacyUpgradeHint")}
            </button>
          )}

          {/* ── Notifications Bell ── */}
          {appUser && (
            <div ref={notifRef} className="relative">
              <button
                type="button"
                onClick={() => setNotifsOpen((v) => !v)}
                className="relative inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-secondary transition-colors"
                title="Notifications"
              >
                <Bell className="w-4 h-4 text-muted-foreground" />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center px-0.5">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>

              {notifsOpen && (
                <div className="absolute right-0 top-10 z-50 w-80 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                    <span className="text-sm font-semibold">Notifications</span>
                    {unread > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-[10px] text-primary hover:underline font-medium"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {notifs.length === 0 ? (
                      <div className="py-8 text-center text-xs text-muted-foreground">
                        No notifications yet.
                      </div>
                    ) : (
                      notifs.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleMarkOne(n.id)}
                          className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors ${
                            !n.read ? "bg-primary/5" : ""
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {!n.read && (
                              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium leading-snug">{n.title}</p>
                              {n.body && (
                                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                              )}
                              <p className="text-[10px] text-muted-foreground/70 mt-1">
                                {new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleSosClick}
            onMouseDown={handleSosButtonDown}
            onMouseUp={handleSosButtonUp}
            onMouseLeave={handleSosButtonUp}
            onTouchStart={handleSosButtonDown}
            onTouchEnd={handleSosButtonUp}
            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 select-none"
            title={canSos ? "Tap: send SOS · Hold: change contacts" : "Upgrade to use SOS"}
          >
            <AlertTriangle className="h-4 w-4" aria-hidden />
            SOS
          </button>
        </div>
      </header>

      {/* ── SOS Contact Setup Modal (first press) ─────────────────────────── */}
      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="font-body sm:max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-heading">{tr("sosSetupTitle")}</DialogTitle>
            <DialogDescription>
              {tr("sosSetupDesc")}
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground px-1">
            {tr("sosSetupLimit").replace("{n}", String(sosLimit))}
            {" "}
            <span className="font-semibold text-foreground">{selectedIds.length}/{sosLimit} selected</span>
          </p>

          <div className="overflow-y-auto flex-1 space-y-1 pr-1 -mr-1">
            {pickableNodes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No family members in your tree yet. Add members first.
              </p>
            ) : (
              pickableNodes.map((node) => {
                const selected = selectedIds.includes(node.id);
                const atLimit = selectedIds.length >= sosLimit && !selected;
                return (
                  <button
                    key={node.id}
                    type="button"
                    disabled={atLimit}
                    onClick={() => toggleContact(node.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      selected
                        ? "border-destructive/50 bg-destructive/8 text-foreground"
                        : atLimit
                        ? "border-border/30 bg-secondary/20 text-muted-foreground/50 cursor-not-allowed"
                        : "border-border/50 bg-card hover:bg-secondary/30 text-foreground"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      selected ? "border-destructive bg-destructive" : "border-border"
                    }`}>
                      {selected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{node.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{node.relation}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/50 mt-2">
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2 text-sm"
              onClick={() => setSetupOpen(false)}
            >
              {tr("cancel")}
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
              onClick={saveSetupAndProceed}
            >
              {tr("sosSetupSave")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── SOS Send Modal ────────────────────────────────────────────────── */}
      <Dialog open={sosOpen} onOpenChange={setSosOpen}>
        <DialogContent className="font-body sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">{tr("sosDialogTitle")}</DialogTitle>
            <DialogDescription>
              {tr("sosDialogDesc")}
            </DialogDescription>
          </DialogHeader>

          {/* Show configured contacts */}
          {(() => {
            const saved = getSavedSosContacts() ?? [];
            const names = saved
              .map((id) => state.nodes.find((n) => n.id === id)?.name)
              .filter(Boolean);
            return names.length > 0 ? (
              <div className="rounded-lg bg-destructive/8 border border-destructive/20 px-3 py-2">
                <p className="text-xs font-semibold text-destructive mb-1">Alerting {names.length} contact(s):</p>
                <p className="text-xs text-muted-foreground">{names.join(", ")}</p>
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline mt-1"
                  onClick={() => { setSosOpen(false); openSosSetup(true); }}
                >
                  Change contacts
                </button>
              </div>
            ) : null;
          })()}

          <textarea
            value={sosNote}
            onChange={(e) => setSosNote(e.target.value)}
            placeholder={tr("sosNotePlaceholder")}
            className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            maxLength={300}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2 text-sm"
              onClick={() => setSosOpen(false)}
            >
              {tr("cancel")}
            </button>
            <button
              type="button"
              disabled={sending}
              className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
              onClick={() => sendSos()}
            >
              {sending ? "…" : tr("sosSend")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
