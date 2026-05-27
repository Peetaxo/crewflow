import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, tally-signature',
};

type TallyField = {
  key?: string;
  label?: string;
  type?: string;
  value?: unknown;
  options?: Array<{ id: string; text: string }>;
};

type TallyPayload = {
  eventId?: string;
  eventType?: string;
  createdAt?: string;
  data?: {
    responseId?: string;
    submissionId?: string;
    respondentId?: string;
    createdAt?: string;
    fields?: TallyField[];
  };
};

type CandidateMatch = {
  id: string;
  stage: string;
  email: string | null;
  phone: string | null;
  interview_date: string | null;
  cal_booking_url: string | null;
  cal_booking_uid: string | null;
};

type MappedTallyCandidate = {
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  tally_submission_id: string | null;
  tally_respondent_id: string | null;
  submitted_at: string | null;
  is_adult: boolean | null;
  has_ico: boolean | null;
  has_driving_license: boolean | null;
  can_drive_van: boolean | null;
  has_event_experience: boolean | null;
  source: string;
  utm_source: string | null;
  utm_content: string | null;
  note: string;
  raw_payload: TallyPayload;
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
    const payload = JSON.parse(rawBody) as TallyPayload;
    const signature = request.headers.get('tally-signature');
    const webhookSecret = Deno.env.get('TALLY_WEBHOOK_SECRET');

    if (!webhookSecret) {
      return json({ error: 'Tally webhook secret is not configured' }, 500);
    }

    const signatureValid = await verifyTallySignature({
      rawBody,
      payload,
      receivedSignature: signature,
      secret: webhookSecret,
    });

    if (!signatureValid) {
      return json({ error: 'Invalid signature' }, 401);
    }

    if (payload.eventType && payload.eventType !== 'FORM_RESPONSE') {
      return json({ ignored: true, eventType: payload.eventType });
    }

    const candidate = mapTallyCandidate(payload);
    if (!candidate.tally_submission_id) {
      return json({ error: 'Missing Tally submission ID' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Supabase environment is not configured' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const existingResult = await findExistingCandidate(supabase, candidate);

    if (existingResult.error) {
      return json({ error: existingResult.error.message }, 500);
    }

    const hasExistingCalBooking = Boolean(
      existingResult.data?.cal_booking_uid
      || existingResult.data?.cal_booking_url
      || existingResult.data?.interview_date,
    );

    const candidatePayload = {
      ...candidate,
      email: hasExistingCalBooking ? (existingResult.data?.email ?? candidate.email) : candidate.email,
      phone: candidate.phone ?? existingResult.data?.phone ?? null,
      stage: existingResult.data?.stage ?? 'new',
      interview_date: existingResult.data?.interview_date ?? null,
      cal_booking_url: existingResult.data?.cal_booking_url ?? null,
    };

    const upsertResult = existingResult.data
      ? await supabase
        .from('candidates')
        .update(candidatePayload)
        .eq('id', existingResult.data.id)
        .select('id')
        .single()
      : await supabase
        .from('candidates')
        .upsert({
          ...candidate,
          stage: 'new',
          interview_date: null,
          cal_booking_url: null,
        }, {
          onConflict: 'tally_submission_id',
        })
        .select('id')
        .single();

    if (upsertResult.error) {
      return json({ error: upsertResult.error.message }, 500);
    }

    return json({ ok: true, candidateId: upsertResult.data.id });
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

const normalizeLabel = (value: string): string => (
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
);

const findField = (fields: TallyField[], labelFragments: string[]): TallyField | undefined => {
  const normalizedFragments = labelFragments.map(normalizeLabel);
  return fields.find((field) => {
    const label = normalizeLabel(field.label ?? field.key ?? '');
    return normalizedFragments.some((fragment) => label.includes(fragment));
  });
};

const fieldText = (field: TallyField | undefined): string => {
  if (!field) return '';
  const value = field.value;

  if (Array.isArray(value)) {
    const optionTexts = (field.options ?? [])
      .filter((option) => value.includes(option.id))
      .map((option) => option.text);

    if (optionTexts.length > 0) {
      return optionTexts.join(', ');
    }

    return value.map((item) => String(item)).join(', ');
  }

  if (typeof value === 'boolean') return value ? 'Ano' : 'Ne';
  if (value == null) return '';
  return String(value);
};

const parseBoolean = (field: TallyField | undefined): boolean | null => {
  if (!field) return null;
  if (typeof field.value === 'boolean') return field.value;

  const value = normalizeLabel(fieldText(field));
  if (!value) return null;
  if (/\b(ano|yes|mam|mám|souhlasim|souhlasím)\b/.test(value)) return true;
  if (/\b(ne|no|nemam|nemám|nesouhlasim|nesouhlasím)\b/.test(value)) return false;

  return null;
};

const parseExperience = (field: TallyField | undefined): boolean | null => {
  const parsed = parseBoolean(field);
  if (parsed != null) return parsed;

  const value = normalizeLabel(fieldText(field));
  if (!value) return null;
  if (value.includes('zadne') || value.includes('žádné') || value === 'ne') return false;
  return true;
};

const splitName = (firstName: string, lastName: string, email: string) => {
  if (firstName || lastName) return { firstName, lastName };

  const fallback = email.split('@')[0]?.replace(/[._-]+/g, ' ') ?? 'Tally';
  const [first = 'Tally', ...rest] = fallback.split(' ').filter(Boolean);
  return {
    firstName: first,
    lastName: rest.join(' '),
  };
};

const mapTallyCandidate = (payload: TallyPayload): MappedTallyCandidate => {
  const fields = payload.data?.fields ?? [];
  const firstName = fieldText(findField(fields, ['jmeno', 'jméno']));
  const lastName = fieldText(findField(fields, ['prijmeni', 'příjmení']));
  const phone = fieldText(findField(fields, ['telefonni cislo', 'telefonní číslo', 'phone']));
  const email = fieldText(findField(fields, ['email']));
  const names = splitName(firstName.trim(), lastName.trim(), email.trim());
  const isAdult = parseBoolean(findField(fields, ['18 let']));
  const hasIco = parseBoolean(findField(fields, ['ico', 'ičo']));
  const hasDrivingLicense = parseBoolean(findField(fields, ['ridicsky prukaz skupiny b', 'řidičský průkaz skupiny b']));
  const canDriveVan = parseBoolean(findField(fields, ['rizeni dodavky', 'řízení dodávky']));
  const hasEventExperience = parseExperience(findField(fields, ['zkusenosti z eventu', 'zkušenosti z eventů', 'bednak', 'bedňák', 'stagehand']));
  const utmSource = fieldText(findField(fields, ['utm_source']));
  const utmContent = fieldText(findField(fields, ['utm_content']));
  const submittedAt = payload.data?.createdAt ?? payload.createdAt ?? null;

  return {
    first_name: names.firstName,
    last_name: names.lastName,
    phone: phone.trim() || null,
    email: email.trim() || null,
    tally_submission_id: payload.data?.submissionId ?? payload.data?.responseId ?? null,
    tally_respondent_id: payload.data?.respondentId ?? null,
    submitted_at: submittedAt,
    is_adult: isAdult,
    has_ico: hasIco,
    has_driving_license: hasDrivingLicense,
    can_drive_van: canDriveVan,
    has_event_experience: hasEventExperience,
    source: 'Tally',
    utm_source: utmSource.trim() || null,
    utm_content: utmContent.trim() || null,
    note: '',
    raw_payload: payload,
  };
};

const hmacSha256Base64 = async (secret: string, message: string): Promise<string> => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const bytes = new Uint8Array(signature);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const safeCompare = (left: string, right: string): boolean => {
  if (left.length !== right.length) return false;

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
};

const verifyTallySignature = async ({
  rawBody,
  payload,
  receivedSignature,
  secret,
}: {
  rawBody: string;
  payload: unknown;
  receivedSignature: string | null;
  secret: string;
}): Promise<boolean> => {
  if (!receivedSignature) return false;

  const rawSignature = await hmacSha256Base64(secret, rawBody);
  if (safeCompare(rawSignature, receivedSignature)) return true;

  const normalizedSignature = await hmacSha256Base64(secret, JSON.stringify(payload));
  return safeCompare(normalizedSignature, receivedSignature);
};

const findExistingCandidate = async (
  supabase: ReturnType<typeof createClient>,
  candidate: MappedTallyCandidate,
): Promise<{ data: CandidateMatch | null; error: { message: string } | null }> => {
  if (candidate.tally_submission_id) {
    const result = await supabase
      .from('candidates')
      .select('id, stage, email, phone, interview_date, cal_booking_url, cal_booking_uid')
      .eq('tally_submission_id', candidate.tally_submission_id)
      .limit(1)
      .maybeSingle();

    if (result.error || result.data) return result;
  }

  if (candidate.email) {
    const result = await supabase
      .from('candidates')
      .select('id, stage, email, phone, interview_date, cal_booking_url, cal_booking_uid')
      .ilike('email', candidate.email)
      .limit(1)
      .maybeSingle();

    if (result.error || result.data) return result;
  }

  if (candidate.phone) {
    const result = await supabase
      .from('candidates')
      .select('id, stage, email, phone, interview_date, cal_booking_url, cal_booking_uid')
      .eq('phone', candidate.phone)
      .limit(1)
      .maybeSingle();

    if (result.error || result.data) return result;
  }

  if (candidate.first_name && candidate.last_name) {
    const result = await supabase
      .from('candidates')
      .select('id, stage, email, phone, interview_date, cal_booking_url, cal_booking_uid')
      .ilike('first_name', candidate.first_name)
      .ilike('last_name', candidate.last_name)
      .is('tally_submission_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.error || result.data) return result;
  }

  return { data: null, error: null };
};
