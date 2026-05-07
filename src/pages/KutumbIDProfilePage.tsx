/**
 * KutumbID Profile Page — full Vyakti + Kul profile editor.
 * Route: /profile/:nodeId
 *
 * Owner can edit. Others see a read-only view.
 *
 * is_self  = this node represents the logged-in user themselves
 * is_alive = whether the person is living (only relevant when !is_self)
 * punyatithi is shown only when !is_self && !is_alive
 */
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Shield, MapPin, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { CityAutocomplete } from "@/components/ui/CityAutocomplete";
import {
  getPersonProfile,
  updatePersonProfile,
  type PersonV2,
  type ProfilePatch,
} from "@/services/treeV2Api";

// ── Styled input (bottom-border style) ──────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  readOnly = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
        {label}
      </label>
      <input
        type="text"
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent border-b border-gray-200 py-1.5 outline-none focus:border-orange-500 transition-colors text-sm font-medium text-gray-800 placeholder:text-gray-300 disabled:opacity-50"
      />
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
        {label}
      </label>
      <textarea
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        rows={3}
        className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium resize-none outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
      />
    </div>
  );
}

// ── DOB masked input (type DDMMYYYY, display DD/MM/YYYY, store YYYY-MM-DD) ──

function DOBField({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
}) {
  function isoToDisplay(iso: string): string {
    if (!iso) return "";
    const parts = iso.split("-");
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return iso;
  }

  const [raw, setRaw] = useState(() => isoToDisplay(value));

  useEffect(() => {
    setRaw(isoToDisplay(value));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (readOnly) return;
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    let disp = digits;
    if (digits.length > 4) disp = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) disp = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setRaw(disp);
    if (digits.length === 8) {
      onChange?.(`${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`);
    } else {
      onChange?.("");
    }
  }

  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
        {label}
      </label>
      <input
        type="text"
        inputMode="numeric"
        value={raw}
        readOnly={readOnly}
        onChange={handleChange}
        placeholder="DD/MM/YYYY"
        maxLength={10}
        className="w-full bg-transparent border-b border-gray-200 py-1.5 outline-none focus:border-orange-500 transition-colors text-sm font-medium text-gray-800 placeholder:text-gray-300 disabled:opacity-50"
      />
    </div>
  );
}

// ── City autocomplete styled to match page ───────────────────────────────────

function CityField({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
        {label}
      </label>
      {readOnly ? (
        <div className="w-full border-b border-gray-200 py-1.5 text-sm font-medium text-gray-800">
          {value || <span className="text-gray-300">—</span>}
        </div>
      ) : (
        <CityAutocomplete
          value={value}
          onChange={(v) => onChange?.(v)}
          placeholder="Start typing a city…"
          className="w-full bg-transparent border-b border-gray-200 py-1.5 outline-none focus:border-orange-500 transition-colors text-sm font-medium text-gray-800 placeholder:text-gray-300"
        />
      )}
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
  accent,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <div className={`p-4 border-b border-gray-100 flex items-center gap-3 ${accent}`}>
      <div className="p-2 rounded-lg bg-white shadow-sm">
        <Icon size={18} />
      </div>
      <div>
        <h3 className="font-bold text-gray-900 leading-none mb-1">{title}</h3>
        <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-widest">{subtitle}</p>
      </div>
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({
  label,
  checked,
  onChange,
  labelOn,
  labelOff,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  labelOn?: string;
  labelOff?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="flex items-center gap-2">
        {labelOff && (
          <span className={`text-xs font-medium ${!checked ? "text-orange-600" : "text-gray-400"}`}>
            {labelOff}
          </span>
        )}
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            checked ? "bg-orange-500" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              checked ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        {labelOn && (
          <span className={`text-xs font-medium ${checked ? "text-orange-600" : "text-gray-400"}`}>
            {labelOn}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TITLE_OPTIONS = ["", "Shri", "Smt.", "Km.", "Dr.", "Prof.", "Adv.", "Mr.", "Mrs.", "Ms.", "Er.", "CA"];
const MARITAL_OPTIONS = ["", "Single", "Married", "Widowed", "Divorced"];

const KutumbIDProfilePage: React.FC = () => {
  const { nodeId } = useParams<{ nodeId: string }>();
  const navigate = useNavigate();
  const { appUser } = useAuth();

  const [tab, setTab] = useState<"vyakti" | "kul">("vyakti");
  const [person, setPerson] = useState<PersonV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Person-state toggles
  const [isSelf, setIsSelf] = useState(false);
  const [isAlive, setIsAlive] = useState(true);

  // Form state
  const [form, setForm] = useState<ProfilePatch>({});

  const uid = appUser?.id;

  useEffect(() => {
    if (!nodeId) return;
    setLoading(true);
    getPersonProfile(nodeId)
      .then((p) => {
        setPerson(p);
        const self = !!uid && p.owner_id === uid;
        const alive = !p.punyatithi;
        setIsSelf(self);
        setIsAlive(alive);
        setForm({
          title: p.title ?? "",
          first_name: p.first_name ?? "",
          middle_name: p.middle_name ?? "",
          last_name: p.last_name ?? "",
          common_name: p.common_name ?? "",
          date_of_birth: (p.date_of_birth as string) ?? "",
          punyatithi: p.punyatithi ?? "",
          marital_status: p.marital_status ?? "",
          marriage_anniversary: p.marriage_anniversary ?? "",
          education: p.education ?? "",
          janmasthan_village: p.janmasthan_village ?? "",
          janmasthan_city: p.janmasthan_city ?? "",
          mool_niwas_village: p.mool_niwas_village ?? "",
          mool_niwas_city: p.mool_niwas_city ?? "",
          nanighar: p.nanighar ?? "",
          ancestral_place: (p.ancestral_place as string) ?? "",
          current_residence: (p.current_residence as string) ?? "",
          vansh_label: p.vansh_label ?? "",
          gotra: (p.gotra as string) ?? "",
          pravara: p.pravara ?? "",
          ved_shakha: p.ved_shakha ?? "",
          ritual_sutra: p.ritual_sutra ?? "",
          kul_devi: p.kul_devi ?? "",
          kul_devi_sthan: p.kul_devi_sthan ?? "",
          ishta_devta: p.ishta_devta ?? "",
          tirth_purohit: p.tirth_purohit ?? "",
          pravas_history: p.pravas_history ?? "",
          paitrik_niwas: p.paitrik_niwas ?? "",
          gram_devta: p.gram_devta ?? "",
          pidhi_label: p.pidhi_label ?? "",
          vivah_sambandh: p.vivah_sambandh ?? "",
          kul_achara: p.kul_achara ?? "",
          manat: p.manat ?? "",
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [nodeId, uid]);

  const isOwner = !!person && (
    person.owner_id
      ? person.owner_id === uid
      : (person.creator_id || "") === uid
  );

  function set(field: keyof ProfilePatch) {
    return (v: string) => setForm((f) => ({ ...f, [field]: v }));
  }

  // Auto-prefill mool_niwas_city from janmasthan_city when it's still empty
  function setJanmasthanCity(v: string) {
    setForm((f) => ({
      ...f,
      janmasthan_city: v,
      mool_niwas_city: f.mool_niwas_city ? f.mool_niwas_city : v,
    }));
  }

  async function handleSave() {
    if (!nodeId || !isOwner) return;
    setSaving(true);
    setError(null);
    try {
      const patch = { ...form };
      // Clear punyatithi if person is self (living) or explicitly marked alive
      if (isSelf || isAlive) patch.punyatithi = "";
      const updated = await updatePersonProfile(nodeId, patch);
      setPerson(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const f = (field: keyof ProfilePatch) => (form[field] as string) ?? "";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Loading profile…
      </div>
    );
  }

  if (!person) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        {error ?? "Person not found"}
      </div>
    );
  }

  const displayName = [f("title"), f("first_name"), f("middle_name"), f("last_name")]
    .filter(Boolean)
    .join(" ") || "(unnamed)";

  const showPunyatithi = !isSelf && !isAlive;
  const showMarriageAnniv = f("marital_status") === "Married";

  return (
    <div className="min-h-screen bg-[#FDFCFB] pb-24">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft size={16} /> Back
          </button>

          <div className="flex-1 text-center min-w-0 overflow-hidden">
            <span className="text-base font-black text-gray-900 truncate block">{displayName}</span>
            {f("common_name") && (
              <span className="text-xs text-gray-400 italic">&quot;{f("common_name")}&quot;</span>
            )}
          </div>

          {isOwner && (
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving}
              className="bg-black hover:bg-gray-800 text-white shrink-0"
            >
              <Save size={14} className="mr-1" />
              {saved ? "Saved!" : saving ? "Saving…" : "Save"}
            </Button>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="max-w-4xl mx-auto px-4 flex border-t border-gray-100">
          {(["vyakti", "kul"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-[10px] font-black tracking-[0.2em] border-b-4 transition-all uppercase ${
                tab === t
                  ? "border-orange-600 text-orange-600"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {t === "vyakti" ? "1. Vyakti Profile" : "2. Kul Profile"}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="max-w-3xl mx-auto px-4 mt-4 text-sm text-red-600 bg-red-50 rounded-lg p-3">
          {error}
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 mt-8 space-y-8">
        {/* ── Vyakti Tab ── */}
        {tab === "vyakti" && (
          <>
            {/* Person-state toggles (owner only) */}
            {isOwner && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                <Toggle
                  label="This profile is me"
                  checked={isSelf}
                  onChange={setIsSelf}
                  labelOff="Someone else"
                  labelOn="Myself"
                />
                {!isSelf && (
                  <Toggle
                    label="Status"
                    checked={isAlive}
                    onChange={(v) => {
                      setIsAlive(v);
                      if (v) set("punyatithi")(""); // clear death date if marking alive
                    }}
                    labelOff="Swargwas"
                    labelOn="Living"
                  />
                )}
              </div>
            )}

            {/* Name */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
              <SectionTitle
                icon={Shield}
                title="Name"
                subtitle="As it appears in official records"
                accent="bg-orange-50/50 text-orange-600"
              />
              <div className="p-6 space-y-4">
                {/* Title + First + Middle + Last on one row (responsive) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
                      Title
                    </label>
                    <select
                      value={f("title")}
                      disabled={!isOwner}
                      onChange={(e) => set("title")(e.target.value)}
                      className="w-full bg-transparent border-b border-gray-200 py-1.5 outline-none focus:border-orange-500 transition-colors text-sm font-medium text-gray-800 disabled:opacity-50"
                    >
                      {TITLE_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o || "—"}</option>
                      ))}
                    </select>
                  </div>
                  <Field label="First name" value={f("first_name")} onChange={set("first_name")} readOnly={!isOwner} placeholder="Ramesh" />
                  <Field label="Middle name" value={f("middle_name")} onChange={set("middle_name")} readOnly={!isOwner} placeholder="Prasad" />
                  <Field label="Last / Surname" value={f("last_name")} onChange={set("last_name")} readOnly={!isOwner} placeholder="Sharma" />
                </div>
                <Field
                  label="Common / Household name"
                  value={f("common_name")}
                  onChange={set("common_name")}
                  readOnly={!isOwner}
                  placeholder="e.g. Chhotu, Bablu…"
                />
              </div>
            </div>

            {/* Individual details */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
              <SectionTitle
                icon={Shield}
                title="Individual Details"
                subtitle="Personal & Generational Identifiers"
                accent="bg-orange-50/50 text-orange-600"
              />
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <DOBField label="Date of Birth (Janm Tithi)" value={f("date_of_birth")} onChange={set("date_of_birth")} readOnly={!isOwner} />

                {showPunyatithi && (
                  <DOBField label="Punyatithi (Swargwas Date)" value={f("punyatithi")} onChange={set("punyatithi")} readOnly={!isOwner} />
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
                    Marital Status
                  </label>
                  <select
                    value={f("marital_status")}
                    disabled={!isOwner}
                    onChange={(e) => set("marital_status")(e.target.value)}
                    className="w-full bg-transparent border-b border-gray-200 py-1.5 outline-none focus:border-orange-500 transition-colors text-sm font-medium text-gray-800 disabled:opacity-50"
                  >
                    {MARITAL_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o || "Choose…"}</option>
                    ))}
                  </select>
                </div>

                {showMarriageAnniv && (
                  <DOBField label="Marriage Anniversary" value={f("marriage_anniversary")} onChange={set("marriage_anniversary")} readOnly={!isOwner} />
                )}

                <Field label="Education" value={f("education")} onChange={set("education")} readOnly={!isOwner} placeholder="e.g. B.Tech, MA…" />
                <Field label="Nanighar (Maternal home)" value={f("nanighar")} onChange={set("nanighar")} readOnly={!isOwner} placeholder="Village or family name" />
              </div>
            </div>

            {/* Janmasthan */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
              <SectionTitle
                icon={MapPin}
                title="Janmasthan"
                subtitle="Birthplace"
                accent="bg-amber-50/50 text-amber-700"
              />
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label="Village / Locality" value={f("janmasthan_village")} onChange={set("janmasthan_village")} readOnly={!isOwner} placeholder="Gram / Mohalla" />
                <CityField label="City / District" value={f("janmasthan_city")} onChange={isOwner ? setJanmasthanCity : undefined} readOnly={!isOwner} />
              </div>
            </div>

            {/* Mool Niwas */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
              <SectionTitle
                icon={MapPin}
                title="Mool Niwas"
                subtitle="Ancestral / native domicile"
                accent="bg-blue-50/50 text-blue-700"
              />
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label="Village / Locality" value={f("mool_niwas_village")} onChange={set("mool_niwas_village")} readOnly={!isOwner} placeholder="Gram / Mohalla" />
                <CityField label="City / District" value={f("mool_niwas_city")} onChange={set("mool_niwas_city")} readOnly={!isOwner} />
                <Field label="Current Residence (city)" value={f("current_residence")} onChange={set("current_residence")} readOnly={!isOwner} placeholder="Where you live now" />
              </div>
            </div>

            {!isOwner && (
              <div className="p-4 bg-gray-50 rounded-xl text-sm text-gray-500 text-center">
                Only the node owner can edit this profile.
              </div>
            )}
          </>
        )}

        {/* ── Kul Tab ── */}
        {tab === "kul" && (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
              <SectionTitle
                icon={Shield}
                title="Level 1 — Spiritual Core"
                subtitle="Vedic Identity & Lineage Pillars"
                accent="bg-orange-50/50 text-orange-600"
              />
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                <Field label="Vansh" value={f("vansh_label")} onChange={set("vansh_label")} readOnly={!isOwner} />
                <Field label="Gotra" value={f("gotra")} onChange={set("gotra")} readOnly={!isOwner} />
                <Field label="Pravara" value={f("pravara")} onChange={set("pravara")} readOnly={!isOwner} />
                <Field label="Ved & Shakha" value={f("ved_shakha")} onChange={set("ved_shakha")} readOnly={!isOwner} />
                <Field label="Ritual Sutra" value={f("ritual_sutra")} onChange={set("ritual_sutra")} readOnly={!isOwner} />
                <Field label="Kul Devi / Devta" value={f("kul_devi")} onChange={set("kul_devi")} readOnly={!isOwner} />
                <Field label="Devi Mukhya Sthan" value={f("kul_devi_sthan")} onChange={set("kul_devi_sthan")} readOnly={!isOwner} />
                <Field label="Ishta Devta" value={f("ishta_devta")} onChange={set("ishta_devta")} readOnly={!isOwner} />
                <Field label="Tirth Purohit" value={f("tirth_purohit")} onChange={set("tirth_purohit")} readOnly={!isOwner} />
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
              <SectionTitle
                icon={MapPin}
                title="Level 2 — Geographic Roots"
                subtitle="Ancestral Soils & Migration"
                accent="bg-blue-50/50 text-blue-600"
              />
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <Textarea label="Migration History (Pravas)" value={f("pravas_history")} onChange={set("pravas_history")} readOnly={!isOwner} />
                <div className="space-y-6">
                  <Field label="Paitrik Niwas (Ancestral Home)" value={f("paitrik_niwas")} onChange={set("paitrik_niwas")} readOnly={!isOwner} />
                  <Field label="Gram Devta" value={f("gram_devta")} onChange={set("gram_devta")} readOnly={!isOwner} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
              <SectionTitle
                icon={BookOpen}
                title="Levels 3 & 4 — Living Heritage"
                subtitle="Vamshavali & Kul Traditions"
                accent="bg-purple-50/50 text-purple-600"
              />
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Field label="Current Pidhi (Generation)" value={f("pidhi_label")} onChange={set("pidhi_label")} readOnly={!isOwner} />
                  <Field label="Vivah Sambandh" value={f("vivah_sambandh")} onChange={set("vivah_sambandh")} readOnly={!isOwner} />
                </div>
                <Textarea label="Kul-Achara (Family Traditions)" value={f("kul_achara")} onChange={set("kul_achara")} readOnly={!isOwner} />
                <Textarea label="Family Vows (Manat / Prohibitions)" value={f("manat")} onChange={set("manat")} readOnly={!isOwner} />
              </div>
            </div>

            <p className="text-center text-[10px] text-gray-300 font-bold uppercase tracking-[0.3em] pb-6">
              KutumbID Registry
            </p>
          </>
        )}
      </main>
    </div>
  );
};

export default KutumbIDProfilePage;
