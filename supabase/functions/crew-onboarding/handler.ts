export type ActivationError = "disabled" | "invalid_invitation" | "expired_invitation" | "already_active" | "activation_in_progress" | "invalid_password" | "activation_unavailable";
type Result<T> = { data?: T; error?: string };
type Preview = { email: string; firstName: string; lastName: string; phone: string; expiresAt: string };
type Claim = Preview & { reservedUserId: string; profileId: string; claimId: string };
type Active = { status: "active"; email: string; profileId: string };
type AuthResult = { data: { user: { id: string; email?: string } | null }; error: { status?: number; code?: string } | null };
export interface ActivationDependencies {
  enabled?: boolean;
  allowedOrigins: string[];
  store: {
    preview(hash: string): Promise<Result<Preview>>;
    claim(hash: string): Promise<Result<Claim>>;
    verify(hash: string, userId: string): Promise<Result<Active>>;
    release(hash: string, claimId: string): Promise<unknown>;
  };
  auth: {
    createUser(attributes: { id: string; email: string; password: string; email_confirm: boolean }): Promise<AuthResult>;
    getUserById(id: string): Promise<AuthResult>;
  };
}
const statuses: Record<ActivationError, number> = { disabled: 503, invalid_invitation: 400, expired_invitation: 410, already_active: 409, activation_in_progress: 409, invalid_password: 422, activation_unavailable: 503 };
function safeError(error?: string): ActivationError {
  return error && Object.prototype.hasOwnProperty.call(statuses, error) ? error as ActivationError : "activation_unavailable";
}
async function readBoundedJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > 16384 || !request.body) throw new Error("body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 16384) { await reader.cancel(); throw new Error("body"); }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export function createActivationHandler(dependencies: ActivationDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    const allowed = origin === null || dependencies.allowedOrigins.includes(origin);
    const headers: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store", "vary": "Origin" };
    if (allowed && origin) headers["access-control-allow-origin"] = origin;
    const fail = (error: ActivationError, status = statuses[error]) => new Response(JSON.stringify({ error }), { status, headers });
    const success = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200, headers });
    if (dependencies.enabled !== true) return fail("disabled");
    if (!allowed) return fail("invalid_invitation", 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, apikey, authorization, x-client-info" } });
    if (request.method !== "POST" || !/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return fail("invalid_invitation");
    let body: Record<string, unknown>;
    try {
      const parsed = await readBoundedJson(request);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("invalid_invitation");
      body = parsed as Record<string, unknown>;
    } catch { return fail("invalid_invitation"); }
    if ((body.action !== "preview" && body.action !== "complete") || typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token)) return fail("invalid_invitation");
    // GoTrue's bcrypt limit is 72 UTF8 bytes; the pilot minimum is 8 Unicode codepoints.
    if (body.action === "complete" && (typeof body.password !== "string" || [...body.password].length < 8 || new TextEncoder().encode(body.password).length > 72)) return fail("invalid_password");
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.token));
      const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      if (body.action === "preview") {
        const result = await dependencies.store.preview(hash);
        return result.data && !result.error ? success({ ...result.data, phone: result.data.phone ?? "" }) : fail(safeError(result.error));
      }
      const claimed = await dependencies.store.claim(hash);
      if (claimed.error || !claimed.data) return fail(safeError(claimed.error));
      const claim = claimed.data;
      let created: AuthResult | undefined;
      try {
        created = await dependencies.auth.createUser({ id: claim.reservedUserId, email: claim.email, password: body.password as string, email_confirm: true });
      } catch { /* Ambiguous transport: inspect the reserved identity; never reset a password. */ }
      if (!created || created.error || !created.data.user || created.data.user.id !== claim.reservedUserId || created.data.user.email !== claim.email) {
        const existing = await dependencies.auth.getUserById(claim.reservedUserId);
        if (existing.error || existing.data.user?.id !== claim.reservedUserId || existing.data.user.email !== claim.email) {
          // An explicit rejection is final. A lost/5xx response might still commit, so its claim stays locked.
          if (created?.error && [400, 422].includes(created.error.status ?? 0) && existing.error?.status === 404) {
            const released = await dependencies.store.release(hash, claim.claimId);
            if (created.error.code === "weak_password" && typeof released === "object" && released !== null && "status" in released && released.status === "released") return fail("invalid_password");
          }
          return fail("activation_unavailable");
        }
      }
      const verified = await dependencies.store.verify(hash, claim.reservedUserId);
      return verified.data?.status === "active" && verified.data.email === claim.email && verified.data.profileId === claim.profileId && !verified.error ? success(verified.data) : fail("activation_unavailable");
    } catch { return fail("activation_unavailable"); }
  };
}
