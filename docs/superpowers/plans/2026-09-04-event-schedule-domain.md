# Event schedule domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Separate versioned event boundaries from optional planned shifts and actual hours without changing legacy events.

**Architecture:** A pure schedule service owns the version-2 defaulting rules. Existing readers delegate to it for version 2; legacy behavior remains unchanged. No UI or database rollout happens in this first independently tested domain task.

**Tech Stack:** TypeScript, Vitest, date-fns.

---

## Task 1: Versioned defaults and safe incomplete hours

**Files:**
- Modify: `src/types.ts` (Event only).
- Create: `src/features/events/services/event-schedule.ts` and `event-schedule.test.ts`.
- Modify: `src/features/timelogs/services/timelog-day-ui.ts` and its test.
- Modify: `src/utils.ts` and its existing test file.
- Modify: `src/features/events/services/events.service.ts` and its test (schedule normalization/build/sync only).

- [x] Write failing tests for blank multi-day defaults, explicit timed phase, explicit untimed single-day phase, free day, legacy unchanged, multiple phases/day, preparation phase preservation, partial times contributing zero, and existing actual days surviving schedule sync.

```ts
const event: Event = {
  id: 1, name: 'Test', job: 'TEST1', client: '', city: '', needed: 1,
  filled: 0, status: 'planning', startDate: '2026-09-04',
  endDate: '2026-09-06', startTime: '14:00', endTime: '18:00',
  scheduleVersion: 2,
};
expect(resolveTimelogDayDefaults('2026-09-05', event)).toMatchObject({ f: '', t: '' });
expect(resolveTimelogDayDefaults('2026-09-04', { ...event, endDate: event.startDate }))
  .toMatchObject({ f: '14:00', t: '18:00' });
expect(calculateDayHours('', '17:00')).toBe(0);
expect(calculateDayHours('08:00', '')).toBe(0);
expect(calculateDayHours('22:00', '02:00')).toBe(4);
```

- [x] Run `npm test -- src/features/events/services/event-schedule.test.ts src/features/timelogs/services/timelog-day-ui.test.ts src/utils.test.ts --reporter=dot`; expect the new version-2 tests to fail before production edits.
- [x] Extend Event with the following explicit stored contract (missing version means legacy):

```ts
scheduleVersion?: 1 | 2;
/** Explicit whole-day days off; absent dates remain unplanned. */
freeDays?: string[];
```

- [x] Add pure service implementing the following interface and rules. Use calendar-day enumeration via `parseISO` / `addDays` / `format` from date-fns for v2 ranges, never mix UTC conversion with local date increments. All TimelogType values, including `pripravy`, are supported. Complete explicit schedules take precedence; incomplete/unplanned schedules return blanks. Free days return no automatic rows. Entire-event assignment includes unspecified working dates with blank times; specific-phase assignment includes only that phase. Returned days are chronological and include multiple slots. No mutation of input.

```ts
import type { Event, TimelogDay, TimelogType } from '../../../types';
import { parseTimeToMinutes } from '../../../utils';
import { addDays, format, parseISO } from 'date-fns';

const getScheduleDates = (event: Event): string[] => {
  const dates: string[] = [];
  const end = parseISO(event.endDate);
  for (let date = parseISO(event.startDate); date <= end; date = addDays(date, 1)) {
    dates.push(format(date, 'yyyy-MM-dd'));
  }
  return dates;
};

const phases: TimelogType[] = ['pripravy', 'instal', 'provoz', 'deinstal'];
const times = (from = '', to = '') => (
  parseTimeToMinutes(from) !== null && parseTimeToMinutes(to) !== null && from !== to
    ? { f: from, t: to } : { f: '', t: '' }
);

export const resolveEventScheduleDay = (date: string, event: Event, preferredType?: TimelogType): TimelogDay => {
  const type = preferredType ?? event.dayTypes?.[date]
    ?? phases.find((phase) => event.phaseSchedules?.[phase]?.some((slot) => slot.dates.includes(date)))
    ?? 'instal';
  const slot = event.showDayTypes
    ? event.phaseSchedules?.[type]?.find((item) => item.dates.includes(date)) : undefined;
  const free = event.showDayTypes && event.freeDays?.includes(date);
  const interval = free ? times() : slot ? times(slot.from, slot.to)
    : !event.showDayTypes && event.startDate === event.endDate
      ? times(event.startTime, event.endTime) : times();
  return { d: date, ...interval, type, meals: [], meal: null, note: '' };
};

export const buildEventScheduleDays = (event: Event, choices: Array<TimelogType | 'all'> = ['all']): TimelogDay[] => {
  const all = choices.includes('all');
  return getScheduleDates(event).flatMap((date) => {
    if (event.showDayTypes && event.freeDays?.includes(date)) return [];
    if (!event.showDayTypes) return [resolveEventScheduleDay(date, event)];
    const slots = phases.flatMap((type) => (event.phaseSchedules?.[type] ?? [])
      .filter((slot) => slot.dates.includes(date))
      .map((slot) => ({ d: date, ...times(slot.from, slot.to), type })));
    if (slots.length) return slots.filter((slot) => all || choices.includes(slot.type));
    const type = event.dayTypes?.[date];
    if (all || (type && choices.includes(type))) return [resolveEventScheduleDay(date, event, type)];
    return [];
  }).sort((a, b) => `${a.d}${a.f}${a.type}`.localeCompare(`${b.d}${b.f}${b.type}`));
};
```

If `parseTimeToMinutes` is currently private, export the existing helper rather than duplicate it.

- [x] Add a version-2 early return in `resolveTimelogDayDefaults`:

```ts
if (event.scheduleVersion === 2) return resolveEventScheduleDay(date, event, preferredType);
```

- [x] Add version-2 branches in existing schedule helpers:

```ts
// normalizeEventSchedules: before legacy synthesized global-time slots
if (event.scheduleVersion === 2) return event.phaseSchedules ?? {};
// buildTimelogDaysForEvent: before legacy code; fix return annotation to Timelog['days']
if (event.scheduleVersion === 2) return buildEventScheduleDays(event, phaseChoices ?? ['all']);
// getScheduledEventDay: version 2 must never rewrite actual entries
if (event.scheduleVersion === 2) return day;
```

Include `pripravy` when deriving `dayTypes` for v2; preserve the legacy iteration otherwise. An empty explicit choices array returns no phase assignment rows. Undefined choices means all only in v2.

- [x] Replace null-to-midnight conversion inside `calculateDayHours`:

```ts
const fromMinutes = parseTimeToMinutes(from);
const toMinutes = parseTimeToMinutes(to);
if (fromMinutes === null || toMinutes === null) return 0;
```

- [x] Run all affected tests then `npm test -- --reporter=dot`; expect all pass. Check malformed dates cannot hang the new helper; follow existing bounded date utility semantics.
- [x] Commit only task files with `git commit -m "feat: separate event boundaries from planned shift defaults"`.
- [x] Independent spec review, then code-quality review before proceeding to persistence/UI tasks.

## Delivery dependencies

This domain commit does not yet enable v2 on new events. The subsequent persistence plan must store `schedule_version` and `free_days`, permit incomplete draft times atomically, and block incomplete submission. Targeted approvals and the mobile form are required before the overall user request is complete. Legacy values and already entered timelogs must remain unchanged throughout.

## Review-driven date correction

Independent review and a root reproduction with `TZ=Europe/Prague` found the legacy `getDatesBetween('2026-03-28', '2026-03-31')` returns `28,29,29,30`: UTC parsing/output is mixed with local `setDate` during a daylight-saving transition. The plan now explicitly uses calendar-day iteration for v2 only. Add RED/GREEN tests for March 28–31 and October 24–27, checking every day exactly once and correct association of free days and phase slots. Leave the legacy helper unchanged in this bounded task; no historical data migration.
