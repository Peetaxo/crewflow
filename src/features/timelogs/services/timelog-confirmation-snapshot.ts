import { z } from 'zod';
import type { TimelogChangeSnapshot, TimelogDay } from '../../../types';
import { normalizeMealSelection } from '../../../utils';

const phase = z.enum(['pripravy', 'instal', 'provoz', 'deinstal']);
const meal = z.enum(['obed', 'vecere']);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timestamp = z.string().datetime({ offset: true });
const daySchema = z.object({
  id: z.string().optional(), d: date, f: z.string(), t: z.string(), type: phase,
  note: z.string().nullable().optional(), meal: meal.nullable().optional(), meals: z.array(meal).nullable().optional(),
});
const legacySchema = z.object({
  changedAt: timestamp,
  before: z.object({ days: z.array(daySchema), km: z.number().finite().nonnegative(), note: z.string() }),
}).strict();
const storedSchema = z.object({
  id: z.string(), event_id: z.string(), contractor_id: z.string(),
  km: z.number().finite().nonnegative().nullable(), note: z.string().nullable(),
  days: z.array(z.object({
    id: z.string(), date, time_from: z.string().nullable(), time_to: z.string().nullable(), day_type: phase,
    note: z.string().nullable(), meal: meal.nullable(), meals: z.array(meal),
  })),
});

const normalizedDay = (day: TimelogDay): TimelogDay => {
  const meals = normalizeMealSelection(day);
  return { ...day, meals, meal: meals[0] ?? null, note: day.note ?? '' };
};

/** Reads old UI-shaped snapshots and the new server-owned full before image. */
export function mapTimelogConfirmationSnapshot(value: unknown, current: {
  id: string; event_id: string; contractor_id: string; updated_at: string;
}): TimelogChangeSnapshot | null {
  if (value == null) return null;
  const invalid = () => new Error('Nepodařilo se ověřit historii úprav výkazu. Obnovte data.');
  if (typeof value === 'object' && !Array.isArray(value)
    && ('before' in value || 'changedAt' in value)
    && ('id' in value || 'event_id' in value || 'contractor_id' in value)) throw invalid();
  const legacy = legacySchema.safeParse(value);
  if (legacy.success) return {
    changedAt: legacy.data.changedAt,
    before: { km: legacy.data.before.km, note: legacy.data.before.note, days: legacy.data.before.days.map((d) => normalizedDay({
      id: d.id, d: d.d, f: d.f, t: d.t, type: d.type, meal: d.meal, meals: d.meals, note: d.note ?? '',
    })) },
  };
  const stored = storedSchema.safeParse(value);
  if (!stored.success || stored.data.id !== current.id || stored.data.event_id !== current.event_id
    || stored.data.contractor_id !== current.contractor_id || !timestamp.safeParse(current.updated_at).success) {
    throw invalid();
  }
  return {
    // Compatibility value for the existing difference view, not an audit time.
    // The immutable action row, not this before image, owns the correction time.
    changedAt: current.updated_at,
    before: { km: stored.data.km ?? 0, note: stored.data.note ?? '', days: stored.data.days.map((d) => normalizedDay({
      id: d.id, d: d.date, f: d.time_from ?? '', t: d.time_to ?? '', type: d.day_type,
      meal: d.meal, meals: d.meals, note: d.note ?? '',
    })) },
  };
}
