import { z } from 'zod';

export const categoryLabels = {
  new_shifts: 'Nové směny', applications: 'Přihlášky a odhlášení', shift_changes: 'Změny a zrušení směn',
  reminders: 'Připomínky směn a výkazů', timelogs: 'Výkazy a schvalování', invoices: 'Faktury a úhrady',
  receipts: 'Účtenky', staffing: 'Chybějící obsazení', system: 'Chyby zpracování',
} as const;
export const notificationTarget = z.object({
  tab: z.enum(['events','my-shifts','my-timelogs','timelogs','my-invoices','invoices','my-receipts']),
  eventId: z.string().uuid().optional(), eventTab: z.enum(['crew','overview']).optional(),
  timelogId: z.string().uuid().optional(), invoiceId: z.string().uuid().optional(), receiptId: z.string().uuid().optional(),
  scheduledAt: z.string().optional(),
});
export type NotificationTarget = z.infer<typeof notificationTarget>;
export const notificationSchema = z.object({
  id: z.string().uuid(), recipient_user_id: z.string().uuid(), recipient_profile_id: z.string().uuid(),
  category: z.enum(Object.keys(categoryLabels) as [keyof typeof categoryLabels, ...(keyof typeof categoryLabels)[]]),
  kind: z.string(), title: z.string(), body: z.string(), target: notificationTarget,
  read_at: z.string().nullable(), created_at: z.string(), urgent: z.boolean(), group_key: z.string().nullable(),
});
export type AppNotification = z.infer<typeof notificationSchema>;
export const preferencesSchema = z.object({
  push_enabled: z.boolean(), categories: z.record(z.boolean()), quiet_enabled: z.boolean(),
  quiet_from: z.string().regex(/^\d\d:\d\d(?::\d\d)?$/), quiet_to: z.string().regex(/^\d\d:\d\d(?::\d\d)?$/), timezone: z.string(),
});
export type NotificationPreferences = z.infer<typeof preferencesSchema>;
export const snapshotSchema = z.object({items:z.array(notificationSchema),unread:z.number().int().nonnegative(),asOf:z.string(),preferences:preferencesSchema});
export type NotificationSnapshot = z.infer<typeof snapshotSchema>;
export function parseSnapshot(data: unknown, userId: string, profileId: string): NotificationSnapshot {
  const snapshot = snapshotSchema.parse(data);
  if (snapshot.items.some(n=>n.recipient_user_id!==userId || n.recipient_profile_id!==profileId)) throw new Error('Upozornění nepatří přihlášenému účtu.');
  return snapshot;
}
