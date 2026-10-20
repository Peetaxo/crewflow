import { describe, expect, it, vi } from "vitest";
import { createActivationHandler } from "../../../../supabase/functions/crew-onboarding/handler";

const token = "a".repeat(64);
const preview = { email: "pilot@crewflow-onboarding.test", firstName: "Ada", lastName: "Crew", phone: null, expiresAt: "2026-10-22T12:00:00Z" };
function fixture(enabled = true) {
  const store = {
    preview: vi.fn(async () => ({ data: preview })),
    claim: vi.fn(async () => ({ data: { ...preview, reservedUserId: "reserved", profileId: "profile", claimId: "claim" } })),
    verify: vi.fn(async () => ({ data: { status: "active", email: preview.email, profileId: "profile" } })),
    release: vi.fn(async () => undefined),
  };
  const auth = { createUser: vi.fn(async () => ({ data: { user: { id: "reserved", email: preview.email } }, error: null })), getUserById: vi.fn(async () => ({ data: { user: null }, error: { status: 404 } })) };
  const handler = createActivationHandler({ enabled, allowedOrigins: ["http://localhost:8096", "capacitor://localhost"], store, auth });
  const request = (body: unknown, headers: Record<string, string> = {}) => handler(new Request("http://localhost/crew-onboarding", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  return { store, auth, handler, request };
}

describe("invitation activation handler", () => {
  it("is disabled by default before reading credentials or mutating Auth", async () => {
    const f = fixture(false);
    const response = await f.request({ action: "complete", token, password: "strong-password" });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "disabled" });
    expect(f.auth.createUser).not.toHaveBeenCalled();
  });
  it("previews without Auth or SQL mutations and passes only SHA256 to SQL", async () => {
    const f = fixture();
    const response = await f.request({ action: "preview", token }, { origin: "capacitor://localhost" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: preview });
    expect(f.store.preview).toHaveBeenCalledWith("ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb");
    expect(f.store.claim).not.toHaveBeenCalled();
    expect(f.auth.createUser).not.toHaveBeenCalled();
  });
  it.each([
    [{ action: "preview", token: "bad" }, {}, "invalid_invitation"],
    [{ action: "preview", token }, { origin: "https://evil.test" }, "invalid_invitation"],
    [{ action: "preview", token }, { "content-type": "text/plain" }, "invalid_invitation"],
    ["{", {}, "invalid_invitation"],
    [{ action: "complete", token, password: "weak" }, {}, "invalid_password"],
    [{ action: "complete", token, password: "x".repeat(1025) }, {}, "invalid_password"],
    [{ action: "preview", token, padding: "x".repeat(17000) }, {}, "invalid_invitation"],
  ])("rejects unsafe input before any SQL or Auth call", async (body, headers, error) => {
    const f = fixture();
    const response = await f.request(body, headers as Record<string, string>);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await response.json()).toEqual({ error });
    expect(f.store.preview).not.toHaveBeenCalled();
    expect(f.store.claim).not.toHaveBeenCalled();
    expect(f.auth.createUser).not.toHaveBeenCalled();
  });
  it.each(["invalid_invitation", "expired_invitation", "already_active", "activation_in_progress"])("returns sanitized %s from SQL", async (error) => {
    const f = fixture();
    f.store.claim.mockResolvedValueOnce({ error } as never);
    const response = await f.request({ action: "complete", token, password: "safe-password-123" });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await response.json()).toEqual({ error });
    expect(f.auth.createUser).not.toHaveBeenCalled();
  });
  it("creates only the reserved identity and verifies atomic consumption before success", async () => {
    const f = fixture();
    const response = await f.request({ action: "complete", token, password: "safe-password-123" });
    expect(f.auth.createUser).toHaveBeenCalledExactlyOnceWith({ id: "reserved", email: preview.email, password: "safe-password-123", email_confirm: true });
    expect(f.store.verify).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/), "reserved");
    expect(await response.json()).toEqual({ data: { status: "active", email: preview.email, profileId: "profile" } });
  });
  it("recovers a committed create whose transport response was lost", async () => {
    const f = fixture();
    f.auth.createUser.mockRejectedValueOnce(new Error("SECRET password=do-not-echo"));
    f.auth.getUserById.mockResolvedValueOnce({ data: { user: { id: "reserved", email: preview.email } }, error: null } as never);
    const response = await f.request({ action: "complete", token, password: "safe-password-123" });
    expect(response.status).toBe(200);
    expect(f.auth.createUser).toHaveBeenCalledTimes(1);
    expect(f.store.release).not.toHaveBeenCalled();
  });
  it("keeps an ambiguous absent-user claim locked instead of retrying a different password", async () => {
    const f = fixture();
    f.auth.createUser.mockRejectedValueOnce(new Error("lost transport SECRET"));
    const response = await f.request({ action: "complete", token, password: "safe-password-123" });
    expect(await response.json()).toEqual({ error: "activation_unavailable" });
    expect(f.store.release).not.toHaveBeenCalled();
    expect(f.auth.createUser).toHaveBeenCalledTimes(1);
  });
  it("releases a definite Auth rejection only after exact UUID absence is confirmed", async () => {
    const f = fixture();
    f.auth.createUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 422, code: "email_exists" } } as never);
    const response = await f.request({ action: "complete", token, password: "safe-password-123" });
    expect(await response.json()).toEqual({ error: "activation_unavailable" });
    expect(f.store.release).toHaveBeenCalledWith(expect.any(String), "claim");
  });
  it("does not claim success when binding verification fails", async () => {
    const f = fixture();
    f.store.verify.mockResolvedValueOnce({ error: "activation_unavailable" } as never);
    const response = await f.request({ action: "complete", token, password: "safe-password-123" });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "activation_unavailable" });
  });
});
