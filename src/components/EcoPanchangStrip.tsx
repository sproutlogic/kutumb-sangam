/**
 * EcoPanchangStrip — Tithi-based eco calendar strip.
 *
 * Primary: fetches today's tithi from GET /api/panchang/today.
 * Fallback: computes tithi client-side (JS ephemeris) + reads tithis table
 *           directly from Supabase — works even if backend is down.
 */

import { useEffect, useState } from "react";
import { Leaf, Droplets, TreePine, Eye, Users, AlertCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { fetchTodayPanchang, type TodayPanchang } from "@/services/api";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import {
  ecoRecommendationFromTithiRecord,
  mergeTithiWithFallback,
  type Paksha,
} from "@/lib/tithiFallback";

// ── Client-side tithi computation (Meeus simplified, accurate to ~0.5°) ──────

function computeTithiIdToday(): number {
  const now   = new Date();
  // Julian Day (UT)
  const JD    = now.getTime() / 86400000 + 2440587.5;
  const T     = (JD - 2451545.0) / 36525; // Julian centuries from J2000

  const deg   = (x: number) => (((x % 360) + 360) % 360);
  const rad   = (x: number) => x * Math.PI / 180;

  // Sun
  const L0    = deg(280.46646  + 36000.76983  * T);
  const M     = deg(357.52911  + 35999.05029  * T);
  const Mr    = rad(M);
  const C     = 1.914602 * Math.sin(Mr) + 0.019993 * Math.sin(2 * Mr) + 0.000289 * Math.sin(3 * Mr);
  const sunLonTrop = deg(L0 + C);

  // Moon
  const Lm    = deg(218.3165   + 481267.8813  * T);
  const Mm    = deg(134.96298  + 477198.867398 * T);
  const D     = deg(297.85036  + 445267.111480 * T);
  const F     = deg(93.27191   + 483202.017538 * T);
  const moonCorr =
    6.289  * Math.sin(rad(Mm)) +
    1.274  * Math.sin(rad(2 * D - Mm)) +
    0.658  * Math.sin(rad(2 * D)) -
    0.214  * Math.sin(rad(2 * Mm)) -
    0.186  * Math.sin(rad(M)) -
    0.114  * Math.sin(rad(2 * F));
  const moonLonTrop = deg(Lm + moonCorr);

  // Lahiri ayanamsha ≈ 23.85° + 0.0137° per year since 2000
  const yearsSince2000 = (JD - 2451545.0) / 365.25;
  const ayanamsha = 23.85 + 0.0137 * yearsSince2000;

  const sunLon  = deg(sunLonTrop  - ayanamsha);
  const moonLon = deg(moonLonTrop - ayanamsha);

  const elongation  = deg(moonLon - sunLon);
  const tithiIndex  = Math.floor(elongation / 12);
  return tithiIndex + 1; // 1–30
}

// ── Supabase direct fetch for tithi definition ─────────────────────────────

async function fetchTithiFromSupabase(tithiId: number): Promise<Record<string, string> | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("tithis")
      .select("*")
      .eq("id", tithiId)
      .single();
    return data as Record<string, string> | null;
  } catch {
    return null;
  }
}

// ── Display constants ──────────────────────────────────────────────────────

const PAKSHA_LABEL: Record<string, string> = {
  shukla: "शुक्ल पक्ष",
  krishna: "कृष्ण पक्ष",
};

const FLAG_BADGE: Record<string, { label: string; color: string }> = {
  ekadashi:  { label: "एकादशी",  color: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  purnima:   { label: "पूर्णिमा", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  amavasya:  { label: "अमावस्या", color: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300" },
  pradosh:   { label: "प्रदोष",   color: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  chaturthi: { label: "चतुर्थी", color: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  ashtami:   { label: "अष्टमी",  color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300" },
  navami:    { label: "नवमी",    color: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300" },
  sankranti: { label: "संक्रांति", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
};

// ── Component ──────────────────────────────────────────────────────────────

export default function EcoPanchangStrip() {
  const [data,     setData]     = useState<TodayPanchang | null>(null);
  const [tithi,    setTithi]    = useState<Record<string, string> | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const tithiIdFallback = computeTithiIdToday();

      // 1. Try backend API first
      const apiData = await fetchTodayPanchang();
      if (apiData && !cancelled) {
        const tid =
          typeof (apiData.tithi as { id?: number } | null)?.id === "number"
            ? (apiData.tithi as { id: number }).id
            : tithiIdFallback;
        const paksha: Paksha =
          apiData.paksha ?? (tid <= 15 ? "shukla" : "krishna");
        const merged = mergeTithiWithFallback(
          apiData.tithi as Record<string, unknown> | null,
          tid,
          paksha,
        );
        const next: TodayPanchang = {
          ...apiData,
          paksha,
          tithi: merged as TodayPanchang["tithi"],
          eco_recommendation: ecoRecommendationFromTithiRecord(merged),
        };
        setData(next);
        setTithi(merged);
        setLoading(false);
        return;
      }

      // 2. Fallback: compute client-side + optional Supabase row + synthetic labels
      const tithiId = tithiIdFallback;
      const tithiRow = await fetchTithiFromSupabase(tithiId);
      if (!cancelled) {
        const paksha: Paksha = tithiId <= 15 ? "shukla" : "krishna";
        const merged = mergeTithiWithFallback(tithiRow, tithiId, paksha);
        setData({
          date: new Date().toISOString().slice(0, 10),
          tithi: merged as TodayPanchang["tithi"],
          paksha,
          nakshatra: null,
          yoga: null,
          masa: null,
          samvat_year: null,
          special_flag: null,
          is_kshaya: false,
          is_adhika: false,
          sunrise_ts: null,
          ref_lat: 23.1809,
          ref_lon: 75.7771,
          eco_recommendation: ecoRecommendationFromTithiRecord(merged),
        } as TodayPanchang);
        setTithi(merged);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 rounded-xl p-4 mb-5 flex items-center gap-3 text-sm text-green-700 dark:text-green-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>आज की तिथि लोड हो रही है…</span>
      </div>
    );
  }

  if (!data || !tithi) {
    return (
      <div className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 rounded-xl p-4 mb-5 text-sm text-green-700 dark:text-green-400">
        🌿 Eco-Panchang — लोड नहीं हो सका। पृष्ठ रीफ़्रेश करें या बाद में पुनः प्रयास करें।
      </div>
    );
  }

  const rec       = data.eco_recommendation;
  const badge     = data.special_flag ? FLAG_BADGE[data.special_flag] : null;
  const tithiName = tithi.name_sanskrit || tithi.name_common || "—";
  const ceremony  = tithi.ceremony_type_hint;

  return (
    <div className="border border-green-200 dark:border-green-800 bg-gradient-to-r from-green-50 via-emerald-50 to-teal-50 dark:from-green-950/40 dark:via-emerald-950/30 dark:to-teal-950/30 rounded-xl mb-5 overflow-hidden shadow-sm">
      {/* Header row */}
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <TreePine className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
          <span className="font-semibold text-green-900 dark:text-green-200 text-sm">
            🌿 आज की तिथि:&nbsp;
            <span className="text-base font-bold">{tithiName}</span>
          </span>

          <span className="text-xs text-green-700 dark:text-green-400 font-medium">
            · {PAKSHA_LABEL[data.paksha] ?? data.paksha}
          </span>

          {data.nakshatra && (
            <span className="text-xs text-green-700 dark:text-green-400">
              · नक्षत्र: <strong>{data.nakshatra}</strong>
            </span>
          )}

          {badge && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.color}`}>
              {badge.label}
            </span>
          )}
          {data.is_kshaya && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">क्षय तिथि</span>
          )}
          {data.is_adhika && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">अधिक तिथि</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {ceremony && (
            <button
              onClick={() => navigate("/services")}
              className="text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg px-3 py-1.5 font-medium transition-colors"
            >
              पर्यावरण सेवा बुक करें →
            </button>
          )}
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {rec.primary && (
        <div className="px-4 pb-2 text-xs text-green-800 dark:text-green-300 italic">
          "{rec.primary}"
        </div>
      )}

      {expanded && (
        <div className="border-t border-green-200 dark:border-green-800 px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {rec.plant     && <RecoRow icon={<Leaf        className="w-3.5 h-3.5 text-green-600" />} label="वृक्षारोपण"      text={rec.plant} />}
          {rec.water     && <RecoRow icon={<Droplets    className="w-3.5 h-3.5 text-blue-500"  />} label="जल सेवा"         text={rec.water} />}
          {rec.community && <RecoRow icon={<Users       className="w-3.5 h-3.5 text-purple-500"/>} label="सामुदायिक कार्य" text={rec.community} />}
          {rec.observe   && <RecoRow icon={<Eye         className="w-3.5 h-3.5 text-teal-500"  />} label="प्रकृति अवलोकन" text={rec.observe} />}
          {rec.avoid     && <RecoRow icon={<AlertCircle className="w-3.5 h-3.5 text-red-400"   />} label="आज परहेज़ करें"  text={rec.avoid} />}

          <div className="sm:col-span-2 mt-1 flex gap-2">
            <button
              onClick={() => navigate("/time-bank")}
              className="text-xs border border-green-500 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg px-3 py-1.5 font-medium transition-colors"
            >
              🌱 Eco-Sewa लॉग करें
            </button>
            <button
              onClick={() => navigate("/eco-panchang")}
              className="text-xs border border-emerald-400 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg px-3 py-1.5 transition-colors"
            >
              पूरा Eco Calendar देखें →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RecoRow({ icon, label, text }: { icon: React.ReactNode; label: string; text: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <span>
        <span className="font-semibold text-green-900 dark:text-green-200">{label}: </span>
        <span className="text-green-800 dark:text-green-300">{text}</span>
      </span>
    </div>
  );
}
