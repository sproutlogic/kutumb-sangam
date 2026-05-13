/**
 * /eco-panchang — Eco-Panchang Calendar + Prakriti Insights
 *
 * Primary source: GET /api/panchang/calendar (backend + pyswisseph).
 * Fallback: client-side JS ephemeris + direct Supabase tithis query.
 */

import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Leaf, Droplets, Users, Eye, AlertCircle,
  TreePine, Loader2, BookOpen, Instagram, Youtube, Hash, Plus, X,
  Megaphone, Bell, Trash2, CalendarDays, Sunrise,
} from "lucide-react";
import AppShell from "@/components/shells/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchPanchangCalendar, type PanchangCalendarRow,
  fetchTodayPanchang, type TodayPanchang,
  fetchPanchangArticles, createPanchangArticle, updatePanchangArticle, deletePanchangArticle,
  type PanchangArticle, getApiBaseUrl, resolveVanshaIdForApi,
} from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { mergeTithiWithFallback, type Paksha } from "@/lib/tithiFallback";

// ── Calendar event types (mirrored from KutumbCalendarPage) ──────────────────

interface CalendarEvent {
  id: string;
  title: string;
  event_date: string;
  event_type: "birthday" | "anniversary" | "event" | "announcement";
  description?: string;
  recurs_yearly: boolean;
  is_announcement: boolean;
  created_at: string;
}

function getAuthToken(): string {
  try {
    for (const k of Object.keys(localStorage).filter(k => k.endsWith("-auth-token"))) {
      const p = JSON.parse(localStorage.getItem(k) || "{}");
      if (p?.access_token) return p.access_token;
    }
  } catch { /* ignore */ }
  return "";
}

function formatEventDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr + "T00:00:00").getTime() - today.getTime()) / 86400000);
}

const EVENT_EMOJI: Record<string, string> = {
  birthday: "🎂", anniversary: "💍", event: "📅", announcement: "📢",
};
const EVENT_COLOR: Record<string, string> = {
  birthday: "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300",
  anniversary: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  event: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  announcement: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function todayStr(): string { return new Date().toISOString().slice(0, 10); }
function formatDisplayDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
  });
}
function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
function firstDayOfWeek(year: number, month: number): number {
  // 0=Sun … 6=Sat
  return new Date(year, month, 1).getDay();
}
function pad2(n: number): string { return String(n).padStart(2, "0"); }
function monthDateStr(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}
function monthKey(year: number, month: number): string {
  return `${year}-${pad2(month + 1)}`;
}

const SPECIAL_LABELS: Record<string, string> = {
  ekadashi: "एकादशी", purnima: "पूर्णिमा", amavasya: "अमावस्या",
  pradosh: "प्रदोष", chaturthi: "चतुर्थी", ashtami: "अष्टमी",
  navami: "नवमी", sankranti: "संक्रांति",
};

const SPECIAL_COLORS: Record<string, string> = {
  purnima: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  amavasya: "bg-slate-200 text-slate-700 dark:bg-slate-700/60 dark:text-slate-300",
  ekadashi: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  pradosh: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  default: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

const SPECIAL_TITHIS: Record<number, string> = {
  4: "chaturthi", 8: "ashtami", 9: "navami", 11: "ekadashi",
  13: "pradosh", 15: "purnima", 19: "chaturthi", 26: "ekadashi",
  28: "pradosh", 30: "amavasya",
};

// ── Client-side tithi computation (Meeus, accurate to ~0.5°) ─────────────────

function computeTithiForDate(dateStr: string): { tithi_id: number; paksha: string; special_flag: string | null } {
  const d   = new Date(dateStr + "T06:00:00+05:30");
  const JD  = d.getTime() / 86400000 + 2440587.5;
  const T   = (JD - 2451545.0) / 36525;
  const deg = (x: number) => (((x % 360) + 360) % 360);
  const rad = (x: number) => x * Math.PI / 180;

  const L0 = deg(280.46646 + 36000.76983 * T);
  const M  = deg(357.52911 + 35999.05029 * T);
  const Mr = rad(M);
  const C  = 1.914602 * Math.sin(Mr) + 0.019993 * Math.sin(2 * Mr) + 0.000289 * Math.sin(3 * Mr);
  const sunLonTrop = deg(L0 + C);

  const Lm = deg(218.3165  + 481267.8813  * T);
  const Mm = deg(134.96298 + 477198.867398 * T);
  const D2 = deg(297.85036 + 445267.111480 * T);
  const F  = deg(93.27191  + 483202.017538 * T);
  const moonCorr =
    6.289  * Math.sin(rad(Mm)) +
    1.274  * Math.sin(rad(2 * D2 - Mm)) +
    0.658  * Math.sin(rad(2 * D2)) -
    0.214  * Math.sin(rad(2 * Mm)) -
    0.186  * Math.sin(rad(M)) -
    0.114  * Math.sin(rad(2 * F));
  const moonLonTrop = deg(Lm + moonCorr);

  const yearsSince2000 = (JD - 2451545.0) / 365.25;
  const ayanamsha = 23.85 + 0.0137 * yearsSince2000;

  const sunLon  = deg(sunLonTrop  - ayanamsha);
  const moonLon = deg(moonLonTrop - ayanamsha);
  const elongation = deg(moonLon - sunLon);
  const tithi_id   = Math.floor(elongation / 12) + 1;
  const paksha     = tithi_id <= 15 ? "shukla" : "krishna";
  return { tithi_id, paksha, special_flag: SPECIAL_TITHIS[tithi_id] ?? null };
}

type TithiDef = Record<string, string>;
let _tithisCache: TithiDef[] | null = null;

async function getAllTithis(): Promise<TithiDef[]> {
  if (_tithisCache) return _tithisCache;
  if (!supabase) return [];
  const { data } = await supabase.from("tithis").select("*").order("id");
  _tithisCache = (data ?? []) as TithiDef[];
  return _tithisCache;
}

async function buildCalendarRows(dates: string[]): Promise<PanchangCalendarRow[]> {
  const tithis = await getAllTithis();
  return dates.map(dateStr => {
    const { tithi_id, paksha, special_flag } = computeTithiForDate(dateStr);
    const tithiDef = tithis.find(t => Number(t.id) === tithi_id) ?? null;
    const merged = mergeTithiWithFallback(
      tithiDef as Record<string, unknown> | null,
      tithi_id,
      paksha as Paksha,
    );
    return {
      id: dateStr,
      gregorian_date: dateStr,
      tithi_id,
      paksha,
      special_flag,
      nakshatra: null,
      yoga: null,
      masa_name: null,
      samvat_year: null,
      is_kshaya: false,
      is_adhika: false,
      tithis: merged as unknown as PanchangCalendarRow["tithis"],
    } as unknown as PanchangCalendarRow;
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EcoPanchangPage() {
  const today = todayStr();
  const navigate = useNavigate();
  const { appUser } = useAuth();
  const isAdmin = appUser?.role === "admin" || appUser?.role === "superadmin";
  const vanshaId = resolveVanshaIdForApi(null);
  const token = getAuthToken();
  const authHeaders = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  // ── Today's live panchang (pyswisseph via API) ────────────────────────────
  const [todayPanchang, setTodayPanchang] = useState<TodayPanchang | null>(null);

  // Sunset countdown (approximate: 18:30 IST daily)
  const [secsLeft, setSecsLeft] = useState(() => {
    const now = new Date();
    const sunset = new Date(now);
    sunset.setHours(18, 30, 0, 0);
    return Math.max(0, Math.floor((sunset.getTime() - now.getTime()) / 1000));
  });

  useEffect(() => {
    fetchTodayPanchang().then(setTodayPanchang);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setSecsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  // Derived live-panchang helpers
  const PAKSHA: Record<string, string> = { shukla: "शुक्ल पक्ष", krishna: "कृष्ण पक्ष" };
  const pakshaLabel = todayPanchang ? (PAKSHA[todayPanchang.paksha] ?? todayPanchang.paksha) : null;
  const sunriseStr  = todayPanchang?.sunrise_ts
    ? new Date(todayPanchang.sunrise_ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })
    : null;
  const pad2sec = (n: number) => String(n).padStart(2, "0");
  const ctH = Math.floor(secsLeft / 3600);
  const ctM = Math.floor((secsLeft % 3600) / 60);
  const ctS = secsLeft % 60;
  const eco  = todayPanchang?.eco_recommendation ?? null;
  const specialLabel = todayPanchang?.special_flag ? (SPECIAL_LABELS[todayPanchang.special_flag] ?? todayPanchang.special_flag) : null;
  const specialColor = todayPanchang?.special_flag ? (SPECIAL_COLORS[todayPanchang.special_flag] ?? SPECIAL_COLORS.default) : null;

  // View mode — default to week
  const [viewMode, setViewMode] = useState<"week" | "month">("week");

  // Week view state
  const [windowStart, setWindowStart] = useState(today);

  // Month view state
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Shared
  const [rows, setRows] = useState<PanchangCalendarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(today);
  const abortRef = useRef<boolean>(false);

  // Articles
  const [articles, setArticles] = useState<PanchangArticle[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  // Add article modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newDate, setNewDate] = useState("");
  const [savingArticle, setSavingArticle] = useState(false);

  // Publish dialog
  const [publishTarget, setPublishTarget] = useState<PanchangArticle | null>(null);
  const [authorName, setAuthorName] = useState("");
  const [publishing, setPublishing] = useState(false);

  // Calendar events
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [showEventModal, setShowEventModal] = useState(false);
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [evtTitle, setEvtTitle] = useState("");
  const [evtDate, setEvtDate] = useState("");
  const [evtType, setEvtType] = useState("event");
  const [evtDesc, setEvtDesc] = useState("");
  const [evtRecurs, setEvtRecurs] = useState(false);
  const [evtSaving, setEvtSaving] = useState(false);

  // Social media visibility (admin-controlled)
  const [showSocialMedia, setShowSocialMedia] = useState(true);

  const windowEnd = addDays(windowStart, 6);

  // ── Load calendar rows ───────────────────────────────────────────────────

  useEffect(() => {
    abortRef.current = false;
    setLoading(true);

    async function load() {
      let from: string;
      let to: string;

      if (viewMode === "week") {
        from = windowStart;
        to = windowEnd;
      } else {
        const { year, month } = currentMonth;
        from = monthDateStr(year, month, 1);
        to = monthDateStr(year, month, daysInMonth(year, month));
      }

      const cal = await fetchPanchangCalendar(from, to);
      if (abortRef.current) return;

      if (cal.length > 0) {
        const enriched = cal.map((row) => {
          const merged = mergeTithiWithFallback(
            row.tithis as Record<string, unknown> | null | undefined,
            row.tithi_id,
            row.paksha as Paksha,
          );
          return { ...row, tithis: merged as unknown as PanchangCalendarRow["tithis"] };
        });
        setRows(enriched);
      } else {
        let dates: string[];
        if (viewMode === "week") {
          dates = Array.from({ length: 7 }, (_, i) => addDays(windowStart, i));
        } else {
          const { year, month } = currentMonth;
          const count = daysInMonth(year, month);
          dates = Array.from({ length: count }, (_, i) => monthDateStr(year, month, i + 1));
        }
        const fallback = await buildCalendarRows(dates);
        if (!abortRef.current) setRows(fallback);
      }
      if (!abortRef.current) setLoading(false);
    }

    load();
    return () => { abortRef.current = true; };
  }, [viewMode, windowStart, currentMonth.year, currentMonth.month]);

  // ── Load articles ────────────────────────────────────────────────────────

  useEffect(() => {
    setArticlesLoading(true);
    const mk = viewMode === "month"
      ? monthKey(currentMonth.year, currentMonth.month)
      : monthKey(
          new Date(windowStart + "T00:00:00").getFullYear(),
          new Date(windowStart + "T00:00:00").getMonth(),
        );
    fetchPanchangArticles(mk).then(data => {
      setArticles(data);
      setArticlesLoading(false);
    });
  }, [viewMode, windowStart, currentMonth.year, currentMonth.month]);

  // ── Load calendar events ─────────────────────────────────────────────────
  useEffect(() => {
    if (!vanshaId) { setEventsLoading(false); return; }
    fetch(`${getApiBaseUrl()}/api/calendar/events?vansha_id=${vanshaId}`, { headers: authHeaders })
      .then(r => r.ok ? r.json() : [])
      .then(setEvents)
      .catch(() => {})
      .finally(() => setEventsLoading(false));
  }, [vanshaId]);

  // ── Events CRUD ──────────────────────────────────────────────────────────
  async function saveEvent() {
    if (!evtTitle.trim() || !evtDate) { toast({ title: "शीर्षक और तिथि आवश्यक है", variant: "destructive" }); return; }
    setEvtSaving(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/calendar/events`, {
        method: "POST", headers: authHeaders,
        body: JSON.stringify({
          vansha_id: vanshaId,
          title: evtTitle.trim(), event_date: evtDate,
          event_type: isAnnouncement ? "announcement" : evtType,
          description: evtDesc || null,
          recurs_yearly: evtRecurs,
          is_announcement: isAnnouncement,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "Error");
      setEvents(prev => [...prev, data].sort((a, b) => a.event_date.localeCompare(b.event_date)));
      toast({ title: isAnnouncement ? "घोषणा पोस्ट की गई!" : "इवेंट जोड़ा गया!" });
      setShowEventModal(false);
      setEvtTitle(""); setEvtDate(""); setEvtDesc(""); setEvtType("event"); setEvtRecurs(false);
    } catch (e) {
      toast({ title: String(e), variant: "destructive" });
    } finally { setEvtSaving(false); }
  }

  async function removeEvent(id: string) {
    await fetch(`${getApiBaseUrl()}/api/calendar/events/${id}`, { method: "DELETE", headers: authHeaders });
    setEvents(prev => prev.filter(e => e.id !== id));
    toast({ title: "इवेंट हटाया गया" });
  }

  const upcomingEvents = events.filter(e => daysUntil(e.event_date) >= 0).slice(0, 10);
  const announcements = events.filter(e => e.is_announcement);

  const selected = rows.find(r => r.gregorian_date === selectedDate);
  const tithi    = selected?.tithis as TithiDef | undefined;

  // article dot dates set
  const articleDates = new Set(articles.filter(a => a.related_date).map(a => a.related_date!));

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleCreateArticle() {
    if (!newTitle.trim() || !newBody.trim()) return;
    setSavingArticle(true);
    try {
      const article = await createPanchangArticle({
        title: newTitle.trim(),
        body: newBody.trim(),
        related_date: newDate || undefined,
      });
      setArticles(prev => [article, ...prev]);
      setShowAddModal(false);
      setNewTitle(""); setNewBody(""); setNewDate("");
    } finally {
      setSavingArticle(false);
    }
  }

  async function handlePublish() {
    if (!publishTarget || !authorName.trim()) return;
    setPublishing(true);
    try {
      const updated = await updatePanchangArticle(publishTarget.id, {
        author_name: authorName.trim(),
        published: true,
      });
      setArticles(prev => prev.map(a => a.id === updated.id ? updated : a));
      setPublishTarget(null);
      setAuthorName("");
    } finally {
      setPublishing(false);
    }
  }

  async function handleDelete(id: string) {
    await deletePanchangArticle(id);
    setArticles(prev => prev.filter(a => a.id !== id));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="relative gradient-hero text-primary-foreground overflow-hidden">
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 24px 32px" }}>

          {/* Top row: brand + CTA buttons */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <TreePine className="w-5 h-5 opacity-80" />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.65 }}>{appUser?.first_name ? `${appUser.first_name} Panchang` : "Panchang"}</span>
              </div>
              <h1 className="font-heading" style={{ fontSize: "clamp(24px,3vw,36px)", fontWeight: 700, lineHeight: 1.1 }}>
                {todayPanchang
                  ? (todayPanchang.tithi?.name_sanskrit ?? "Prakriti Calendar")
                  : "Prakriti Calendar"}
              </h1>
              <p style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
                {todayPanchang
                  ? [pakshaLabel, todayPanchang.masa ? `${todayPanchang.masa} मास` : null, todayPanchang.samvat_year ? `सम्वत ${todayPanchang.samvat_year}` : null].filter(Boolean).join(" · ")
                  : "हर तिथि पर प्रकृति और समाज के लिए शुभ कार्य जानें"}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => navigate("/services")}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-primary-foreground/20 text-primary-foreground text-sm font-semibold transition-colors">
                🌿 सेवा बुक करें →
              </button>
              {appUser && (
                <>
                  <button onClick={() => { setIsAnnouncement(true); setShowEventModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-foreground/15 text-primary-foreground text-sm font-semibold hover:bg-primary-foreground/25 transition-colors">
                    <Megaphone className="w-4 h-4" /> घोषणा
                  </button>
                  <button onClick={() => { setIsAnnouncement(false); setShowEventModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-foreground/15 text-primary-foreground text-sm font-semibold hover:bg-primary-foreground/25 transition-colors">
                    <Plus className="w-4 h-4" /> इवेंट
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Live panchang data strip */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {/* Tithi pill */}
            {todayPanchang ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", fontSize: 12 }}>
                <span style={{ fontSize: 14 }}>🌒</span>
                <span style={{ fontWeight: 600 }}>{todayPanchang.tithi?.name_common ?? "—"}</span>
                {specialLabel && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1 ${specialColor}`}>{specialLabel}</span>
                )}
                {todayPanchang.is_kshaya && <span style={{ fontSize: 10, opacity: 0.7 }}>(क्षय)</span>}
                {todayPanchang.is_adhika && <span style={{ fontSize: 10, opacity: 0.7 }}>(अधिक)</span>}
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.08)", fontSize: 12, opacity: 0.5 }}>
                <Loader2 className="w-3 h-3 animate-spin" /> लोड हो रहा है…
              </div>
            )}

            {/* Nakshatra */}
            {todayPanchang?.nakshatra && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", fontSize: 12 }}>
                <span>✦</span>
                <span>नक्षत्र: <strong>{todayPanchang.nakshatra}</strong></span>
              </div>
            )}

            {/* Yoga */}
            {todayPanchang?.yoga && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", fontSize: 12 }}>
                <span>☯</span>
                <span>योग: <strong>{todayPanchang.yoga}</strong></span>
              </div>
            )}

            {/* Sunrise */}
            {sunriseStr && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, background: "rgba(255,200,50,0.12)", border: "1px solid rgba(255,200,50,0.25)", fontSize: 12 }}>
                <Sunrise className="w-3.5 h-3.5 opacity-80" />
                <span>सूर्योदय: <strong>{sunriseStr}</strong></span>
              </div>
            )}

            {/* Eco window countdown */}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 8, background: secsLeft > 3600 ? "rgba(34,197,94,0.15)" : "rgba(249,115,22,0.18)", border: `1px solid ${secsLeft > 3600 ? "rgba(34,197,94,0.3)" : "rgba(249,115,22,0.35)"}` }}>
              <span style={{ fontSize: 10, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em" }}>Eco window</span>
              <span style={{ fontFamily: "var(--ds-mono, monospace)", fontSize: 15, fontWeight: 700, color: secsLeft > 3600 ? "#86efac" : "#fb923c" }}>
                {pad2sec(ctH)}:{pad2sec(ctM)}:{pad2sec(ctS)}
              </span>
              {todayPanchang?.special_flag && <span style={{ fontSize: 10, opacity: 0.8 }}>2× आज</span>}
            </div>
          </div>

          {/* Eco recommendation mini-cards — from live pyswisseph API */}
          {eco && (eco.plant || eco.water || eco.community) && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }} className="ep-eco-grid">
              {eco.plant && (
                <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.22)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>🌱</span>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.6, marginBottom: 2 }}>वृक्षारोपण</div>
                    <div style={{ fontSize: 11, lineHeight: 1.4, opacity: 0.9 }}>{eco.plant}</div>
                  </div>
                </div>
              )}
              {eco.water && (
                <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(56,189,248,0.10)", border: "1px solid rgba(56,189,248,0.22)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>💧</span>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.6, marginBottom: 2 }}>जल सेवा</div>
                    <div style={{ fontSize: 11, lineHeight: 1.4, opacity: 0.9 }}>{eco.water}</div>
                  </div>
                </div>
              )}
              {eco.community && (
                <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(168,85,247,0.10)", border: "1px solid rgba(168,85,247,0.22)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>🤝</span>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.6, marginBottom: 2 }}>सामुदायिक कार्य</div>
                    <div style={{ fontSize: 11, lineHeight: 1.4, opacity: 0.9 }}>{eco.community}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 700px) { .ep-eco-grid { grid-template-columns: 1fr !important; } }
        @media (max-width: 900px) { .ep-eco-grid { grid-template-columns: 1fr 1fr !important; } }
      `}</style>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 24px 80px" }} className="space-y-6">
        {/* Upcoming Events + Announcements */}
        {(announcements.length > 0 || upcomingEvents.filter(e => !e.is_announcement).length > 0 || !eventsLoading) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-bold text-sm flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" /> आगामी इवेंट
              </h2>
            </div>
            {eventsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> लोड हो रहा है…
              </div>
            ) : upcomingEvents.filter(e => !e.is_announcement).length === 0 && announcements.length === 0 ? (
              <div className="bg-card rounded-xl p-5 text-center border border-border/50">
                <CalendarDays className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground font-body">कोई आगामी इवेंट नहीं।</p>
                {appUser && (
                  <button onClick={() => { setIsAnnouncement(false); setShowEventModal(true); }} className="mt-2 text-primary text-xs font-medium hover:underline">
                    पहला इवेंट जोड़ें →
                  </button>
                )}
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {announcements.map(e => (
                  <div key={e.id} className="flex-shrink-0 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 w-48 sm:w-56">
                    <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 mb-0.5">📢 घोषणा</p>
                    <p className="font-semibold text-xs leading-tight">{e.title}</p>
                    {appUser && <button onClick={() => removeEvent(e.id)} className="mt-1 text-[9px] text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3 inline" /></button>}
                  </div>
                ))}
                {upcomingEvents.filter(e => !e.is_announcement).map(e => {
                  const days = daysUntil(e.event_date);
                  return (
                    <div key={e.id} className="flex-shrink-0 bg-card border border-border/50 rounded-xl p-3 w-48 sm:w-56 flex items-start gap-2">
                      <span className="text-lg">{EVENT_EMOJI[e.event_type] || "📅"}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-xs leading-tight truncate">{e.title}</p>
                        <p className="text-[10px] text-muted-foreground">{formatEventDate(e.event_date)}</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${EVENT_COLOR[e.event_type]}`}>
                          {days === 0 ? "आज!" : days === 1 ? "कल" : `${days} दिन`}
                        </span>
                      </div>
                      {appUser && <button onClick={() => removeEvent(e.id)} className="text-muted-foreground hover:text-destructive flex-shrink-0"><Trash2 className="w-3 h-3" /></button>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* View toggle + navigation */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Toggle */}
          <div className="flex items-center rounded-lg border border-border overflow-hidden text-sm">
            <button
              onClick={() => setViewMode("week")}
              className={`px-4 py-2 transition-colors ${viewMode === "week" ? "bg-green-600 text-white" : "hover:bg-muted"}`}
            >
              सप्ताह
            </button>
            <button
              onClick={() => setViewMode("month")}
              className={`px-4 py-2 transition-colors ${viewMode === "month" ? "bg-green-600 text-white" : "hover:bg-muted"}`}
            >
              माह
            </button>
          </div>

          {/* Navigation */}
          {viewMode === "week" ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWindowStart(addDays(windowStart, -7))}
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-sm"
              >
                <ChevronLeft className="w-4 h-4" /> पिछला
              </button>
              <span className="text-sm font-medium text-muted-foreground">
                {formatDisplayDate(windowStart)} – {formatDisplayDate(windowEnd)}
              </span>
              <button
                onClick={() => setWindowStart(addDays(windowStart, 7))}
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-sm"
              >
                अगला <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentMonth(prev => {
                  const d = new Date(prev.year, prev.month - 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })}
                className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold min-w-[140px] text-center">
                {monthLabel(currentMonth.year, currentMonth.month)}
              </span>
              <button
                onClick={() => setCurrentMonth(prev => {
                  const d = new Date(prev.year, prev.month + 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })}
                className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>तिथि डेटा लोड हो रहा है…</span>
          </div>
        ) : viewMode === "week" ? (
          <WeekView
            rows={rows}
            windowStart={windowStart}
            today={today}
            selectedDate={selectedDate}
            onSelectDate={d => { setSelectedDate(d); setEvtDate(d); }}
            articleDates={articleDates}
          />
        ) : (
          <MonthView
            rows={rows}
            currentMonth={currentMonth}
            today={today}
            selectedDate={selectedDate}
            onSelectDate={d => { setSelectedDate(d); setEvtDate(d); }}
            articleDates={articleDates}
          />
        )}

        {/* Add Event for selected date — shown after date is clicked */}
        {appUser && selectedDate && (
          <div className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card/60">
            <span className="text-sm text-muted-foreground flex-1">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            </span>
            <button onClick={() => { setIsAnnouncement(false); setShowEventModal(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Event
            </button>
            <button onClick={() => { setIsAnnouncement(true); setShowEventModal(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:opacity-80 transition-colors">
              <Megaphone className="w-3.5 h-3.5" /> Announce
            </button>
          </div>
        )}

        {/* Detail panel + Blog preview + Social Media (two-column on large screens) */}
        {tithi ? (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3">
              <DetailPanel selected={selected!} tithi={tithi} />
            </div>
            <div className="lg:col-span-2 space-y-3">
              {/* Blog preview — latest article */}
              {articles.length > 0 && (
                <div className="border border-border rounded-xl p-4 bg-card space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" /> प्रकृति इनसाइट
                  </p>
                  <h3 className="font-semibold text-sm leading-snug line-clamp-2">{articles[0].title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{articles[0].body}</p>
                  <button
                    onClick={() => setExpandedArticle(articles[0].id)}
                    className="text-xs text-green-600 hover:text-green-700 font-medium"
                  >
                    और पढ़ें →
                  </button>
                </div>
              )}
              {/* Content & Social Media — separated from detail panel */}
              {(tithi as TithiDef).blog_title_template || (tithi as TithiDef).ig_caption_template || (tithi as TithiDef).yt_short_title_template ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      Content &amp; Social Media
                    </p>
                    {isAdmin && (
                      <button
                        onClick={() => setShowSocialMedia(v => !v)}
                        className={`text-[10px] px-2 py-1 rounded border transition-colors ${showSocialMedia ? "border-green-400 text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30" : "border-border text-muted-foreground"}`}
                      >
                        {showSocialMedia ? "👁 Visible" : "🙈 Hidden"}
                      </button>
                    )}
                  </div>
                  {showSocialMedia && <ContentSocialSection tithi={tithi as TithiDef} />}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-6 text-sm">
            कोई तिथि चुनें।
          </div>
        )}

        {/* Prakriti Insights */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-heading text-lg font-bold text-green-900 dark:text-green-200">
                🌿 प्रकृति इनसाइट्स
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                तिथि अनुसार पर्यावरण सेवा — वैदिक परंपरा और विज्ञान के आलोक में
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Insight
              </button>
            )}
          </div>

          {articlesLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> लोड हो रहा है…
            </div>
          ) : articles.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              इस माह के लिए अभी कोई Prakriti Insight नहीं है।
            </p>
          ) : (
            <div className="space-y-4">
              {articles.map(article => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  isAdmin={isAdmin}
                  expanded={expandedArticle === article.id}
                  onToggleExpand={() =>
                    setExpandedArticle(prev => prev === article.id ? null : article.id)
                  }
                  onPublish={() => { setPublishTarget(article); setAuthorName(""); }}
                  onDelete={() => handleDelete(article.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Event / Announce Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border/50">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
              <h3 className="font-heading font-bold">{isAnnouncement ? "कुटुंब को घोषणा करें" : "इवेंट जोड़ें"}</h3>
              <button onClick={() => setShowEventModal(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5">शीर्षक</label>
                <input value={evtTitle} onChange={e => setEvtTitle(e.target.value)} maxLength={200}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              {!isAnnouncement && (
                <div>
                  <label className="block text-xs font-medium mb-1.5">प्रकार</label>
                  <select value={evtType} onChange={e => setEvtType(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40">
                    {["birthday", "anniversary", "event"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium mb-1.5">तिथि</label>
                <input type="date" value={evtDate} onChange={e => setEvtDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">विवरण <span className="text-muted-foreground font-normal">(��ैकल्पिक)</span></label>
                <textarea value={evtDesc} onChange={e => setEvtDesc(e.target.value)} rows={3} maxLength={1000}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              {!isAnnouncement && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={evtRecurs} onChange={e => setEvtRecurs(e.target.checked)} className="accent-primary" />
                  <span className="text-sm font-body">हर वर्ष दोहराएँ</span>
                </label>
              )}
            </div>
            <div className="px-6 py-4 border-t border-border/50 flex gap-3">
              <button onClick={() => setShowEventModal(false)} className="flex-1 py-2.5 rounded-lg border border-border text-sm font-body">रद्द करें</button>
              <button onClick={saveEvent} disabled={evtSaving}
                className="flex-1 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold text-sm shadow-warm hover:opacity-90 disabled:opacity-50">
                {evtSaving ? "सहेज रहे हैं…" : isAnnouncement ? "घोषणा भेजें" : "सहेजें"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Article Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl border border-border shadow-xl w-full max-w-lg space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-lg">New Prakriti Insight</h3>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Title</label>
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. एकादशी पर वृक्षारोपण क्यों करें?"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Body</label>
                <textarea
                  rows={6}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  placeholder="Vedic rationale + scientific explanation of the eco-practice for this tithi…"
                  value={newBody}
                  onChange={e => setNewBody(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Related Date (optional)</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateArticle}
                disabled={!newTitle.trim() || !newBody.trim() || savingArticle}
                className="px-4 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 transition-colors"
              >
                {savingArticle ? "Saving…" : "Save as Draft"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish Dialog */}
      {publishTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl border border-border shadow-xl w-full max-w-sm space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-lg">Publish Insight</h3>
              <button onClick={() => setPublishTarget(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">"{publishTarget.title}"</p>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Author Name</label>
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Your name as it will appear publicly"
                value={authorName}
                onChange={e => setAuthorName(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setPublishTarget(null)}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                disabled={!authorName.trim() || publishing}
                className="px-4 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 transition-colors"
              >
                {publishing ? "Publishing…" : "Publish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ── Week View ─────────────────────────────────────────────────────────────────

function WeekView({
  rows, windowStart, today, selectedDate, onSelectDate, articleDates,
}: {
  rows: PanchangCalendarRow[];
  windowStart: string;
  today: string;
  selectedDate: string;
  onSelectDate: (d: string) => void;
  articleDates: Set<string>;
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {Array.from({ length: 7 }).map((_, i) => {
        const d      = addDays(windowStart, i);
        const row    = rows.find(r => r.gregorian_date === d);
        const t      = row?.tithis as Record<string, string> | undefined;
        const isToday = d === today;
        const isSel   = d === selectedDate;
        return (
          <button
            key={d}
            onClick={() => onSelectDate(d)}
            className={[
              "rounded-lg border p-1.5 text-center transition-all flex flex-col items-center gap-0.5",
              isSel    ? "border-green-500 bg-green-600 text-white shadow-md"
              : isToday ? "border-green-500 bg-green-50 dark:bg-green-950/50 ring-2 ring-green-400"
                       : "border-border hover:bg-muted",
            ].join(" ")}
          >
            <span className={`text-[10px] ${isSel ? "text-white/80" : "text-muted-foreground"}`}>
              {new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" })}
            </span>
            <span className={`text-sm font-bold leading-tight ${isSel ? "text-white" : isToday ? "text-green-700 dark:text-green-400" : "text-foreground"}`}>
              {new Date(d + "T00:00:00").getDate()}
            </span>
            <span className={`text-[9px] leading-tight text-center font-medium line-clamp-2 ${isToday ? "text-white/90" : "text-foreground/80"}`}>
              {t?.name_sanskrit || t?.name_common || (row ? "—" : "N/A")}
            </span>
            {row?.special_flag && (
              <span className={`text-[8px] px-1 rounded-full ${SPECIAL_COLORS[row.special_flag] ?? SPECIAL_COLORS.default}`}>
                {SPECIAL_LABELS[row.special_flag] ?? row.special_flag}
              </span>
            )}
            {articleDates.has(d) && (
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-0.5" />
            )}
            {isToday && (
              <span className="text-[8px] bg-green-600 text-white rounded-full px-1.5">आज</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Month View ────────────────────────────────────────────────────────────────

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function MonthView({
  rows, currentMonth, today, selectedDate, onSelectDate, articleDates,
}: {
  rows: PanchangCalendarRow[];
  currentMonth: { year: number; month: number };
  today: string;
  selectedDate: string;
  onSelectDate: (d: string) => void;
  articleDates: Set<string>;
}) {
  const { year, month } = currentMonth;
  const totalDays  = daysInMonth(year, month);
  const startDay   = firstDayOfWeek(year, month); // 0=Sun
  const totalCells = Math.ceil((startDay + totalDays) / 7) * 7;

  return (
    <div>
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEK_DAYS.map(d => (
          <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Calendar cells */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: totalCells }).map((_, idx) => {
          const dayNum = idx - startDay + 1;
          const isThisMonth = dayNum >= 1 && dayNum <= totalDays;
          if (!isThisMonth) {
            return <div key={idx} className="rounded-lg h-12 bg-muted/20" />;
          }

          const dateStr  = monthDateStr(year, month, dayNum);
          const row      = rows.find(r => r.gregorian_date === dateStr);
          const t        = row?.tithis as Record<string, string> | undefined;
          const isToday  = dateStr === today;
          const isSel    = dateStr === selectedDate;
          const tithiName = t?.name_sanskrit || t?.name_common || "";

          return (
            <button
              key={idx}
              onClick={() => onSelectDate(dateStr)}
              className={[
                "rounded-lg border p-1 text-left flex flex-col gap-0.5 h-12 transition-all overflow-hidden",
                isSel    ? "border-green-500 bg-green-50 dark:bg-green-950/50 shadow"
                : isToday ? "border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/30"
                         : "border-border hover:bg-muted",
              ].join(" ")}
            >
              <span className={`text-xs font-bold leading-none ${isToday ? "text-green-700 dark:text-green-400" : ""}`}>
                {dayNum}
              </span>
              {tithiName && (
                <span className="text-[9px] leading-tight text-green-800 dark:text-green-300 line-clamp-2 font-medium">
                  {tithiName}
                </span>
              )}
              {row?.special_flag && (
                <span className={`text-[8px] px-1 rounded-full self-start ${SPECIAL_COLORS[row.special_flag] ?? SPECIAL_COLORS.default}`}>
                  {SPECIAL_LABELS[row.special_flag]}
                </span>
              )}
              {articleDates.has(dateStr) && (
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 self-end mt-auto" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({ selected, tithi }: { selected: PanchangCalendarRow; tithi: TithiDef }) {
  return (
    <div className="border border-green-200 dark:border-green-800 rounded-xl p-5 space-y-4 bg-green-50/40 dark:bg-green-950/20">
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h2 className="font-heading text-xl font-bold text-green-900 dark:text-green-200">
            {tithi.name_sanskrit}
          </h2>
          <span className="text-sm text-muted-foreground">— {tithi.name_common}</span>
          {selected.special_flag && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${SPECIAL_COLORS[selected.special_flag] ?? SPECIAL_COLORS.default}`}>
              {SPECIAL_LABELS[selected.special_flag]}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {selected.paksha === "shukla" ? "शुक्ल पक्ष" : "कृष्ण पक्ष"}
          {selected.nakshatra && ` · नक्षत्र: ${selected.nakshatra}`}
          {selected.yoga      && ` · योग: ${selected.yoga}`}
          {selected.masa_name && ` · मास: ${selected.masa_name}`}
        </p>
      </div>

      {tithi.eco_significance && (
        <p className="text-sm text-green-800 dark:text-green-300 italic border-l-4 border-green-400 pl-3">
          {tithi.eco_significance}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        {tithi.plant_action      && <EcoCard icon={<Leaf        className="w-4 h-4 text-green-600" />} label="वृक्षारोपण"      text={tithi.plant_action} />}
        {tithi.water_action      && <EcoCard icon={<Droplets    className="w-4 h-4 text-blue-500"  />} label="जल सेवा"         text={tithi.water_action} />}
        {tithi.community_action  && <EcoCard icon={<Users       className="w-4 h-4 text-purple-500"/>} label="सामुदायिक कार्य" text={tithi.community_action} />}
        {tithi.nature_observation && <EcoCard icon={<Eye        className="w-4 h-4 text-teal-500"  />} label="प्रकृति अवलोकन" text={tithi.nature_observation} />}
        {tithi.avoid_action      && <EcoCard icon={<AlertCircle className="w-4 h-4 text-red-400"   />} label="आज परहेज़ करें"  text={tithi.avoid_action} />}
      </div>

      {tithi.ceremony_type_hint && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">अनुशंसित पर्यावरण सेवा:</span>
          <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full font-medium">
            {tithi.ceremony_type_hint.replace(/_/g, " ")}
          </span>
        </div>
      )}

    </div>
  );
}

// ── Content & Social Media Section (standalone, outside DetailPanel) ──────────

function ContentSocialSection({ tithi }: { tithi: TithiDef }) {
  return (
    <div className="space-y-3">
      {tithi.blog_title_template && (
        <div className="bg-white/70 dark:bg-black/20 rounded-lg p-3 border border-green-100 dark:border-green-900/40">
          <div className="flex items-center gap-1.5 mb-1.5">
            <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Blog Post</span>
          </div>
          <p className="text-sm font-bold text-foreground leading-snug">
            {tithi.blog_title_template.replace(/\{[^}]+\}/g, "…")}
          </p>
          {tithi.blog_subtitle_template && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {tithi.blog_subtitle_template.replace(/\{[^}]+\}/g, "…")}
            </p>
          )}
        </div>
      )}
      {tithi.ig_caption_template && (
        <div className="bg-white/70 dark:bg-black/20 rounded-lg p-3 border border-pink-100 dark:border-pink-900/40">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Instagram className="w-3.5 h-3.5 text-pink-500" />
            <span className="text-xs font-semibold text-pink-700 dark:text-pink-300">Instagram Caption</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
            {tithi.ig_caption_template.replace(/\{[^}]+\}/g, "…")}
          </p>
          {tithi.ig_hashtag_set && Array.isArray(tithi.ig_hashtag_set) && (
            <div className="flex items-center gap-1 flex-wrap mt-2">
              <Hash className="w-3 h-3 text-pink-400" />
              {(tithi.ig_hashtag_set as string[]).map(tag => (
                <span key={tag} className="text-[10px] text-pink-500 dark:text-pink-400">{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}
      {tithi.yt_short_title_template && (
        <div className="bg-white/70 dark:bg-black/20 rounded-lg p-3 border border-red-100 dark:border-red-900/40">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Youtube className="w-3.5 h-3.5 text-red-500" />
            <span className="text-xs font-semibold text-red-700 dark:text-red-300">YouTube Short</span>
          </div>
          <p className="text-sm font-bold text-foreground leading-snug">
            {tithi.yt_short_title_template.replace(/\{[^}]+\}/g, "…")}
          </p>
          {tithi.yt_short_desc_template && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {tithi.yt_short_desc_template.replace(/\{[^}]+\}/g, "…")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Article Card ──────────────────────────────────────────────────────────────

function ArticleCard({
  article, isAdmin, expanded, onToggleExpand, onPublish, onDelete,
}: {
  article: PanchangArticle;
  isAdmin: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onPublish: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`rounded-xl border p-4 space-y-2 ${!article.published ? "border-dashed border-amber-300 bg-amber-50/40 dark:bg-amber-950/10" : "border-border bg-background"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm text-foreground">{article.title}</h3>
            {!article.published && (
              <span className="text-[10px] bg-amber-200 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-semibold">
                Draft
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {article.related_date && (
              <span className="text-[10px] text-muted-foreground">
                📅 {new Date(article.related_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
            {article.author_name && (
              <span className="text-[10px] text-muted-foreground">✍️ {article.author_name}</span>
            )}
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1 shrink-0">
            {!article.published && (
              <button
                onClick={onPublish}
                className="text-[11px] px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white transition-colors"
              >
                Publish
              </button>
            )}
            <button
              onClick={onDelete}
              className="text-[11px] px-2 py-1 rounded border border-red-200 hover:bg-red-50 text-red-500 dark:border-red-800 dark:hover:bg-red-950/30 transition-colors"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <p className={`text-sm text-muted-foreground leading-relaxed ${!expanded ? "line-clamp-3" : ""}`}>
        {article.body}
      </p>

      {article.body.length > 200 && (
        <button
          onClick={onToggleExpand}
          className="text-xs text-green-600 hover:text-green-700 font-medium"
        >
          {expanded ? "कम दिखाएं ↑" : "और पढ़ें →"}
        </button>
      )}
    </div>
  );
}

function EcoCard({ icon, label, text }: { icon: React.ReactNode; label: string; text: string }) {
  return (
    <div className="flex items-start gap-2 bg-white/60 dark:bg-black/20 rounded-lg p-3 border border-green-100 dark:border-green-900/40">
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <div>
        <div className="font-semibold text-xs text-green-900 dark:text-green-200 mb-0.5">{label}</div>
        <div className="text-xs text-muted-foreground leading-relaxed">{text}</div>
      </div>
    </div>
  );
}
