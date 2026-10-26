import { renderActivationEmail } from "../_shared/activation-email.mjs";

export type InvitationError = "disabled" | "unauthorized" | "forbidden" | "invalid_request" | "profile_unavailable" | "missing_email" | "test_only" | "already_active" | "activation_in_progress" | "invitation_changed" | "invitation_in_progress" | "delivery_unavailable" | "invitation_unavailable";
export type InvitationState = "not_invited" | "preparing" | "pending" | "expired" | "active" | "activation_in_progress";
export type CrewInvitationStatus = { profileId: string; email: string; state: InvitationState; invitationId: string | null; expiresAt: string | null };
export type InviteRequest = { action: "invite"; profileId: string; expectedEmail: string; requestId: string; expectedInvitationId: string | null; replaceExisting: boolean };
type Result<T> = { data?: T; error?: string };
type Prepared = CrewInvitationStatus & { token?: string; firstName?: string };
export interface InvitationDependencies {
  enabled?: boolean;
  apiUrl: string;
  mailpitUrl: string;
  allowedOrigins: string[];
  allowedInviterIds: string[];
  auth: {
    getUser(token: string): Promise<{ data: { user: { id: string; is_anonymous?: boolean } | null }; error: unknown }>;
    hasCooRole(id: string): Promise<boolean>;
  };
  store: {
    status(profileId: string): Promise<Result<CrewInvitationStatus>>;
    prepare(request: InviteRequest): Promise<Result<Prepared>>;
    capture(profileId: string, requestId: string, hash: string): Promise<Result<CrewInvitationStatus>>;
    cancel(profileId: string, requestId: string, hash: string): Promise<unknown>;
  };
  mail: { send(message: { email: string; subject: string; text: string; html: string }): Promise<boolean> };
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const syntheticEmail = /^[a-z0-9][a-z0-9._+-]*@crewflow-onboarding\.test$/;
const codes: Record<InvitationError, number> = { disabled: 503, unauthorized: 401, forbidden: 403, invalid_request: 400, profile_unavailable: 404, missing_email: 422, test_only: 403, already_active: 409, activation_in_progress: 409, invitation_changed: 409, invitation_in_progress: 409, delivery_unavailable: 503, invitation_unavailable: 503 };
const states = new Set<InvitationState>(["not_invited", "preparing", "pending", "expired", "active", "activation_in_progress"]);
const apiTargets = new Set(["http://kong:8000", "http://127.0.0.1:55431", "http://localhost:55431", "http://[::1]:55431"]);
const captureTargets = new Set(["http://supabase_inbucket_crewflow-onboarding-pilot-20261020:8025", "http://127.0.0.1:55434", "http://localhost:55434", "http://[::1]:55434"]);
function safeError(value?: string): InvitationError { return value && Object.prototype.hasOwnProperty.call(codes, value) ? value as InvitationError : "invitation_unavailable"; }
function safeStatus(value: Prepared | undefined, profileId: string): CrewInvitationStatus | null {
  if (!value || value.profileId !== profileId || !uuid.test(value.profileId) || !syntheticEmail.test(value.email) || !states.has(value.state)
      || !(value.invitationId === null || (typeof value.invitationId === "string" && uuid.test(value.invitationId)))
      || !(value.expiresAt === null || (typeof value.expiresAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.expiresAt) && Number.isFinite(Date.parse(value.expiresAt))))) return null;
  return { profileId: value.profileId, email: value.email, state: value.state, invitationId: value.invitationId, expiresAt: value.expiresAt };
}
async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.body || Number(request.headers.get("content-length")) > 4096) throw new Error();
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const next = await reader.read(); if (next.done) break;
    size += next.value.byteLength;
    if (size > 4096) { await reader.cancel(); throw new Error(); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
  return value;
}
export function createInvitationsHandler(dependencies: InvitationDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    const allowed = origin === null || dependencies.allowedOrigins.includes(origin);
    const headers: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store", vary: "Origin" };
    if (allowed && origin) headers["access-control-allow-origin"] = origin;
    const fail = (error: InvitationError) => new Response(JSON.stringify({ error }), { status: codes[error], headers });
    const success = (data: CrewInvitationStatus) => new Response(JSON.stringify({ data }), { status: 200, headers });
    if (dependencies.enabled !== true) return fail("disabled");
    if (!apiTargets.has(dependencies.apiUrl) || !captureTargets.has(dependencies.mailpitUrl) || !dependencies.allowedInviterIds.length || dependencies.allowedInviterIds.some((id) => !uuid.test(id))) return fail("test_only");
    if (!allowed) return fail("forbidden");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, apikey, authorization, x-client-info" } });
    if (request.method !== "POST" || !/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return fail("invalid_request");
    const bearer = /^Bearer ([^\s]+)$/i.exec(request.headers.get("authorization") ?? "");
    if (!bearer || bearer[1].length > 8192) return fail("unauthorized");
    try {
      const user = await dependencies.auth.getUser(bearer[1]);
      if (user.error || !user.data.user || user.data.user.is_anonymous || !uuid.test(user.data.user.id)) return fail("unauthorized");
      const id = user.data.user.id;
      if (!dependencies.allowedInviterIds.includes(id) || !(await dependencies.auth.hasCooRole(id))) return fail("forbidden");
    } catch { return fail("unauthorized"); }
    let body: Record<string, unknown>;
    try { body = await readJson(request); } catch { return fail("invalid_request"); }
    const keys = body.action === "status" ? ["action", "profileId"] : ["action", "profileId", "expectedEmail", "requestId", "expectedInvitationId", "replaceExisting"];
    if (!["status", "invite"].includes(body.action as string) || Object.keys(body).length !== keys.length || !keys.every((key) => Object.prototype.hasOwnProperty.call(body, key)) || typeof body.profileId !== "string" || !uuid.test(body.profileId)) return fail("invalid_request");
    if (body.action === "invite") {
      if (typeof body.expectedEmail !== "string" || body.expectedEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.expectedEmail.trim()) || typeof body.requestId !== "string" || !uuid.test(body.requestId) || !(body.expectedInvitationId === null || (typeof body.expectedInvitationId === "string" && uuid.test(body.expectedInvitationId))) || typeof body.replaceExisting !== "boolean") return fail("invalid_request");
      body.expectedEmail = body.expectedEmail.trim().toLowerCase();
      if (!syntheticEmail.test(body.expectedEmail as string)) return fail("test_only");
    }
    try {
      if (body.action === "status") {
        const result = await dependencies.store.status(body.profileId);
        const status = safeStatus(result.data, body.profileId);
        return result.error || !status ? fail(safeError(result.error)) : success(status);
      }
      const input = body as InviteRequest;
      const prepared = await dependencies.store.prepare(input);
      if (prepared.error) return fail(safeError(prepared.error));
      const status = safeStatus(prepared.data, input.profileId);
      if (!status || status.email !== input.expectedEmail) return fail("invitation_unavailable");
      // A captured replay contains metadata only; raw capabilities are returned by SQL once.
      if (!prepared.data?.token) return status.state === "pending" || status.state === "active" || status.state === "expired" ? success(status) : fail("invitation_in_progress");
      if (!/^[a-f0-9]{64}$/.test(prepared.data.token) || status.state !== "preparing" || !status.invitationId || !status.expiresAt || typeof prepared.data.firstName !== "string") return fail("invitation_unavailable");
      const token = prepared.data.token;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      try {
        const message = renderActivationEmail({ firstName: prepared.data.firstName, activationUrl: `http://127.0.0.1:8096/activate#token=${token}`, nativeUrl: `nodu-test://activate#token=${token}` });
        if (!(await dependencies.mail.send({ email: status.email, ...message }))) throw new Error();
        const captured = await dependencies.store.capture(input.profileId, input.requestId, hash);
        const acknowledged = safeStatus(captured.data, input.profileId);
        if (captured.error || !acknowledged || acknowledged.email !== status.email || acknowledged.invitationId !== status.invitationId || acknowledged.state !== "pending") throw new Error();
        return success(acknowledged);
      } catch {
        try { await dependencies.store.cancel(input.profileId, input.requestId, hash); } catch { /* Exact preparation stays unavailable; a newer invitation is never cancelled. */ }
        return fail("delivery_unavailable");
      }
    } catch { return fail("invitation_unavailable"); }
  };
}
