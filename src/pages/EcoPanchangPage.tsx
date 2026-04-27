/**
 * /eco-panchang — Full Eco-Panchang Calendar page.
 *
 * Shows a 7-day rolling calendar of tithis with eco-recommendations.
 * Today's tithi is highlighted. Users can step forward/back by week.
 * Public — no auth required.
 */

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Leaf, Droplets, Users, Eye, AlertCircle, TreePine, Loader2 } from "lucide-react";
import AppShell from "@/components/shells/AppShell";
import { fetchPanchangCalendar, fetchTodayPanchang, type PanchangCalendarRow, type TodayPanchang } from "@/services/api";

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

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

export default function EcoPanchangPage() {
  const today = todayStr();
  const [windowStart, setWindowStart] = useState(today);
  const [rows, setRows] = useState<PanchangCalendarRow[]>([]);
  const [todayData, setTodayData] = useState<TodayPanchang | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(today);

  const windowEnd = addDays(windowStart, 6);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchPanchangCalendar(windowStart, windowEnd),
      windowStart === today ? fetchTodayPanchang() : Promise.resolve(null),
    ]).then(([cal, td]) => {
      setRows(cal);
      if (td) setTodayData(td);
    }).finally(() => setLoading(false));
  }, [windowStart]);

  const selected = rows.find(r => r.gregorian_date === selectedDate);
  const tithi    = selected?.tithis;
  const todayRec = selectedDate === today ? todayData?.eco_recommendation : null;

  return (
    <AppShell>
      {/* Hero */}
      <div className="relative gradient-hero text-primary-foreground py-8 overflow-hidden">
        <div className="container">
          <div className="flex items-center gap-2 mb-1">
            <TreePine className="w-6 h-6" />
            <h1 className="font-heading text-2xl font-bold">Eco-Panchang Calendar</h1>
          </div>
          <p className="text-sm opacity-70">
            हर तिथि पर प्रकृति और परिवार के लिए शुभ कार्य जानें
          </p>
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
                const d   = addDays(windowStart, i);
                const row = rows.find(r => r.gregorian_date === d);
                const isToday  = d === today;
                const isSel    = d === selectedDate;
                const t        = row?.tithis;
                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDate(d)}
                    className={[
                      "rounded-xl border p-2 text-center transition-all flex flex-col items-center gap-1",
                      isSel
                        ? "border-green-500 bg-green-50 dark:bg-green-950/50 shadow-md"
                        : isToday
                        ? "border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30"
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
                      {t?.name_hindi || (row ? "—" : "N/A")}
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
            {selected && tithi ? (
              <div className="border border-green-200 dark:border-green-800 rounded-xl p-5 space-y-4 bg-green-50/40 dark:bg-green-950/20">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="font-heading text-xl font-bold text-green-900 dark:text-green-200">
                      {tithi.name_hindi}
                    </h2>
                    <span className="text-sm text-muted-foreground">— {tithi.name_common}</span>
                    {selected.special_flag && (
                      <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full font-semibold">
                        {SPECIAL_LABELS[selected.special_flag]}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selected.paksha === "shukla" ? "शुक्ल पक्ष" : "कृष्ण पक्ष"}
                    {selected.nakshatra && ` · नक्षत्र: ${selected.nakshatra}`}
                    {selected.yoga && ` · योग: ${selected.yoga}`}
                    {selected.masa_name && ` · मास: ${selected.masa_name}`}
                  </p>
                </div>

                {tithi.eco_significance && (
                  <p className="text-sm text-green-800 dark:text-green-300 italic border-l-4 border-green-400 pl-3">
                    {tithi.eco_significance}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {(tithi.plant_action || todayRec?.plant) && (
                    <EcoCard icon={<Leaf className="w-4 h-4 text-green-600" />} label="वृक्षारोपण" text={todayRec?.plant || tithi.plant_action!} />
                  )}
                  {(tithi.water_action || todayRec?.water) && (
                    <EcoCard icon={<Droplets className="w-4 h-4 text-blue-500" />} label="जल सेवा" text={todayRec?.water || tithi.water_action!} />
                  )}
                  {tithi.community_action && (
                    <EcoCard icon={<Users className="w-4 h-4 text-purple-500" />} label="सामुदायिक कार्य" text={tithi.community_action} />
                  )}
                  {(tithi.nature_observation || todayRec?.observe) && (
                    <EcoCard icon={<Eye className="w-4 h-4 text-teal-500" />} label="प्रकृति अवलोकन" text={todayRec?.observe || tithi.nature_observation!} />
                  )}
                  {(tithi.avoid_action || todayRec?.avoid) && (
                    <EcoCard icon={<AlertCircle className="w-4 h-4 text-red-400" />} label="आज परहेज़ करें" text={todayRec?.avoid || tithi.avoid_action!} />
                  )}
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
            ) : selected && !tithi ? (
              <div className="text-center text-muted-foreground py-8 text-sm">
                इस तिथि का डेटा उपलब्ध नहीं है।
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
