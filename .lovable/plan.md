

# Plan: Fix Verification, Discovery Privacy, and Matrimony Opt-In

## Issues Identified

1. **Verification "Request Verification" button does nothing** — it's a static button with no onClick handler
2. **Discovery page treats visibility as tree-wide toggle** — should be per-node privacy (private / public-to-tree / public-to-all), not a single tree-level switch
3. **Logo click logs out** — user reports this as a bug (clicking Kutumb Map logo resets everything)
4. **Matrimony "Opt In" button does nothing** — no state, no form, no flow per matrimony.txt instructions

---

## Fix 1 — Verification Request Flow

**Edit `src/pages/VerificationPage.tsx`:**
- Add `useState` for request status: `idle` → `submitted` → shows confirmation
- On "Request Verification" click: create an activity log entry via `useTree()`, show toast "Verification request submitted", display a "Pending — awaiting Pandit Ji" state with a shield icon
- Add a section showing the user's current verification tier (self-declared / expert-verified / community-endorsed)
- Add a "Pandit Ji will verify and put remark" explainer text
- No Aadhaar, no eKYC — purely community-based

**Edit `src/i18n/translations.ts`:**
- Add keys: `verificationSubmitted`, `verificationPending`, `verificationPendingDesc`, `currentVerificationTier`, `panditWillVerify`

---

## Fix 2 — Per-Node Discovery Privacy (not tree-wide)

**Edit `src/engine/types.ts`:**
- Add `visibility: 'private' | 'tree-only' | 'public'` field to `TreeNode` interface (default: `'private'`)

**Edit `src/contexts/TreeContext.tsx`:**
- Update `initTree` and `addNode` to set default `visibility: 'private'` on new nodes
- Add `setNodeVisibility(nodeId, visibility)` method

**Edit `src/pages/DiscoveryPage.tsx` — full rework:**
- Remove the single tree-wide toggle
- Show a list of the current user's tree nodes with a dropdown for each: Private / Public to Tree / Public to All
- Explain: "Each family member controls their own visibility. You can only change nodes you own."
- For nodes the user doesn't own, show current visibility as read-only
- Non-public nodes visible to outsiders show as anonymous silhouettes (name hidden, relation hidden)
- Keep the "Connection Chains" locked banner for non-entitled plans

**Edit `src/pages/NodePage.tsx`:**
- Add a visibility dropdown (Private / Public to Tree / Public to All) in the edit form for owned nodes
- Uses the new `setNodeVisibility` from TreeContext

**Edit `src/i18n/translations.ts`:**
- Add keys: `visibilityPrivate`, `visibilityTreeOnly`, `visibilityPublic`, `visibilityLabel`, `visibilityExplainer`, `onlyOwnerCanChange`, `nodeVisibilityDesc`

---

## Fix 3 — Logo Click Should NOT Log Out

**Edit `src/components/AppHeader.tsx`:**
- Change `handleLogoClick` to navigate to `/dashboard` if tree is initialized, or `/` if not
- Remove `resetTree()`, `localStorage.clear()`, `window.location.reload()`
- Keep the explicit "Logout" button in the dropdown menu for actual logout

---

## Fix 4 — Matrimony Opt-In with Full Flow from matrimony.txt

**Edit `src/engine/types.ts`:**
- Add `MatrimonyProfile` interface with all fields from the doc:
  - `searchingFor`: 'myself' | 'son' | 'daughter' | 'familyMember'
  - `intent`: 'open' | 'exploring'
  - `management`: 'self' | 'parents' | 'joint' | 'elder'
  - `dietary`, `religiousPractice`, `languageAtHome`, `educationLevel`, `professionCategory`, `livingSituation`, `geographicPreference`, `horoscopeWillingness`
  - `generationAvoidance`: 3 | 5 | 7 | 'askPandit' | 'notApplicable'
  - `ownGotra`, `mothersGotra`, `dadisGotra`, `nanisGotra`, `buasGotra`, `mausisGotra` (each: string | 'unknown' | 'askPandit' | 'notApplicable')
  - `surnamesToAvoid`: string[]
  - `kundaliData`: { dob, timeOfBirth, timeKnown, placeOfBirth, state, country, birthDetailsSource }
  - `stage`: 0-6 tracking the matrimony flow stage
  - `optedIn`: boolean

**Edit `src/contexts/TreeContext.tsx`:**
- Add `matrimonyProfile: MatrimonyProfile | null` to TreeState
- Add `setMatrimonyProfile(profile)` method
- Persist in localStorage with the rest of state

**Edit `src/pages/MatrimonyPage.tsx` — full rework as multi-step form:**
- **Step 0 (Entry):** "Who are you searching for?" dropdown + Intent dropdown + Management context dropdown
- **Step 1 (Sanskriti — Lifestyle):** Dietary, religious practice, language, education, profession, living situation, geographic preference, horoscope willingness — all as dropdowns
- **Step 2 (Gotra & Lineage Avoidance):** Generation avoidance dropdown (3/5/7/Ask Pandit/NA) → Own Gotra (type or dropdown with "Don't know"/"Ask My Pandit"/"Not applicable") → Progressive disclosure: Mother's Gotra, Dadi's Gotra, Nani's Gotra, Bua's Gotra, Mausi's Gotra — each with same options
- **Step 3 (Surname Cross-Check):** Family surname + "Add surnames to avoid" with relation context dropdown
- **Step 4 (Kundali Data):** DOB, Time of birth (with "exact/approximate/unknown" dropdown), Place of birth, State, Country, Birth details source dropdown
- **Step 5 (Review & Submit):** Summary of all entered data, "Opt In" button saves to TreeContext

All dropdowns use `<select>` elements with proper i18n labels. Each step has back/next navigation. Progress indicator at top.

**Edit `src/i18n/translations.ts`:**
- Add ~50 keys for all matrimony form labels, dropdown options, step titles, and descriptions (full EN/HI parity)

---

## Technical Notes

- All state persists via localStorage through TreeContext — no backend needed yet
- The matrimony flow is the largest change — a proper multi-step form with ~8 dropdown-heavy screens
- Discovery privacy is per-node, stored on the TreeNode, controlled only by the node owner
- Verification creates an activity log entry and shows pending state — actual Pandit review will come with backend
- No files are rewritten from scratch — all changes are targeted edits to existing files

