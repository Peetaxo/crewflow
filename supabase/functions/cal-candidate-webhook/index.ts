import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cal-signature-256, x-cal-webhook-version',
};

type JsonRecord = Record<string, unknown>;
type CandidateMatch = {
  id: string;
  stage: string;
};
type CalBooking = {
  eventType: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  bookingUid: string | null;
  bookingUrl: string | null;
  startTime: string | null;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-cal-signature-256');
    const webhookSecret = Deno.env.get('CAL_WEBHOOK_SECRET');

    if (!webhookSecret) {
      return json({ error: 'Cal.com webhook secret is not configured' }, 500);
    }

    const signatureValid = await verifyCalSignature({
      rawBody,
      receivedSignature: signature,
      secret: webhookSecret,
    });

    if (!signatureValid) {
      return json({ error: 'Invalid signature' }, 401);
    }

    const body = JSON.parse(rawBody) as JsonRecord;
    const booking = mapCalBooking(body);
    if (!booking.email) {
      return json({ error: 'Missing attendee email' }, 400);
    }

    if (!isSupportedEvent(booking.eventType)) {
      return json({ ignored: true, eventType: booking.eventType });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Supabase environment is not configured' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const existingResult = await findExistingCandidate(supabase, booking);

    if (existingResult.error) {
      return json({ error: existingResult.error.message }, 500);
    }

    const cancelled = booking.eventType === 'BOOKING_CANCELLED';
    const nextStage = getNextStage(existingResult.data?.stage, cancelled);
    const candidatePayload = {
      first_name: booking.firstName,
      last_name: booking.lastName,
      email: booking.email,
      phone: booking.phone ?? undefined,
      source: existingResult.data ? undefined : 'Cal.com',
      cal_booking_uid: booking.bookingUid,
      cal_booking_status: cancelled ? 'cancelled' : 'booked',
      cal_event_type: booking.eventType,
      cal_booking_url: cancelled ? null : booking.bookingUrl,
      interview_date: cancelled ? null : booking.startTime,
      stage: nextStage,
      note: existingResult.data ? undefined : '',
      cal_raw_payload: body,
    };

    const result = existingResult.data
      ? await supabase
        .from('candidates')
        .update(stripUndefined(candidatePayload))
        .eq('id', existingResult.data.id)
        .select('id')
        .single()
      : await supabase
        .from('candidates')
        .insert(stripUndefined(candidatePayload))
        .select('id')
        .single();

    if (result.error) {
      return json({ error: result.error.message }, 500);
    }

    return json({ ok: true, candidateId: result.data.id, eventType: booking.eventType });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});

const json = (body: unknown, status = 200): Response => (
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
);

const stripUndefined = <T extends JsonRecord>(value: T): JsonRecord => (
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
);

const findExistingCandidate = async (
  supabase: ReturnType<typeof createClient>,
  booking: CalBooking,
): Promise<{ data: CandidateMatch | null; error: { message: string } | null }> => {
  if (booking.bookingUid) {
    const result = await supabase
      .from('candidates')
      .select('id, stage')
      .eq('cal_booking_uid', booking.bookingUid)
      .limit(1)
      .maybeSingle();

    if (result.error || result.data) return result;
  }

  if (booking.email) {
    const result = await supabase
      .from('candidates')
      .select('id, stage')
      .ilike('email', booking.email)
      .limit(1)
      .maybeSingle();

    if (result.error || result.data) return result;
  }

  if (booking.phone) {
    const result = await supabase
      .from('candidates')
      .select('id, stage')
      .eq('phone', booking.phone)
      .limit(1)
      .maybeSingle();

    if (result.error || result.data) return result;
  }

  if (booking.firstName && booking.lastName && booking.lastName !== '-') {
    const result = await supabase
      .from('candidates')
      .select('id, stage')
      .ilike('first_name', booking.firstName)
      .ilike('last_name', booking.lastName)
      .is('cal_booking_uid', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.error || result.data) return result;
  }

  return { data: null, error: null };
};

const asRecord = (value: unknown): JsonRecord | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const text = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
};

const readPath = (source: JsonRecord | null, path: string[]): unknown => {
  let current: unknown = source;
  for (const key of path) {
    const record = asRecord(current);
    if (!record || !(key in record)) return undefined;
    current = record[key];
  }
  return current;
};

const responseValue = (responses: JsonRecord | null, keys: string[]): string => {
  for (const key of keys) {
    const value = responses?.[key];
    const record = asRecord(value);
    const direct = text(record?.value ?? value);
    if (direct) return direct;
  }
  return '';
};

const getAttendee = (payload: JsonRecord): JsonRecord | null => {
  const attendees = asArray(payload.attendees);
  const first = asRecord(attendees[0]);
  if (first) return first;

  return asRecord(payload.attendee) ?? asRecord(payload.booker) ?? null;
};

const splitName = (fullName: string, email: string) => {
  const cleanName = fullName.trim();
  if (cleanName) {
    const [firstName = cleanName, ...rest] = cleanName.split(/\s+/);
    return {
      firstName,
      lastName: rest.join(' ') || '-',
    };
  }

  const fallback = email.split('@')[0]?.replace(/[._-]+/g, ' ') ?? 'Cal';
  const [firstName = 'Cal', ...rest] = fallback.split(/\s+/).filter(Boolean);
  return {
    firstName,
    lastName: rest.join(' ') || '-',
  };
};

const mapCalBooking = (body: JsonRecord): CalBooking => {
  const payload = asRecord(body.payload) ?? asRecord(body.data) ?? body;
  const attendee = getAttendee(payload);
  const responses = asRecord(payload.responses);
  const eventType = text(body.triggerEvent ?? payload.triggerEvent ?? body.eventType ?? body.type).toUpperCase();
  const email = text(
    attendee?.email
    ?? payload.email
    ?? responseValue(responses, ['email', 'Email', 'e-mail']),
  ).toLowerCase();
  const fullName = text(
    attendee?.name
    ?? payload.name
    ?? responseValue(responses, ['name', 'Name', 'jmeno', 'Jméno']),
  );
  const names = splitName(fullName, email);
  const bookingUrl = text(
    payload.bookingUrl
    ?? payload.booking_url
    ?? payload.videoCallUrl
    ?? payload.video_call_url
    ?? readPath(payload, ['metadata', 'videoCallUrl'])
    ?? readPath(payload, ['metadata', 'bookingUrl']),
  ) || null;

  return {
    eventType,
    email,
    firstName: text(attendee?.firstName) || names.firstName,
    lastName: text(attendee?.lastName) || names.lastName,
    phone: text(payload.phone ?? responseValue(responses, ['phone', 'Telefon', 'Telefonní číslo'])) || null,
    bookingUid: text(payload.uid ?? payload.bookingUid ?? payload.booking_uid ?? payload.id) || null,
    bookingUrl,
    startTime: text(payload.startTime ?? payload.start_time ?? payload.start) || null,
  };
};

const isSupportedEvent = (eventType: string): boolean => (
  ['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED'].includes(eventType)
);

const getNextStage = (currentStage: string | undefined, cancelled: boolean): string => {
  if (cancelled) {
    return currentStage === 'interview_scheduled' ? 'new' : currentStage ?? 'new';
  }

  if (!currentStage || currentStage === 'new') {
    return 'interview_scheduled';
  }

  return currentStage;
};

const hmacSha256Hex = async (secret: string, message: string): Promise<string> => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const safeCompare = (left: string, right: string): boolean => {
  if (left.length !== right.length) return false;

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
};

const verifyCalSignature = async ({
  rawBody,
  receivedSignature,
  secret,
}: {
  rawBody: string;
  receivedSignature: string | null;
  secret: string;
}): Promise<boolean> => {
  if (!receivedSignature) return false;

  const normalizedSignature = receivedSignature.replace(/^sha256=/i, '').trim();
  const expectedSignature = await hmacSha256Hex(secret, rawBody);
  return safeCompare(expectedSignature, normalizedSignature);
};
