/**
 * KutumbID Profile Page — full Vyakti + Kul profile editor.
 * Route: /profile/:nodeId
 *
 * Only the node owner can save. Others see a read-only view.
 */
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Shield, MapPin, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPersonProfile,
  updatePersonProfile,
  type PersonV2,
  type ProfilePatch,
} from "@/services/treeV2Api";

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function Input({
  label,
  value,
  onChange,
  type = "text",
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
        {label}
      </label>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
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

// ── Main page ─────────────────────────────────────────────────────────────────

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

  // local edit state — mirrors PersonV2 fields
  const [form, setForm] = useState<ProfilePatch>({});

  useEffect(() => {
    if (!nodeId) return;
    setLoading(true);
    getPersonProfile(nodeId)
      .then((p) => {
        setPerson(p);
        setForm({
          first_name: p.first_name ?? "",
          last_name: p.last_name ?? "",
          date_of_birth: (p.date_of_birth as string) ?? "",
          punyatithi: p.punyatithi ?? "",
          ancestral_place: (p.ancestral_place as string) ?? "",
          current_residence: (p.current_residence as string) ?? "",
          marital_status: p.marital_status ?? "",
          education: p.education ?? "",
          mool_niwas_city: p.mool_niwas_city ?? "",
          nanighar: p.nanighar ?? "",
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
  }, [nodeId]);

  const isOwner =
    !person?.owner_id || person.owner_id === appUser?.id;

  function set(field: keyof ProfilePatch) {
    return (v: string) => setForm((f) => ({ ...f, [field]: v }));
  }

  async function handleSave() {
    if (!nodeId || !isOwner) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updatePersonProfile(nodeId, form);
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

  const fullName = [person.first_name, person.last_name].filter(Boolean).join(" ") || "(unnamed)";

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

          <div className="flex-1 text-center">
            <span className="text-base font-black text-gray-900">{fullName}</span>
            {person.kutumb_id && (
              <span className="ml-2 text-xs font-mono text-orange-500">{String(person.kutumb_id)}</span>
            )}
          </div>

          {isOwner && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-black hover:bg-gray-800 text-white"
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
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
              <SectionTitle
                icon={Shield}
                title="Individual Details"
                subtitle="Personal & Generational Identifiers"
                accent="bg-orange-50/50 text-orange-600"
              />
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input label="First Name" value={f("first_name")} onChange={set("first_name")} readOnly={!isOwner} />
                <Input label="Last Name" value={f("last_name")} onChange={set("last_name")} readOnly={!isOwner} />
                <Input label="Date of Birth" value={f("date_of_birth")} onChange={set("date_of_birth")} type="date" readOnly={!isOwner} />
                <Input label="Punyatithi (Memorial Date)" value={f("punyatithi")} onChange={set("punyatithi")} type="date" readOnly={!isOwner} />
                <Input label="Janma Sthan (Birthplace)" value={f("ancestral_place")} onChange={set("ancestral_place")} readOnly={!isOwner} />
                <Input label="Vartaman Niwas (Current Residence)" value={f("current_residence")} onChange={set("current_residence")} readOnly={!isOwner} />
                <Input label="Mool Niwas City" value={f("mool_niwas_city")} onChange={set("mool_niwas_city")} readOnly={!isOwner} />
                <Input label="Nanighar (Maternal Lineage)" value={f("nanighar")} onChange={set("nanighar")} readOnly={!isOwner} />
                <Input label="Education" value={f("education")} onChange={set("education")} readOnly={!isOwner} />

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
                    Marital Status
                  </label>
                  <select
                    value={f("marital_status")}
                    disabled={!isOwner}
                    onChange={(e) => set("marital_status")(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none text-sm font-medium focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                  >
                    <option value="">Choose…</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Widowed">Widowed</option>
                  </select>
                </div>
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
                <Input label="Vansh" value={f("vansh_label")} onChange={set("vansh_label")} readOnly={!isOwner} />
                <Input label="Gotra" value={f("gotra")} onChange={set("gotra")} readOnly={!isOwner} />
                <Input label="Pravara" value={f("pravara")} onChange={set("pravara")} readOnly={!isOwner} />
                <Input label="Ved & Shakha" value={f("ved_shakha")} onChange={set("ved_shakha")} readOnly={!isOwner} />
                <Input label="Ritual Sutra" value={f("ritual_sutra")} onChange={set("ritual_sutra")} readOnly={!isOwner} />
                <Input label="Kul Devi / Devta" value={f("kul_devi")} onChange={set("kul_devi")} readOnly={!isOwner} />
                <Input label="Devi Mukhya Sthan" value={f("kul_devi_sthan")} onChange={set("kul_devi_sthan")} readOnly={!isOwner} />
                <Input label="Ishta Devta" value={f("ishta_devta")} onChange={set("ishta_devta")} readOnly={!isOwner} />
                <Input label="Tirth Purohit" value={f("tirth_purohit")} onChange={set("tirth_purohit")} readOnly={!isOwner} />
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
                  <Input label="Paitrik Niwas (Ancestral Home)" value={f("paitrik_niwas")} onChange={set("paitrik_niwas")} readOnly={!isOwner} />
                  <Input label="Gram Devta" value={f("gram_devta")} onChange={set("gram_devta")} readOnly={!isOwner} />
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
                  <Input label="Current Pidhi (Generation)" value={f("pidhi_label")} onChange={set("pidhi_label")} readOnly={!isOwner} />
                  <Input label="Vivah Sambandh" value={f("vivah_sambandh")} onChange={set("vivah_sambandh")} readOnly={!isOwner} />
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
