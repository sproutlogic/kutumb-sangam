/**
 * EcoPanchangStrip — Tithi-based eco calendar strip.
 *
 * Shown above the family events section on KutumbCalendarPage.
 * Displays today's tithi, nakshatra, and eco-recommendation.
 * Visible to ALL plan holders (no entitlement gate on today's tithi).
 * "Book Eco Ceremony" CTA navigates to /services.
 */

import { useEffect, useState } from "react";
import { Leaf, Droplets, TreePine, Eye, Users, AlertCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { fetchTodayPanchang, type TodayPanchang } from "@/services/api";
import { useNavigate } from "react-router-dom";

const PAKSHA_LABEL: Record<string, string> = {
  shukla: "शुक्ल पक्ष",
  krishna: "कृष्ण पक्ष",
};

const FLAG_BADGE: Record<string, { label: string; color: string }> = {
  ekadashi: { label: "एकादशी", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  purnima:  { label: "पूर्णिमा", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  amavasya: { label: "अमावस्या", color: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300" },
  pradosh:  { label: "प्रदोष", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  chaturthi:{ label: "चतुर्थी", color: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  ashtami:  { label: "अष्टमी", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300" },
  navami:   { label: "नवमी", color: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300" },
  sankranti:{ label: "संक्रांति", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
};

export default function EcoPanchangStrip() {
  const [data, setData] = useState<TodayPanchang | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchTodayPanchang()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 rounded-xl p-4 mb-5 flex items-center gap-3 text-sm text-green-700 dark:text-green-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>आज की तिथि लोड हो रही है…</span>
      </div>
    );
  }

  if (!data) return null;

  const tithi  = data.tithi;
  const rec    = data.eco_recommendation;
  const badge  = data.special_flag ? FLAG_BADGE[data.special_flag] : null;
  const tithiName = tithi?.name_hindi || tithi?.name_common || "—";
  const ceremony = tithi?.ceremony_type_hint;

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

          {/* Paksha */}
          <span className="text-xs text-green-700 dark:text-green-400 font-medium">
            · {PAKSHA_LABEL[data.paksha] ?? data.paksha}
          </span>

          {/* Nakshatra */}
          {data.nakshatra && (
            <span className="text-xs text-green-700 dark:text-green-400">
              · नक्षत्र: <strong>{data.nakshatra}</strong>
            </span>
          )}

          {/* Special flag badge */}
          {badge && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.color}`}>
              {badge.label}
            </span>
          )}

          {/* Kshaya / Adhika */}
          {data.is_kshaya && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
              क्षय तिथि
            </span>
          )}
          {data.is_adhika && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
              अधिक तिथि
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Eco ceremony CTA */}
          {ceremony && (
            <button
              onClick={() => navigate("/services")}
              className="text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg px-3 py-1.5 font-medium transition-colors"
            >
              पर्यावरण सेवा बुक करें →
            </button>
          )}
          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 transition-colors"
            aria-label={expanded ? "Hide eco details" : "Show eco details"}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Primary eco significance — always visible */}
      {rec.primary && (
        <div className="px-4 pb-2 text-xs text-green-800 dark:text-green-300 italic">
          "{rec.primary}"
        </div>
      )}

      {/* Expanded eco-recommendation grid */}
      {expanded && (
        <div className="border-t border-green-200 dark:border-green-800 px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {rec.plant && (
            <RecoRow icon={<Leaf className="w-3.5 h-3.5 text-green-600" />} label="वृक्षारोपण" text={rec.plant} />
          )}
          {rec.water && (
            <RecoRow icon={<Droplets className="w-3.5 h-3.5 text-blue-500" />} label="जल सेवा" text={rec.water} />
          )}
          {rec.community && (
            <RecoRow icon={<Users className="w-3.5 h-3.5 text-purple-500" />} label="सामुदायिक कार्य" text={rec.community} />
          )}
          {rec.observe && (
            <RecoRow icon={<Eye className="w-3.5 h-3.5 text-teal-500" />} label="प्रकृति अवलोकन" text={rec.observe} />
          )}
          {rec.avoid && (
            <RecoRow icon={<AlertCircle className="w-3.5 h-3.5 text-red-400" />} label="आज परहेज़ करें" text={rec.avoid} />
          )}

          {/* Log Eco-Sewa CTA */}
          <div className="sm:col-span-2 mt-1 flex gap-2">
            <button
              onClick={() => navigate("/eco-sewa")}
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
