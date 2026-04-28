/**
 * /eco-panchang — Full Eco-Panchang Calendar page.
 *
 * Primary source: GET /api/panchang/calendar (backend + pyswisseph).
 * Fallback: client-side JS ephemeris + direct Supabase tithis query.
 * Works fully offline from backend.
 */

import { useEffect, useState, useRef } from "react";
import { ChevronLeft, ChevronRight, Leaf, Droplets, Users, Eye, AlertCircle, TreePine, Loader2, BookOpen, Instagram, Youtube, Hash } from "lucide-react";
import AppShell from "@/components/shells/AppShell";
import { fetchPanchangCalendar, type PanchangCalendarRow } from "@/services/api";
import { supabase } from "@/lib/supabase";
import { mergeTithiWithFallback, type Paksha } from "@/lib/tithiFallback";

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

const SPECIAL_LABELS: Record<string, string> = {
  ekadashi: "एकादशी", purnima: "पूर्णिमा", amavasya: "अमावस्या",
  pradosh: "प्रदोष", chaturthi: "चतुर्थी", ashtami: "अष्टमी",
  navami: "नवमी", sankranti: "संक्रांति",
};

const SPECIAL_TITHIS: Record<number, string> = {
  4: "chaturthi", 8: "ashtami", 9: "navami", 11: "ekadashi",
  13: "pradosh", 15: "purnima", 19: "chaturthi", 26: "ekadashi",
  28: "pradosh", 30: "amavasya",
};

// ── Client-side tithi computation (Meeus, accurate to ~0.5°) ─────────────────

function computeTithiForDate(dateStr: string): { tithi_id: number; paksha: string; special_flag: string | null } {
  const d   = new Date(dateStr + "T06:00:00+05:30"); // ~sunrise IST
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
  const tithi_id   = Math.floor(elongation / 12) + 1; // 1–30
  const paksha     = tithi_id <= 15 ? "shukla" : "krishna";
  return { tithi_id, paksha, special_flag: SPECIAL_TITHIS[tithi_id] ?? null };
}

// ── Supabase: load all 30 tithis once ────────────────────────────────────────

type TithiDef = Record<string, string>;
let _tithisCache: TithiDef[] | null = null;

async function getAllTithis(): Promise<TithiDef[]> {
  if (_tithisCache) return _tithisCache;
  if (!supabase) return [];
  const { data } = await supabase.from("tithis").select("*").order("id");
  _tithisCache = (data ?? []) as TithiDef[];
  return _tithisCache;
}

// Build PanchangCalendarRow-compatible objects from client-side computation
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
  const [windowStart,  setWindowStart]  = useState(today);
  const [rows,         setRows]         = useState<PanchangCalendarRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedDate, setSelectedDate] = useState(today);
  const abortRef = useRef<boolean>(false);

  const windowEnd = addDays(windowStart, 6);

  useEffect(() => {
    abortRef.current = false;
    setLoading(true);

    async function load() {
      // Try backend first
      const cal = await fetchPanchangCalendar(windowStart, windowEnd);
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
        // Fallback: compute client-side for the 7-day window
        const dates = Array.from({ length: 7 }, (_, i) => addDays(windowStart, i));
        const fallback = await buildCalendarRows(dates);
        if (!abortRef.current) setRows(fallback);
      }
      if (!abortRef.current) setLoading(false);
    }

    load();
    return () => { abortRef.current = true; };
  }, [windowStart]);

  const selected  = rows.find(r => r.gregorian_date === selectedDate);
  const tithi     = selected?.tithis as TithiDef | undefined;

  return (
    <AppShell>
      {/* Hero */}
      <div className="relative gradient-hero text-primary-foreground py-8 overflow-hidden">
        <div className="container">
          <div className="flex items-center gap-2 mb-1">
            <TreePine className="w-6 h-6" />
            <h1 className="font-heading text-2xl font-bold">Eco-Panchang Calendar</h1>
          </div>
          <p className="text-sm opacity-70">हर तिथि पर प्रकृति और परिवार के लिए शुभ कार्य जानें</p>
        </div>
      </div>

      <div className="container py-6 space-y-6">
        {/* Week navigator */}
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => setWindowStart(addDays(windowStart, -7))}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-sm"
          >
            <ChevronLeft className="w-4 h-4" /> पिछला सप्ताह
          </button>
          <span className="text-sm font-medium text-muted-foreground">
            {formatDisplayDate(windowStart)} – {formatDisplayDate(windowEnd)}
          </span>
          <button
            onClick={() => setWindowStart(addDays(windowStart, 7))}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-sm"
          >
            अगला सप्ताह <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>तिथि डेटा लोड हो रहा है…</span>
          </div>
        ) : (
          <>
            {/* 7-day strip */}
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 7 }).map((_, i) => {
                const d      = addDays(windowStart, i);
                const row    = rows.find(r => r.gregorian_date === d);
                const t      = row?.tithis as TithiDef | undefined;
                const isToday = d === today;
                const isSel   = d === selectedDate;
                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDate(d)}
                    className={[
                      "rounded-xl border p-2 text-center transition-all flex flex-col items-center gap-1",
                      isSel    ? "border-green-500 bg-green-50 dark:bg-green-950/50 shadow-md"
                      : isToday ? "border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30"
                               : "border-border hover:bg-muted",
                    ].join(" ")}
                  >
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" })}
                    </span>
                    <span className={`text-lg font-bold ${isToday ? "text-green-700 dark:text-green-400" : ""}`}>
                      {new Date(d + "T00:00:00").getDate()}
                    </span>
                    <span className="text-[9px] leading-tight text-center font-medium text-green-800 dark:text-green-300 line-clamp-2">
                      {t?.name_sanskrit || t?.name_common || (row ? "—" : "N/A")}
                    </span>
                    {row?.special_flag && (
                      <span className="text-[8px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1 rounded-full">
                        {SPECIAL_LABELS[row.special_flag] ?? row.special_flag}
                      </span>
                    )}
                    {isToday && (
                      <span className="text-[8px] bg-green-600 text-white rounded-full px-1.5">आज</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Detail panel */}
            {tithi ? (
              <div className="border border-green-200 dark:border-green-800 rounded-xl p-5 space-y-4 bg-green-50/40 dark:bg-green-950/20">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="font-heading text-xl font-bold text-green-900 dark:text-green-200">
                      {tithi.name_sanskrit}
                    </h2>
                    <span className="text-sm text-muted-foreground">— {tithi.name_common}</span>
                    {selected?.special_flag && (
                      <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full font-semibold">
                        {SPECIAL_LABELS[selected.special_flag]}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selected?.paksha === "shukla" ? "शुक्ल पक्ष" : "कृष्ण पक्ष"}
                    {selected?.nakshatra && ` · नक्षत्र: ${selected.nakshatra}`}
                    {selected?.yoga      && ` · योग: ${selected.yoga}`}
                    {selected?.masa_name && ` · मास: ${selected.masa_name}`}
                  </p>
                </div>

                {tithi.eco_significance && (
                  <p className="text-sm text-green-800 dark:text-green-300 italic border-l-4 border-green-400 pl-3">
                    {tithi.eco_significance}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {tithi.plant_action     && <EcoCard icon={<Leaf        className="w-4 h-4 text-green-600" />} label="वृक्षारोपण"      text={tithi.plant_action} />}
                  {tithi.water_action     && <EcoCard icon={<Droplets    className="w-4 h-4 text-blue-500"  />} label="जल सेवा"         text={tithi.water_action} />}
                  {tithi.community_action && <EcoCard icon={<Users       className="w-4 h-4 text-purple-500"/>} label="सामुदायिक कार्य" text={tithi.community_action} />}
                  {tithi.nature_observation && <EcoCard icon={<Eye       className="w-4 h-4 text-teal-500"  />} label="प्रकृति अवलोकन" text={tithi.nature_observation} />}
                  {tithi.avoid_action     && <EcoCard icon={<AlertCircle className="w-4 h-4 text-red-400"   />} label="आज परहेज़ करें"  text={tithi.avoid_action} />}
                </div>

                {tithi.ceremony_type_hint && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs text-muted-foreground">अनुशंसित पर्यावरण सेवा:</span>
                    <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full font-medium">
                      {tithi.ceremony_type_hint.replace(/_/g, " ")}
                    </span>
                  </div>
                )}

                {/* ── Blog & Social Content ── */}
                {(tithi.blog_title_template || tithi.ig_caption_template || tithi.yt_short_title_template) && (
                  <div className="border-t border-green-200 dark:border-green-800 pt-4 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      Content &amp; Social Media
                    </p>

                    {/* Blog */}
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

                    {/* Instagram */}
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

                    {/* YouTube Short */}
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
                )}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8 text-sm">
                कोई तिथि चुनें।
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
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
