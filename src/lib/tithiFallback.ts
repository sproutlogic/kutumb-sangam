/**
 * Offline-friendly tithi labels + eco copy when the API or Supabase `tithis` row
 * is unavailable (wrong API URL, RLS, empty DB, etc.).
 */

export type Paksha = "shukla" | "krishna";

const FORTNIGHT_DAY_NAMES: { sk: string; en: string }[] = [
  { sk: "प्रतिपदा", en: "Pratipada" },
  { sk: "द्वितीया", en: "Dvitiya" },
  { sk: "तृतीया", en: "Tritiya" },
  { sk: "चतुर्थी", en: "Chaturthi" },
  { sk: "पंचमी", en: "Panchami" },
  { sk: "षष्ठी", en: "Shashthi" },
  { sk: "सप्तमी", en: "Saptami" },
  { sk: "अष्टमी", en: "Ashtami" },
  { sk: "नवमी", en: "Navami" },
  { sk: "दशमी", en: "Dashami" },
  { sk: "एकादशी", en: "Ekadashi" },
  { sk: "द्वादशी", en: "Dwadashi" },
  { sk: "त्रयोदशी", en: "Trayodashi" },
  { sk: "चतुर्दशी", en: "Chaturdashi" },
];

function baseNameForTithiId(tithiId: number): { sk: string; en: string } {
  if (tithiId === 15) return { sk: "पूर्णिमा", en: "Purnima (full moon)" };
  if (tithiId === 30) return { sk: "अमावस्या", en: "Amavasya (new moon)" };
  const d = tithiId > 15 ? tithiId - 15 : tithiId;
  return FORTNIGHT_DAY_NAMES[Math.max(0, Math.min(13, d - 1))];
}

/** Minimal row shape used by EcoPanchangStrip / EcoPanchangPage. */
export function getSyntheticTithiDef(tithiId: number, paksha: Paksha): Record<string, string> {
  const { sk, en } = baseNameForTithiId(tithiId);
  return {
    id: String(tithiId),
    name_sanskrit: sk,
    name_common: en,
    eco_significance:
      "यह तिथि प्रकृति संरक्षण और परिवारिक कल्याण के कार्यों के लिए उपयुक्त है। जल, वृक्ष और स्वच्छता को दैनिक जीवन में प्राथमिकता दें।",
    plant_action: "मौसम अनुकूल हो तो एक पौधा लगाएँ या मौजूदा वृक्षों की सिंचाई व देखभाल करें।",
    water_action: "जल का सोच-समझकर उपयोग करें; पक्षियों या जीवों के लिए साफ पानी उपलब्ध कराएँ।",
    avoid_action: "एकमुश्त प्लास्टिक और अनावश्यक कूड़ा उत्सर्जन कम करें।",
    nature_observation: "आसपास की हरियाली, वायु या आकाश पर कुछ क्षण ध्यान दें।",
    community_action: "परिवार या समुदाय को हरित आदतों व जल संरक्षण में शामिल करने का साधारण संकल्प लें।",
  };
}

/** Prefer non-empty fields from DB; fill gaps from synthetic defaults. */
export function mergeTithiWithFallback(
  dbRow: Record<string, unknown> | null | undefined,
  tithiId: number,
  paksha: Paksha,
): Record<string, string> {
  const synth = getSyntheticTithiDef(tithiId, paksha);
  if (!dbRow || typeof dbRow !== "object") return synth;
  const out: Record<string, string> = { ...synth };
  for (const [k, v] of Object.entries(dbRow)) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s !== "") out[k] = s;
  }
  return out;
}

export function ecoRecommendationFromTithiRecord(t: Record<string, string>) {
  return {
    primary: t.eco_significance ?? "",
    plant: t.plant_action ?? "",
    water: t.water_action ?? "",
    avoid: t.avoid_action ?? "",
    observe: t.nature_observation ?? "",
    community: t.community_action ?? "",
  };
}
