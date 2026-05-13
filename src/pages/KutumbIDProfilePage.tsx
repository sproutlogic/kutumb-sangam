/**
 * KutumbID Profile Page — full Vyakti + Kul profile editor.
 * Route: /profile/:nodeId
 *
 * Owner can edit. Others see fields only where field_privacy[field] = "public".
 *
 * is_self  = this node represents the logged-in user themselves
 * is_alive = whether the person is living (only relevant when !is_self)
 * punyatithi is shown only when !is_self && !is_alive
 */
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Shield, MapPin, BookOpen, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useTree } from "@/contexts/TreeContext";
import { requestPanditVerification } from "@/services/api";
import { CityAutocomplete } from "@/components/ui/CityAutocomplete";
import {
  getPersonProfile,
  updatePersonProfile,
  type PersonV2,
  type ProfilePatch,
} from "@/services/treeV2Api";

// ── Privacy types ─────────────────────────────────────────────────────────────

type PrivacyMap = Record<string, string>;

// ── Privacy badge (🔒 / 🌐) shown inline next to field labels ────────────────

function PrivacyBit({
  field,
  privacy,
  onToggle,
}: {
  field: string;
  privacy: PrivacyMap;
  onToggle?: (f: string) => void;
}) {
  const isPublic = privacy[field] === "public";
  return (
    <button
      type="button"
      onClick={() => onToggle?.(field)}
      title={isPublic ? "Public — visible to everyone" : "Private — only you can see this"}
      className={`ml-1.5 text-[11px] transition-opacity leading-none ${
        onToggle ? "cursor-pointer hover:opacity-70" : "cursor-default"
      } ${isPublic ? "text-emerald-500" : "text-gray-300"}`}
    >
      {isPublic ? "🌐" : "🔒"}
    </button>
  );
}

// ── Styled input ──────────────────────────────────────────────────────────────

const inputCls =
  "w-full bg-transparent border-b border-gray-200 py-1.5 outline-none focus:border-orange-500 transition-colors text-sm font-medium text-gray-800 placeholder:text-gray-300 disabled:opacity-50";

function Field({
  label,
  value,
  onChange,
  readOnly = false,
  placeholder,
  privacyField,
  privacy,
  onTogglePrivacy,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  privacyField?: string;
  privacy?: PrivacyMap;
  onTogglePrivacy?: (f: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center">
        {label}
        {privacyField && privacy !== undefined && (
          <PrivacyBit field={privacyField} privacy={privacy} onToggle={onTogglePrivacy} />
        )}
      </label>
      <input
        type="text"
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  readOnly = false,
  privacyField,
  privacy,
  onTogglePrivacy,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  privacyField?: string;
  privacy?: PrivacyMap;
  onTogglePrivacy?: (f: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center">
        {label}
        {privacyField && privacy !== undefined && (
          <PrivacyBit field={privacyField} privacy={privacy} onToggle={onTogglePrivacy} />
        )}
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

// ── DOB masked input (DDMMYYYY display, YYYY-MM-DD storage) ──────────────────

function DOBField({
  label,
  value,
  onChange,
  readOnly = false,
  privacyField,
  privacy,
  onTogglePrivacy,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  privacyField?: string;
  privacy?: PrivacyMap;
  onTogglePrivacy?: (f: string) => void;
}) {
  function isoToDisplay(iso: string): string {
    if (!iso) return "";
    const p = iso.split("-");
    return p.length === 3 && p[0].length === 4 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
  }

  const [raw, setRaw] = useState(() => isoToDisplay(value));
  useEffect(() => { setRaw(isoToDisplay(value)); }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (readOnly) return;
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    let disp = digits;
    if (digits.length > 4) disp = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) disp = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setRaw(disp);
    if (digits.length === 8) onChange?.(`${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`);
    else onChange?.("");
  }

  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center">
        {label}
        {privacyField && privacy !== undefined && (
          <PrivacyBit field={privacyField} privacy={privacy} onToggle={onTogglePrivacy} />
        )}
      </label>
      <input
        type="text"
        inputMode="numeric"
        value={raw}
        readOnly={readOnly}
        onChange={handleChange}
        placeholder="DD/MM/YYYY"
        maxLength={10}
        className={inputCls}
      />
    </div>
  );
}

// ── City autocomplete field ───────────────────────────────────────────────────

function CityField({
  label,
  value,
  onChange,
  readOnly = false,
  privacyField,
  privacy,
  onTogglePrivacy,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  privacyField?: string;
  privacy?: PrivacyMap;
  onTogglePrivacy?: (f: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center">
        {label}
        {privacyField && privacy !== undefined && (
          <PrivacyBit field={privacyField} privacy={privacy} onToggle={onTogglePrivacy} />
        )}
      </label>
      {readOnly ? (
        <div className={`${inputCls} ${!value ? "text-gray-300" : ""}`}>{value || "—"}</div>
      ) : (
        <CityAutocomplete value={value} onChange={(v) => onChange?.(v)} placeholder="Start typing a city…" className={inputCls} />
      )}
    </div>
  );
}

// ── Section title ─────────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, title, subtitle, accent }: {
  icon: React.ElementType; title: string; subtitle: string; accent: string;
}) {
  return (
    <div className={`p-4 border-b border-gray-100 flex items-center gap-3 ${accent}`}>
      <div className="p-2 rounded-lg bg-white shadow-sm"><Icon size={18} /></div>
      <div>
        <h3 className="font-bold text-gray-900 leading-none mb-1">{title}</h3>
        <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-widest">{subtitle}</p>
      </div>
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ label, checked, onChange, labelOn, labelOff }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
  labelOn?: string; labelOff?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="flex items-center gap-2">
        {labelOff && <span className={`text-xs font-medium ${!checked ? "text-orange-600" : "text-gray-400"}`}>{labelOff}</span>}
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-orange-500" : "bg-gray-300"}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
        </button>
        {labelOn && <span className={`text-xs font-medium ${checked ? "text-orange-600" : "text-gray-400"}`}>{labelOn}</span>}
      </div>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TITLE_OPTIONS = ["", "Shri", "Smt.", "Km.", "Dr.", "Prof.", "Adv.", "Mr.", "Mrs.", "Ms.", "Er.", "CA"];
const MARITAL_OPTIONS = ["", "Single", "Married", "Widowed", "Divorced"];

// ── Main page ─────────────────────────────────────────────────────────────────

const KutumbIDProfilePage: React.FC = () => {
  const { nodeId } = useParams<{ nodeId: string }>();
  const navigate = useNavigate();
  const { appUser } = useAuth();

  const { state, requestVerification } = useTree();

  const [tab, setTab] = useState<"vyakti" | "kul">("vyakti");
  const [person, setPerson] = useState<PersonV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [isSelf, setIsSelf] = useState(false);
  const [isAlive, setIsAlive] = useState(true);
  const [privacy, setPrivacy] = useState<PrivacyMap>({});
  const [form, setForm] = useState<ProfilePatch>({});

  const uid = appUser?.id;

  useEffect(() => {
    if (!nodeId) return;
    setLoading(true);
    getPersonProfile(nodeId)
      .then((p) => {
        setPerson(p);
        setIsSelf(!!uid && p.owner_id === uid);
        setIsAlive(!p.punyatithi);
        setPrivacy((p.field_privacy as PrivacyMap) ?? {});
        setForm({
          relation: p.relation ?? "",
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
          current_residence: (p.current_residence as string) ?? "",
          nanighar: p.nanighar ?? "",
          ancestral_place: (p.ancestral_place as string) ?? "",
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
    person.owner_id ? person.owner_id === uid : (person.creator_id || "") === uid
  );

  function set(field: keyof ProfilePatch) {
    return (v: string) => setForm((f) => ({ ...f, [field]: v }));
  }

  function togglePrivacy(field: string) {
    if (!isOwner) return;
    setPrivacy((p) => ({ ...p, [field]: p[field] === "public" ? "private" : "public" }));
  }

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
      const patch: ProfilePatch = { ...form, field_privacy: privacy };
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

  const inviteCode = isSelf ? (appUser?.kutumb_id ?? person?.kutumb_id) : person?.kutumb_id;

  function copyInviteCode() {
    if (!inviteCode) return;
    void navigator.clipboard.writeText(String(inviteCode));
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  async function handleRequestVerification() {
    if (!nodeId || !person) return;
    const alreadyPending = state.pendingActions.some(
      a => a.nodeId === nodeId && a.type === "verify-request" && a.status === "pending"
    );
    if (alreadyPending) return;
    setVerifying(true);
    try {
      await requestPanditVerification({
        vansha_id: person.vansha_id,
        node_id: nodeId,
        requested_by: appUser?.id ?? undefined,
      });
      requestVerification(nodeId);
    } catch {
      /* non-fatal — tree context already shows toasts */
    } finally {
      setVerifying(false);
    }
  }

  const isVerified = !!(person as Record<string, unknown> | null)?.pandit_verified;
  const verifiedPanditId = (person as Record<string, unknown> | null)?.verified_by_pandit_id as string | undefined;
  const verifyPending = nodeId
    ? state.pendingActions.some(a => a.nodeId === nodeId && a.type === "verify-request" && a.status === "pending")
    : false;

  const f = (field: keyof ProfilePatch) => (form[field] as string) ?? "";
  const pp = { privacy, onTogglePrivacy: isOwner ? togglePrivacy : undefined };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading profile…</div>;
  }
  if (!person) {
    return <div className="min-h-screen flex items-center justify-center text-red-500">{error ?? "Person not found"}</div>;
  }

  const displayName = [f("title"), f("first_name"), f("middle_name"), f("last_name")].filter(Boolean).join(" ") || "(unnamed)";
  const showPunyatithi = !isSelf && !isAlive;
  const showMarriageAnniv = f("marital_status") === "Married";

  return (
    <div className="min-h-screen bg-[#FDFCFB] pb-24">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-800">
            <ArrowLeft size={16} /> Back
          </button>
          <div className="flex-1 text-center min-w-0">
            <span className="text-base font-black text-gray-900 truncate block">{displayName}</span>
            {f("common_name") && <span className="text-xs text-gray-400 italic">&quot;{f("common_name")}&quot;</span>}
          </div>
          {isOwner && (
            <Button size="sm" onClick={() => void handleSave()} disabled={saving} className="bg-black hover:bg-gray-800 text-white shrink-0">
              <Save size={14} className="mr-1" />
              {saved ? "Saved!" : saving ? "Saving…" : "Save"}
            </Button>
          )}
        </div>

        <div className="max-w-4xl mx-auto px-4 flex border-t border-gray-100">
          {(["vyakti", "kul"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-[10px] font-black tracking-[0.2em] border-b-4 transition-all uppercase ${
                tab === t ? "border-orange-600 text-orange-600" : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {t === "vyakti" ? "1. Vyakti Profile" : "2. Kul Profile"}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="max-w-3xl mx-auto px-4 mt-4 text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>
      )}

      <main className="max-w-3xl mx-auto px-4 mt-8 space-y-8">
        {tab === "vyakti" && (
          <>
            {/* Relation label */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <Field
                label="Relation (how others see this node in the tree)"
                value={f("relation")}
                onChange={isOwner ? set("relation") : undefined}
                readOnly={!isOwner}
                placeholder="e.g. Son, Daughter, Uncle…"
              />
            </div>

            {/* KutumbID & Verification card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-amber-50 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white shadow-sm">
                  <Shield size={16} className="text-orange-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 leading-none mb-0.5">KutumbID &amp; Verification</h3>
                  <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-widest">Invitation Code · Pandit Status · Referral</p>
                </div>
              </div>
              <div className="p-5 space-y-4">

                {/* Invitation code */}
                {inviteCode && (
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                      {isSelf ? "Your Invitation Code (permanent)" : "KutumbID"}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold tracking-widest text-gray-800 flex-1 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        {isSelf ? String(inviteCode) : `****${String(inviteCode).slice(-4)}`}
                      </span>
                      {isSelf && (
                        <button
                          onClick={copyInviteCode}
                          className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                          title="Copy invite code"
                        >
                          {codeCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        </button>
                      )}
                    </div>
                    {isSelf && (
                      <p className="text-[10px] text-gray-400 mt-1">Share this code to invite family members — it never changes.</p>
                    )}
                  </div>
                )}

                {/* Pandit verification */}
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Pandit Verification</div>
                  {isVerified ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                            <circle cx="6" cy="6" r="6" fill="#16a34a"/>
                            <path d="M3 6l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Verified by Pandit Ji
                        </span>
                      </div>
                      {verifiedPanditId && (
                        <div className="text-[10px] text-gray-500">
                          Pandit ID: <span className="font-mono font-semibold text-gray-700">{verifiedPanditId}</span>
                        </div>
                      )}
                    </div>
                  ) : verifyPending ? (
                    <p className="text-xs text-amber-600 font-medium">⏳ Verification request pending — awaiting Pandit Ji</p>
                  ) : isOwner ? (
                    <button
                      onClick={() => void handleRequestVerification()}
                      disabled={verifying}
                      className="text-xs px-3 py-1.5 rounded-lg border border-amber-400 text-amber-700 hover:bg-amber-50 font-semibold transition-colors disabled:opacity-50"
                    >
                      {verifying ? "Sending request…" : "🔱 Request Pandit Ji Verification"}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">Not yet verified</span>
                  )}
                </div>

                {/* Referral network — own profile only */}
                {isSelf && inviteCode && (
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Referral Network</div>
                    <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 space-y-1">
                      <p>Share your code <span className="font-mono font-bold text-gray-700">{String(inviteCode)}</span> to invite family members.</p>
                      <p className="text-[10px] text-gray-400">Members who join using your code will appear here once the feature is live.</p>
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Person-state toggles */}
            {isOwner && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                <Toggle label="This profile is me" checked={isSelf} onChange={setIsSelf} labelOff="Someone else" labelOn="Myself" />
                {!isSelf && (
                  <Toggle label="Status" checked={isAlive} onChange={(v) => { setIsAlive(v); if (v) set("punyatithi")(""); }}
                    labelOff="Swargwas" labelOn="Living" />
                )}
              </div>
            )}

            {/* Name */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
              <SectionTitle icon={Shield} title="Name" subtitle="As it appears in official records" accent="bg-orange-50/50 text-orange-600" />
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Title</label>
                    <select value={f("title")} disabled={!isOwner} onChange={(e) => set("title")(e.target.value)}
                      className="w-full bg-transparent border-b border-gray-200 py-1.5 outline-none focus:border-orange-500 transition-colors text-sm font-medium text-gray-800 disabled:opacity-50">
                      {TITLE_OPTIONS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
                    </select>
                  </div>
                  <Field label="First name" value={f("first_name")} onChange={isOwner ? set("first_name") : undefined} readOnly={!isOwner} placeholder="Ramesh" />
                  <Field label="Middle name" value={f("middle_name")} onChange={isOwner ? set("middle_name") : undefined} readOnly={!isOwner} placeholder="Prasad" />
                  <Field label="Last / Surname" value={f("last_name")} onChange={isOwner ? set("last_name") : undefined} readOnly={!isOwner} placeholder="Sharma" />
                </div>
                <Field label="Common / Household name" value={f("common_name")} onChange={isOwner ? set("common_name") : undefined} readOnly={!isOwner} placeholder="e.g. Chhotu, Bablu…" />
              </div>
            </div>

            {/* Individual details */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
              <SectionTitle icon={Shield} title="Individual Details" subtitle="Personal & Generational Identifiers" accent="bg-orange-50/50 text-orange-600" />
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <DOBField label="Date of Birth (Janm Tithi)" value={f("date_of_birth")} onChange={isOwner ? set("date_of_birth") : undefined} readOnly={!isOwner}
                  privacyField="date_of_birth" {...pp} />

                {showPunyatithi && (
                  <DOBField label="Punyatithi (Swargwas Date)" value={f("punyatithi")} onChange={isOwner ? set("punyatithi") : undefined} readOnly={!isOwner}
                    privacyField="punyatithi" {...pp} />
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center">
                    Marital Status
                    <PrivacyBit field="marital_status" privacy={privacy} onToggle={isOwner ? togglePrivacy : undefined} />
                  </label>
                  <select value={f("marital_status")} disabled={!isOwner} onChange={(e) => set("marital_status")(e.target.value)}
                    className="w-full bg-transparent border-b border-gray-200 py-1.5 outline-none focus:border-orange-500 transition-colors text-sm font-medium text-gray-800 disabled:opacity-50">
                    {MARITAL_OPTIONS.map((o) => <option key={o} value={o}>{o || "Choose…"}</option>)}
                  </select>
                </div>

                {showMarriageAnniv && (
                  <DOBField label="Marriage Anniversary" value={f("marriage_anniversary")} onChange={isOwner ? set("marriage_anniversary") : undefined} readOnly={!isOwner}
                    privacyField="marriage_anniversary" {...pp} />
                )}

                <Field label="Education" value={f("education")} onChange={isOwner ? set("education") : undefined} readOnly={!isOwner} placeholder="e.g. B.Tech, MA…"
                  privacyField="education" {...pp} />
                <Field label="Nanighar (Maternal home)" value={f("nanighar")} onChange={isOwner ? set("nanighar") : undefined} readOnly={!isOwner} placeholder="Village or family name"
                  privacyField="nanighar" {...pp} />
              </div>
            </div>

            {/* Janmasthan */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
              <SectionTitle icon={MapPin} title="Janmasthan" subtitle="Birthplace" accent="bg-amber-50/50 text-amber-700" />
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label="Village / Locality" value={f("janmasthan_village")} onChange={isOwner ? set("janmasthan_village") : undefined} readOnly={!isOwner} placeholder="Gram / Mohalla"
                  privacyField="janmasthan_village" {...pp} />
                <CityField label="City / District" value={f("janmasthan_city")} onChange={isOwner ? setJanmasthanCity : undefined} readOnly={!isOwner}
                  privacyField="janmasthan_city" {...pp} />
              </div>
            </div>

            {/* Mool Niwas */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
              <SectionTitle icon={MapPin} title="Mool Niwas" subtitle="Ancestral / native domicile" accent="bg-blue-50/50 text-blue-700" />
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label="Village / Locality" value={f("mool_niwas_village")} onChange={isOwner ? set("mool_niwas_village") : undefined} readOnly={!isOwner} placeholder="Gram / Mohalla"
                  privacyField="mool_niwas_village" {...pp} />
                <CityField label="City / District" value={f("mool_niwas_city")} onChange={isOwner ? set("mool_niwas_city") : undefined} readOnly={!isOwner}
                  privacyField="mool_niwas_city" {...pp} />
                <Field label="Current Residence" value={f("current_residence")} onChange={isOwner ? set("current_residence") : undefined} readOnly={!isOwner} placeholder="Where you live now"
                  privacyField="current_residence" {...pp} />
              </div>
            </div>

            {!isOwner && (
              <div className="p-4 bg-gray-50 rounded-xl text-sm text-gray-500 text-center">
                Only the node owner can edit this profile.
              </div>
            )}

            {isOwner && (
              <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-400 flex items-center gap-2">
                <span>🔒 Private</span><span className="text-gray-300">|</span>
                <span className="text-emerald-500">🌐 Public</span>
                <span className="text-gray-300">— tap the badge next to any field to toggle visibility</span>
              </div>
            )}
          </>
        )}

        {tab === "kul" && (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
              <SectionTitle icon={Shield} title="Level 1 — Spiritual Core" subtitle="Vedic Identity & Lineage Pillars" accent="bg-orange-50/50 text-orange-600" />
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                <Field label="Vansh" value={f("vansh_label")} onChange={isOwner ? set("vansh_label") : undefined} readOnly={!isOwner} privacyField="vansh_label" {...pp} />
                <Field label="Gotra" value={f("gotra")} onChange={isOwner ? set("gotra") : undefined} readOnly={!isOwner} privacyField="gotra" {...pp} />
                <Field label="Pravara" value={f("pravara")} onChange={isOwner ? set("pravara") : undefined} readOnly={!isOwner} privacyField="pravara" {...pp} />
                <Field label="Ved & Shakha" value={f("ved_shakha")} onChange={isOwner ? set("ved_shakha") : undefined} readOnly={!isOwner} privacyField="ved_shakha" {...pp} />
                <Field label="Ritual Sutra" value={f("ritual_sutra")} onChange={isOwner ? set("ritual_sutra") : undefined} readOnly={!isOwner} privacyField="ritual_sutra" {...pp} />
                <Field label="Kul Devi / Devta" value={f("kul_devi")} onChange={isOwner ? set("kul_devi") : undefined} readOnly={!isOwner} privacyField="kul_devi" {...pp} />
                <Field label="Devi Mukhya Sthan" value={f("kul_devi_sthan")} onChange={isOwner ? set("kul_devi_sthan") : undefined} readOnly={!isOwner} privacyField="kul_devi_sthan" {...pp} />
                <Field label="Ishta Devta" value={f("ishta_devta")} onChange={isOwner ? set("ishta_devta") : undefined} readOnly={!isOwner} privacyField="ishta_devta" {...pp} />
                <Field label="Tirth Purohit" value={f("tirth_purohit")} onChange={isOwner ? set("tirth_purohit") : undefined} readOnly={!isOwner} privacyField="tirth_purohit" {...pp} />
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
              <SectionTitle icon={MapPin} title="Level 2 — Geographic Roots" subtitle="Ancestral Soils & Migration" accent="bg-blue-50/50 text-blue-600" />
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <Textarea label="Migration History (Pravas)" value={f("pravas_history")} onChange={isOwner ? set("pravas_history") : undefined} readOnly={!isOwner} privacyField="pravas_history" {...pp} />
                <div className="space-y-6">
                  <Field label="Paitrik Niwas (Ancestral Home)" value={f("paitrik_niwas")} onChange={isOwner ? set("paitrik_niwas") : undefined} readOnly={!isOwner} privacyField="paitrik_niwas" {...pp} />
                  <Field label="Gram Devta" value={f("gram_devta")} onChange={isOwner ? set("gram_devta") : undefined} readOnly={!isOwner} privacyField="gram_devta" {...pp} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
              <SectionTitle icon={BookOpen} title="Levels 3 & 4 — Living Heritage" subtitle="Vamshavali & Kul Traditions" accent="bg-purple-50/50 text-purple-600" />
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Field label="Current Pidhi (Generation)" value={f("pidhi_label")} onChange={isOwner ? set("pidhi_label") : undefined} readOnly={!isOwner} privacyField="pidhi_label" {...pp} />
                  <Field label="Vivah Sambandh" value={f("vivah_sambandh")} onChange={isOwner ? set("vivah_sambandh") : undefined} readOnly={!isOwner} privacyField="vivah_sambandh" {...pp} />
                </div>
                <Textarea label="Kul-Achara (Family Traditions)" value={f("kul_achara")} onChange={isOwner ? set("kul_achara") : undefined} readOnly={!isOwner} privacyField="kul_achara" {...pp} />
                <Textarea label="Family Vows (Manat / Prohibitions)" value={f("manat")} onChange={isOwner ? set("manat") : undefined} readOnly={!isOwner} privacyField="manat" {...pp} />
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
