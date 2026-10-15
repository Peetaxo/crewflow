import { billingUuid, billingVersion, type BillingStatement } from './contract';
import type { Contractor } from '../../types';
/** Names already available within the current authorized data scope. */
export type BillingActor = Pick<Contractor, 'name' | 'profileId' | 'userId'>;
export function billingActorName(actors: readonly BillingActor[], ids: { profileId?: string | null; userId?: string | null }): string {
  if (!ids.profileId && !ids.userId) return 'Autor není zaznamenán';
  const actor = actors.find((a) => (!ids.profileId || a.profileId === ids.profileId) && (!ids.userId || a.userId === ids.userId));
  return actor?.name.trim() || 'Jméno není dostupné';
}
export function billingSourceApproval(source: BillingStatement['sources'][number]) {
  const snapshot = source.sourceSnapshot;
  const approval = snapshot.approval?.status === 'approved' ? snapshot.approval : null;
  const id = (value: unknown) => { const parsed = billingUuid.safeParse(value); return parsed.success ? parsed.data : null; };
  const time = billingVersion.safeParse(approval?.resolvedAt);
  const userId = snapshot.approvedBy ?? id(approval?.approverUserId);
  return { userId, profileId: userId === approval?.approverUserId ? id(approval?.approverProfileId) : null,
    approvedAt: snapshot.approvedAt ?? (time.success ? time.data : null) };
}
