/**
 * /green-legacy/:vanshaId — Public shareable family eco-profile.
 *
 * Tab 1 — Timeline: chronological eco-event feed
 * Tab 2 — Family Portrait: printable card with root elder, generations, score
 */

import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { TreePine, Leaf, Droplets, CheckCircle2, Share2, Loader2, ArrowLeft, Award, Printer, Users } from "lucide-react";
import AppShell from "@/components/shells/AppShell";
import {
  fetchGreenLegacyProfile,
  fetchGreenLegacyTimeline,
  fetchGreenLegacyGenerations,
  type GreenLegacyProfile,
  type GreenLegacyEvent,
  type GreenLegacyGenerations,
} from "@/services/api";
import { toast } from "@/hooks/use-toast";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function getPortraitWhatsAppMessage(profile: GreenLegacyProfile, genCount: number, pageUrl: string): string {
  const familyBase = profile.family_name.replace(" Parivar", "");
  return `🌳 *Meet the ${familyBase} family*\n\n${genCount} generation${genCount !== 1 ? "s" : ""} · ${profile.member_count} member${profile.member_count !== 1 ? "s" : ""} · Prakriti Score ${profile.prakriti_score.toFixed(0)}\n\n_Every family a forest. This is ours._\n\n👉 ${pageUrl}\n\n*Prakriti* — India's Family Nature Score`;
}

const SOURCE_UI: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  eco_sewa: { icon: <Leaf className="w-3.5 h-3.5" />,       color: "text-green-600",   label: "Eco-Sewa" },
  verified: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "text-emerald-600", label: "Verified" },
  ceremony: { icon: <Droplets className="w-3.5 h-3.5" />,    color: "text-blue-500",    label: "Ceremony" },
};

// ── Portrait component ────────────────────────────────────────────────────────

function FamilyPortrait({ profile, generations, onWhatsApp, onPrint }: {
  profile: GreenLegacyProfile;
  generations: GreenLegacyGenerations | null;
  onWhatsApp: () => void;
  onPrint: () => void;
}) {
  const genCount = generations?.generations.length ?? 0;
  const rootGen = generations?.generations[0];
  const rootElder = rootGen?.members[0] ?? null;
  const elderName = rootElder?.name || "—";
  const elderYear = rootElder?.birth_year ? `b. ${rootElder.birth_year}` : "";
  const familyBase = profile.family_name.replace(" Parivar", "");

  return (
    <>
      {/* Print-only CSS — isolates portrait card when printing */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #family-portrait-card, #family-portrait-card * { visibility: visible !important; }
          #family-portrait-card {
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            background: #14532d !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      <div className="flex flex-col items-center gap-4 py-4">
        {/* The portrait card */}
        <div
          id="family-portrait-card"
          className="w-full max-w-md bg-gradient-to-b from-green-900 to-emerald-950 rounded-3xl overflow-hidden shadow-2xl text-white"
        >
          {/* Banyan header illustration */}
          <div className="relative h-36 flex items-end justify-center bg-green-950 overflow-hidden">
            {/* Decorative root lines */}
            <div className="absolute bottom-0 left-0 right-0 h-8 opacity-20">
              {[15, 30, 50, 70, 85].map((x) => (
                <div key={x} className="absolute bottom-0 w-0.5 bg-amber-300" style={{ left: `${x}%`, height: `${20 + Math.random() * 20}px` }} />
              ))}
            </div>
            {/* Banyan silhouette */}
            <svg viewBox="0 0 300 120" className="w-72 opacity-30 mb-0" fill="currentColor">
              {/* Canopy */}
              <ellipse cx="150" cy="40" rx="120" ry="50" />
              <ellipse cx="80" cy="55" rx="60" ry="35" />
              <ellipse cx="220" cy="55" rx="60" ry="35" />
              {/* Trunk */}
              <rect x="138" y="70" width="24" height="50" rx="4" />
              {/* Aerial roots */}
              <line x1="100" y1="60" x2="95" y2="120" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <line x1="200" y1="60" x2="205" y2="120" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <line x1="130" y1="65" x2="125" y2="120" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="170" y1="65" x2="175" y2="120" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {/* Founding family badge */}
            <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[10px] font-semibold">
              <Award className="w-3 h-3" /> Founding Family
            </div>
          </div>

          {/* Body */}
          <div className="px-6 pb-6 pt-4 text-center space-y-4">
            <div>
              <p className="text-xs text-emerald-400 uppercase tracking-widest font-semibold mb-1">Meet the</p>
              <h2 className="font-heading text-3xl font-black">{familyBase} family</h2>
              <p className="text-sm text-emerald-300 mt-1">📍 {profile.location}</p>
            </div>

            {/* Root elder — most prominent */}
            {rootElder && (
              <div className="bg-white/10 rounded-2xl px-5 py-4 border border-white/20">
                <p className="text-[10px] text-emerald-400 uppercase tracking-widest mb-1">Root Elder</p>
                <p className="font-heading text-xl font-bold">{elderName}</p>
                {elderYear && <p className="text-xs text-emerald-300">{elderYear}</p>}
                <p className="text-xs text-emerald-400 mt-1 italic">"The roots of the Banyan"</p>
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/10 rounded-xl py-3">
                <p className="text-lg font-black">{genCount}</p>
                <p className="text-[10px] text-emerald-300 leading-tight">generation{genCount !== 1 ? "s" : ""}</p>
              </div>
              <div className="bg-white/10 rounded-xl py-3">
                <p className="text-lg font-black">{profile.member_count}</p>
                <p className="text-[10px] text-emerald-300 leading-tight">member{profile.member_count !== 1 ? "s" : ""}</p>
              </div>
              <div className="bg-amber-400/20 border border-amber-400/30 rounded-xl py-3">
                <p className="text-lg font-black text-amber-300">{profile.prakriti_score.toFixed(0)}</p>
                <p className="text-[10px] text-amber-400 leading-tight">Prakriti Score</p>
              </div>
            </div>

            {/* Eco highlights */}
            <div className="flex justify-center gap-4 text-xs text-emerald-300">
              <span>🌳 {profile.verified_trees} trees</span>
              <span>🤝 {profile.sewa_actions_vouched} sewa acts</span>
              <span>📜 {profile.verified_pledges} pledges</span>
            </div>

            {/* Tagline */}
            <p className="text-xs text-emerald-400 italic border-t border-white/10 pt-4">
              "Every family a forest. This is ours."
            </p>
            <p className="text-[10px] text-white/40">Prakriti — India's Family Nature Score</p>
          </div>
        </div>

        {/* Action buttons — outside the print card so they don't print */}
        <div className="flex gap-3 print:hidden">
          <button
            onClick={onWhatsApp}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-xl text-sm font-semibold transition-colors shadow-lg"
          >
            <Share2 className="w-4 h-4" />
            शेयर करें
          </button>
          <button
            onClick={onPrint}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-medium transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>

        {genCount === 0 && !generations && (
          <p className="text-xs text-muted-foreground">Family tree data loading…</p>
        )}
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "timeline" | "portrait";

export default function GreenLegacyPage() {
  const { vanshaId } = useParams<{ vanshaId: string }>();
  const navigate = useNavigate();

  const [profile, setProfile]       = useState<GreenLegacyProfile | null>(null);
  const [timeline, setTimeline]     = useState<GreenLegacyEvent[]>([]);
  const [generations, setGenerations] = useState<GreenLegacyGenerations | null>(null);
  const [loading, setLoading]       = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [generationsLoading, setGenerationsLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("timeline");
  const [page, setPage] = useState(0);
  const LIMIT = 20;
  const portraitFetched = useRef(false);

  useEffect(() => {
    if (!vanshaId) return;
    setLoading(true);
    fetchGreenLegacyProfile(vanshaId)
      .then(setProfile)
      .finally(() => setLoading(false));
    loadTimeline(0);
  }, [vanshaId]);

  // Lazy-load generations when portrait tab is first opened
  useEffect(() => {
    if (tab !== "portrait" || !vanshaId || portraitFetched.current) return;
    portraitFetched.current = true;
    setGenerationsLoading(true);
    fetchGreenLegacyGenerations(vanshaId)
      .then(setGenerations)
      .finally(() => setGenerationsLoading(false));
  }, [tab, vanshaId]);

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
    window.open(`https://wa.me/?text=${encodeURIComponent(getWhatsAppMessage(profile, url))}`, "_blank");
  }

  function handlePortraitWhatsApp() {
    if (!profile) return;
    const genCount = generations?.generations.length ?? 0;
    const url = window.location.href;
    window.open(`https://wa.me/?text=${encodeURIComponent(getPortraitWhatsAppMessage(profile, genCount, url))}`, "_blank");
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      toast({ title: "🔗 लिंक कॉपी हो गया!", description: "इसे शेयर करें।" });
    });
  }

  function handlePrint() {
    window.print();
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

              <div className="mb-1">
                <span className="text-6xl font-black">{profile.prakriti_score.toFixed(0)}</span>
                <span className="text-xl opacity-60 ml-2">/100</span>
              </div>
              <div className="text-sm font-semibold text-amber-300 mb-1">Prakriti Score</div>
              <div className="text-xs opacity-70 mb-5">
                🏆 {getPrakritiContext(profile.prakriti_score, profile.location)}
              </div>

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

      {/* Tab switcher */}
      <div className="border-b border-border bg-background sticky top-0 z-10">
        <div className="container flex gap-0">
          {(["timeline", "portrait"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === t
                  ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "timeline" ? "🌱 हरित यात्रा" : "🖼 Family Portrait"}
            </button>
          ))}
        </div>
      </div>

      <div className="container py-6 space-y-6">
        {/* Score breakdown — always visible */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ScoreCard label="सत्यापित पेड़" value={profile.verified_trees} icon="🌳" color="text-green-700" />
          <ScoreCard label="Prakriti Score" value={profile.prakriti_score.toFixed(0)} icon="🌿" color="text-emerald-700" />
          <ScoreCard label="Sewa Actions" value={`${profile.sewa_actions_vouched}/${profile.sewa_actions_total}`} icon="🤝" color="text-teal-700" />
          <ScoreCard label="Eco Services" value={profile.orders_completed} icon="📋" color="text-blue-700" />
        </div>

        {/* Tab content */}
        {tab === "timeline" && (
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
        )}

        {tab === "portrait" && (
          generationsLoading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" /> Portrait तैयार हो रहा है…
            </div>
          ) : (
            <FamilyPortrait
              profile={profile}
              generations={generations}
              onWhatsApp={handlePortraitWhatsApp}
              onPrint={handlePrint}
            />
          )
        )}
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
