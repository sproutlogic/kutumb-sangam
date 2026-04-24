import type { MatrimonyProfile } from "@/engine/types";

export const DEFAULT_MATRIMONY_PROFILE: MatrimonyProfile = {
  optedIn: false,
  stage: 0,
  searchingFor: "myself",
  intent: "exploring",
  management: "self",
  dietary: "",
  religiousPractice: "",
  languageAtHome: "",
  educationLevel: "",
  professionCategory: "",
  livingSituation: "",
  geographicPreference: "",
  horoscopeWillingness: "",
  generationAvoidance: "5",
  ownGotra: "",
  mothersGotra: "",
  dadisGotra: "",
  nanisGotra: "",
  buasGotra: "",
  mausisGotra: "",
  surnamesToAvoid: [],
  familySurname: "",
  kundaliData: {
    dob: "",
    timeOfBirth: "",
    timeKnown: "unknown",
    placeOfBirth: "",
    state: "",
    country: "India",
    birthDetailsSource: "",
  },
};

/** Merge API / partial JSON into a full MatrimonyProfile. */
export function mergeMatrimonyProfile(raw: unknown): MatrimonyProfile {
  const d = DEFAULT_MATRIMONY_PROFILE;
  if (!raw || typeof raw !== "object") return { ...d };
  const r = raw as Record<string, unknown>;
  const kd =
    r.kundaliData && typeof r.kundaliData === "object"
      ? { ...d.kundaliData, ...(r.kundaliData as Record<string, unknown>) }
      : d.kundaliData;
  return {
    ...d,
    ...r,
    searchingFor: (r.searchingFor as MatrimonyProfile["searchingFor"]) ?? d.searchingFor,
    intent: (r.intent as MatrimonyProfile["intent"]) ?? d.intent,
    management: (r.management as MatrimonyProfile["management"]) ?? d.management,
    generationAvoidance:
      (r.generationAvoidance as MatrimonyProfile["generationAvoidance"]) ?? d.generationAvoidance,
    kundaliData: {
      ...kd,
      timeKnown: (kd.timeKnown as MatrimonyProfile["kundaliData"]["timeKnown"]) ?? d.kundaliData.timeKnown,
    },
    surnamesToAvoid: Array.isArray(r.surnamesToAvoid)
      ? (r.surnamesToAvoid as string[])
      : d.surnamesToAvoid,
  } as MatrimonyProfile;
}
