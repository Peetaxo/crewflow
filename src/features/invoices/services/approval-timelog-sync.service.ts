import type {
  Contractor,
  Event,
  EventCrewAssignment,
  GrasonEventConfirmation,
  InvoiceApprovalDocument,
  Timelog,
  TimelogDay,
  TimelogType,
} from '../../../types';
import { getDatesBetween } from '../../../utils';
import { createTimelog, saveTimelog } from '../../timelogs/services/timelogs.service';

export type ApprovalTimelogPreviewStatus = 'ready' | 'needs_review' | 'blocked' | 'applied';

export interface ApprovalTimelogPreviewRow {
  id: string;
  status: ApprovalTimelogPreviewStatus;
  reason: string;
  documentId: string;
  documentName: string;
  document: InvoiceApprovalDocument;
  approvalStatusLabel: string;
  jobNumber: string;
  invoiceNumber: string;
  eventName: string;
  personName: string;
  matchedEvent: Event | null;
  matchedContractor: Contractor | null;
  proposedDays: TimelogDay[];
  existingTimelogId: number | null;
}

interface BuildApprovalTimelogPreviewInput {
  approvalDocuments: InvoiceApprovalDocument[];
  events: Event[];
  contractors: Contractor[];
  timelogs: Timelog[];
  eventCrewAssignments: EventCrewAssignment[];
  grasonConfirmations: GrasonEventConfirmation[];
}

interface ApplyApprovalTimelogPreviewDependencies {
  timelogs: Timelog[];
}

interface ParsedCommentEntry {
  source: string;
  date: string | null;
  from: string | null;
  to: string | null;
  hours: number | null;
  isFlatRate: boolean;
}

interface ParsedApprovalTimelogComment {
  eventName: string;
  personName: string;
  entries: ParsedCommentEntry[];
}

interface EventMatchResult {
  event: Event | null;
  reason: string | null;
}

interface GroupedEntry {
  event: Event;
  entries: ParsedCommentEntry[];
}

interface IndexedSearchText {
  text: string;
  originalIndexes: number[];
}

interface PersonSection {
  personName: string;
  start: number;
  end: number;
  body: string;
}

const DEFAULT_PHASE: TimelogType = 'instal';
const DATE_WITH_OPTIONAL_YEAR_PATTERN = /\b(\d{1,2})\.\s*(\d{1,2})(?:\.\s*(\d{2,4})(?!\s*:))?/;
const DATE_OCCURRENCE_PATTERN = /\b\d{1,2}\.\s*\d{1,2}(?:\.\s*\d{2,4}(?!\s*:))?/g;
const EVENT_NAME_STOP_TOKENS = new Set([
  'bude',
  'cas',
  'deinstal',
  'deinstalace',
  'instal',
  'instalace',
  'pausal',
  'provoz',
  'upresneno',
]);
const TRUSTED_UNIQUE_JOB_DATE_FALLBACKS = new Set(['eit18', 'bmw129']);
const TIME_CONFLICT_REASON = 'Clen crew ma ve stejnem case jinou akci.';

const normalizeAscii = (value: string | null | undefined): string => (
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
);

const normalizeToken = (value: string | null | undefined): string => (
  normalizeAscii(value).replace(/[^a-z0-9]+/g, '')
);

const normalizeJobNumber = (value: string | null | undefined): string => (
  normalizeAscii(value)
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^([a-z]+)0+(\d+)$/, '$1$2')
);

const toDateKey = (year: number, month: number, day: number): string => {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return '';
  }

  return date.toISOString().slice(0, 10);
};

const inferYear = (document: InvoiceApprovalDocument, explicitYear: string | undefined): number => {
  if (explicitYear) {
    const parsed = Number(explicitYear);
    if (Number.isFinite(parsed)) {
      return parsed < 100 ? 2000 + parsed : parsed;
    }
  }

  const syncedYear = Number((document.lastSyncedAt || document.createdAt || '').slice(0, 4));
  return Number.isFinite(syncedYear) && syncedYear > 2000 ? syncedYear : new Date().getFullYear();
};

const parseDecimal = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeTime = (hour: string, minute?: string): string => (
  `${hour.padStart(2, '0')}:${(minute ?? '00').padStart(2, '0')}`
);

const minutesFromTime = (time: string): number => {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};

const timeFromMinutes = (totalMinutes: number): string => {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const addHours = (time: string, hours: number): string => (
  timeFromMinutes(minutesFromTime(time) + Math.round(hours * 60))
);

const escapeRegExp = (value: string): string => (
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
);

const toIndexedSearchText = (value: string): IndexedSearchText => {
  const chars: string[] = [];
  const originalIndexes: number[] = [];

  Array.from(value).forEach((char, originalIndex) => {
    const normalized = char
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const ascii = normalized.replace(/[^a-z0-9]+/g, ' ');

    Array.from(ascii || ' ').forEach((outputChar) => {
      chars.push(outputChar);
      originalIndexes.push(originalIndex);
    });
  });

  return {
    text: chars.join(''),
    originalIndexes,
  };
};

const splitCommentSegments = (comment: string): string[] => (
  comment
    .split(/\r?\n|[|]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
);

const isTotalSegment = (segment: string): boolean => (
  normalizeAscii(segment).startsWith('celkem')
);

const hasDate = (segment: string): boolean => /\b\d{1,2}\.\s*\d{1,2}/.test(segment);

const contractorMatchesName = (candidate: string, contractor: Contractor): boolean => {
  const candidateToken = normalizeToken(candidate);
  const names = [contractor.name, contractor.billingName].filter((name): name is string => Boolean(name));

  return names.some((name) => {
    const nameToken = normalizeToken(name);
    if (!candidateToken || !nameToken) return false;
    if (candidateToken === nameToken) return true;

    const parts = normalizeAscii(name)
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length >= 3);
    return parts.length >= 2 && parts.every((part) => candidateToken.includes(part));
  });
};

const contractorLooseNameMatches = (candidate: string, contractor: Contractor): boolean => {
  const candidateToken = normalizeToken(candidate);
  const candidateWords = normalizeAscii(candidate)
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 4);
  if (!candidateToken || candidateWords.length === 0) return false;

  return [contractor.name, contractor.billingName]
    .filter((name): name is string => Boolean(name))
    .some((name) => {
      const contractorWords = normalizeAscii(name)
        .split(/[^a-z0-9]+/)
        .filter((part) => part.length >= 4);

      return contractorWords.some((contractorWord) => (
        candidateWords.some((candidateWord) => contractorWord.startsWith(candidateWord))
        || candidateToken.includes(contractorWord)
      ));
    });
};

const findUniqueLooseContractorByName = (
  personName: string,
  contractors: Contractor[],
): Contractor | null => {
  const matches = contractors.filter((contractor) => contractorLooseNameMatches(personName, contractor));
  const uniqueByProfile = new Map(matches.map((contractor) => [contractor.profileId ?? contractor.name, contractor]));
  return uniqueByProfile.size === 1 ? [...uniqueByProfile.values()][0] : null;
};

const findContractorByName = (personName: string, contractors: Contractor[]): Contractor | null => (
  contractors.find((contractor) => contractorMatchesName(personName, contractor))
  ?? findUniqueLooseContractorByName(personName, contractors)
);

const findContractorForDocumentPerson = (
  personName: string,
  document: InvoiceApprovalDocument,
  contractors: Contractor[],
): Contractor | null => {
  const direct = findContractorByName(personName, contractors);
  if (direct) return direct;

  const documentNameCandidate = document.documentName.replace(/\.[a-z0-9]+$/i, '');
  return findContractorByName(documentNameCandidate, contractors)
    ?? findContractorByName(document.supplierName, contractors);
};

const looksLikePersonName = (segment: string): boolean => {
  const normalized = normalizeAscii(segment);
  if (!normalized || /festival|summit|hotel|instal|deinstal|provoz|nakladka|uklid|riegrovy|elimon/.test(normalized)) {
    return false;
  }

  return segment.split(/\s+/).filter(Boolean).length >= 2;
};

const findCommentPersonName = (segments: string[], contractors: Contractor[]): string => {
  const possiblePersonSegments = segments
    .filter((segment) => !hasDate(segment) && !isTotalSegment(segment))
    .slice(1);

  const exact = possiblePersonSegments.find((segment) => findContractorByName(segment, contractors));
  if (exact) return exact;

  return possiblePersonSegments.find(looksLikePersonName) ?? '';
};

const parseCommentEntry = (
  segment: string,
  document: InvoiceApprovalDocument,
): ParsedCommentEntry | null => {
  const dateMatch = segment.match(DATE_WITH_OPTIONAL_YEAR_PATTERN);
  if (!dateMatch) return null;

  const year = inferYear(document, dateMatch[3]);
  const date = toDateKey(year, Number(dateMatch[2]), Number(dateMatch[1]));
  if (!date) return null;

  const timeSource = segment.slice((dateMatch.index ?? 0) + dateMatch[0].length);
  const timeMatch = timeSource.match(/(?:^|[\s-])(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?(?=\s|$|\()/);
  const startOnlyTimeMatch = timeMatch
    ? null
    : timeSource.match(/(?:^|[\s-])(\d{1,2})(?::(\d{2}))?\s*(?=(?:[-–]\s*)?(?:(?:[\d.,]+\s*h\s*)?(?:paus|pauš)|[\d.,]+\s*h\b|\(|$))/i);
  const hoursMatch = segment.match(/\(([\d.,]+)\s*h\)/i) ?? segment.match(/\b([\d.,]+)\s*h\b/i);
  const normalized = normalizeAscii(segment);

  return {
    source: segment,
    date,
    from: timeMatch
      ? normalizeTime(timeMatch[1], timeMatch[2])
      : startOnlyTimeMatch
        ? normalizeTime(startOnlyTimeMatch[1], startOnlyTimeMatch[2])
        : null,
    to: timeMatch ? normalizeTime(timeMatch[3], timeMatch[4]) : null,
    hours: parseDecimal(hoursMatch?.[1]),
    isFlatRate: normalized.includes('pausal') || normalized.includes('paus al') || normalized.includes('pausál'),
  };
};

const parseDatelessHoursEntry = (segment: string): ParsedCommentEntry | null => {
  const hoursMatch = segment.match(/\(([\d.,]+)\s*h\)/i) ?? segment.match(/\b([\d.,]+)\s*h\b/i);
  const hours = parseDecimal(hoursMatch?.[1]);
  if (hours == null) return null;

  const normalized = normalizeAscii(segment);
  return {
    source: segment,
    date: null,
    from: null,
    to: null,
    hours,
    isFlatRate: normalized.includes('pausal') || normalized.includes('paus al') || normalized.includes('pausál'),
  };
};

const parseCommentEntries = (
  text: string,
  document: InvoiceApprovalDocument,
  options: { allowDateless?: boolean } = {},
): ParsedCommentEntry[] => {
  const dateMatches = [...text.matchAll(DATE_OCCURRENCE_PATTERN)];
  if (dateMatches.length === 0 && options.allowDateless) {
    const parsed = parseDatelessHoursEntry(text);
    return parsed ? [parsed] : [];
  }

  if (dateMatches.length <= 1) {
    const parsed = parseCommentEntry(text, document);
    return parsed ? [parsed] : [];
  }

  return dateMatches
    .map((match, index) => {
      const start = match.index ?? 0;
      const nextStart = dateMatches[index + 1]?.index ?? text.length;
      return text.slice(start, nextStart).trim();
    })
    .map((segment) => parseCommentEntry(segment, document))
    .filter((entry): entry is ParsedCommentEntry => Boolean(entry));
};

const findPersonNameRanges = (
  comment: string,
  contractors: Contractor[],
): PersonSection[] => {
  const indexed = toIndexedSearchText(comment);
  const ranges = contractors.flatMap((contractor) => (
    [contractor.name, contractor.billingName]
      .filter((name): name is string => Boolean(name))
      .flatMap((name) => {
        const tokens = normalizeAscii(name)
          .split(/[^a-z0-9]+/)
          .filter((token) => token.length >= 3);
        if (tokens.length < 2) return [];

        const pattern = new RegExp(`\\b${tokens.map(escapeRegExp).join('\\s+')}\\b`, 'g');
        const matches = [...indexed.text.matchAll(pattern)];
        return matches
          .map((match) => {
            const normalizedStart = match.index ?? 0;
            const normalizedEnd = normalizedStart + match[0].length - 1;
            const start = indexed.originalIndexes[normalizedStart];
            const end = indexed.originalIndexes[normalizedEnd] + 1;
            if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

            return {
              personName: comment.slice(start, end).trim(),
              start,
              end,
              length: end - start,
            };
          })
          .filter((range): range is { personName: string; start: number; end: number; length: number } => Boolean(range));
      })
  ))
    .sort((left, right) => (
      left.start - right.start
      || right.length - left.length
    ));

  const nonOverlapping = ranges.reduce<typeof ranges>((acc, range) => {
    const previous = acc[acc.length - 1];
    if (previous && range.start < previous.end) return acc;
    acc.push(range);
    return acc;
  }, []);

  return nonOverlapping.map((range, index) => ({
    personName: range.personName,
    start: range.start,
    end: range.end,
    body: comment.slice(range.end, nonOverlapping[index + 1]?.start ?? comment.length).trim(),
  }));
};

const parseApprovalTimelogComment = (
  document: InvoiceApprovalDocument,
  contractors: Contractor[],
): ParsedApprovalTimelogComment => {
  const segments = splitCommentSegments(document.comment);
  const contentSegments = segments.filter((segment) => !hasDate(segment) && !isTotalSegment(segment));
  const eventName = contentSegments[0] ?? '';
  const personName = findCommentPersonName(segments, contractors)
    || document.supplierName
    || document.documentName.replace(/\.[a-z0-9]+$/i, '').replace(/\s+-\s+.*$/, '').trim();

  return {
    eventName,
    personName,
    entries: segments.flatMap((segment) => parseCommentEntries(segment, document)),
  };
};

const parseApprovalTimelogComments = (
  document: InvoiceApprovalDocument,
  contractors: Contractor[],
): ParsedApprovalTimelogComment[] => {
  const personSections = findPersonNameRanges(document.comment, contractors);
  if (personSections.length > 0) {
    const eventName = document.comment.slice(0, personSections[0].start).trim();
    const parsedSections = personSections
      .map((section) => ({
        eventName,
        personName: section.personName,
        entries: parseCommentEntries(section.body, document, { allowDateless: true }),
      }))
      .filter((section) => section.entries.length > 0);

    if (parsedSections.length === personSections.length) {
      return parsedSections;
    }
  }

  return [parseApprovalTimelogComment(document, contractors)];
};

const eventNameMatches = (candidate: string, event: Event): boolean => {
  const candidateToken = normalizeToken(candidate);
  const eventToken = normalizeToken(event.name);

  return Boolean(
    candidateToken
    && eventToken
    && (eventToken.includes(candidateToken) || candidateToken.includes(eventToken))
  );
};

const eventContainsDate = (event: Event, date: string): boolean => (
  getDatesBetween(event.startDate, event.endDate).includes(date)
);

const getEventStartTimesForDate = (event: Event, date: string): string[] => {
  const starts = new Set<string>();
  if (event.startTime) starts.add(event.startTime);

  Object.values(event.phaseTimes ?? {}).forEach((phaseTime) => {
    if (phaseTime?.from) starts.add(phaseTime.from);
  });

  Object.values(event.phaseSchedules ?? {}).forEach((slots) => {
    (slots ?? []).forEach((slot) => {
      if (slot.dates.includes(date) && slot.from) starts.add(slot.from);
    });
  });

  return [...starts];
};

const eventTimeMatchesEntry = (event: Event, entry: ParsedCommentEntry): boolean => (
  Boolean(entry.date && entry.from && getEventStartTimesForDate(event, entry.date).includes(entry.from))
);

const getMeaningfulEventTokens = (value: string): string[] => (
  normalizeAscii(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !EVENT_NAME_STOP_TOKENS.has(token))
);

const getClosestStartDistance = (event: Event, entry: ParsedCommentEntry): number | null => {
  if (!entry.date || !entry.from) return null;
  const entryMinutes = minutesFromTime(entry.from);
  const distances = getEventStartTimesForDate(event, entry.date)
    .map((start) => Math.abs(minutesFromTime(start) - entryMinutes));

  if (distances.length === 0) return null;
  return Math.min(...distances);
};

const scoreEventNameValue = (
  eventName: string,
  document: InvoiceApprovalDocument,
  parsed: ParsedApprovalTimelogComment,
): number => {
  const parsedToken = normalizeToken(parsed.eventName);
  const eventToken = normalizeToken(eventName);
  if (!parsedToken || !eventToken) return 0;

  if (parsedToken === eventToken) return 240;
  if (parsedToken.includes(eventToken)) return 120 + Math.min(eventToken.length, 80);
  if (eventToken.includes(parsedToken)) return 110 + Math.min(parsedToken.length, 80);
  if (normalizeAscii(document.comment).includes(normalizeAscii(eventName))) {
    return 80 + Math.min(eventToken.length, 60);
  }

  const parsedTokens = getMeaningfulEventTokens(parsed.eventName);
  const eventTokens = getMeaningfulEventTokens(eventName);
  const sharedTokens = eventTokens.filter((token) => parsedTokens.includes(token));
  if (sharedTokens.length > 0) {
    return 70
      + sharedTokens.length * 35
      + Math.max(...sharedTokens.map((token) => token.length));
  }

  return 0;
};

const scoreEventName = (
  document: InvoiceApprovalDocument,
  parsed: ParsedApprovalTimelogComment,
  event: Event,
): number => scoreEventNameValue(event.name, document, parsed);

const scoreEventMatch = (
  document: InvoiceApprovalDocument,
  parsed: ParsedApprovalTimelogComment,
  entry: ParsedCommentEntry,
  event: Event,
  evidenceNameScore = 0,
): number => {
  let score = scoreEventName(document, parsed, event) + evidenceNameScore;
  const startDistance = getClosestStartDistance(event, entry);

  if (startDistance != null) {
    score += startDistance === 0 ? 160 : Math.max(0, 90 - startDistance);
  }

  if (event.startTime) score += 8;

  return score;
};

const matchEventForEntry = (
  document: InvoiceApprovalDocument,
  parsed: ParsedApprovalTimelogComment,
  entry: ParsedCommentEntry,
  events: Event[],
  getCandidateBonus: (event: Event) => number = () => 0,
  getCandidateNameScore: (event: Event) => number = () => 0,
): EventMatchResult => {
  const documentJob = normalizeJobNumber(document.jobNumber);
  const dateCandidates = entry.date
    ? events.filter((event) => eventContainsDate(event, entry.date as string))
    : events;
  const jobCandidates = dateCandidates.filter((event) => (
    documentJob && normalizeJobNumber(event.job) === documentJob
  ));
  const hasSpecificEventName = getMeaningfulEventTokens(parsed.eventName).length > 0;
  const scoreCandidateName = (event: Event): number => (
    scoreEventName(document, parsed, event) + getCandidateNameScore(event)
  );
  const nameCandidates = hasSpecificEventName
    ? dateCandidates.filter((event) => scoreCandidateName(event) > 0)
    : [];
  const jobCandidatesWithName = hasSpecificEventName
    ? jobCandidates.filter((event) => scoreCandidateName(event) > 0)
    : jobCandidates;
  const canUseTrustedUniqueJobDateFallback = Boolean(
    entry.date
    && TRUSTED_UNIQUE_JOB_DATE_FALLBACKS.has(documentJob)
    && jobCandidates.length === 1,
  );
  const candidates = jobCandidatesWithName.length > 0
    ? jobCandidatesWithName
    : nameCandidates.length > 0
      ? nameCandidates
      : canUseTrustedUniqueJobDateFallback
        ? jobCandidates
      : hasSpecificEventName
        ? []
        : jobCandidates;

  if (candidates.length === 0) {
    return { event: null, reason: 'Nenasel jsem akci podle job number a data.' };
  }

  if (candidates.length === 1) {
    return { event: candidates[0], reason: null };
  }

  const scored = candidates
    .map((event) => ({
      event,
      score: scoreEventMatch(document, parsed, entry, event, getCandidateNameScore(event))
        + getCandidateBonus(event),
    }))
    .sort((left, right) => right.score - left.score);
  const [best, secondBest] = scored;

  if (best && best.score > 0 && (!secondBest || best.score > secondBest.score)) {
    return { event: best.event, reason: null };
  }

  if (candidates.some((event) => eventTimeMatchesEntry(event, entry))) {
    return { event: null, reason: 'Komentar odpovida vice akcim.' };
  }

  return { event: null, reason: 'Komentar odpovida vice akcim.' };
};

const inferPhase = (value: string): TimelogType => {
  const normalized = normalizeAscii(value);
  if (normalized.includes('deinstal')) return 'deinstal';
  if (normalized.includes('provoz')) return 'provoz';
  return DEFAULT_PHASE;
};

const getScheduledPhaseForDate = (
  event: Event,
  date: string,
): { type: TimelogType; from: string | null; to: string | null } => {
  const scheduled = (Object.entries(event.phaseSchedules ?? {}) as Array<[TimelogType, NonNullable<Event['phaseSchedules']>[TimelogType]]>)
    .flatMap(([type, slots]) => (slots ?? []).map((slot) => ({ type, slot })))
    .find(({ slot }) => slot.dates.includes(date));

  if (scheduled) {
    return {
      type: scheduled.type,
      from: scheduled.slot.from,
      to: scheduled.slot.to,
    };
  }

  const dayType = event.dayTypes?.[date];
  const fallbackType = dayType ?? inferPhase(event.name);
  return {
    type: fallbackType,
    from: event.phaseTimes?.[fallbackType]?.from ?? event.startTime ?? null,
    to: event.phaseTimes?.[fallbackType]?.to ?? event.endTime ?? null,
  };
};

const durationHoursBetween = (from: string, to: string): number => {
  let diff = minutesFromTime(to) - minutesFromTime(from);
  if (diff < 0) diff += 24 * 60;
  return diff / 60;
};

const getScheduledTimelogDaysForEvent = (event: Event): TimelogDay[] => {
  const fromPhaseSchedules = (Object.entries(event.phaseSchedules ?? {}) as Array<[TimelogType, NonNullable<Event['phaseSchedules']>[TimelogType]]>)
    .flatMap(([type, slots]) => (slots ?? []).flatMap((slot) => (
      slot.dates.map((date) => ({
        d: date,
        f: slot.from,
        t: slot.to,
        type,
      }))
    )));

  if (fromPhaseSchedules.length > 0) {
    return sortDays(fromPhaseSchedules);
  }

  if (!event.startDate || !event.startTime || !event.endTime) return [];

  return getDatesBetween(event.startDate, event.endDate)
    .map((date) => ({
      d: date,
      f: event.startTime as string,
      t: event.endTime as string,
      type: event.dayTypes?.[date] ?? inferPhase(event.name),
    }));
};

const resolveDatelessTimelogDays = (entry: ParsedCommentEntry, event: Event): TimelogDay[] | null => {
  const scheduledDays = getScheduledTimelogDaysForEvent(event);
  if (scheduledDays.length === 0) return null;

  const targetHours = entry.isFlatRate ? 5 : entry.hours;
  if (targetHours == null) return scheduledDays;

  const scheduledHours = scheduledDays.reduce((sum, day) => sum + durationHoursBetween(day.f, day.t), 0);
  if (Math.abs(scheduledHours - targetHours) <= 0.25) return scheduledDays;

  if (scheduledDays.length === 1) {
    const day = scheduledDays[0];
    return [{ ...day, t: addHours(day.f, targetHours) }];
  }

  return null;
};

const resolveTimelogDay = (entry: ParsedCommentEntry, event: Event): TimelogDay | null => {
  if (!entry.date) return null;

  const scheduled = getScheduledPhaseForDate(event, entry.date);
  const from = entry.from ?? scheduled.from;
  if (!from) return null;

  const hours = entry.isFlatRate ? 5 : entry.hours;
  const to = entry.isFlatRate ? addHours(from, 5) : entry.to ?? (hours != null ? addHours(from, hours) : scheduled.to);
  if (!to) return null;

  return {
    d: entry.date,
    f: from,
    t: to,
    type: scheduled.type,
  };
};

const resolveTimelogDaysForEntry = (entry: ParsedCommentEntry, event: Event): TimelogDay[] | null => {
  if (!entry.date) return resolveDatelessTimelogDays(entry, event);

  const day = resolveTimelogDay(entry, event);
  return day ? [day] : null;
};

const eventAssignmentMatches = (
  event: Event,
  contractor: Contractor,
  assignment: EventCrewAssignment,
): boolean => (
  assignment.contractorProfileId === contractor.profileId
  && (
    assignment.eventId === event.id
    || Boolean(event.supabaseId && assignment.eventSupabaseId === event.supabaseId)
  )
);

const grasonConfirmationMatches = (
  event: Event,
  contractor: Contractor,
  confirmation: GrasonEventConfirmation,
): boolean => {
  const personMatches = confirmation.profileId === contractor.profileId
    || contractorMatchesName(confirmation.confirmedName, contractor);

  if (!personMatches) return false;

  return (
    Boolean(event.supabaseId && confirmation.eventId === event.supabaseId)
    || (
      !confirmation.eventId
      && eventContainsDate(event, confirmation.shiftDate)
      && normalizeJobNumber(event.job) === normalizeJobNumber(confirmation.jobNumber)
      && eventNameMatches(confirmation.eventName, event)
    )
  );
};

const grasonConfirmationRelatesToEntry = (
  event: Event,
  contractor: Contractor,
  document: InvoiceApprovalDocument,
  entry: ParsedCommentEntry,
  confirmation: GrasonEventConfirmation,
): boolean => {
  const personMatches = confirmation.profileId === contractor.profileId
    || contractorMatchesName(confirmation.confirmedName, contractor);
  if (!personMatches) return false;

  const eventMatches = Boolean(event.supabaseId && confirmation.eventId === event.supabaseId);
  if (!eventMatches) return false;

  if (entry.date && confirmation.shiftDate && confirmation.shiftDate !== entry.date) return false;

  const documentJob = normalizeJobNumber(document.jobNumber);
  const confirmationJob = normalizeJobNumber(confirmation.jobNumber);
  const eventJob = normalizeJobNumber(event.job);
  return !documentJob || confirmationJob === documentJob || eventJob === documentJob;
};

const getGrasonEvidenceNameScore = (
  event: Event,
  contractor: Contractor,
  document: InvoiceApprovalDocument,
  parsed: ParsedApprovalTimelogComment,
  entry: ParsedCommentEntry,
  input: BuildApprovalTimelogPreviewInput,
): number => {
  const scores = input.grasonConfirmations
    .filter((confirmation) => grasonConfirmationRelatesToEntry(event, contractor, document, entry, confirmation))
    .map((confirmation) => scoreEventNameValue(confirmation.eventName, document, parsed));

  return scores.length > 0 ? Math.max(...scores) : 0;
};

const findExistingTimelog = (
  event: Event,
  contractor: Contractor,
  timelogs: Timelog[],
): Timelog | null => (
  contractor.profileId
    ? timelogs.find((timelog) => (
      timelog.eid === event.id && timelog.contractorProfileId === contractor.profileId
    )) ?? null
    : null
);

const isContractorAssigned = (
  event: Event,
  contractor: Contractor,
  input: BuildApprovalTimelogPreviewInput,
): boolean => (
  Boolean(findExistingTimelog(event, contractor, input.timelogs))
  || input.eventCrewAssignments.some((assignment) => eventAssignmentMatches(event, contractor, assignment))
  || input.grasonConfirmations.some((confirmation) => grasonConfirmationMatches(event, contractor, confirmation))
);

const sortDays = (days: TimelogDay[]): TimelogDay[] => (
  [...days].sort((left, right) => `${left.d}${left.f}${left.type}`.localeCompare(`${right.d}${right.f}${right.type}`))
);

const timelogDayKey = (day: TimelogDay): string => `${day.d}|${day.f}|${day.t}|${day.type}`;

const timelogDaysMatch = (left: TimelogDay[], right: TimelogDay[]): boolean => {
  const sortedLeft = sortDays(left).map(timelogDayKey);
  const sortedRight = sortDays(right).map(timelogDayKey);
  return sortedLeft.length === sortedRight.length
    && sortedLeft.every((value, index) => value === sortedRight[index]);
};

const isAlreadyAppliedTimelog = (
  timelog: Timelog | null,
  proposedDays: TimelogDay[],
  documentName: string,
): boolean => (
  Boolean(
    timelog
    && ['approved', 'invoiced', 'paid'].includes(timelog.status)
    && (
      timelog.note.includes(`PowerApps: ${documentName}`)
      || timelogDaysMatch(timelog.days, proposedDays)
    ),
  )
);

const dateOrdinal = (date: string): number | null => {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 86_400_000);
};

const toAbsoluteInterval = (day: TimelogDay): { start: number; end: number } | null => {
  const ordinal = dateOrdinal(day.d);
  if (ordinal == null) return null;

  const startMinutes = minutesFromTime(day.f);
  const endMinutes = minutesFromTime(day.t);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return null;

  const start = ordinal * 24 * 60 + startMinutes;
  let end = ordinal * 24 * 60 + endMinutes;
  if (end <= start) end += 24 * 60;

  return { start, end };
};

const timelogDaysOverlap = (left: TimelogDay, right: TimelogDay): boolean => {
  const leftInterval = toAbsoluteInterval(left);
  const rightInterval = toAbsoluteInterval(right);
  if (!leftInterval || !rightInterval) return false;

  return leftInterval.start < rightInterval.end && rightInterval.start < leftInterval.end;
};

const hasOverlappingTimelog = (
  event: Event,
  contractor: Contractor,
  proposedDays: TimelogDay[],
  timelogs: Timelog[],
): boolean => {
  if (!contractor.profileId || proposedDays.length === 0) return false;

  return timelogs.some((timelog) => (
    timelog.contractorProfileId === contractor.profileId
    && timelog.eid !== event.id
    && timelog.days.some((existingDay) => (
      proposedDays.some((proposedDay) => timelogDaysOverlap(existingDay, proposedDay))
    ))
  ));
};

const groupEntriesByEvent = (
  document: InvoiceApprovalDocument,
  parsed: ParsedApprovalTimelogComment,
  input: BuildApprovalTimelogPreviewInput,
  contractor: Contractor,
): { groups: GroupedEntry[]; reviewReasons: string[] } => {
  const groups = new Map<number, GroupedEntry>();
  const reviewReasons: string[] = [];

  parsed.entries.forEach((entry) => {
    const match = matchEventForEntry(
      document,
      parsed,
      entry,
      input.events,
      (event) => (isContractorAssigned(event, contractor, input) ? 260 : 0),
      (event) => getGrasonEvidenceNameScore(event, contractor, document, parsed, entry, input),
    );
    if (!match.event) {
      reviewReasons.push(match.reason ?? 'Komentar se nepodarilo sparovat s akci.');
      return;
    }

    const current = groups.get(match.event.id) ?? { event: match.event, entries: [] };
    current.entries.push(entry);
    groups.set(match.event.id, current);
  });

  return {
    groups: [...groups.values()],
    reviewReasons,
  };
};

const makeBaseRow = (
  document: InvoiceApprovalDocument,
  parsed: ParsedApprovalTimelogComment,
  index: number,
): Omit<ApprovalTimelogPreviewRow, 'status' | 'reason' | 'matchedEvent' | 'matchedContractor' | 'proposedDays' | 'existingTimelogId'> => ({
  id: `${document.id}:${index}`,
  documentId: document.id,
  documentName: document.documentName,
  document,
  approvalStatusLabel: document.approvalStatusLabel,
  jobNumber: document.jobNumber,
  invoiceNumber: document.invoiceNumber,
  eventName: parsed.eventName,
  personName: parsed.personName,
});

export const buildApprovalTimelogPreview = (
  input: BuildApprovalTimelogPreviewInput,
): ApprovalTimelogPreviewRow[] => {
  const rows: ApprovalTimelogPreviewRow[] = [];

  input.approvalDocuments.forEach((document) => {
    const parsedComments = parseApprovalTimelogComments(document, input.contractors);

    parsedComments.forEach((parsed) => {
      const contractor = findContractorForDocumentPerson(parsed.personName, document, input.contractors);
      const base = makeBaseRow(document, parsed, rows.length);

      if (!contractor) {
        rows.push({
          ...base,
          status: 'needs_review',
          reason: 'Komentar se nepodarilo priradit ke clenu crew.',
          matchedEvent: null,
          matchedContractor: null,
          proposedDays: [],
          existingTimelogId: null,
        });
        return;
      }

      if (parsed.entries.length === 0) {
        rows.push({
          ...base,
          status: 'needs_review',
          reason: 'Komentar neobsahuje parsovatelny datum a cas.',
          matchedEvent: null,
          matchedContractor: contractor,
          proposedDays: [],
          existingTimelogId: null,
        });
        return;
      }

      const grouped = groupEntriesByEvent(document, parsed, input, contractor);
      grouped.reviewReasons.forEach((reason) => {
        rows.push({
          ...makeBaseRow(document, parsed, rows.length),
          status: 'needs_review',
          reason,
          matchedEvent: null,
          matchedContractor: contractor,
          proposedDays: [],
          existingTimelogId: null,
        });
      });

      grouped.groups.forEach((group) => {
        const resolvedDays = group.entries.map((entry) => resolveTimelogDaysForEntry(entry, group.event));
        const hasUnresolvedDays = resolvedDays.some((days) => !days || days.length === 0);
        const proposedDays = sortDays(
          resolvedDays.flatMap((days) => days ?? []),
        );
        const existingTimelog = findExistingTimelog(group.event, contractor, input.timelogs);
        const isAssigned = isContractorAssigned(group.event, contractor, input);
        const hasTimeConflict = hasOverlappingTimelog(group.event, contractor, proposedDays, input.timelogs);
        const isAlreadyApplied = isAlreadyAppliedTimelog(existingTimelog, proposedDays, document.documentName);
        const isApprovedDocument = document.approvalStatus === 'approved';
        const rowStatus: ApprovalTimelogPreviewStatus = !isApprovedDocument
          ? 'blocked'
          : hasUnresolvedDays
            ? 'needs_review'
            : !isAssigned
              ? 'blocked'
              : isAlreadyApplied
                ? 'applied'
              : hasTimeConflict
                ? 'needs_review'
                : 'ready';
        const reason = !isApprovedDocument
          ? 'Dokument jeste neni schvaleny v PowerApps.'
          : hasUnresolvedDays
            ? 'Nenasel jsem zacatek nebo konec smeny.'
            : !isAssigned
              ? 'Clovek neni na akci prirazeny v NODU.'
              : isAlreadyApplied
                ? 'Uz aplikovano v NODU.'
              : hasTimeConflict
                ? TIME_CONFLICT_REASON
                : 'Pripraveno k aplikovani.';

        rows.push({
          ...makeBaseRow(document, parsed, rows.length),
          status: rowStatus,
          reason,
          matchedEvent: group.event,
          matchedContractor: contractor,
          proposedDays,
          existingTimelogId: existingTimelog?.id ?? null,
        });
      });
    });
  });

  return rows;
};

const withApprovalNote = (note: string, row: ApprovalTimelogPreviewRow): string => {
  const approvalNote = `PowerApps: ${row.documentName}`;
  if (note.includes(approvalNote)) return note;
  return note.trim() ? `${note.trim()}\n${approvalNote}` : approvalNote;
};

export const applyApprovalTimelogPreview = async (
  row: ApprovalTimelogPreviewRow,
  dependencies: ApplyApprovalTimelogPreviewDependencies,
): Promise<Timelog> => {
  if (row.status !== 'ready' || !row.matchedEvent || !row.matchedContractor?.profileId) {
    throw new Error('Tento radek neni pripraveny k aplikovani.');
  }

  const existingTimelog = dependencies.timelogs.find((timelog) => (
    timelog.eid === row.matchedEvent?.id
    && timelog.contractorProfileId === row.matchedContractor?.profileId
  ));
  const nextDays = sortDays(row.proposedDays);

  if (existingTimelog) {
    return saveTimelog({
      ...existingTimelog,
      days: nextDays,
      note: withApprovalNote(existingTimelog.note, row),
      status: 'approved',
    });
  }

  return createTimelog({
    eid: row.matchedEvent.id,
    contractorProfileId: row.matchedContractor.profileId,
    days: nextDays,
    km: 0,
    note: withApprovalNote('', row),
    status: 'approved',
  });
};
