/**
 * /eco-sewa — Tier 1 self-reported Eco-Sewa page.
 *
 * Left panel: log a new eco action.
 * Right panel: vansha feed with vouch / dispute controls.
 */

import { useEffect, useState } from "react";
import { Leaf, CheckCircle2, XCircle, Clock, Plus, Loader2, TreePine } from "lucide-react";
import AppShell from "@/components/shells/AppShell";
import {
  fetchEcoSewaLogs,
  fetchEcoSewaStats,
  logEcoSewa,
  vouchEcoSewaLog,
  disputeEcoSewaLog,
  resolveVanshaIdForApi,
  type EcoSewaLog,
  type EcoSewaStats,
  type EcoSewaActionType,
} from "@/services/api";
import { toast } from "@/hooks/use-toast";

const ACTION_LABELS: Record<EcoSewaActionType, string> = {
  tree_watered:      "🌳 पेड़ सींचा",
  tree_planted_self: "🌱 पेड़ लगाया",
  waste_segregated:  "♻️ कचरा अलग किया",
  animal_water:      "🐦 जल-पात्र भरा",
  eco_pledge:        "🤝 पर्यावरण संकल्प",
  community_clean:   "🧹 सामुदायिक सफाई",
  composting:        "🍂 कम्पोस्ट बनाया",
  solar_action:      "☀️ सौर ऊर्जा कार्य",
  water_harvesting:  "💧 जल संचयन",
};

const STATUS_UI: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  pending:  { icon: <Clock className="w-3.5 h-3.5" />, label: "प्रतीक्षा", color: "text-amber-600 dark:text-amber-400" },
  vouched:  { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: "सत्यापित", color: "text-green-600 dark:text-green-400" },
  disputed: { icon: <XCircle className="w-3.5 h-3.5" />, label: "विवादित", color: "text-red-500 dark:text-red-400" },
  rejected: { icon: <XCircle className="w-3.5 h-3.5" />, label: "अस्वीकृत", color: "text-slate-500" },
};

function getUserId(): string {
  try {
    for (const k of Object.keys(localStorage).filter(k => k.endsWith("-auth-token"))) {
      const p = JSON.parse(localStorage.getItem(k) || "{}");
      if (p?.user?.id) return p.user.id;
    }
  } catch { /* ignore */ }
  return "";
}

export default function EcoSewaPage() {
  const vanshaId = resolveVanshaIdForApi(null);
  const currentUid = getUserId();

  const [logs, setLogs]         = useState<EcoSewaLog[]>([]);
  const [stats, setStats]       = useState<EcoSewaStats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [actionType, setActionType] = useState<EcoSewaActionType>("tree_watered");
  const [notes, setNotes]           = useState("");
  const [photoUrl, setPhotoUrl]     = useState("");
  const [actionDate, setActionDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving]         = useState(false);

  // Dispute dialog
  const [disputeLogId, setDisputeLogId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");

  async function loadData() {
    const [l, s] = await Promise.all([
      fetchEcoSewaLogs(vanshaId || undefined),
      vanshaId ? fetchEcoSewaStats(vanshaId) : Promise.resolve(null),
    ]);
    setLogs(l);
    setStats(s);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [vanshaId]);

  async function handleLog() {
    setSaving(true);
    try {
      const res = await logEcoSewa({
        action_type: actionType,
        action_date: actionDate,
        notes: notes.trim() || undefined,
        photo_url: photoUrl.trim() || undefined,
      });
      toast({ title: "✅ Eco-Sewa लॉग हो गई!", description: res.message });
      setShowForm(false);
      setNotes(""); setPhotoUrl("");
      await loadData();
    } catch (e) {
      toast({ title: String(e), variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function handleVouch(log_id: string) {
    try {
      const res = await vouchEcoSewaLog(log_id);
      toast({ title: "✅ Vouched!", description: `Score updated. +${res.eco_hours_delta} eco hours.` });
      await loadData();
    } catch (e) {
      toast({ title: String(e), variant: "destructive" });
    }
  }

  async function handleDispute() {
    if (!disputeLogId || disputeReason.trim().length < 5) {
      toast({ title: "कारण कम से कम 5 अक्षर का होना चाहिए।", variant: "destructive" });
      return;
    }
    try {
      await disputeEcoSewaLog(disputeLogId, disputeReason.trim());
      toast({ title: "⚠️ विवाद दर्ज हुआ।" });
      setDisputeLogId(null); setDisputeReason("");
      await loadData();
    } catch (e) {
      toast({ title: String(e), variant: "destructive" });
    }
  }

  return (
    <AppShell>
      {/* Hero */}
      <div className="relative gradient-hero text-primary-foreground py-8 overflow-hidden">
        <div className="container flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Leaf className="w-6 h-6" />
              <h1 className="font-heading text-2xl font-bold">Eco-Sewa</h1>
            </div>
            <p className="text-sm opacity-70">परिवार की हरित सेवाएं — स्व-रिपोर्ट व सत्यापन</p>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-foreground/15 text-primary-foreground text-sm font-semibold hover:bg-primary-foreground/25 transition-colors"
          >
            <Plus className="w-4 h-4" /> सेवा लॉग करें
          </button>
        </div>
      </div>

      <div className="container py-6 space-y-6">
        {/* Stats bar */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="कुल कार्य" value={stats.total_actions} color="text-blue-600" />
            <StatCard label="सत्यापित" value={stats.vouched} color="text-green-600" />
            <StatCard label="प्रतीक्षारत" value={stats.pending} color="text-amber-600" />
            <StatCard label="कुल स्कोर" value={stats.total_score_contrib.toFixed(1)} color="text-purple-600" />
          </div>
        )}

        {/* Log form */}
        {showForm && (
          <div className="border border-green-200 dark:border-green-800 rounded-xl p-5 bg-green-50/40 dark:bg-green-950/20 space-y-4">
            <h2 className="font-semibold text-green-900 dark:text-green-200">🌱 नई Eco-Sewa लॉग करें</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">कार्य का प्रकार *</label>
                <select
                  value={actionType}
                  onChange={e => setActionType(e.target.value as EcoSewaActionType)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  {(Object.keys(ACTION_LABELS) as EcoSewaActionType[]).map(k => (
                    <option key={k} value={k}>{ACTION_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">तारीख *</label>
                <input
                  type="date"
                  value={actionDate}
                  onChange={e => setActionDate(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">नोट्स (वैकल्पिक)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="क्या, कहाँ, कितने पेड़..."
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">फोटो URL (वैकल्पिक)</label>
                <input
                  type="url"
                  value={photoUrl}
                  onChange={e => setPhotoUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleLog}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                सेव करें
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
                रद्द करें
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              💡 लॉग होते ही 0.5× अंक मिलते हैं। परिवार के किसी सदस्य के vouch करने पर 1× पूरे अंक मिलते हैं।
            </p>
          </div>
        )}

        {/* Feed */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> लोड हो रहा है…
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <TreePine className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>अभी कोई Eco-Sewa लॉग नहीं है। पहली शुरुआत करें!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map(log => {
              const ui = STATUS_UI[log.status] ?? STATUS_UI.pending;
              const isOwn = log.reported_by_uid === currentUid;
              const canVouch = !isOwn && log.status === "pending";
              const canDispute = !isOwn && (log.status === "pending" || log.status === "vouched");
              return (
                <div key={log.id} className="border border-border rounded-xl p-4 bg-card space-y-2 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{ACTION_LABELS[log.action_type as EcoSewaActionType] ?? log.action_type}</span>
                      <span className={`flex items-center gap-1 text-xs font-medium ${ui.color}`}>
                        {ui.icon} {ui.label}
                      </span>
                      {log.tithi_id && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 rounded-full">
                          तिथि #{log.tithi_id}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{log.action_date}</span>
                      <span className="text-xs font-bold text-green-700 dark:text-green-400">+{log.score_contribution}</span>
                    </div>
                  </div>
                  {log.notes && <p className="text-xs text-muted-foreground">{log.notes}</p>}
                  {(canVouch || canDispute) && (
                    <div className="flex gap-2 pt-1">
                      {canVouch && (
                        <button
                          onClick={() => handleVouch(log.id)}
                          className="text-xs px-3 py-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors font-medium"
                        >
                          ✅ Vouch करें
                        </button>
                      )}
                      {canDispute && (
                        <button
                          onClick={() => { setDisputeLogId(log.id); setDisputeReason(""); }}
                          className="text-xs px-3 py-1 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
                        >
                          ⚠️ विवाद करें
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dispute dialog */}
      {disputeLogId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl p-6 w-full max-w-sm space-y-4 shadow-xl">
            <h3 className="font-semibold text-base">विवाद का कारण बताएं</h3>
            <textarea
              value={disputeReason}
              onChange={e => setDisputeReason(e.target.value)}
              rows={3}
              placeholder="कम से कम 5 अक्षर..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleDispute}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                दर्ज करें
              </button>
              <button
                onClick={() => { setDisputeLogId(null); setDisputeReason(""); }}
                className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
              >
                रद्द करें
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="border border-border rounded-xl p-4 bg-card text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
