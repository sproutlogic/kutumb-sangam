import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePersonalLabels } from '@/hooks/usePersonalLabels';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import { usePlan } from '@/contexts/PlanContext';
import { useTree } from '@/contexts/TreeContext';
import AppShell from '@/components/shells/AppShell';
import LockedBanner from '@/components/states/LockedBanner';
import NodeSovereigntyBadge from '@/components/ui/NodeSovereigntyBadge';
import ConsentToggle from '@/components/ui/ConsentToggle';
import DisputeForkIndicator from '@/components/ui/DisputeForkIndicator';
import TrustBadge from '@/components/ui/TrustBadge';
import { toast } from '@/hooks/use-toast';
import { createPerson, updatePerson, deletePerson, claimPersonNode, fetchVanshaTree, linkExistingSpouses, resolveVanshaIdForApi, requestNodeVerification, familyEndorseNode } from '@/services/api';
import { Trash2, UserCheck, ShieldCheck } from 'lucide-react';
import { CityAutocomplete } from '@/components/ui/CityAutocomplete';
import { backendPayloadToTreeState } from '@/services/mapVanshaPayload';
import {
  ALL_VRUKSHA_RELATIONS,
  ANCESTRAL_ADD_RELATION_OPTIONS,
  computeVrukshaGeneration,
  isChildRelation,
  isSpouseRelation,
  normalizeRelationToKutumb,
} from '@/constants/vrukshaRelations';
import { RelationDropdown } from '@/components/members/RelationDropdown';
import { migrateLegacyVisibility, privacyLevelsForPlan } from '@/engine/privacy';
import type { NodePrivacyLevel } from '@/engine/types';

/** Three-field DD / MM / YYYY date-of-birth input. Emits YYYY-MM-DD strings. */
function DOBInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const currentYear = new Date().getFullYear();
  const [dd, setDd] = useState('');
  const [mm, setMm] = useState('');
  const [yyyy, setYyyy] = useState('');
  const mmRef = useRef<HTMLInputElement>(null);
  const yyyyRef = useRef<HTMLInputElement>(null);

  // Sync external value → internal fields
  useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-');
      setYyyy(y); setMm(m); setDd(d);
    }
  }, [value]);

  const emit = (d: string, m: string, y: string) => {
    if (d.length === 2 && m.length === 2 && y.length === 4) {
      onChange(`${y}-${m}-${d}`);
    } else {
      onChange('');
    }
  };

  const handleDd = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 2);
    setDd(clean);
    emit(clean, mm, yyyy);
    if (clean.length === 2) mmRef.current?.focus();
  };

  const handleMm = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 2);
    setMm(clean);
    emit(dd, clean, yyyy);
    if (clean.length === 2) yyyyRef.current?.focus();
  };

  const handleYyyy = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 4);
    const num = parseInt(clean, 10);
    const clamped = clean.length === 4 && num > currentYear ? String(currentYear) : clean;
    setYyyy(clamped);
    emit(dd, mm, clamped);
  };

  const seg = `border border-input bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 rounded-lg text-center`;
  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <input
        type="text" inputMode="numeric" placeholder="DD"
        value={dd} onChange={e => handleDd(e.target.value)}
        className={`${seg} w-14 px-2 py-2.5`} maxLength={2}
      />
      <span className="text-muted-foreground">/</span>
      <input
        ref={mmRef} type="text" inputMode="numeric" placeholder="MM"
        value={mm} onChange={e => handleMm(e.target.value)}
        className={`${seg} w-14 px-2 py-2.5`} maxLength={2}
      />
      <span className="text-muted-foreground">/</span>
      <input
        ref={yyyyRef} type="text" inputMode="numeric" placeholder="YYYY"
        value={yyyy} onChange={e => handleYyyy(e.target.value)}
        className={`${seg} w-20 px-2 py-2.5`} maxLength={4}
      />
    </div>
  );
}

function splitLegacyDisplayName(name: string): { given: string; sur: string } {
  const t = name.trim();
  const i = t.indexOf(' ');
  if (i === -1) return { given: t, sur: '' };
  return { given: t.slice(0, i), sur: t.slice(i + 1).trim() };
}

const NodePage = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const { tr } = useLang();
  const { hasEntitlement, planId } = usePlan();
  const { state, addNode, editNode, setNodePrivacy, loadTreeState, linkSpousePair } = useTree();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { appUser } = useAuth();
  const { setLabel } = usePersonalLabels(appUser?.id, appUser?.vansha_id);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [spouseLinkTargetId, setSpouseLinkTargetId] = useState('');
  const [linkingSpouse, setLinkingSpouse] = useState(false);
  const hasCultural = hasEntitlement('culturalFields');

  const existingNode = isEdit ? state.nodes.find(n => n.id === id) : null;

  const allowedPrivacy = new Set<NodePrivacyLevel>(privacyLevelsForPlan(planId));
  const [customPrivacyNodes, setCustomPrivacyNodes] = useState<string[]>([]);

  useEffect(() => {
    if (existingNode?.privacyNodeIds?.length) {
      setCustomPrivacyNodes(existingNode.privacyNodeIds);
    } else {
      setCustomPrivacyNodes([]);
    }
  }, [existingNode?.id, existingNode?.privacyNodeIds]);

  const [form, setForm] = useState({
    title: '',
    givenName: '',
    middleName: '',
    surname: '',
    dateOfBirth: '',
    ancestralPlace: '',
    currentResidence: '',
    relation: '',
    gender: 'male' as 'male' | 'female' | 'other',
    branch: '',
    gotra: '',
    moolNiwas: '',
    parentId: '',
    fatherName: '',
    motherName: '',
    personalLabel: '',
  });

  // currentResidence is optional — deceased members may not have one
  const identityComplete =
    form.givenName.trim() &&
    form.surname.trim() &&
    form.dateOfBirth.trim() &&
    form.ancestralPlace.trim();

  const displayName = [form.givenName, form.middleName, form.surname].filter(Boolean).join(' ').trim();

  const anchorNodeId = (searchParams.get('anchor_node_id') ?? '').trim();
  const effectiveVanshaId = resolveVanshaIdForApi(searchParams.get('vansha_id'));
  const anchorNode =
    !isEdit && anchorNodeId ? state.nodes.find((n) => n.id === anchorNodeId) : null;
  /** Anchor from tree selection (Add Member after tapping a node). */
  const hasKutumbAnchor = !isEdit && Boolean(anchorNodeId) && Boolean(anchorNode);
  const parentAsAnchor =
    !isEdit && !hasKutumbAnchor && form.parentId
      ? state.nodes.find((n) => n.id === form.parentId)
      : null;
  const lineageReferenceNode = anchorNode ?? parentAsAnchor;

  // Pre-fill form for edit mode (same fields as Add Member; relation uses Kutumb dropdown + legacy mapping)
  useEffect(() => {
    if (existingNode) {
      const sp = splitLegacyDisplayName(existingNode.name);
      setForm({
        title: (existingNode as Record<string, unknown>).title as string ?? '',
        givenName: existingNode.givenName ?? sp.given,
        middleName: existingNode.middleName ?? '',
        surname: existingNode.surname ?? sp.sur,
        dateOfBirth: existingNode.dateOfBirth ?? '',
        ancestralPlace: existingNode.ancestralPlace ?? existingNode.moolNiwas ?? '',
        currentResidence: existingNode.currentResidence ?? '',
        relation: normalizeRelationToKutumb(existingNode.relation),
        gender: existingNode.gender,
        branch: existingNode.branch,
        gotra: existingNode.gotra,
        moolNiwas: existingNode.moolNiwas,
        parentId: '',
        fatherName: '',
        motherName: '',
      });
    }
  }, [existingNode]);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  // Auto-set gender when relation is chosen
  useEffect(() => {
    const genderByRelation: Record<string, 'male' | 'female'> = {
      Son: 'male', Brother: 'male', Father: 'male', 'Adopted Son': 'male',
      Daughter: 'female', Sister: 'female', Mother: 'female', 'Adopted Daughter': 'female',
    };
    const inferred = genderByRelation[form.relation];
    if (inferred) set('gender', inferred);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.relation]);

  // Auto-fill ancestralPlace from anchor/tree for non-spouse new members
  useEffect(() => {
    if (isEdit || form.ancestralPlace.trim()) return; // don't overwrite if already set or editing
    if (isSpouseRelation(form.relation)) return; // spouse comes from different family
    const source =
      anchorNode?.ancestralPlace ||
      state.nodes.find(n => n.relation?.toLowerCase() === 'self')?.ancestralPlace ||
      state.nodes[0]?.ancestralPlace ||
      '';
    if (source) set('ancestralPlace', source);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.relation, anchorNode?.id]);

  // Auto-fill gotra + moolNiwas from anchor/tree for non-spouse new members
  useEffect(() => {
    if (isEdit) return;
    if (isSpouseRelation(form.relation)) return; // spouse comes from a different family
    const ref =
      anchorNode ||
      state.nodes.find(n => n.relation?.toLowerCase() === 'self') ||
      state.nodes[0];
    if (!ref) return;
    if (!form.gotra.trim() && ref.gotra) set('gotra', ref.gotra);
    if (!form.moolNiwas.trim() && ref.moolNiwas) set('moolNiwas', ref.moolNiwas);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.relation, anchorNode?.id]);

  const handleLinkSpouse = async () => {
    if (!existingNode || !spouseLinkTargetId) return;
    if (effectiveVanshaId) {
      setLinkingSpouse(true);
      try {
        const result = await linkExistingSpouses({
          vansha_id: effectiveVanshaId,
          anchor_node_id: existingNode.id,
          spouse_node_id: spouseLinkTargetId,
        });
        const data = await fetchVanshaTree(effectiveVanshaId);
        loadTreeState(backendPayloadToTreeState(data));
        toast({
          title: tr('linkSpouseSuccess'),
          description: result.already_linked ? tr('linkSpouseAlreadyLinked') : tr('linkSpouseSuccessDesc'),
        });
        setSpouseLinkTargetId('');
      } catch (e) {
        toast({
          title: tr('errorGeneric'),
          description: e instanceof Error ? e.message : 'Request failed',
          variant: 'destructive',
        });
      } finally {
        setLinkingSpouse(false);
      }
      return;
    }
    const r = linkSpousePair(existingNode.id, spouseLinkTargetId);
    if (!r.ok) {
      toast({
        title: tr('errorGeneric'),
        description: r.message ?? '',
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: tr('linkSpouseSuccess'),
      description: tr('linkSpouseSuccessDesc'),
    });
    setSpouseLinkTargetId('');
  };

  const handleDelete = async () => {
    if (!existingNode || !effectiveVanshaId) return;
    setDeleting(true);
    try {
      await deletePerson(existingNode.id);
      const data = await fetchVanshaTree(effectiveVanshaId);
      loadTreeState(backendPayloadToTreeState(data));
      toast({ title: 'Member removed', description: `${existingNode.name} has been deleted from the tree.` });
      navigate(-1);
    } catch (e) {
      toast({ title: tr('errorGeneric'), description: e instanceof Error ? e.message : 'Delete failed', variant: 'destructive' });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleClaim = async () => {
    if (!existingNode) return;
    setClaiming(true);
    try {
      await claimPersonNode(existingNode.id);
      toast({ title: 'Claim request sent', description: 'The tree creator will review your request. You will be notified once approved.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not submit claim. Please try again.';
      toast({ title: 'Claim failed', description: msg, variant: 'destructive' });
    } finally {
      setClaiming(false);
    }
  };

  const handleFamilyEndorse = async () => {
    if (!existingNode || !effectiveVanshaId) return;
    setVerifying(true);
    try {
      await familyEndorseNode(effectiveVanshaId, existingNode.id);
      toast({ title: 'Node endorsed', description: 'This ancestor node is now family-endorsed.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not submit endorsement.';
      toast({ title: 'Endorsement failed', description: msg, variant: 'destructive' });
    } finally {
      setVerifying(false);
    }
  };

  const handleRequestExpertVerify = async () => {
    if (!existingNode || !effectiveVanshaId) return;
    setVerifying(true);
    try {
      await requestNodeVerification(effectiveVanshaId, existingNode.id);
      toast({ title: 'Verification requested', description: 'A Paryavaran Mitra or Trust will review this node.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not submit verification request.';
      toast({ title: 'Request failed', description: msg, variant: 'destructive' });
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async () => {
    if (isEdit && existingNode) {
      if (!identityComplete) {
        toast({
          title: tr('errorGeneric'),
          description: tr('fillRequiredIdentity'),
          variant: 'destructive',
        });
        return;
      }

      // API-backed update when connected to a remote vansha
      if (effectiveVanshaId) {
        setSaving(true);
        try {
          await updatePerson(existingNode.id, {
            first_name: form.givenName.trim() || undefined,
            middle_name: form.middleName.trim() || null,
            last_name: form.surname.trim() || undefined,
            date_of_birth: form.dateOfBirth.trim() || undefined,
            ancestral_place: form.ancestralPlace.trim() || undefined,
            current_residence: form.currentResidence.trim() || undefined,
            gender: form.gender,
            relation: form.relation || undefined,
            branch: form.branch || undefined,
            gotra: form.gotra || undefined,
            mool_niwas: form.moolNiwas || undefined,
            title: form.title.trim() || undefined,
          });
          const data = await fetchVanshaTree(effectiveVanshaId);
          loadTreeState(backendPayloadToTreeState(data));
          toast({ title: tr('saveMember'), description: tr('changesSaved') });
          navigate(-1);
        } catch (e) {
          toast({ title: tr('errorGeneric'), description: e instanceof Error ? e.message : 'Update failed', variant: 'destructive' });
        } finally {
          setSaving(false);
        }
        return;
      }

      // Local-only edit (no remote vansha) — use decision engine
      const fields = [
        'givenName', 'middleName', 'surname', 'dateOfBirth',
        'ancestralPlace', 'currentResidence', 'relation',
        'gender', 'branch', 'gotra', 'moolNiwas',
      ] as const;
      let anyPending = false;
      fields.forEach((field) => {
        const newVal = String((form as Record<string, string>)[field] ?? '');
        const oldVal = String((existingNode as Record<string, string>)[field] ?? '');
        if (newVal !== oldVal && newVal.trim()) {
          const result = editNode(existingNode.id, field, newVal);
          if (!result.applied) anyPending = true;
        }
      });
      if (displayName !== existingNode.name.trim()) {
        const result = editNode(existingNode.id, 'name', displayName);
        if (!result.applied) anyPending = true;
      }
      toast({
        title: anyPending ? tr('correctionSubmitted') : tr('saveMember'),
        description: anyPending ? tr('correctionSubmittedDesc') : tr('changesSaved'),
      });
      navigate(-1);
      return;
    }

    // Add mode
    if (!identityComplete) {
      toast({
        title: tr('errorGeneric'),
        description: tr('fillRequiredIdentity'),
        variant: 'destructive',
      });
      return;
    }
    if (!form.relation.trim()) {
      toast({
        title: tr('errorGeneric'),
        description: tr('selectRelation'),
        variant: 'destructive',
      });
      return;
    }
    if (!form.personalLabel.trim()) {
      toast({
        title: 'आप इन्हें क्या कहते हैं?',
        description: 'Please enter what you call this person (e.g. पिताजी, बप्पा, Chachu)',
        variant: 'destructive',
      });
      return;
    }

    if (anchorNodeId && !anchorNode) {
      toast({
        title: tr('errorGeneric'),
        description: tr('anchorNotLoaded'),
        variant: 'destructive',
      });
      return;
    }

    const relationLabel = form.relation.trim();
    const first_name = form.givenName.trim();
    const middle_name = form.middleName.trim();
    const last_name = form.surname.trim();

    const canUseRemoteApi = Boolean(effectiveVanshaId);

    if (canUseRemoteApi) {
      if (!hasKutumbAnchor && state.nodes.length > 0 && !form.parentId.trim()) {
        toast({
          title: tr('errorGeneric'),
          description: tr('selectParent'),
          variant: 'destructive',
        });
        return;
      }
      setSaving(true);
      try {
        let relative_gen_index = 0;
        if (lineageReferenceNode) {
          relative_gen_index = computeVrukshaGeneration(lineageReferenceNode.generation, relationLabel);
        }

        await createPerson({
          vansha_id: effectiveVanshaId,
          first_name,
          middle_name: middle_name || undefined,
          last_name,
          date_of_birth: form.dateOfBirth.trim(),
          ancestral_place: form.ancestralPlace.trim(),
          current_residence: form.currentResidence.trim() || undefined,
          gender: form.gender,
          relation: relationLabel,
          relative_gen_index,
          branch: form.branch || 'main',
          gotra: form.gotra,
          mool_niwas: form.moolNiwas.trim() || form.ancestralPlace.trim(),
          title: form.title.trim() || undefined,
          parent_node_id: hasKutumbAnchor ? undefined : form.parentId || undefined,
          anchor_node_id: hasKutumbAnchor ? anchorNodeId : null,
          father_name: isChildRelation(relationLabel) ? form.fatherName.trim() || null : null,
          mother_name: isChildRelation(relationLabel) ? form.motherName.trim() || null : null,
        });
        const data = await fetchVanshaTree(effectiveVanshaId);
        const newState = backendPayloadToTreeState(data);
        loadTreeState(newState);
        // Save personal label for the newly created node
        const newNode = newState.nodes.find(n => n.name?.includes(first_name));
        if (newNode) setLabel(newNode.id, form.personalLabel.trim(), effectiveVanshaId);
        toast({
          title: tr('activityAddedMember'),
          description: displayName,
        });
        navigate(-1);
      } catch (e) {
        toast({
          title: tr('errorGeneric'),
          description: e instanceof Error ? e.message : 'Request failed',
          variant: 'destructive',
        });
      } finally {
        setSaving(false);
      }
      return;
    }

    // Local-only tree (no resolved vansha_id)
    if (hasKutumbAnchor && anchorNode) {
      const gen = computeVrukshaGeneration(anchorNode.generation, relationLabel);
      if (['Father', 'Mother'].includes(relationLabel)) {
        toast({
          title: tr('errorGeneric'),
          description: tr('parentAddRequiresVansha'),
          variant: 'destructive',
        });
        return;
      }
      if (isChildRelation(relationLabel)) {
        addNode(displayName, relationLabel, form.gender, anchorNode.id, {
          branch: form.branch,
          gotra: form.gotra,
          moolNiwas: form.moolNiwas || form.ancestralPlace,
          generation: gen,
          givenName: form.givenName.trim(),
          middleName: form.middleName.trim(),
          surname: form.surname.trim(),
          dateOfBirth: form.dateOfBirth.trim(),
          ancestralPlace: form.ancestralPlace.trim(),
          currentResidence: form.currentResidence.trim(),
        });
      } else if (isSpouseRelation(relationLabel)) {
        addNode(displayName, relationLabel, form.gender, anchorNode.id, {
          branch: form.branch,
          gotra: form.gotra,
          moolNiwas: form.moolNiwas || form.ancestralPlace,
          generation: gen,
          link: 'spouse',
          givenName: form.givenName.trim(),
          middleName: form.middleName.trim(),
          surname: form.surname.trim(),
          dateOfBirth: form.dateOfBirth.trim(),
          ancestralPlace: form.ancestralPlace.trim(),
          currentResidence: form.currentResidence.trim(),
        });
      } else {
        addNode(displayName, relationLabel, form.gender, anchorNode.id, {
          branch: form.branch,
          gotra: form.gotra,
          moolNiwas: form.moolNiwas || form.ancestralPlace,
          generation: gen,
          givenName: form.givenName.trim(),
          middleName: form.middleName.trim(),
          surname: form.surname.trim(),
          dateOfBirth: form.dateOfBirth.trim(),
          ancestralPlace: form.ancestralPlace.trim(),
          currentResidence: form.currentResidence.trim(),
        });
      }
      toast({
        title: tr('activityAddedMember'),
        description: displayName,
      });
      navigate(-1);
      return;
    }

    const parentId = form.parentId || state.currentUserId;
    const parent = state.nodes.find((n) => n.id === parentId);
    const parentGen = parent?.generation ?? 0;
    const relLower = relationLabel.toLowerCase();
    const isParentRel = ['father', 'mother', 'grandfather', 'grandmother'].includes(relLower);
    const isChildRel = ['son', 'daughter', 'adopted son', 'adopted daughter'].includes(relLower);
    let generation: number | undefined;
    if (isParentRel) generation = parentGen - 1;
    else if (isChildRel) generation = parentGen + 1;
    else generation = parentGen;

    addNode(displayName, relationLabel, form.gender, parentId, {
      branch: form.branch,
      gotra: form.gotra,
      moolNiwas: form.moolNiwas || form.ancestralPlace,
      generation,
      givenName: form.givenName.trim(),
      middleName: form.middleName.trim(),
      surname: form.surname.trim(),
      dateOfBirth: form.dateOfBirth.trim(),
      ancestralPlace: form.ancestralPlace.trim(),
      currentResidence: form.currentResidence.trim(),
    });

    toast({
      title: tr('activityAddedMember'),
      description: displayName,
    });
    navigate(-1);
  };

  // Get disputes for this node
  const nodeDisputes = isEdit
    ? state.disputes.filter(d => d.nodeId === id && d.status === 'active')
    : [];

  // Get change log for this node
  const nodeChanges = isEdit
    ? state.changeLog.filter(c => c.nodeId === id).slice(-5).reverse()
    : [];

  const isOwnNode = existingNode?.ownerId === state.currentUserId;
  // Unclaimed = ownerId fell back to node_id (no real user owns it yet)
  const isUnclaimed = existingNode ? existingNode.ownerId === existingNode.id : false;
  const isSelfDeclared = existingNode?.verificationTier === 'self-declared';
  // Creator can delete any unclaimed+unverified node in their tree
  const canDeleteNode = isEdit && !!existingNode && !!effectiveVanshaId && (isOwnNode || (isUnclaimed && isSelfDeclared));

  const inputClass = "w-full px-4 py-2.5 rounded-lg border border-input bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-ring/30";

  return (
    <AppShell>
      <div className="container py-8 max-w-lg">
        <h1 className="font-heading text-2xl font-bold mb-6">{isEdit ? tr('nodeEditTitle') : tr('nodeAddTitle')}</h1>

        {isEdit && isOwnNode && <NodeSovereigntyBadge />}

        <div className="bg-card rounded-xl p-8 shadow-card border border-border/50 space-y-5">
          {/* Title / Honorific */}
          <div>
            <label className="block text-sm font-medium font-body mb-1.5">
              शीर्षक / Title
              <span className="ml-2 text-[10px] text-muted-foreground font-normal">optional</span>
            </label>
            <select
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              className={inputClass}
            >
              <option value="">-- Select Title --</option>
              <optgroup label="General">
                <option value="Shri">Shri (श्री)</option>
                <option value="Smt.">Smt. (श्रीमती)</option>
                <option value="Kumari">Kumari (कुमारी)</option>
                <option value="Mr.">Mr.</option>
                <option value="Mrs.">Mrs.</option>
                <option value="Ms.">Ms.</option>
              </optgroup>
              <optgroup label="Professional">
                <option value="Dr.">Dr.</option>
                <option value="Prof.">Prof.</option>
                <option value="Adv.">Adv. (Advocate)</option>
                <option value="Eng.">Eng. (Engineer)</option>
                <option value="CA">CA (Chartered Accountant)</option>
              </optgroup>
              <optgroup label="Military / Govt">
                <option value="Col.">Col. (Colonel)</option>
                <option value="Maj.">Maj. (Major)</option>
                <option value="Capt.">Capt. (Captain)</option>
                <option value="IAS">IAS</option>
                <option value="IPS">IPS</option>
              </optgroup>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium font-body mb-1.5">{tr('givenName')}</label>
            <input value={form.givenName} onChange={(e) => set('givenName', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium font-body mb-1.5">{tr('middleName')}</label>
            <input value={form.middleName} onChange={(e) => set('middleName', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium font-body mb-1.5">{tr('surname')}</label>
            <input value={form.surname} onChange={(e) => set('surname', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium font-body mb-1.5">{tr('dateOfBirth')}</label>
            <DOBInput value={form.dateOfBirth} onChange={v => set('dateOfBirth', v)} className="w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium font-body mb-1.5">
              {tr('ancestralPlace')}
              {!isEdit && !isSpouseRelation(form.relation) && form.ancestralPlace && (
                <span className="ml-2 text-[10px] text-emerald-600 font-normal">auto-filled · edit to override</span>
              )}
            </label>
            <CityAutocomplete
              value={form.ancestralPlace}
              onChange={v => set('ancestralPlace', v)}
              className={inputClass}
              placeholder="e.g. Varanasi, Uttar Pradesh"
            />
          </div>
          <div>
            <label className="block text-sm font-medium font-body mb-1.5">
              {tr('currentResidence')}
              <span className="ml-2 text-[10px] text-muted-foreground font-normal">optional</span>
            </label>
            <CityAutocomplete
              value={form.currentResidence}
              onChange={v => set('currentResidence', v)}
              className={inputClass}
              placeholder="e.g. Mumbai, Maharashtra"
            />
          </div>

          <div>
            <label className="block text-sm font-medium font-body mb-1.5">{tr('relation')}</label>
            <RelationDropdown
              value={form.relation}
              onChange={(v) => set('relation', v)}
              options={isEdit ? undefined : ANCESTRAL_ADD_RELATION_OPTIONS}
              placeholder={tr('selectRelation')}
            />
            {!isEdit &&
              lineageReferenceNode &&
              form.relation &&
              ANCESTRAL_ADD_RELATION_OPTIONS.includes(form.relation) && (
                <p className="text-xs text-muted-foreground font-body mt-2">
                  {tr('vrukshaLineageIndex')}:{' '}
                  <span className="font-medium text-foreground">
                    {computeVrukshaGeneration(lineageReferenceNode.generation, form.relation)}
                  </span>
                  {hasKutumbAnchor && anchorNode && (
                    <>
                      {' '}
                      ({tr('anchorLabel')}: {anchorNode.name}, {tr('generation')}: {anchorNode.generation})
                    </>
                  )}
                </p>
              )}
            {isEdit && existingNode && (
              <p className="text-xs text-muted-foreground font-body mt-2">
                {tr('generation')}:{' '}
                <span className="font-medium text-foreground">{existingNode.generation}</span>
              </p>
            )}
          </div>

          {/* Personal label — compulsory on add, optional update on edit */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-semibold font-body mb-1">
                आप इन्हें क्या कहते हैं? <span className="text-destructive">*</span>
              </label>
              <p className="text-xs text-muted-foreground font-body mb-2">
                Your personal name for this person — only you see this on hover.
              </p>
              <input
                type="text"
                value={form.personalLabel}
                onChange={e => set('personalLabel', e.target.value)}
                placeholder="e.g. पिताजी, बप्पा, दादू, Chachu, Nani…"
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}

          {isEdit && existingNode && state.nodes.length > 1 && (
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-4">
              <p className="text-sm font-medium font-body">{tr('linkSpouseTitle')}</p>
              <p className="text-xs text-muted-foreground font-body leading-relaxed">{tr('linkSpouseHint')}</p>
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">{tr('linkSpouseSelect')}</label>
                <select
                  value={spouseLinkTargetId}
                  onChange={(e) => setSpouseLinkTargetId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">{tr('linkSpouseSelectPlaceholder')}</option>
                  {state.nodes
                    .filter((n) => n.id !== existingNode.id)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.relation})
                      </option>
                    ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void handleLinkSpouse()}
                disabled={!spouseLinkTargetId || linkingSpouse}
                className="w-full py-2.5 rounded-lg border border-primary bg-primary/10 text-primary font-semibold font-body text-sm hover:bg-primary/15 transition-colors disabled:opacity-50"
              >
                {linkingSpouse ? '…' : tr('linkSpouseButton')}
              </button>
            </div>
          )}

          {!isEdit && isChildRelation(form.relation) && (
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-4">
              <p className="text-xs text-muted-foreground font-body leading-relaxed">
                {tr('parentNamesHint')}
              </p>
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">
                  {tr('fatherNameOptional')}
                </label>
                <input
                  value={form.fatherName}
                  onChange={(e) => set('fatherName', e.target.value)}
                  className={inputClass}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">
                  {tr('motherNameOptional')}
                </label>
                <input
                  value={form.motherName}
                  onChange={(e) => set('motherName', e.target.value)}
                  className={inputClass}
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium font-body mb-1.5">{tr('gender')}</label>
            <div className="flex gap-3">
              {(['male', 'female', 'other'] as const).map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => set('gender', g)}
                  className={`flex-1 py-2 rounded-lg text-sm font-body border transition-colors ${form.gender === g ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-input text-muted-foreground hover:bg-secondary'}`}
                >
                  {g === 'other' ? tr('preferNotToSay') : tr(g)}
                </button>
              ))}
            </div>
          </div>

          {/* Parent selector when no anchor from tree (connect new member to an existing node) */}
          {!isEdit && !hasKutumbAnchor && state.nodes.length > 0 && (
            <div>
              <label className="block text-sm font-medium font-body mb-1.5">{tr('connectTo')}</label>
              <select value={form.parentId} onChange={(e) => set('parentId', e.target.value)} className={inputClass}>
                <option value="">{tr('selectParent')}</option>
                {state.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} ({n.relation})
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isEdit && effectiveVanshaId && anchorNodeId && !anchorNode && (
            <p className="text-sm text-amber-700 dark:text-amber-400 font-body">{tr('anchorNotLoaded')}</p>
          )}

          {!isEdit && hasKutumbAnchor && anchorNode && (
            <p className="text-sm text-muted-foreground font-body">
              {tr('anchorLabel')}: <span className="font-medium text-foreground">{anchorNode.name}</span>
            </p>
          )}

          <div>
            <label className="block text-sm font-medium font-body mb-1.5">{tr('branch')}</label>
            <input value={form.branch} onChange={e => set('branch', e.target.value)} className={inputClass} />
          </div>

          {/* Cultural fields — plan gated */}
          {hasCultural ? (
            <>
              <div className="border-t border-border pt-5 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <TrustBadge variant="consent-active" compact />
                  <span className="text-[10px] text-muted-foreground font-body">{tr('zeroKnowledgeDesc')}</span>
                </div>
                <ConsentToggle fieldLabel={tr('gotraField')} />
                <div>
                  <label className="block text-sm font-medium font-body mb-1.5">{tr('gotraField')}</label>
                  <input value={form.gotra} onChange={e => set('gotra', e.target.value)} className={inputClass} />
                </div>
                <ConsentToggle fieldLabel={tr('moolNiwas')} />
                <div>
                  <label className="block text-sm font-medium font-body mb-1.5">{tr('moolNiwas')}</label>
                  <input value={form.moolNiwas} onChange={e => set('moolNiwas', e.target.value)} className={inputClass} />
                </div>
              </div>
            </>
          ) : (
            <div className="border-t border-border pt-5">
              <LockedBanner featureKey="culturalFields" />
            </div>
          )}

          {/* Active Disputes for this node */}
          {nodeDisputes.length > 0 && (
            <div className="border-t border-border pt-5 space-y-3">
              <p className="text-sm font-medium font-body mb-3">{tr('disputedField')}</p>
              {nodeDisputes.map(d => (
                <DisputeForkIndicator
                  key={d.id}
                  fieldName={d.field}
                  valueA={d.versionA}
                  valueB={d.versionB}
                />
              ))}
            </div>
          )}

          {/* Change history */}
          {nodeChanges.length > 0 && (
            <div className="border-t border-border pt-5">
              <p className="text-sm font-medium font-body mb-3">{tr('changeHistory')}</p>
              <div className="space-y-2">
                {nodeChanges.map(c => (
                  <div key={c.id} className="text-xs font-body text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">
                    <span className="font-medium text-foreground">{c.field}</span>
                    {c.oldValue && <> : {c.oldValue} → </>}{c.newValue}
                    <span className="ml-2 text-[10px]">{new Date(c.timestamp).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Privacy scope for owned nodes (plan-gated; free tier = public only) */}
          {isEdit && isOwnNode && existingNode && (
            <div className="space-y-3">
              <label className="block text-sm font-medium font-body mb-1.5">{tr('privacyLevelLabel')}</label>
              <select
                value={migrateLegacyVisibility(existingNode.visibility as string)}
                onChange={(e) => {
                  const level = e.target.value as NodePrivacyLevel;
                  if (!allowedPrivacy.has(level)) {
                    toast({
                      title: tr('privacyLockedTitle'),
                      description: tr('privacyLockedDesc'),
                      variant: 'destructive',
                    });
                    navigate('/upgrade');
                    return;
                  }
                  setNodePrivacy(
                    existingNode.id,
                    level,
                    level === 'custom_five_nodes' ? customPrivacyNodes.slice(0, 5) : undefined,
                  );
                }}
                className={inputClass}
              >
                {(['private', 'parents', 'grandparents', 'tree_all_generations', 'custom_five_nodes', 'public'] as const).map(
                  (lev) => (
                    <option key={lev} value={lev} disabled={!allowedPrivacy.has(lev)}>
                      {tr(`privacyLevel_${lev}`)}
                    </option>
                  ),
                )}
              </select>
              {planId === 'beej' && (
                <p className="text-xs text-amber-800 dark:text-amber-300 font-body">{tr('privacyFreePublicOnly')}</p>
              )}
              {migrateLegacyVisibility(existingNode.visibility as string) === 'custom_five_nodes' &&
                allowedPrivacy.has('custom_five_nodes') && (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                    <p className="text-xs font-medium font-body">{tr('privacyPickFive')}</p>
                    <div className="max-h-40 space-y-1.5 overflow-y-auto">
                      {state.nodes
                        .filter((n) => n.id !== existingNode.id)
                        .map((n) => (
                          <label
                            key={n.id}
                            className="flex cursor-pointer items-center gap-2 text-xs font-body"
                          >
                            <input
                              type="checkbox"
                              checked={customPrivacyNodes.includes(n.id)}
                              disabled={
                                !customPrivacyNodes.includes(n.id) && customPrivacyNodes.length >= 5
                              }
                              onChange={() => {
                                let next = customPrivacyNodes.includes(n.id)
                                  ? customPrivacyNodes.filter((x) => x !== n.id)
                                  : [...customPrivacyNodes, n.id].slice(0, 5);
                                setCustomPrivacyNodes(next);
                                setNodePrivacy(existingNode.id, 'custom_five_nodes', next);
                              }}
                            />
                            <span>{n.name}</span>
                          </label>
                        ))}
                    </div>
                  </div>
                )}
              <p className="text-xs text-muted-foreground font-body">{tr('nodePrivacyDesc')}</p>
            </div>
          )}

          {/* Sovereignty reminder */}
          {isEdit && isOwnNode && (
            <p className="text-xs text-center text-muted-foreground font-body italic">{tr('yourNodeYourRules')}</p>
          )}

          {/* Claim this node — shown when the current user is NOT the owner */}
          {isEdit && existingNode && !isOwnNode && (
            <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-primary flex-shrink-0" />
                <p className="text-sm font-semibold font-body text-primary">Is this you?</p>
              </div>
              <p className="text-xs text-muted-foreground font-body leading-relaxed">
                If this node represents you, you can request to claim it. The tree creator will approve your request.
              </p>
              <button
                type="button"
                onClick={() => void handleClaim()}
                disabled={claiming}
                className="w-full py-2 rounded-lg border border-primary text-primary text-sm font-semibold font-body hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                {claiming ? '…' : 'Request to Claim this Node'}
              </button>
            </div>
          )}

          <button
            onClick={() => void handleSave()}
            disabled={
              !identityComplete ||
              saving ||
              !form.relation.trim() ||
              (!isEdit && Boolean(effectiveVanshaId) && Boolean(anchorNodeId) && !anchorNode)
            }
            className="w-full py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? '…' : tr('saveMember')}
          </button>

          {/* Verification actions — shown only in edit mode with a vansha */}
          {isEdit && existingNode && effectiveVanshaId && isSelfDeclared && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 flex-shrink-0" />
                <p className="text-sm font-semibold font-body text-emerald-900 dark:text-emerald-300">Verify this node</p>
              </div>

              {/* Tier 2 — Family endorsement (for ancestor nodes not owned by current user) */}
              {!isOwnNode && (
                <div className="space-y-1">
                  <p className="text-xs font-medium font-body text-foreground">Family Endorsement</p>
                  <p className="text-xs text-muted-foreground font-body">You personally know this ancestor — endorse their details as a living family member.</p>
                  <button
                    type="button"
                    onClick={() => void handleFamilyEndorse()}
                    disabled={verifying}
                    className="w-full py-2 rounded-lg border border-emerald-600 text-emerald-700 dark:text-emerald-400 text-sm font-semibold font-body hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
                  >
                    {verifying ? '…' : 'Endorse as Family Member'}
                  </button>
                </div>
              )}

              {/* Tier 3/4 — Paryavaran Mitra or Trust review */}
              <div className="space-y-1">
                <p className="text-xs font-medium font-body text-foreground">Paryavaran Mitra / Trust Verification</p>
                <p className="text-xs text-muted-foreground font-body">Request review by a certified Paryavaran Mitra or registered trust.</p>
                <button
                  type="button"
                  onClick={() => void handleRequestExpertVerify()}
                  disabled={verifying}
                  className="w-full py-2 rounded-lg border border-emerald-600 text-emerald-700 dark:text-emerald-400 text-sm font-semibold font-body hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
                >
                  {verifying ? '…' : 'Request Expert Verification'}
                </button>
              </div>
            </div>
          )}

          {/* Delete node — creator can delete unclaimed+unverified nodes */}
          {canDeleteNode && (
            <div className="pt-4 border-t border-border/60">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-destructive/40 text-destructive text-sm font-semibold font-body hover:bg-destructive/8 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete this member
                </button>
              ) : (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
                  <p className="text-sm font-semibold text-destructive font-body">Delete {existingNode?.name}?</p>
                  <p className="text-xs text-muted-foreground font-body">This will permanently remove this person from the tree. This action cannot be undone.</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 py-2 rounded-lg border border-border text-sm font-body"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      disabled={deleting}
                      className="flex-1 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold font-body disabled:opacity-50"
                    >
                      {deleting ? '…' : 'Yes, Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
};

export default NodePage;
