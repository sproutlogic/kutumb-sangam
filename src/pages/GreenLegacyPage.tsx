/**
 * /green-legacy/:vanshaId — Public shareable family eco-profile.
 *
 * Shows the family's Green Legacy Score, verified trees, eco-sewa actions,
 * and a chronological timeline of eco-events. No auth required.
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { TreePine, Leaf, Droplets, CheckCircle2, Share2, Loader2, ArrowLeft } from "lucide-react";
import AppShell from "@/components/shells/AppShell";
import {
  fetchGreenLegacyProfile,
  fetchGreenLegacyTimeline,
  type GreenLegacyProfile,
  type GreenLegacyEvent,
} from "@/services/api";
import { toast } from "@/hooks/use-toast";

const SOURCE_UI: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  eco_sewa: { icon: <Leaf className="w-3.5 h-3.5" />,       color: "text-green-600",   label: "Eco-Sewa" },
  verified: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "text-emerald-600", label: "Verified" },
  ceremony: { icon: <Droplets className="w-3.5 h-3.5" />,    color: "text-blue-500",    label: "Ceremony" },
};

export default function GreenLegacyPage() {
  const { vanshaId } = useParams<{ vanshaId: string }>();
  const navigate = useNavigate();

  const [profile, setProfile]   = useState<GreenLegacyProfile | null>(null);
  const [timeline, setTimeline] = useState<GreenLegacyEvent[]>([]);
  const [loading, setLoading]   = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [page, setPage] = useState(0);
  const LIMIT = 20;

  useEffect(() => {
    if (!vanshaId) return;
    setLoading(true);
    fetchGreenLegacyProfile(vanshaId)
      .then(setProfile)
      .finally(() => setLoading(false));
    loadTimeline(0);
  }, [vanshaId]);

  async function loadTimeline(offset: number) {
    if (!vanshaId) return;
    setTimelineLoading(true);
    const items = await fetchGreenLegacyTimeline(vanshaId, LIMIT, offset);
    setTimeline(prev => offset === 0 ? items : [...prev, ...items]);
    setPage(offset / LIMIT);
    setTimelineLoading(false);
  }

  function handleShare() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "🔗 लिंक कॉपी हो गया!", description: "इसे शेयर करें।" });
    });
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" /> Green Legacy लोड हो रहा है…
        </div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell>
        <div className="container py-16 text-center text-muted-foreground">
          <p>यह परिवार नहीं मिला।</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-sm text-green-600 hover:underline">
            वापस जाएं
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Hero */}
      <div className="relative bg-gradient-to-br from-green-800 to-emerald-700 text-white py-10 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="w-full h-full bg-[radial-gradient(circle_at_30%_50%,_rgba(255,255,255,0.3)_0%,_transparent_60%)]" />
        </div>
        <div className="container relative">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm opacity-70 hover:opacity-100 mb-3">
                <ArrowLeft className="w-4 h-4" /> वापस
              </button>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                  <TreePine className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="font-heading text-2xl font-bold">{profile.family_name}</h1>
                  <p className="text-sm opacity-80">📍 {profile.location} · {profile.member_count} सदस्य</p>
                </div>
              </div>
              <div className="text-5xl font-black mt-4">{profile.green_legacy_score.toFixed(0)}</div>
              <div className="text-sm opacity-80">Green Legacy Score</div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleShare}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors"
              >
                <Share2 className="w-4 h-4" /> शेयर करें
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-6 space-y-6">
        {/* Score breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ScoreCard label="सत्यापित पेड़" value={profile.verified_trees} icon="🌳" color="text-green-700" />
          <ScoreCard label="Prakriti Score" value={profile.prakriti_score.toFixed(0)} icon="🌿" color="text-emerald-700" />
          <ScoreCard label="Sewa Actions" value={`${profile.sewa_actions_vouched}/${profile.sewa_actions_total}`} icon="🤝" color="text-teal-700" />
          <ScoreCard label="Eco Services" value={profile.orders_completed} icon="📋" color="text-blue-700" />
        </div>

        {/* Timeline */}
        <div>
          <h2 className="font-semibold text-base mb-3">🌱 हरित यात्रा की कहानी</h2>
          {timeline.length === 0 && !timelineLoading ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              अभी कोई eco-activity नहीं है।
            </div>
          ) : (
            <div className="space-y-2">
              {timeline.map((event, i) => {
                const ui = SOURCE_UI[event.source] ?? SOURCE_UI.eco_sewa;
                return (
                  <div key={i} className="border border-border rounded-xl p-4 bg-card flex items-start gap-3">
                    <span className={`mt-0.5 flex-shrink-0 ${ui.color}`}>{ui.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm capitalize">
                          {event.action_type.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] bg-muted text-muted-foreground px-1.5 rounded-full">
                          {ui.label}
                        </span>
                        {event.tithi_id && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 rounded-full">
                            तिथि #{event.tithi_id}
                          </span>
                        )}
                      </div>
                      {event.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{event.notes}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-bold text-green-700 dark:text-green-400">+{event.points}</div>
                      <div className="text-[10px] text-muted-foreground">{event.event_date}</div>
                    </div>
                  </div>
                );
              })}

              {/* Load more */}
              {timeline.length >= (page + 1) * LIMIT && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => loadTimeline((page + 1) * LIMIT)}
                    disabled={timelineLoading}
                    className="text-sm text-green-600 hover:text-green-800 flex items-center gap-1 mx-auto"
                  >
                    {timelineLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    और देखें
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function ScoreCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <div className="border border-border rounded-xl p-4 bg-card text-center space-y-1">
      <div className="text-2xl">{icon}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground leading-tight">{label}</div>
    </div>
  );
}
