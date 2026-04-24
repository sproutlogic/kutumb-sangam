import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Megaphone, Radio } from "lucide-react";
import { useLang } from "@/i18n/LanguageContext";
import { usePlan } from "@/contexts/PlanContext";
import { useTree } from "@/contexts/TreeContext";
import { resolveSosRecipients } from "@/engine/privacy";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

/**
 * Top bar: SOS (subscription), centre announce broadcast (Vansh), plan upsell.
 */
export function AppTopBar() {
  const { tr } = useLang();
  const navigate = useNavigate();
  const { hasEntitlement, planId } = usePlan();
  const { state, pushActivity, isTreeInitialized } = useTree();
  const [sosOpen, setSosOpen] = useState(false);
  const [sosNote, setSosNote] = useState("");
  const [sending, setSending] = useState(false);
  const [announce, setAnnounce] = useState("");

  const canSos = hasEntitlement("sosAlerts");
  const canAnnounce = hasEntitlement("treeAnnounce");
  const senderId = state.currentUserId;

  const sendSos = () => {
    if (!isTreeInitialized || !senderId) {
      toast({
        title: tr("sosNoTree"),
        description: tr("sosNoTreeDesc"),
        variant: "destructive",
      });
      return;
    }
    setSending(true);
    const finish = (lat: string, lon: string) => {
      const { recipientIds } = resolveSosRecipients(senderId, state.nodes, state.edges);
      const names = recipientIds
        .map((id) => state.nodes.find((n) => n.id === id)?.name ?? id)
        .join(", ");
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
      (pos) => {
        finish(String(pos.coords.latitude), String(pos.coords.longitude));
      },
      () => {
        finish("", "");
      },
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
            className="hidden font-heading text-sm font-semibold text-primary md:inline hover:text-primary/70 transition-colors"
          >
            Kutumb
          </button>
          <span className="text-[10px] text-muted-foreground md:hidden">{tr("appTopSafety")}</span>
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
          {planId === "beej" && (
            <button
              type="button"
              onClick={() => navigate("/upgrade")}
              className="hidden text-[10px] text-muted-foreground underline hover:text-foreground sm:inline"
            >
              {tr("privacyUpgradeHint")}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!canSos) {
                toast({
                  title: tr("sosLockedTitle"),
                  description: tr("sosLockedDesc"),
                });
                navigate("/upgrade");
                return;
              }
              setSosOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20"
          >
            <AlertTriangle className="h-4 w-4" aria-hidden />
            SOS
          </button>
        </div>
      </header>

      <Dialog open={sosOpen} onOpenChange={setSosOpen}>
        <DialogContent className="font-body sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">{tr("sosDialogTitle")}</DialogTitle>
            <DialogDescription>{tr("sosDialogDesc")}</DialogDescription>
          </DialogHeader>
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
