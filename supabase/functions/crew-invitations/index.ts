import { createClient } from "npm:@supabase/supabase-js@2.103.0";
import { createInvitationsHandler, type InvitationDependencies } from "./handler.ts";

const enabled = Deno.env.get("CREW_INVITATIONS_ENABLED") === "true";
const apiUrl = Deno.env.get("SUPABASE_URL") ?? "";
const mailpitUrl = Deno.env.get("CREW_INVITATIONS_MAILPIT_URL") ?? "http://supabase_inbucket_crewflow-onboarding-pilot-20261020:8025";
const allowedInviterIds = (Deno.env.get("CREW_INVITATIONS_ALLOWED_INVITER_IDS") ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
const allowedOrigins = (Deno.env.get("CREW_ONBOARDING_ALLOWED_ORIGINS") ?? "http://127.0.0.1:8096,http://localhost:8096,capacitor://localhost,http://localhost").split(",").map((value) => value.trim()).filter(Boolean);
let client: ReturnType<typeof createClient> | null = null;
// Never initialize a privileged remote client, including when the feature flag is misconfigured.
if (enabled && ["http://kong:8000", "http://127.0.0.1:55431", "http://localhost:55431", "http://[::1]:55431"].includes(apiUrl)) {
  try { client = createClient(apiUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false } }); } catch { /* Sanitized unavailable result below. */ }
}
async function rpc(name: string, args: Record<string, unknown>) {
  if (!client) return { error: "invitation_unavailable" };
  const { data, error } = await client.rpc(name, args);
  return error || !data ? { error: "invitation_unavailable" } : data.error ? { error: data.error } : { data };
}
const store: InvitationDependencies["store"] = {
  status: (id) => rpc("crew_onboarding_manual_status", { p_profile_id: id }),
  prepare: (input) => rpc("crew_onboarding_manual_prepare", { p_profile_id: input.profileId, p_expected_email: input.expectedEmail, p_request_id: input.requestId, p_expected_invitation_id: input.expectedInvitationId, p_replace_existing: input.replaceExisting }),
  capture: (id, request, hash) => rpc("crew_onboarding_manual_capture", { p_profile_id: id, p_request_id: request, p_token_hash: hash }),
  cancel: (id, request, hash) => rpc("crew_onboarding_manual_cancel", { p_profile_id: id, p_request_id: request, p_token_hash: hash }),
};
Deno.serve(createInvitationsHandler({ enabled, apiUrl, mailpitUrl, allowedOrigins, allowedInviterIds, store,
  auth: {
    getUser: async (token) => client ? client.auth.getUser(token) : { data: { user: null }, error: true },
    hasCooRole: async (id) => {
      if (!client) return false;
      const { data, error } = await client.from("user_roles").select("user_id").eq("user_id", id).eq("role", "coo").limit(1);
      return !error && data?.length === 1;
    },
  },
  mail: {
    send: async (message) => {
      const response = await fetch(`${mailpitUrl}/api/v1/send`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(5000), headers: { "content-type": "application/json" },
        body: JSON.stringify({ From: { Email: "onboarding@nodu.test", Name: "nodu (test)" }, To: [{ Email: message.email }], Subject: message.subject, HTML: message.html, Text: message.text }),
      });
      if (!response.ok) return false;
      const receipt = await response.json();
      return typeof receipt?.ID === "string" && receipt.ID.length > 0;
    },
  },
}));
