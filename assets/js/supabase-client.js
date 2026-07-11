// ============================================================
// WILD SISTER // SID — Shared Supabase Client
// Loaded by every page that needs auth or database access.
// Uses the publishable/anon key — this key is DESIGNED to be
// public and safe to ship in client-side code. Row Level
// Security (see schema.sql) is what actually protects data,
// not secrecy of this key.
// ============================================================

// Loaded via CDN in each page's <head>:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

const SUPABASE_URL = 'https://xntqxdqqhdjvlxovawzn.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_zsq-1wRl_I3yppqQI_h09A_oLChn78T';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// ------------------------------------------------------------
// requireAuth() — call this at the top of any dashboard page.
// Redirects to login.html if there's no active session.
// Returns the session if one exists.
// ------------------------------------------------------------
async function requireAuth() {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

// ------------------------------------------------------------
// signOut() — clears the session and returns to login.
// ------------------------------------------------------------
async function signOut() {
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}

// ------------------------------------------------------------
// getAuthHeader() — every fetch() to /api/* needs the user's
// access token so the Cloudflare Function can verify who's
// calling. Use like:
//   fetch('/api/cases', { headers: await getAuthHeader() })
// ------------------------------------------------------------
async function getAuthHeader() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return {};
  return { 'Authorization': 'Bearer ' + session.access_token };
}
