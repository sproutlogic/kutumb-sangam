/**
 * /admin/content — Admin content review queue.
 *
 * Shows draft generated content for the coming week.
 * Admins can approve (+ optionally publish immediately) or reject.
 * Also shows tabs for blog posts, IG captions, YT shorts.
 */

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle, Send, RefreshCw, FileText, Instagram, Youtube } from "lucide-react";
import AppShell from "@/components/shells/AppShell";
import {
  fetchContentQueue,
  approveContent,
  rejectContent,
  triggerContentGeneration,
  type GeneratedContentItem,
  type ContentType,
} from "@/services/api";
import { toast } from "@/hooks/use-toast";

const TABS: { id: ContentType; label: string; icon: React.ReactNode }[] = [
  { id: "blog_post",  label: "Blog Posts",  icon: <FileText className="w-4 h-4" /> },
  { id: "ig_caption", label: "Instagram",   icon: <Instagram className="w-4 h-4" /> },
  { id: "yt_short",   label: "YouTube",     icon: <Youtube className="w-4 h-4" /> },
];

export default function ContentQueuePage() {
  const [tab, setTab]             = useState<ContentType>("blog_post");
  const [items, setItems]         = useState<GeneratedContentItem[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [rejectId, setRejectId]   = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function load(ct: ContentType) {
    setLoading(true);
    const res = await fetchContentQueue({ content_type: ct, limit: 50 });
    setItems(res.items);
    setTotal(res.total);
    setLoading(false);
  }

  useEffect(() => { load(tab); }, [tab]);

  async function handleApprove(id: string, publishNow: boolean) {
    try {
      const res = await approveContent(id, publishNow);
      toast({ title: publishNow ? "✅ Approved & Published!" : "✅ Approved!", description: `Status: ${res.new_status}` });
      await load(tab);
    } catch (e) {
      toast({ title: String(e), variant: "destructive" });
    }
  }

  async function handleReject() {
    if (!rejectId || rejectReason.trim().length < 5) {
      toast({ title: "कारण 5+ अक्षर का होना चाहिए।", variant: "destructive" });
      return;
    }
    try {
      await rejectContent(rejectId, rejectReason.trim());
      toast({ title: "❌ Rejected." });
      setRejectId(null); setRejectReason("");
      await load(tab);
    } catch (e) {
      toast({ title: String(e), variant: "destructive" });
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await triggerContentGeneration();
      toast({ title: "🌿 Content Generated!", description: res.message });
      await load(tab);
    } catch (e) {
      toast({ title: String(e), variant: "destructive" });
    } finally { setGenerating(false); }
  }

  return (
    <AppShell>
      {/* Hero */}
      <div className="relative gradient-hero text-primary-foreground py-8 overflow-hidden">
        <div className="container flex items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold">Content Review Queue</h1>
            <p className="text-sm opacity-70">Eco-Panchang generated content — approve before publishing</p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Generate Now
          </button>
        </div>
      </div>

      <div className="container py-6 space-y-5">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                tab === t.id
                  ? "border-green-500 text-green-700 dark:text-green-400"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {t.icon} {t.label}
              {tab === t.id && total > 0 && (
                <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-1.5 rounded-full">
                  {total}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> लोड हो रहा है…
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground space-y-2">
            <p>कोई draft content नहीं।</p>
            <button onClick={handleGenerate} disabled={generating} className="text-sm text-green-600 hover:underline flex items-center gap-1 mx-auto">
              <RefreshCw className="w-3.5 h-3.5" /> Generate करें
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map(item => (
              <div key={item.id} className="border border-border rounded-xl p-5 bg-card space-y-3">
                {/* Meta */}
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                        {item.panchang_date}
                      </span>
                      {item.vansha_id ? (
                        <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                          {item.family_name ?? item.vansha_id.slice(0, 8)}
                        </span>
                      ) : (
                        <span className="text-xs bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
                          Generic
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-sm mt-1.5 leading-snug">{item.title}</h3>
                    {item.subtitle && <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>}
                  </div>
                </div>

                {/* Body preview */}
                <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed bg-muted/40 rounded-lg p-3">
                  {item.body}
                </p>

                {/* Hashtags */}
                {item.hashtags && item.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.hashtags.slice(0, 5).map(h => (
                      <span key={h} className="text-[10px] bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 px-1.5 rounded-full">{h}</span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 flex-wrap pt-1">
                  <button
                    onClick={() => handleApprove(item.id, false)}
                    className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors font-medium"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => handleApprove(item.id, true)}
                    className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-medium"
                  >
                    <Send className="w-3.5 h-3.5" /> Approve & Publish
                  </button>
                  <button
                    onClick={() => { setRejectId(item.id); setRejectReason(""); }}
                    className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reject dialog */}
      {rejectId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl p-6 w-full max-w-sm space-y-4 shadow-xl">
            <h3 className="font-semibold">Rejection का कारण</h3>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              placeholder="कम से कम 5 अक्षर…"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
            />
            <div className="flex gap-2">
              <button onClick={handleReject} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium">Reject</button>
              <button onClick={() => setRejectId(null)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted">रद्द करें</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
