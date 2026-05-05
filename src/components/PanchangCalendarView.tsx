import { useEffect, useState, useRef } from "react";
import { ChevronLeft, ChevronRight, Loader2, Leaf, Droplets, Users, Eye, AlertCircle } from "lucide-react";
import { fetchPanchangCalendar, type PanchangCalendarRow } from "@/services/api";
import { mergeTithiWithFallback, type Paksha } from "@/lib/tithiFallback";
import { supabase } from "@/lib/supabase";

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
  return new Date(year, month, 1).getDay();
}
function pad2(n: number): string { return String(n).padStart(2, "0"); }
function monthDateStr(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
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

// ── Client-side tithi fallback ─────────────────────────────────────────────

function computeTithiForDate(dateStr: string): { tithi_id: number; paksha: string; special_flag: string | null } {
  const d  = new Date(dateStr + "T06:00:00+05:30");
  const JD = d.getTime() / 86400000 + 2440587.5;
  const T  = (JD - 2451545.0) / 36525;
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

  const ayanamsha = 23.85 + 0.0137 * ((JD - 2451545.0) / 365.25);
  const sunLon    = deg(sunLonTrop  - ayanamsha);
  const moonLon   = deg(moonLonTrop - ayanamsha);
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

async function buildFallbackRows(dates: string[]): Promise<PanchangCalendarRow[]> {
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

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  /** Default month to show on first render (0-indexed). Defaults to May 2026. */
  defaultYear?: number;
  defaultMonth?: number;
}

export default function PanchangCalendarView({ defaultYear = 2026, defaultMonth = 4 }: Props) {
  const today = todayStr();

  const [viewMode, setViewMode] = useState<"week" | "month">("month");

  // Week view
  const [windowStart, setWindowStart] = useState(() => monthDateStr(defaultYear, defaultMonth, 1));

  // Month view
  const [currentMonth, setCurrentMonth] = useState({ year: defaultYear, month: defaultMonth });

  const [rows, setRows] = useState<PanchangCalendarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => monthDateStr(defaultYear, defaultMonth, 1));
  const abortRef = useRef<boolean>(false);

  // ── Load data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    abortRef.current = false;
    setLoading(true);

    async function load() {
      let from: string;
      let to: string;

      if (viewMode === "week") {
        from = windowStart;
        to = addDays(windowStart, 6);
      } else {
        const { year, month } = currentMonth;
        from = monthDateStr(year, month, 1);
        to = monthDateStr(year, month, daysInMonth(year, month));
      }

      const cal = await fetchPanchangCalendar(from, to);
      if (abortRef.current) return;

      if (cal.length > 0) {
        const enriched = cal.map(row => {
          const merged = mergeTithiWithFallback(
            row.tithis as Record<string, unknown> | null | undefined,
            row.tithi_id,
            row.paksha as Paksha,
          );
          return { ...row, tithis: merged as unknown as PanchangCalendarRow["tithis"] };
        });
        if (!abortRef.current) setRows(enriched);
      } else {
        let dates: string[];
        if (viewMode === "week") {
          dates = Array.from({ length: 7 }, (_, i) => addDays(windowStart, i));
        } else {
          const { year, month } = currentMonth;
          const count = daysInMonth(year, month);
          dates = Array.from({ length: count }, (_, i) => monthDateStr(year, month, i + 1));
        }
        const fallback = await buildFallbackRows(dates);
        if (!abortRef.current) setRows(fallback);
      }

      if (!abortRef.current) setLoading(false);
    }

    load();
    return () => { abortRef.current = true; };
  }, [viewMode, windowStart, currentMonth.year, currentMonth.month]);

  const windowEnd = addDays(windowStart, 6);
  const selected  = rows.find(r => r.gregorian_date === selectedDate);
  const tithi     = selected?.tithis as TithiDef | undefined;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
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

      {/* Calendar grid */}
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
          onSelectDate={setSelectedDate}
        />
      ) : (
        <MonthView
          rows={rows}
          currentMonth={currentMonth}
          today={today}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
      )}

      {/* Detail panel */}
      {tithi ? (
        <DetailPanel selected={selected!} tithi={tithi} />
      ) : (
        <div className="text-center text-muted-foreground py-4 text-sm">कोई तिथि चुनें।</div>
      )}
    </div>
  );
}

// ── Week View ──────────────────────────────────────────────────────────────────

function WeekView({ rows, windowStart, today, selectedDate, onSelectDate }: {
  rows: PanchangCalendarRow[];
  windowStart: string;
  today: string;
  selectedDate: string;
  onSelectDate: (d: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {Array.from({ length: 7 }).map((_, i) => {
        const d     = addDays(windowStart, i);
        const row   = rows.find(r => r.gregorian_date === d);
        const t     = row?.tithis as Record<string, string> | undefined;
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
            <span className={`text-[9px] leading-tight text-center font-medium line-clamp-2 ${isSel ? "text-white/90" : "text-foreground/80"}`}>
              {t?.name_sanskrit || t?.name_common || (row ? "—" : "N/A")}
            </span>
            {row?.special_flag && (
              <span className={`text-[8px] px-1 rounded-full ${SPECIAL_COLORS[row.special_flag] ?? SPECIAL_COLORS.default}`}>
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
  );
}

// ── Month View ─────────────────────────────────────────────────────────────────

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function MonthView({ rows, currentMonth, today, selectedDate, onSelectDate }: {
  rows: PanchangCalendarRow[];
  currentMonth: { year: number; month: number };
  today: string;
  selectedDate: string;
  onSelectDate: (d: string) => void;
}) {
  const { year, month } = currentMonth;
  const totalDays  = daysInMonth(year, month);
  const startDay   = firstDayOfWeek(year, month);
  const totalCells = Math.ceil((startDay + totalDays) / 7) * 7;

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {WEEK_DAYS.map(d => (
          <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: totalCells }).map((_, idx) => {
          const dayNum = idx - startDay + 1;
          if (dayNum < 1 || dayNum > totalDays) {
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
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Detail Panel ───────────────────────────────────────────────────────────────

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
        {tithi.plant_action       && <EcoCard icon={<Leaf        className="w-4 h-4 text-green-600" />} label="वृक्षारोपण"       text={tithi.plant_action} />}
        {tithi.water_action       && <EcoCard icon={<Droplets    className="w-4 h-4 text-blue-500"  />} label="जल सेवा"          text={tithi.water_action} />}
        {tithi.community_action   && <EcoCard icon={<Users       className="w-4 h-4 text-purple-500"/>} label="सामुदायिक कार्य"  text={tithi.community_action} />}
        {tithi.nature_observation && <EcoCard icon={<Eye        className="w-4 h-4 text-teal-500"  />} label="प्रकृति अवलोकन"  text={tithi.nature_observation} />}
        {tithi.avoid_action       && <EcoCard icon={<AlertCircle className="w-4 h-4 text-red-400"   />} label="आज परहेज़ करें"   text={tithi.avoid_action} />}
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
