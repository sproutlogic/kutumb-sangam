/**
 * /green-legacy/:vanshaId — Public shareable family eco-profile.
 *
 * Shows the family's Green Legacy Score, verified trees, eco-sewa actions,
 * and a chronological timeline of eco-events. No auth required.
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { TreePine, Leaf, Droplets, CheckCircle2, Share2, Loader2, ArrowLeft, Award } from "lucide-react";
import AppShell from "@/components/shells/AppShell";
import {
  fetchGreenLegacyProfile,
  fetchGreenLegacyTimeline,
  type GreenLegacyProfile,
  type GreenLegacyEvent,
} from "@/services/api";
import { toast } from "@/hooks/use-toast";

function getPrakritiContext(score: number, location: string): string {
  if (score >= 80) return `Top 10% families in ${location}`;
  if (score >= 60) return `Higher than 70% of families in ${location}`;
  if (score >= 40) return `Higher than 50% of families in ${location}`;
  return `Growing fast — your forest is taking root`;
}

function getWhatsAppMessage(profile: GreenLegacyProfile, pageUrl: string): string {
  const score = profile.prakriti_score.toFixed(0);
  const context = getPrakritiContext(profile.prakriti_score, profile.location);
  return `🌳 *${profile.family_name} की Prakriti Score: ${score}*\n\n${context}\n\n_"When the last elder goes, the whole forest falls."_\n\nHamara parivaar apni jaḍẽ mazboot kar raha hai — kya aap bhi apne parivaar ki Prakriti jaante hain?\n\n👉 ${pageUrl}\n\n*Prakriti* — India's Family Nature Score`;
}

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

  function handleWhatsAppShare() {
    if (!profile) return;
    const url = window.location.href;
    const message = getWhatsAppMessage(profile, url);
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
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
      <div className="relative bg-gradient-to-br from-green-900 via-green-800 to-emerald-700 text-white py-12 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="w-full h-full bg-[radial-gradient(circle_at_30%_50%,_rgba(255,255,255,0.3)_0%,_transparent_60%)]" />
        </div>
        <div className="container relative">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm opacity-70 hover:opacity-100 mb-5">
            <ArrowLeft className="w-4 h-4" /> वापस
          </button>

          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            {/* Left — identity + score */}
            <div className="flex-1">
              {/* Gotra Founder badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-xs font-semibold mb-4">
                <Award className="w-3.5 h-3.5" />
                Founding Family · Prakriti
              </div>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                  <TreePine className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="font-heading text-2xl md:text-3xl font-bold">{profile.family_name}</h1>
                  <p className="text-sm opacity-75">📍 {profile.location} · {profile.member_count} सदस्य</p>
                </div>
              </div>

              {/* Prakriti Score — hero number */}
              <div className="mb-1">
                <span className="text-6xl font-black">{profile.prakriti_score.toFixed(0)}</span>
                <span className="text-xl opacity-60 ml-2">/100</span>
              </div>
              <div className="text-sm font-semibold text-amber-300 mb-1">Prakriti Score</div>
              <div className="text-xs opacity-70 mb-5">
                🏆 {getPrakritiContext(profile.prakriti_score, profile.location)}
              </div>

              {/* Share buttons */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleWhatsAppShare}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-xl text-sm font-semibold transition-colors shadow-lg"
                >
                  <Share2 className="w-4 h-4" />
                  WhatsApp पर शेयर करें
                </button>
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/15 hover:bg-white/25 rounded-xl text-sm font-medium transition-colors"
                >
                  🔗 लिंक कॉपी करें
                </button>
              </div>
            </div>

            {/* Right — Banyan visual */}
            <div className="hidden md:flex items-center justify-center opacity-20 w-40">
              <svg viewBox="0 0 200 200" className="w-full" fill="currentColor">
                <path d="M100 10 C90 30 70 50 50 80 C30 110 20 140 25 180 L175 180 C180 140 170 110 150 80 C130 50 110 30 100 10Z" />
                <rect x="92" y="140" width="16" height="40" rx="4" />
              </svg>
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
