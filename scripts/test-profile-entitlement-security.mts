import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const workdir = process.env.SUPABASE_WORKDIR;
const status = JSON.parse(execFileSync(process.platform === "win32" ? "supabase.cmd" : "supabase", [
  ...(workdir ? ["--workdir", workdir] : []), "status", "--output", "json",
], { encoding: "utf8" }));
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(status.API_URL ?? "")
  || (process.env.SUPABASE_EXPECTED_API_URL && status.API_URL !== process.env.SUPABASE_EXPECTED_API_URL)) {
  throw new Error("Profile entitlement assurance requires the intended local test stack.");
}
const key = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const client = createClient(status.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let userId: string | undefined;
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
try {
  const email = `profile-entitlements-${randomUUID()}@example.test`;
  const password = `Profile-${randomUUID()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert(!created.error && created.data.user, "Fixture account creation succeeds");
  userId = created.data.user.id;
  const signedIn = await client.auth.signInWithPassword({ email, password });
  assert(!signedIn.error, "Fixture account sign-in succeeds");

  // No RETURNING: an absent SELECT policy must never masquerade as denial.
  for (const patch of [{ plan: "supporter" }, { supporter_until: "2099-01-01T00:00:00Z" }]) {
    const result = await client.from("profiles").update(patch).eq("id", userId);
    assert(result.error, "Browser cannot set its subscription entitlement");
  }
  const profileEdit = await client.from("profiles").update({ display_name: "Updated player", venmo_handle: "player", zelle_handle: "player@example.test" }).eq("id", userId);
  assert(!profileEdit.error, "Normal profile and payment-contact edits still work");
  const before = await admin.from("profiles").select("plan,supporter_until,display_name").eq("id", userId).single();
  assert(!before.error && before.data.plan === "free" && before.data.supporter_until === null && before.data.display_name === "Updated player", "Denied mutations leave persisted entitlements unchanged");

  const removed = await client.from("profiles").delete().eq("id", userId);
  assert(!removed.error, "Own profile can be removed");
  const forgedInsert = await client.from("profiles").insert({ id: userId, display_name: "Forged", plan: "supporter", supporter_until: null });
  assert(forgedInsert.error, "Delete-and-recreate cannot bypass server-owned entitlements");
  const absent = await admin.from("profiles").select("id").eq("id", userId);
  assert(!absent.error && absent.data.length === 0, "Forged profile was never stored");
  const recreation = await client.from("profiles").insert({ id: userId, display_name: "Recreated player" });
  assert(!recreation.error, "Permitted own profile recreation succeeds with default entitlements");
  const restored = await admin.from("profiles").select("plan,supporter_until").eq("id", userId).single();
  assert(!restored.error && restored.data.plan === "free" && restored.data.supporter_until === null, "Recreated profile retains server defaults");
  const trustedUpdate = await admin.from("profiles").update({ plan: "supporter", supporter_until: "2099-01-01T00:00:00Z" }).eq("id", userId);
  assert(!trustedUpdate.error, "Trusted service-role entitlement assignment still works");
  const trustedProfile = await admin.from("profiles").select("plan").eq("id", userId).single();
  assert(!trustedProfile.error && trustedProfile.data.plan === "supporter", "Trusted entitlement assignment persists");
  console.log("Profile entitlement security passed.");
} finally {
  await client.auth.signOut();
  if (userId) await admin.auth.admin.deleteUser(userId);
}
