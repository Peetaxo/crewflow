import { createClient } from "npm:@supabase/supabase-js@2.103.0";
import { createActivationHandler, type ActivationDependencies } from "./handler.ts";

const enabled = Deno.env.get("CREW_ONBOARDING_ENABLED") === "true";
const allowedOrigins = (Deno.env.get("CREW_ONBOARDING_ALLOWED_ORIGINS") ?? "http://127.0.0.1:8096,http://localhost:8096,capacitor://localhost,http://localhost").split(",").map((value) => value.trim()).filter(Boolean);
// A disabled worker does not even initialize a privileged client.
let client: ReturnType<typeof createClient> | null = null;
if (enabled) {
  try {
    client = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
  } catch { /* Missing/invalid server configuration produces the sanitized unavailable envelope. */ }
}
async function rpc(name: string, args: Record<string, string>) {
  if (!client) return { error: "activation_unavailable" };
  const { data, error } = await client.rpc(name, args);
  return error ? { error: "activation_unavailable" } : data;
}
const store: ActivationDependencies["store"] = {
  preview: async (hash) => { const value = await rpc("crew_onboarding_preview", { p_token_hash: hash }); return value.error ? value : { data: value }; },
  claim: async (hash) => { const value = await rpc("crew_onboarding_claim", { p_token_hash: hash }); return value.error ? value : { data: value }; },
  verify: async (hash, id) => { const value = await rpc("crew_onboarding_verify", { p_token_hash: hash, p_reserved_user_id: id }); return value.error ? value : { data: value }; },
  release: (hash, claim) => rpc("crew_onboarding_release", { p_token_hash: hash, p_claim_id: claim }),
};
Deno.serve(createActivationHandler({ enabled, allowedOrigins, store, auth: client?.auth.admin as ActivationDependencies["auth"] }));
