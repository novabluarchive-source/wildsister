// ============================================================
// WILD SISTER // SID — Shared Supabase Client
// ============================================================

// Supabase Project
const SUPABASE_URL = "https://xntqxdqqhdjvlxovawzn.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_zsq-1wRl_I3yppqQI_h09A_oLChn78T";

// Create ONE shared client for the entire application
window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

// Local reference (optional)
const supabaseClient = window.supabaseClient;

// ------------------------------------------------------------
// REQUIRE AUTH
// ------------------------------------------------------------
async function requireAuth() {
  const {
    data: { session },
    error,
  } = await supabaseClient.auth.getSession();

  if (error || !session) {
    window.location.href = "login.html";
    return null;
  }

  return session;
}

// ------------------------------------------------------------
// SIGN OUT
// ------------------------------------------------------------
async function signOut() {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
}

// ------------------------------------------------------------
// AUTH HEADER
// ------------------------------------------------------------
async function getAuthHeader() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (!session) return {};

  return {
    Authorization: "Bearer " + session.access_token,
  };
}
