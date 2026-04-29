# Crew Onboarding And Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add profile-based invite onboarding, self-registration, and admin approval flow for future crew users, all tied to the existing UUID `profileId` identity model.

**Architecture:** Extend the current Supabase-backed `profiles` identity layer with explicit onboarding / approval state, then add two entry flows (`admin invite`, `self-registration`) that converge into the same profile lifecycle. Keep login on standard `email + password`, and separate the project into four phases so existing runtime auth and UUID flows stay stable while onboarding is introduced.

**Tech Stack:** React, TypeScript, Supabase Auth, Supabase Postgres, existing service layer, AppContext/AuthProvider, Vitest

---

## File Structure

### Database and auth foundation

- Modify: `src/lib/database.types.ts`
  - Add the new profile lifecycle fields used by the onboarding and approval flow.
- Modify: `src/lib/supabase-mappers.ts`
  - Map new profile lifecycle fields into the local contractor/profile shape when needed.
- Modify: `src/app/providers/AuthProvider.tsx`
  - Gate incomplete or non-approved accounts and expose any needed onboarding state.
- Modify: `src/app/providers/auth-context.ts`
  - Extend the auth context contract if onboarding / approval state needs to be exposed to UI.

### Profile / approval service layer

- Create: `src/features/onboarding/services/onboarding.service.ts`
  - Invite creation, invite resolution, onboarding completion, self-registration, approval actions.
- Create: `src/features/onboarding/services/onboarding.service.test.ts`
  - Focused tests for invite / approval flow and Supabase payloads.
- Create: `src/features/onboarding/types/onboarding.types.ts`
  - Shared types for onboarding status, collaboration type, pending approval records, and onboarding forms.

### Public onboarding UI

- Create: `src/pages/InviteAccept.tsx`
  - Page for accepting an invite, filling missing profile data, and setting password.
- Create: `src/pages/Register.tsx`
  - Self-registration page for new crew users.
- Create: `src/pages/AuthPendingApproval.tsx`
  - Holding page shown after successful registration / onboarding when account is waiting for admin approval.
- Create: `src/pages/AuthRejected.tsx`
  - Optional simple page shown if account was rejected.

### Admin approval UI

- Create: `src/views/PendingApprovalsView.tsx`
  - Admin-facing list/detail view for pending invites / registrations.
- Create: `src/components/modals/ApprovalReviewModal.tsx`
  - Modal or panel for approve / reject + rate / tags / collaboration type / profile edits.

### Routing and navigation

- Modify: `src/pages/Index.tsx`
  - Add onboarding / registration / approval routes and route guards.
- Modify: `src/constants.ts`
  - Add navigation entry for pending approvals if that matches current role navigation.
- Modify: `src/components/layout/Sidebar.tsx`
  - Show the approval item only to the appropriate admin role(s).

### Tests and integration coverage

- Modify: `src/app/providers/AuthProvider.test.tsx`
  - Add approval-gating auth tests.
- Create: `src/features/onboarding/onboarding-flow.integration.test.tsx`
  - Cover invite accept and self-registration high-level flow without full UI e2e complexity.

---

## Task 1: Add onboarding state to the profile model

**Files:**
- Modify: `src/lib/database.types.ts`
- Modify: `src/types.ts`
- Modify: `src/lib/supabase-mappers.ts`
- Test: `src/app/providers/AuthProvider.test.tsx`

- [ ] **Step 1: Add the new profile lifecycle fields to database typings**

```ts
// src/lib/database.types.ts
profiles: {
  Row: {
    // existing fields...
    onboarding_status: 'invited' | 'pending_approval' | 'active' | 'rejected' | null;
    collaboration_type: string | null;
    invited_email: string | null;
    approved_at: string | null;
    approved_by: string | null;
    rejected_at: string | null;
    rejected_by: string | null;
  };
};
```

- [ ] **Step 2: Extend the app-level contractor/profile shape**

```ts
// src/types.ts
export type OnboardingStatus = 'invited' | 'pending_approval' | 'active' | 'rejected';

export interface Contractor {
  // existing fields...
  onboardingStatus?: OnboardingStatus | null;
  collaborationType?: string | null;
  invitedEmail?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
}
```

- [ ] **Step 3: Map the new profile fields from Supabase**

```ts
// src/lib/supabase-mappers.ts
export function mapContractor(row: ProfileRow): Contractor {
  return {
    // existing mapping...
    onboardingStatus: row.onboarding_status,
    collaborationType: row.collaboration_type,
    invitedEmail: row.invited_email,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    rejectedAt: row.rejected_at,
    rejectedBy: row.rejected_by,
  };
}
```

- [ ] **Step 4: Add a failing auth test for non-active accounts**

```tsx
// src/app/providers/AuthProvider.test.tsx
it('marks invited or pending accounts as auth-incomplete until approval', async () => {
  // mock a profile with onboardingStatus: 'pending_approval'
  // assert the provider exposes a gated auth state
});
```

- [ ] **Step 5: Run focused auth test**

Run: `npm test -- src/app/providers/AuthProvider.test.tsx`
Expected: FAIL until gating logic is implemented

- [ ] **Step 6: Commit**

```bash
git add src/lib/database.types.ts src/types.ts src/lib/supabase-mappers.ts src/app/providers/AuthProvider.test.tsx
git commit -m "feat: add onboarding lifecycle fields to profiles"
```

---

## Task 2: Gate incomplete or non-approved accounts in auth

**Files:**
- Modify: `src/app/providers/AuthProvider.tsx`
- Modify: `src/app/providers/auth-context.ts`
- Test: `src/app/providers/AuthProvider.test.tsx`

- [ ] **Step 1: Define the auth gating contract**

```ts
// src/app/providers/auth-context.ts
export interface AuthContextType {
  // existing fields...
  onboardingStatus: OnboardingStatus | null;
  isPendingApproval: boolean;
  isRejected: boolean;
  isOnboardingIncomplete: boolean;
}
```

- [ ] **Step 2: Implement gating based on profile lifecycle**

```ts
// src/app/providers/AuthProvider.tsx
const onboardingStatus = profile?.onboardingStatus ?? null;
const isPendingApproval = onboardingStatus === 'pending_approval';
const isRejected = onboardingStatus === 'rejected';
const isOnboardingIncomplete = onboardingStatus === 'invited';
```

- [ ] **Step 3: Ensure normal app access stays allowed only for active accounts**

```ts
// src/app/providers/AuthProvider.tsx
const isAuthRequired = !session || isPendingApproval || isRejected || isOnboardingIncomplete;
```

- [ ] **Step 4: Finish the previously failing auth test and add active-account regression coverage**

```tsx
it('allows active accounts into the application', async () => {
  // mock onboardingStatus: 'active'
  // assert normal authenticated behavior
});
```

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/app/providers/AuthProvider.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/providers/AuthProvider.tsx src/app/providers/auth-context.ts src/app/providers/AuthProvider.test.tsx
git commit -m "feat: gate auth by onboarding approval state"
```

---

## Task 3: Create onboarding service foundation

**Files:**
- Create: `src/features/onboarding/types/onboarding.types.ts`
- Create: `src/features/onboarding/services/onboarding.service.ts`
- Create: `src/features/onboarding/services/onboarding.service.test.ts`

- [ ] **Step 1: Define onboarding service types**

```ts
// src/features/onboarding/types/onboarding.types.ts
export type InviteAcceptPayload = {
  profileId: string;
  email: string;
  password: string;
  name: string;
  city: string;
  phone: string;
  collaborationType: string;
  billingName?: string;
  billingStreet?: string;
  billingZip?: string;
  billingCity?: string;
  billingCountry?: string;
  ico?: string;
  dic?: string;
  bank?: string;
};

export type SelfRegistrationPayload = {
  email: string;
  password: string;
  name: string;
  city: string;
  phone: string;
  collaborationType: string;
  billingName?: string;
  billingStreet?: string;
  billingZip?: string;
  billingCity?: string;
  billingCountry?: string;
  ico?: string;
  dic?: string;
  bank?: string;
};
```

- [ ] **Step 2: Write failing tests for invite creation and self-registration payload persistence**

```ts
// src/features/onboarding/services/onboarding.service.test.ts
it('creates an invited profile with invited status and invited email', async () => {
  // expect profiles insert/update payload to contain onboarding_status: 'invited'
});

it('creates a pending approval crew profile from self-registration', async () => {
  // expect role crew + onboarding_status: 'pending_approval'
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm test -- src/features/onboarding/services/onboarding.service.test.ts`
Expected: FAIL because service does not exist yet

- [ ] **Step 4: Implement minimal service skeleton**

```ts
// src/features/onboarding/services/onboarding.service.ts
export const inviteCrewMember = async () => {
  throw new Error('Not implemented');
};

export const registerCrewUser = async () => {
  throw new Error('Not implemented');
};

export const completeInviteOnboarding = async () => {
  throw new Error('Not implemented');
};

export const approveCrewProfile = async () => {
  throw new Error('Not implemented');
};

export const rejectCrewProfile = async () => {
  throw new Error('Not implemented');
};
```

- [ ] **Step 5: Commit**

```bash
git add src/features/onboarding/types/onboarding.types.ts src/features/onboarding/services/onboarding.service.ts src/features/onboarding/services/onboarding.service.test.ts
git commit -m "feat: scaffold onboarding service layer"
```

---

## Task 4: Implement admin invite foundation

**Files:**
- Modify: `src/features/onboarding/services/onboarding.service.ts`
- Modify: `src/features/onboarding/services/onboarding.service.test.ts`
- Modify: `src/features/crew/services/crew.service.ts`

- [ ] **Step 1: Implement invite creation for an existing or pre-created profile**

```ts
// src/features/onboarding/services/onboarding.service.ts
export const inviteCrewMember = async (profileId: string, email: string) => {
  // update profile with:
  // invited_email
  // onboarding_status: 'invited'
  // email if chosen design stores it on profile
  // return invite metadata / token
};
```

- [ ] **Step 2: Add the test expectation for invited profile payload**

```ts
expect(profileUpdate).toHaveBeenCalledWith(expect.objectContaining({
  invited_email: 'invitee@example.com',
  onboarding_status: 'invited',
}));
```

- [ ] **Step 3: Ensure crew service can prepare a minimal profile for invite flow**

```ts
// src/features/crew/services/crew.service.ts
// keep createCrew separate for now, but expose the data shape needed for future invite onboarding
```

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/features/onboarding/services/onboarding.service.test.ts`
Expected: PASS for invite cases

- [ ] **Step 5: Commit**

```bash
git add src/features/onboarding/services/onboarding.service.ts src/features/onboarding/services/onboarding.service.test.ts src/features/crew/services/crew.service.ts
git commit -m "feat: add admin invite onboarding foundation"
```

---

## Task 5: Implement self-registration foundation

**Files:**
- Modify: `src/features/onboarding/services/onboarding.service.ts`
- Modify: `src/features/onboarding/services/onboarding.service.test.ts`

- [ ] **Step 1: Implement self-registration creation**

```ts
// src/features/onboarding/services/onboarding.service.ts
export const registerCrewUser = async (payload: SelfRegistrationPayload) => {
  // create auth user
  // create or upsert profile
  // force onboarding_status: 'pending_approval'
  // force role: crew
};
```

- [ ] **Step 2: Add duplicate-email and active-account rejection tests**

```ts
it('rejects self-registration for an already active account', async () => {
  // expect meaningful domain error
});
```

- [ ] **Step 3: Run focused tests**

Run: `npm test -- src/features/onboarding/services/onboarding.service.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/features/onboarding/services/onboarding.service.ts src/features/onboarding/services/onboarding.service.test.ts
git commit -m "feat: add self-registration foundation"
```

---

## Task 6: Add invite accept page

**Files:**
- Create: `src/pages/InviteAccept.tsx`
- Modify: `src/pages/Index.tsx`
- Modify: `src/features/onboarding/services/onboarding.service.ts`
- Test: `src/features/onboarding/onboarding-flow.integration.test.tsx`

- [ ] **Step 1: Write a failing integration test for invite onboarding**

```tsx
// src/features/onboarding/onboarding-flow.integration.test.tsx
it('loads an invited profile, collects missing data, and completes password setup', async () => {
  // render invite route
  // submit missing fields + password
  // assert onboarding completion + pending or active redirect behavior
});
```

- [ ] **Step 2: Implement the invite accept page UI**

```tsx
// src/pages/InviteAccept.tsx
// fields:
// email, password, name, city, phone, collaborationType
// optional billing + ICO/DIC/bank
// prefill from invite profile when available
```

- [ ] **Step 3: Wire route and submit handler**

```tsx
// src/pages/Index.tsx
<Route path="/invite/:token" element={<InviteAccept />} />
```

- [ ] **Step 4: Run focused test**

Run: `npm test -- src/features/onboarding/onboarding-flow.integration.test.tsx`
Expected: PASS for invite scenario

- [ ] **Step 5: Commit**

```bash
git add src/pages/InviteAccept.tsx src/pages/Index.tsx src/features/onboarding/services/onboarding.service.ts src/features/onboarding/onboarding-flow.integration.test.tsx
git commit -m "feat: add invite accept onboarding flow"
```

---

## Task 7: Add self-registration page

**Files:**
- Create: `src/pages/Register.tsx`
- Create: `src/pages/AuthPendingApproval.tsx`
- Modify: `src/pages/Index.tsx`
- Modify: `src/features/onboarding/onboarding-flow.integration.test.tsx`

- [ ] **Step 1: Add a failing test for self-registration**

```tsx
it('creates a pending approval crew account from self-registration', async () => {
  // render register route
  // fill fields and submit
  // assert pending approval screen
});
```

- [ ] **Step 2: Implement registration page**

```tsx
// src/pages/Register.tsx
// collect required personal fields
// collect optional billing details
// submit to registerCrewUser
```

- [ ] **Step 3: Add pending approval holding page**

```tsx
// src/pages/AuthPendingApproval.tsx
export default function AuthPendingApproval() {
  return <div>Účet čeká na schválení administrátorem.</div>;
}
```

- [ ] **Step 4: Route and redirect**

```tsx
// src/pages/Index.tsx
<Route path="/register" element={<Register />} />
<Route path="/pending-approval" element={<AuthPendingApproval />} />
```

- [ ] **Step 5: Run focused integration tests**

Run: `npm test -- src/features/onboarding/onboarding-flow.integration.test.tsx`
Expected: PASS for self-registration path

- [ ] **Step 6: Commit**

```bash
git add src/pages/Register.tsx src/pages/AuthPendingApproval.tsx src/pages/Index.tsx src/features/onboarding/onboarding-flow.integration.test.tsx
git commit -m "feat: add self-registration pending approval flow"
```

---

## Task 8: Add admin approval UI

**Files:**
- Create: `src/views/PendingApprovalsView.tsx`
- Create: `src/components/modals/ApprovalReviewModal.tsx`
- Modify: `src/features/onboarding/services/onboarding.service.ts`
- Modify: `src/constants.ts`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Write failing test for approval action payload**

```ts
it('approves a pending crew profile with rate tags and collaboration type', async () => {
  // assert profile update payload sets:
  // onboarding_status: 'active'
  // hourly_rate
  // tags
  // collaboration_type
});
```

- [ ] **Step 2: Implement approval / rejection service actions**

```ts
export const approveCrewProfile = async (profileId: string, input: {
  rate: number;
  tags: string[];
  collaborationType: string;
  // editable profile fields...
}) => {
  // update profile
  // set onboarding_status: 'active'
};

export const rejectCrewProfile = async (profileId: string) => {
  // set onboarding_status: 'rejected'
};
```

- [ ] **Step 3: Implement admin pending approvals view**

```tsx
// src/views/PendingApprovalsView.tsx
// list invited + pending profiles
// open ApprovalReviewModal on selection
```

- [ ] **Step 4: Implement approval modal**

```tsx
// src/components/modals/ApprovalReviewModal.tsx
// fields:
// rate, tags, collaborationType, editable profile data
// buttons: approve / reject
```

- [ ] **Step 5: Add navigation entry for allowed admin roles**

```ts
// src/constants.ts
// add nav item e.g. 'Schvalovani'
```

- [ ] **Step 6: Run targeted tests**

Run: `npm test -- src/features/onboarding/services/onboarding.service.test.ts`
Expected: PASS for approve/reject paths

- [ ] **Step 7: Commit**

```bash
git add src/views/PendingApprovalsView.tsx src/components/modals/ApprovalReviewModal.tsx src/features/onboarding/services/onboarding.service.ts src/constants.ts src/components/layout/Sidebar.tsx
git commit -m "feat: add admin approval workflow for crew onboarding"
```

---

## Task 9: Final auth routing and regression pass

**Files:**
- Modify: `src/pages/Index.tsx`
- Modify: `src/app/providers/AuthProvider.tsx`
- Modify: `src/features/onboarding/onboarding-flow.integration.test.tsx`
- Modify: `src/app/providers/AuthProvider.test.tsx`

- [ ] **Step 1: Add rejected-account and incomplete-onboarding routing tests**

```tsx
it('routes rejected accounts to the rejected state page', async () => {
  // assert rejected route behavior
});
```

- [ ] **Step 2: Add final route guard logic**

```tsx
// src/pages/Index.tsx
// if invited -> invite completion route
// if pending -> pending approval page
// if rejected -> rejected page
// if active -> app shell
```

- [ ] **Step 3: Run the full onboarding/auth test set**

Run: `npm test -- src/app/providers/AuthProvider.test.tsx src/features/onboarding/onboarding-flow.integration.test.tsx src/features/onboarding/services/onboarding.service.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/Index.tsx src/app/providers/AuthProvider.tsx src/features/onboarding/onboarding-flow.integration.test.tsx src/app/providers/AuthProvider.test.tsx
git commit -m "feat: finalize onboarding auth route guards"
```

---

## Task 10: Full verification

**Files:**
- Modify: any touched implementation files if verification reveals issues

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Manual smoke checklist**

Run through:

```text
1. Invite an existing crew profile
2. Open invite link
3. Complete missing profile data
4. Set password
5. Confirm pending/active route behavior
6. Self-register a new crew account
7. Verify pending approval state
8. Approve from admin UI with rate/tags/collaboration type
9. Log in with e-mail + password
```

- [ ] **Step 5: Final commit if verification fixes were needed**

```bash
git add .
git commit -m "chore: finalize crew onboarding rollout"
```

---

## Self-Review

### Spec coverage

- Identity + approval foundation: covered in Tasks 1-2.
- Admin invite flow: covered in Tasks 3-4 and 6.
- Self-registration flow: covered in Tasks 3, 5, and 7.
- Admin approval UI: covered in Task 8.
- Login and route behavior: covered in Tasks 2 and 9.
- Full verification: covered in Task 10.

No spec gaps remain at plan level.

### Placeholder scan

- No `TBD` / `TODO` placeholders remain.
- Each task lists exact files and commands.
- Test steps include explicit commands and expected outcomes.

### Type consistency

- `OnboardingStatus` is introduced once and reused consistently.
- `profileId` remains the primary UUID identity across auth and onboarding service actions.
- Approval state is consistently modeled as `invited | pending_approval | active | rejected`.

