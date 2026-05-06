I'll read all the specified files completely. Let me start with the database schemas, then backend routers and utilities, then frontend services and components.

Let me continue reading the remaining frontend files.

Let me check if FamilyNode.tsx exists:

## Codebase Reconnaissance: Complete

I've read all specified files. Here's the complete report with exact content:

---

## **DATABASE SCHEMAS**

### `001_persons_unions.sql`
- **persons** table: UUID primary key `node_id`, columns for identity (first_name, last_name, date_of_birth, ancestral_place, current_residence), lineage (father_node_id, mother_node_id, parent_union_id), matrimony (maiden_vansha_id, origin_vansha_id), family metadata (gotra, mool_niwas, title, branch, relation, gender), generation tracking (generation, relative_gen_index). RLS enabled; authenticated users can SELECT all rows.
- **unions** table: UUID primary key `union_id`, male_node_id/female_node_id FKs, relative_gen_index, vansha_id. Marital couples. RLS enabled.

### `004_ltree_ancestors.sql`
- Adds ltree extension + `lineage_path` GIST-indexed column to persons
- Functions: `ancestors_of(node_id)` — recursive walk via father_node_id (depth guard 25), `descendants_of(node_id)` — recursive walk via children, `backfill_lineage_paths()` — iterative root-first propagation (up to 25 generations)
- Helper: `uuid_to_ltree_label()` converts UUIDs to underscores for ltree safety

### `013_kutumb_id_referral.sql`
- Adds `kutumb_id` TEXT UNIQUE to users table (KM + 8 random chars from unambiguous alphabet: ABCDEFGHJKMNPQRSTUVWXYZ23456789)
- `generate_kutumb_id()` function with collision checking
- Backfill + BEFORE INSERT trigger for auto-assignment
- **referral_events** table (immutable append-only): `kutumb_id_used`, `referrer_id`, `referred_id`, `event_type` (registration|se_application|invite_accepted), `metadata` JSONB, `created_at`. RLS: users see rows where they are referrer or referred.

### `036_tree_v2_ids_and_edges.sql`
- Adds `kutumb_id` TEXT UNIQUE to persons (same KM format, collision-checked against users.kutumb_id too)
- **vanshas** table: `vansha_id` (PK), `vansh_code` (VS + 8 chars), `vansh_name`, `founder_node_id`, `created_by`, `created_at`, `updated_at`. Auto-trigger for vansh_code generation. RLS: authenticated can SELECT.
- **relationships** table: `id` (PK), `vansha_id`, `from_node_id`, `to_node_id`, `type` (parent_of|spouse_of), `subtype` (biological|adopted|step). Unique constraint on (from_node_id, to_node_id, type). No self-edges. RLS: authenticated can SELECT.
- Adds `canvas_offset_x`, `canvas_offset_y` DOUBLE PRECISION columns to persons (manual drag override on auto-layout)
- Backfill: converts existing father_node_id/mother_node_id/parent_union_id into relationships edges (parent_of), converts unions into relationships edges (spouse_of)
- Updated_at trigger on vanshas

---

## **BACKEND ROUTERS**

### `tree.py` (v1 API)
- `GET /api/tree/{vansha_id}` → full tree payload (persons + unions)
- `GET /api/tree/{vansha_id}/page?gen_min=X&gen_max=Y` → paginated by generation (max window 30)
- `POST /api/tree/bootstrap` → onboarding: creates self + optional father/mother/spouse in one request, returns tree payload
- `POST /api/tree/bridge` → matrimonial bridge: loads paternal tree by origin_vansha_id (female's birth family)
- Helpers: `_combined_person_name()`, `_enrich_persons_with_name()` (adds `name` field from first/last), `_filter_rows_for_vansha()` (defense in depth), `_split_name()`, `_fetch_tree_for_vansha()`, `_insert_placeholder_parent()`, `_insert_union()`
- Uses constants: PERSONS_TABLE, UNIONS_TABLE, VANSHA_ID_COLUMN

### `tree_v2.py` (relationships edge API)
- **Relationships**:
  - `GET /api/tree-v2/{vansha_id}/relationships` → list all edges
  - `POST /api/tree-v2/relationships` → create edge (parent_of|spouse_of), subtype (biological|adopted|step). Validations: endpoints must be in same vansha; parent_of: child can have ≤1 father & ≤1 mother per subtype; spouse_of: no reverse duplicate (a→b blocks b→a)
  - `PATCH /api/tree-v2/relationships/{id}` → update subtype only
  - `DELETE /api/tree-v2/relationships/{id}`
- **Vanshas**:
  - `GET /api/tree-v2/vanshas/{vansha_id}` → metadata
  - `GET /api/tree-v2/vanshas/by-code/{code}` → lookup by vansh_code (case-insensitive)
  - `PATCH /api/tree-v2/vanshas/{vansha_id}` → update vansh_name & founder_node_id
- **Canvas Offsets**:
  - `PATCH /api/tree-v2/persons/{node_id}/offset` → save drag offset (canvas_offset_x/y)
  - `DELETE /api/tree-v2/persons/{node_id}/offset` → clear offset (revert to auto-layout)
- **Integrity**:
  - `GET /api/tree-v2/persons/{node_id}/integrity` → report incoming/outgoing edges, flag: multiple biological parents same gender, self-loops
- All endpoints require CurrentUser (authenticated)

### `person.py` (create/update/delete persons)
- `POST /api/person` → create person with Vruksha logic. Params: vansha_id, identity fields (first_name, last_name, date_of_birth, ancestral_place, current_residence), gender, relation, relative_gen_index, anchor_node_id (optional). Infers generation & lineage from anchor + relation. Auto-creates placeholder parents/spouses + unions. Computes lineage_path.
- `PATCH /api/person/{node_id}` → update field-by-field (requires owner auth)
- `DELETE /api/person/{node_id}` → delete (requires owner auth)
- `POST /api/person/link` → link two existing persons (parent-child or spouse). Auto-resolves union_id or creates solo union if needed. 
- Relation sets: CHILD_RELATIONS (Son, Daughter, Adopted Son, Adopted Daughter), PARENT_RELATIONS (Father, Mother), SIBLING_RELATIONS (Brother, Sister), SPOUSE_RELATIONS (Wife, Husband, Spouse)
- Helpers: `_normalize_gender()`, `_anchor_generation()`, `_str_id()`, `_union_row_id()`, `_list_unions()`, `_find_union_containing_node()`, `_placeholder_name()`, `_uuid_to_ltree_label()`, `_compute_lineage_path()`, `_insert_placeholder_parent()`, `_insert_union()`

### `union.py` (link spouses)
- `POST /api/union/spouse` → link two existing persons as marital union (one male, one female). Both must belong to same vansha. Validates gender requirements. If union already exists (same male/female pair), returns ok=true with already_linked=true.

---

## **BACKEND UTILITIES**

### `constants.py`
- Table names: PERSONS_TABLE="persons", UNIONS_TABLE="unions", RELATIONSHIPS_TABLE="relationships", VANSHAS_TABLE="vanshas", USERS_TABLE="users"
- Column names: VANSHA_ID_COLUMN="vansha_id", PARENT_UNION_ID_COLUMN="parent_union_id"
- Many other tables (matrimony_profiles, verification_requests, samay_*, prakriti_*, services_*, etc.)
- GST rates (DEFAULT_IGST_RATE=18.00, DEFAULT_CGST_RATE=9.00, DEFAULT_SGST_RATE=9.00)
- Eco-ceremony prices: vriksha_pratishtha=999, jal_puja=499, eco_pledge=199, dharti_sandesh=199, harit_circle_monthly=500
- Eco-sewa hour weights: tree_watered=0.5, tree_planted_self=2.0, waste_segregated=0.5, etc.

### `middleware/auth.py`
- `get_current_user(creds: HTTPAuthorizationCredentials)` → validates Supabase JWT via `sb.auth.get_user(token)`, returns public.users row. Auto-provisions users row on first auth (id + role='user'). Handles token expiry gracefully.
- `require_margdarshak(user)` → checks role in (margdarshak, admin)
- Type aliases: `CurrentUser = Annotated[dict, Depends(get_current_user)]`, `MargdarshakUser = Annotated[dict, Depends(require_margdarshak)]`

---

## **FRONTEND SERVICES**

### `services/api.ts` (main HTTP client)
- `getApiBaseUrl()` → from VITE_API_BASE_URL env, infers for prakriti.ecotech.co.in → api.prakriti.ecotech.co.in, defaults to http://127.0.0.1:8000
- `getAccessToken()` → reads Supabase auth token from localStorage (searches for keys ending "-auth-token")
- `fetchApi(url, init)` → wraps fetch with auth header + error handling (TypeError if API unreachable)
- **Tree payloads**: `VanshaTreePayload { vansha_id, unions[], persons[], kuldevi?, kuldevta? }`
- **Core functions**:
  - `fetchVanshaTree(vansha_id)` → GET /api/tree/{id}
  - `fetchVanshaTreePage(vansha_id, gen_min, gen_max)` → GET /api/tree/{id}/page
  - `bootstrapOnboardingTree(payload)` → POST /api/tree/bootstrap
  - `updateVanshaMetadata(vansha_id, meta)` → PATCH /api/tree/{id}/meta
  - `createPerson(payload)` → POST /api/person
  - `updatePerson(nodeId, fields)` → PATCH /api/person/{id}
  - `deletePerson(nodeId)` → DELETE /api/person/{id}
  - `claimPersonNode(nodeId)` → POST /api/person/{id}/claim
  - `requestNodeVerification(vanshaId, nodeId)` → POST /api/verification/request
  - `familyEndorseNode(vanshaId, nodeId)` → POST /api/verification/family-endorse
  - `linkExistingSpouses(params)` → POST /api/union/spouse
  - `fetchMatrimonialBridge(origin_vansha_id)` → POST /api/tree/bridge
  - `validateReferralCode(code)` → GET /api/auth/referral/validate?code=...
  - `recordReferralEvent(payload)` → POST /api/auth/referral/record
- Also exports prakriti (panchang, leaderboard, service, green-legacy), samay, sewa, notifications, calendar, etc. APIs

### `services/treeV2Api.ts` (tree v2 edge API)
- `listRelationships(vanshaId)` → GET /api/tree-v2/{id}/relationships
- `createRelationship(payload)` → POST /api/tree-v2/relationships
- `updateRelationshipSubtype(id, subtype)` → PATCH /api/tree-v2/relationships/{id}
- `deleteRelationship(id)` → DELETE /api/tree-v2/relationships/{id}
- `getVansha(vanshaId)` → GET /api/tree-v2/vanshas/{id}
- `getVanshaByCode(code)` → GET /api/tree-v2/vanshas/by-code/{code}
- `setNodeOffset(nodeId, x, y)` → PATCH /api/tree-v2/persons/{id}/offset
- `clearNodeOffset(nodeId)` → DELETE /api/tree-v2/persons/{id}/offset
- `getIntegrity(nodeId)` → GET /api/tree-v2/persons/{id}/integrity
- Types: `EdgeType = "parent_of" | "spouse_of"`, `EdgeSubtype = "biological" | "adopted" | "step"`, `Relationship`, `VanshaMeta`, `IntegrityReport`

---

## **FRONTEND TYPES**

### `engine/types.ts`
- `VerificationTier = 'self-declared' | 'family-endorsed' | 'expert-verified' | 'community-endorsed'`
- `NodePrivacyLevel = 'private' | 'parents' | 'grandparents' | 'tree_all_generations' | 'custom_five_nodes' | 'public'`
- `NodeStatus = 'active' | 'frozen' | 'sealed'`
- `BorderStyle = 'solid' | 'dotted'`
- **UnionRow**: id, maleNodeId, femaleNodeId, relativeGenIndex? (for layout trunks)
- **TreeNode**: id, name, givenName?, middleName?, surname?, dateOfBirth?, ancestralPlace?, currentResidence?, relation, gender, branch, gotra, moolNiwas, title?, ownerId, createdBy, createdAt (timestamp), verificationTier, borderStyle, status, generation (signed), visibility, privacyNodeIds?, maidenVanshaId?, paternalVanshaId?, parentUnionId?, fatherNodeId?, motherNodeId?, isPlaceholder?
- **MatrimonyProfile**: optedIn, stage, searchingFor, intent, management, dietary, religiousPractice, languageAtHome, educationLevel, professionCategory, livingSituation, geographicPreference, horoscopeWillingness, generationAvoidance, ownGotra/mothersGotra/dadisGotra/nanisGotra/buasGotra/mausisGotra, surnamesToAvoid[], familySurname, kundaliData { dob, timeOfBirth, timeKnown, placeOfBirth, state, country, birthDetailsSource }
- **TreeEdge**: from, to, relation
- **TreeState**: nodes[], edges[], unionRows[], changeLog[], disputes[], pendingActions[], activityLog[], currentUserId, treeName, kuldevi?, kuldevta?, matrimonyProfile

---

## **FRONTEND CONSTANTS & RELATIONS**

### `constants/vrukshaRelations.ts`
- `idEqNodeIds(a, b)` → case-insensitive UUID compare (ignores hyphens)
- `KUTUMB_RELATION_OPTIONS = ["Son", "Daughter", "Father", "Mother", "Brother", "Sister", "Spouse", "Adopted Son", "Adopted Daughter"]`
- `ANCESTRAL_ADD_RELATION_OPTIONS = ["Son", "Daughter", "Father", "Mother", "Spouse", "Adopted Son", "Adopted Daughter"]`
- `computeVrukshaGeneration(anchorGen, relation)` → Son/Daughter/Adopted children: +1; Father/Mother: -1; spouse/sibling: same
- `isChildRelation(relation)` → true for Son/Daughter/Adopted Son/Adopted Daughter
- `isSpouseRelation(relation)` → true for Wife/Husband/Spouse (case-insensitive)
- `isAdoptedChildRelation(relation)` → regex /adopted/i
- `getTreeNodeContainerVariant(node, unionRows)` → returns "bio-child" | "adopted-child" | "incoming-spouse" | "lineage-host" | "default" (used for node styling)
- `normalizeRelationToKutumb(r)` → maps legacy labels (wife, husband, relative, etc.) to canonical Kutumb labels

---

## **FRONTEND PAGES & COMPONENTS**

### `pages/TreePageV2.tsx`
- Demo mode (no auth, static mock): DEMO_NODES (8 family members in Hindi), DEMO_EDGES (parent-child + spouse links), context menu for edit/delete/integrity
- Main mode: fetches vanshaId from URL param, appUser.vansha_id, VITE_DEFAULT_VANSHA_ID, or persisted. No vanshaId → demo mode
- Returns `<TreeCanvasV2 vanshaId={vanshaId} />`

### `components/tree/TreeCanvasV2.tsx`
- React Flow powered canvas: drag-drop nodes, pan, zoom, right-click context menu, edge deletion
- **Layout**: BFS from roots via parent_of edges, groups by generation, places spouses adjacent
- **Node colors**: male=#dbeafe (light blue), female=#fce7f3 (light pink), other=#f3f4f6 (gray)
- **Edge colors**: spouse=#ec4899 (pink, straight line, width 2), parent_of biological=#475569 (gray, smoothstep arrow), adopted=#a855f7 (purple, dashed), step=#f59e0b (amber)
- **Fetches**: fetchVanshaTree(), listRelationships(), getVansha()
- **Actions**: delete node (cascades edges), delete edge, save drag offset (debounced 600ms), view integrity report (right panel showing issues)
- Node data: {label: JSX, nodeId, name}

### `pages/NodePage.tsx` (300+ lines, partial read)
- Edit or create person. Params: `id` (edit mode) or `anchor_node_id` (Vruksha add from tree selection)
- Form fields: title, givenName, middleName, surname, dateOfBirth (DD/MM/YYYY input), ancestralPlace, currentResidence, relation, gender, branch, gotra, moolNiwas, personalLabel, marriageAnniversary, swargwasDate
- Auto-fill logic: gender from relation, ancestralPlace/gotra/surname from anchor node
- DOBInput component: three inputs (DD, MM, YYYY) that focus-advance and emit YYYY-MM-DD
- Relation dropdown uses ANCESTRAL_ADD_RELATION_OPTIONS or all options depending on context
- Saves via createPerson() or updatePerson() APIs
- Optional: claim node, verify node, link spouse (requires effectiveVanshaId)

---

## **FRONTEND CONTEXTS**

### `contexts/AuthContext.tsx`
- **AppUser**: id, role (user|margdarshak|admin|superadmin|np|zp|rp|cp|se|office|finance), vansha_id, phone, full_name, kutumb_id (unique permanent referral code), kutumb_pro?, onboarding_complete
- **AuthState**: session, supabaseUser, appUser, loading, supabaseReady, signOut(), refreshAppUser()
- Uses Supabase onAuthStateChange listener (fires INITIAL_SESSION or SIGNED_IN). Does NOT call getSession() on mount (PKCE code not yet exchanged).
- Auto-upsert session via /api/auth/session POST with full_name and phone
- Fetches /api/auth/me GET to get appUser
- Safety valve: 8s timeout if Supabase never fires

### `contexts/TreeContext.tsx` (300+ lines, partial read)
- **TreeState**: nodes[], edges[], unionRows[], changeLog[], disputes[], pendingActions[], activityLog[], currentUserId, treeName, kuldevi?, kuldevta?, matrimonyProfile
- Persists to localStorage (kutumb_tree_state)
- Actions: INIT_TREE, ADD_NODE, EDIT_NODE, MERGE, LOAD, RESET
- Methods: initTree(), addNode(), editNode(), raiseDispute(), resolveDispute(), approvePending(), objectPending(), setNodePrivacy(), requestVerification(), setMatrimonyProfile(), loadTreeState(), linkSpousePair()
- Computes: trustScore, treeDepth

---

## **FRONTEND APP ROUTING**

### `App.tsx`
- Wraps in: QueryClientProvider, ThemeProvider, BrowserRouter, LanguageProvider, AuthProvider, TreeProvider, PlanProvider, WorkspaceProvider
- **Public routes**: /, /signin, /onboarding, /code/:type?/:code, /margdarshak-kyc, /eco-panchang, /green-legacy/:vanshaId, /leaderboard, /services
- **Protected routes** (any auth): /dashboard, /tree, /tree-v2, /invite, /verification, /discovery, /matrimony, /upgrade, /support, /node, /node/:id, /calendar, /radar, /legacy-box, /time-bank, /transactions, /settings, /admin/content, /services/orders/:orderId, etc.
- **Protected** (margdarshak role): /margdarshak, /harit-circle, /mitra-earnings

---

## **KEY INTEGRATION POINTS**

1. **Auth**: Supabase JWT → FastAPI /api/auth/me endpoint → appUser (with kutumb_id, vansha_id)
2. **Tree data**: FastAPI /api/tree/{vansha_id} → VanshaTreePayload (persons + unions) → stored in TreeContext
3. **Tree v2 edges**: FastAPI /api/tree-v2/relationships → Relationship[] → ReactFlow edges
4. **Canvas offsets**: PATCH /api/tree-v2/persons/{id}/offset → persists manual drag position (canvas_offset_x/y)
5. **Node creation**: POST /api/person with anchor_node_id → Vruksha generation logic (server-side) → creates person + unions + relationships
6. **Spouse linking**: POST /api/union/spouse or local TreeContext.linkSpousePair()
7. **Integrity**: GET /api/tree-v2/persons/{id}/integrity → flags relationship conflicts (multiple bio parents same gender, self-loops)

---

All exact values, field names, API contracts, and type definitions are included above.