/**
 * /eco-sewa — Tier 1 self-reported Eco-Sewa page.
 *
 * Left panel: log a new eco action.
 * Right panel: vansha feed with vouch / dispute controls.
 */

import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Leaf, CheckCircle2, Clock, Plus, Loader2, TreePine, Share2, Sparkles, Users, Globe2 } from "lucide-react";
import {
  getApiBaseUrl,
  resolveVanshaIdForApi,
} from "@/services/api";
import { toast } from "@/hooks/use-toast";

type EcoSewaActionType =
  | "tree_planting"
  | "water_conservation"
  | "waste_cleanup"
  | "nature_care"
  | "eco_awareness"
  | "composting"
  | "solar_energy"
  | "eco_volunteering";

type SamayEcoRequest = {
  id: string;
  requester_id: string;
  requester_name?: string;
  request_type: "offer" | "need";
  scope: "local" | "global";
  title: string;
  description?: string | null;
  category: string;
  hours_estimate?: number | null;
  status: string;
  visible_from: string;
  created_at: string;
};

const ACTION_LABELS: Record<EcoSewaActionType, string> = {
  tree_planting: "🌱 पेड़ लगाया / सींचा",
  water_conservation: "💧 जल संरक्षण",
  waste_cleanup: "🧹 सफाई / कचरा अलग किया",
  nature_care: "🐦 प्रकृति सेवा",
  eco_awareness: "📢 पर्यावरण जागरूकता",
  composting: "🍂 कम्पोस्ट बनाया",
  solar_energy: "☀️ सौर ऊर्जा कार्य",
  eco_volunteering: "🤝 सामुदायिक eco-sewa",
};

const ECO_ACTIONS = Object.keys(ACTION_LABELS) as EcoSewaActionType[];

const STATUS_UI: Record<string, { label: string; color: string }> = {
  open: { label: "Vouch needed", color: "text-amber-600 dark:text-amber-400" },
  assigned: { label: "Vouch assigned", color: "text-blue-600 dark:text-blue-400" },
  completed: { label: "Sewa confirmed", color: "text-green-600 dark:text-green-400" },
  closed: { label: "Closed", color: "text-slate-500" },
};

function getToken(): string {
  try {
    for (const k of Object.keys(localStorage).filter(k => k.endsWith("-auth-token"))) {
      const p = JSON.parse(localStorage.getItem(k) || "{}");
      if (p?.access_token) return p.access_token;
    }
  } catch { /* ignore */ }
  return "";
}

export function EcoSewaPanel({ embedded = false, branchId }: { embedded?: boolean; branchId?: string | null }) {
  const vanshaId = resolveVanshaIdForApi(null);
  const api = `${getApiBaseUrl()}/api/samay`;
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const [logs, setLogs]         = useState<SamayEcoRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [feedScope, setFeedScope] = useState<"family" | "gotra" | "public">("family");
  const [scoreDelta, setScoreDelta] = useState<{ label: string; delta: number } | null>(null);
  const [localVouches, setLocalVouches] = useState<Record<string, number>>({});

  // Form state
  const [actionType, setActionType] = useState<EcoSewaActionType>("tree_planting");
  const [notes, setNotes]           = useState("");
  const [actionDate, setActionDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving]         = useState(false);

  async function loadData() {
    if (!branchId) {
      setLogs([]);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${api}/requests?${new URLSearchParams({
        scope: "local",
        req_type: "all",
        category: "all",
        branch_id: branchId,
      })}`, { headers });
      const data = res.ok ? ((await res.json()) as SamayEcoRequest[]) : [];
      setLogs(data.filter((r) => ECO_ACTIONS.includes(r.category as EcoSewaActionType)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [branchId, vanshaId]);

  async function handleLog() {
    if (!branchId) {
      toast({ title: "Sewa Chakra branch missing", description: "Join or create a branch before logging sewa.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const score = actionType === "tree_planting" ? 1.5 : 1;
      const res = await fetch(`${api}/requests`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          branch_id: branchId,
          request_type: "need",
          scope: "local",
          title: ACTION_LABELS[actionType],
          description: [notes.trim(), `Action date: ${actionDate}`, "Eco-Sewa migrated to Sewa Chakra API"].filter(Boolean).join("\n"),
          category: actionType,
          hours_estimate: score,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || "Could not create Sewa Chakra post.");
      toast({ title: "✅ Sewa Chakra में लॉग हो गई!", description: "Family members can now vouch from the same board." });
      setScoreDelta({ label: "Sewa Chakra post created", delta: score });
      setShowForm(false);
      setNotes("");
      await loadData();
    } catch (e) {
      toast({ title: String(e), variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function handleVouch(log: SamayEcoRequest) {
    try {
      const hours = log.hours_estimate ?? 1;
      const res = await fetch(`${api}/requests/${encodeURIComponent(log.id)}/respond`, {
        method: "POST",
        headers,
        body: JSON.stringify({ hours, description: "Family vouch for this green sewa." }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || "Could not vouch through Sewa Chakra.");
      toast({ title: "✅ Vouch sent!", description: "A Sewa Chakra response was created for this action." });
      setLocalVouches(prev => ({ ...prev, [log.id]: Math.min(5, (prev[log.id] ?? 1) + 1) }));
      setScoreDelta({ label: "Sewa Chakra vouch added", delta: hours });
      await loadData();
    } catch (e) {
      toast({ title: String(e), variant: "destructive" });
    }
  }

  useEffect(() => {
    if (!scoreDelta) return;
    const timer = setTimeout(() => setScoreDelta(null), 2400);
    return () => clearTimeout(timer);
  }, [scoreDelta]);

  const shareLog = async (log: SamayEcoRequest) => {
    const text = `${log.title} by our family on Prakriti Sewa Chakra. +${log.hours_estimate ?? 1} sewa hours.`;
    const url = `${window.location.origin}/time-bank`;
    try {
      if (navigator.share) await navigator.share({ title: "Prakriti Eco-Sewa", text, url });
      else await navigator.clipboard.writeText(`${text}\n${url}`);
      toast({ title: "Share card ready", description: "Eco-Sewa story copied/shared." });
    } catch { /* cancelled */ }
  };

  const visibleLogs = logs.filter((_, index) => {
    if (feedScope === "family") return true;
    if (feedScope === "gotra") return index % 2 === 0 || logs.length < 4;
    return true;
  });

  const scopeCopy = {
    family: "Family feed: your vansha sees and vouches first.",
    gotra: "Gotra feed: nearby kin can strengthen the proof.",
    public: "Public feed: shareable proof for the wider Prakriti movement.",
  }[feedScope];

  return (
    <>
      {/* Hero */}
      {!embedded && <div className="relative gradient-hero text-primary-foreground py-8 overflow-hidden">
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
      </div>}

      <div className={embedded ? "space-y-6" : "container py-6 space-y-6"}>
        {embedded && (
          <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900 dark:bg-emerald-950/20 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <Leaf className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
                <h2 className="font-heading text-lg font-bold">Eco-Sewa inside Sewa Chakra</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Self-reported green actions, family vouches, and score movement now live in the Sewa Chakra.
              </p>
            </div>
            <button
              onClick={() => setShowForm(v => !v)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" /> सेवा लॉग करें
            </button>
          </div>
        )}
        {scoreDelta && (
          <div className="fixed right-4 top-20 z-50 w-72 animate-in slide-in-from-right-4 fade-in duration-300 rounded-2xl border border-emerald-200 bg-white p-4 shadow-xl dark:border-emerald-900 dark:bg-gray-950">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Score moved</p>
                <p className="font-heading text-xl font-bold text-emerald-900 dark:text-emerald-100">+{scoreDelta.delta}</p>
                <p className="text-xs text-muted-foreground">{scoreDelta.label}</p>
              </div>
            </div>
          </div>
        )}

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Sewa posts" value={logs.length} color="text-blue-600" />
          <StatCard label="Open for vouch" value={logs.filter((l) => l.status === "open").length} color="text-amber-600" />
          <StatCard label="Confirmed" value={logs.filter((l) => l.status === "completed").length} color="text-green-600" />
          <StatCard label="Sewa hours" value={logs.reduce((sum, l) => sum + Number(l.hours_estimate ?? 0), 0).toFixed(1)} color="text-purple-600" />
        </div>

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
                  {ECO_ACTIONS.map(k => (
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
              💡 यह अब Sewa Chakra post बनता है। परिवार का vouch Sewa Chakra response/handshake से आता है।
            </p>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Eco-Sewa story feed</p>
              <p className="text-sm text-muted-foreground">{scopeCopy}</p>
            </div>
            <div className="grid grid-cols-3 rounded-lg border border-border bg-secondary/30 p-1 text-xs font-semibold">
              {[
                { id: "family" as const, label: "Family", icon: Users },
                { id: "gotra" as const, label: "Gotra", icon: TreePine },
                { id: "public" as const, label: "Public", icon: Globe2 },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFeedScope(id)}
                  className={`flex items-center justify-center gap-1 rounded-md px-3 py-1.5 ${feedScope === id ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Feed */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> लोड हो रहा है…
          </div>
        ) : visibleLogs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <TreePine className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>अभी कोई Eco-Sewa लॉग नहीं है। पहली शुरुआत करें!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleLogs.map(log => {
              const ui = STATUS_UI[log.status] ?? STATUS_UI.open;
              const canVouch = log.status === "open";
              const vouchCount = log.status === "completed" ? 5 : Math.min(4, localVouches[log.id] ?? 0);
              const autoVerified = vouchCount >= 5 || log.status === "completed";
              return (
                <div key={log.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
                  <div className="border-b border-border/50 bg-gradient-to-r from-emerald-50 to-lime-50 px-4 py-3 dark:from-emerald-950/30 dark:to-lime-950/20">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                          {feedScope === "family" ? "Family proof" : feedScope === "gotra" ? "Gotra proof" : "Public proof"}
                        </p>
                        <h3 className="mt-1 font-heading text-base font-bold">
                          {log.title || ACTION_LABELS[log.category as EcoSewaActionType] || log.category}
                        </h3>
                      </div>
                      <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">+{log.hours_estimate ?? 1}h</span>
                    </div>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`flex items-center gap-1 text-xs font-medium ${ui.color}`}>
                        {log.status === "completed" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />} {ui.label}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${autoVerified ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                        {autoVerified ? "5/5 auto-verified" : `${vouchCount}/5 vouches`}
                      </span>
                      <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleDateString("en-IN")}</span>
                    </div>
                    {log.description && <p className="text-sm text-muted-foreground whitespace-pre-line">{log.description}</p>}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {canVouch && (
                        <button
                          onClick={() => handleVouch(log)}
                          className="text-xs px-3 py-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors font-medium"
                        >
                          ✅ Sewa response भेजें
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => shareLog(log)}
                        className="inline-flex items-center gap-1 text-xs px-3 py-1 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors font-medium"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        Share story
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

export default function EcoSewaPage() {
  return <Navigate to="/time-bank" replace />;
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="border border-border rounded-xl p-4 bg-card text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
