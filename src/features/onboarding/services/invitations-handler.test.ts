import { describe, expect, it, vi } from "vitest";
import { createInvitationsHandler, type InvitationDependencies } from "../../../../supabase/functions/crew-invitations/handler";

const profileId = "10000000-0000-4000-8000-000000000001";
const operatorId = "10000000-0000-4000-8000-000000000002";
const requestId = "10000000-0000-4000-8000-000000000003";
const invitationId = "10000000-0000-4000-8000-000000000004";
const email = "ada@crewflow-onboarding.test";
const token = "a".repeat(64);
const hash = "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb";
const status = { profileId, email, state: "pending" as const, invitationId, expiresAt: "2026-10-23T12:00:00Z" };
const invite = { action: "invite", profileId, expectedEmail: email, requestId, expectedInvitationId: null, replaceExisting: false };
function fixture(options: Partial<InvitationDependencies> = {}) {
  const store = {
    status: vi.fn(async () => ({ data: status })),
    prepare: vi.fn(async () => ({ data: { ...status, state: "preparing" as const, token, firstName: "<Ada & Crew>" } })),
    capture: vi.fn(async () => ({ data: status })),
    cancel: vi.fn(async () => ({ status: "revoked" })),
  };
  const auth = { getUser: vi.fn(async () => ({ data: { user: { id: operatorId, is_anonymous: false } }, error: null })), hasCooRole: vi.fn(async () => true) };
  const mail = { send: vi.fn<InvitationDependencies["mail"]["send"]>(async () => true) };
  const handler = createInvitationsHandler({ enabled: true, apiUrl: "http://kong:8000", mailpitUrl: "http://supabase_inbucket_crewflow-onboarding-pilot-20261020:8025", allowedOrigins: ["http://127.0.0.1:8096", "capacitor://localhost"], allowedInviterIds: [operatorId], store, auth, mail, ...options });
  const request = (body: unknown = { action: "status", profileId }, headers: Record<string, string> = {}) => handler(new Request("http://localhost/crew-invitations", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer actual-user-token", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  return { handler, request, store, auth, mail };
}
const errorOf = async (response: Response) => (await response.json()).error;

describe("privileged test invitation handler", () => {
  it("defaults disabled before any dependency", async () => {
    const f = fixture({ enabled: undefined });
    expect(await errorOf(await f.request(invite))).toBe("disabled");
    expect(f.auth.getUser).not.toHaveBeenCalled();
    expect(f.store.prepare).not.toHaveBeenCalled();
    expect(f.mail.send).not.toHaveBeenCalled();
  });
  it.each([
    { apiUrl: "https://cloud.supabase.co" }, { apiUrl: "http://127.0.0.1:55321" },
    { apiUrl: "http://kong:8000/remote" }, { mailpitUrl: "https://api.mailprovider.test" },
    { mailpitUrl: "http://127.0.0.1:8025" }, { allowedInviterIds: [] }, { allowedInviterIds: ["bad"] },
  ])("fails closed on unsafe server configuration %j", async (config) => {
    const f = fixture(config);
    expect(await errorOf(await f.request(invite))).toBe("test_only");
    expect(f.auth.getUser).not.toHaveBeenCalled();
    expect(f.store.prepare).not.toHaveBeenCalled();
  });
  it.each(["", "Bearer", "Basic actual-user-token", "Bearer a b"])("denies missing or malformed bearer %s", async (authorization) => {
    const f = fixture();
    expect(await errorOf(await f.request(invite, { authorization }))).toBe("unauthorized");
    expect(f.store.prepare).not.toHaveBeenCalled();
  });
  it("validates bearer using Auth and rejects invalid or anonymous users", async () => {
    for (const authResult of [{ data: { user: null }, error: { message: "SECRET" } }, { data: { user: { id: operatorId, is_anonymous: true } }, error: null }]) {
      const f = fixture();
      f.auth.getUser.mockResolvedValueOnce(authResult as never);
      expect(await errorOf(await f.request(invite))).toBe("unauthorized");
      expect(f.auth.getUser).toHaveBeenCalledWith("actual-user-token");
      expect(f.store.prepare).not.toHaveBeenCalled();
    }
  });
  it("requires both server allowlist and current COO role", async () => {
    const unlisted = fixture({ allowedInviterIds: [profileId] });
    expect(await errorOf(await unlisted.request(invite))).toBe("forbidden");
    expect(unlisted.auth.hasCooRole).not.toHaveBeenCalled();
    const crew = fixture();
    crew.auth.hasCooRole.mockResolvedValueOnce(false);
    expect(await errorOf(await crew.request(invite))).toBe("forbidden");
    expect(crew.auth.hasCooRole).toHaveBeenCalledWith(operatorId);
    expect(crew.store.prepare).not.toHaveBeenCalled();
  });
  it.each([
    ["{", {}], [{ action: "status", profileId: "bad" }, {}], [{ action: "status", profileId, extra: true }, {}],
    [{ ...invite, requestId: "bad" }, {}], [{ ...invite, expectedInvitationId: "bad" }, {}],
    [{ ...invite, replaceExisting: "false" }, {}], [{ ...invite, expectedEmail: "no-email" }, {}],
    [{ ...invite, extra: true }, {}], [{ ...invite, expectedEmail: "x".repeat(321) + "@crewflow-onboarding.test" }, {}],
    [{ action: "status", profileId }, { "content-type": "text/plain" }],
    [" ".repeat(5000), {}],
  ])("rejects exact bounded request input %j", async (body, headers) => {
    const f = fixture();
    expect(await errorOf(await f.request(body, headers))).toBe("invalid_request");
    expect(f.store.status).not.toHaveBeenCalled();
    expect(f.store.prepare).not.toHaveBeenCalled();
  });
  it("rejects untrusted origin before dependencies and supports a safe preflight", async () => {
    const f = fixture();
    const denied = await f.request(invite, { origin: "https://evil.test" });
    expect(await errorOf(denied)).toBe("forbidden");
    expect(denied.headers.has("access-control-allow-origin")).toBe(false);
    expect(f.auth.getUser).not.toHaveBeenCalled();
    const preflight = await f.handler(new Request("http://localhost", { method: "OPTIONS", headers: { origin: "capacitor://localhost" } }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
  });
  it("rejects real recipients before preparation", async () => {
    const f = fixture();
    expect(await errorOf(await f.request({ ...invite, expectedEmail: "ada@example.com" }))).toBe("test_only");
    expect(f.store.prepare).not.toHaveBeenCalled();
  });
  it("returns a sanitized status with no extra backend fields", async () => {
    const f = fixture();
    f.store.status.mockResolvedValueOnce({ data: { ...status, token, serviceKey: "SECRET" } } as never);
    const response = await f.request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: status });
    expect(f.mail.send).not.toHaveBeenCalled();
  });
  it("captures trusted current profile email and escaped 48h message then acknowledges only its hash", async () => {
    const f = fixture();
    const response = await f.request({ ...invite, expectedEmail: " Ada@Crewflow-Onboarding.Test " }, { origin: "http://127.0.0.1:8096" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: status });
    expect(f.store.prepare).toHaveBeenCalledWith({ ...invite, expectedEmail: email });
    expect(f.mail.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ email, subject: expect.any(String), text: expect.stringContaining("48 hodin"), html: expect.stringContaining("&lt;Ada &amp; Crew&gt;") }));
    expect(f.mail.send.mock.calls[0][0].html).toContain(`http://127.0.0.1:8096/activate#token=${token}`);
    expect(f.store.capture).toHaveBeenCalledExactlyOnceWith(profileId, requestId, hash);
    expect(f.store.cancel).not.toHaveBeenCalled();
  });
  it("does not send or create again on captured request replay", async () => {
    const f = fixture();
    f.store.prepare.mockResolvedValueOnce({ data: status } as never);
    expect(await (await f.request(invite)).json()).toEqual({ data: status });
    expect(f.mail.send).not.toHaveBeenCalled();
    expect(f.store.capture).not.toHaveBeenCalled();
  });
  it.each(["profile_unavailable", "missing_email", "test_only", "already_active", "activation_in_progress", "invitation_changed", "invitation_in_progress"])("preserves safe store error %s", async (error) => {
    const f = fixture();
    f.store.prepare.mockResolvedValueOnce({ error } as never);
    expect(await errorOf(await f.request(invite))).toBe(error);
    expect(f.mail.send).not.toHaveBeenCalled();
  });
  it.each(["false", "throw", "ack-false", "ack-throw"])("cancels only the exact prepared request on failed or uncertain capture %s", async (scenario) => {
    const f = fixture();
    if (scenario === "false") f.mail.send.mockResolvedValueOnce(false);
    if (scenario === "throw") f.mail.send.mockRejectedValueOnce(new Error("SECRET token backend"));
    if (scenario === "ack-false") f.store.capture.mockResolvedValueOnce({ error: "invitation_changed" } as never);
    if (scenario === "ack-throw") f.store.capture.mockRejectedValueOnce(new Error("SECRET"));
    const response = await f.request(invite);
    expect(await response.json()).toEqual({ error: "delivery_unavailable" });
    expect(f.store.cancel).toHaveBeenCalledExactlyOnceWith(profileId, requestId, hash);
    if (["false", "throw"].includes(scenario)) expect(f.store.capture).not.toHaveBeenCalled();
  });
  it("suppresses backend diagnostics and malformed trusted responses", async () => {
    for (const result of [{ error: "SECRET service key" }, { data: { ...status, expiresAt: "2026-10-23 (SECRET diagnostic)" } }, { data: { ...status, email: "other@example.com" } }, { data: { ...status, profileId: operatorId } }]) {
      const f = fixture(); f.store.prepare.mockResolvedValueOnce(result as never);
      expect(await errorOf(await f.request(invite))).toBe("invitation_unavailable");
      expect(f.mail.send).not.toHaveBeenCalled();
    }
  });
});
