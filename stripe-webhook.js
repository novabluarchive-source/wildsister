// ============================================================
// WILD SISTER // SID — Stripe Webhook
// Cloudflare Pages Function — lives at /api/stripe-webhook
// ============================================================
// What this does:
//   1. Verifies the request really came from Stripe (HMAC check,
//      no npm dependency — uses the Web Crypto API directly so
//      this deploys with zero build step, same as everything
//      else on this site).
//   2. On a subscription created/updated event, works out which
//      clearance level that Stripe Price ID maps to.
//   3. Matches the Stripe customer to a Supabase user BY EMAIL —
//      necessary because Payment Links (unlike dynamically
//      created Checkout Sessions) don't carry a Supabase user ID
//      through checkout. If you ever switch to server-created
//      Checkout Sessions with client_reference_id, this lookup
//      can be replaced with a direct ID match instead.
//   4. Writes the result into the `subscriptions` table using
//      the Supabase SERVICE ROLE key — this is the one place in
//      the whole system allowed to write clearance levels,
//      which is what makes clearance trustworthy at all.
//
// Required environment variables (set in Cloudflare Pages →
// Settings → Environment Variables — NEVER commit these to git):
//   STRIPE_WEBHOOK_SECRET   — from the specific webhook endpoint
//                             in Stripe (whsec_...)
//   STRIPE_SECRET_KEY       — your Stripe API secret key (sk_...)
//   SUPABASE_URL            — https://xntqxdqqhdjvlxovawzn.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY — the SECRET key from Supabase,
//                             never the publishable one
// ============================================================

// ------------------------------------------------------------
// Keyed by Stripe PRODUCT ID (prod_...), not Price ID — easier
// to find in the Stripe dashboard, and Stripe's webhook payload
// includes both, so this works exactly the same either way.
//
// Only 3 of your 5 recurring products are mapped here. Division
// Access — Monthly and Multi-Division Investigation are
// deliberately left OUT: they're SID division-scoped access,
// not community membership tiers, and don't fit the current
// clearance_level enum (visitor/foundation/inner_circle/
// institution) without mislabeling them. Until schema.sql grows
// a real column for division-scoped access, this webhook will
// log a warning and skip those two rather than write something
// false into the database.
// ------------------------------------------------------------
const PRODUCT_TO_CLEARANCE = {
  'prod_UJ55BustOWHsej': 'foundation',    // Sister — $49/mo
  'prod_UJ58xE2X1gkAvh': 'inner_circle',  // Wild One — $197/mo
  'prod_UrjGeAMiDWbpDz': 'institution',   // Institution-Wide Investigation — $111/mo
  // 'prod_UrjBVAkRZC1uVk' — Division Access — Monthly — NOT MAPPED, see note above
  // 'prod_UrjDlBEHThpaq8' — Multi-Division Investigation — NOT MAPPED, see note above
};


export async function onRequestPost(context) {
  const { request, env } = context;

  const signature = request.headers.get('stripe-signature');
  const rawBody = await request.text();

  const isValid = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    return new Response('Invalid signature', { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return new Response('Invalid JSON', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object, env);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(event.data.object, env);
        break;
      default:
        // Not a subscription event — nothing to do, but still
        // return 200 so Stripe doesn't retry it forever.
        break;
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    // Return 500 so Stripe retries — this event might be a
    // real failure (e.g. Supabase was briefly down), not
    // something to silently drop.
    return new Response('Handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}


// ------------------------------------------------------------
// SUBSCRIPTION CREATED / UPDATED
// ------------------------------------------------------------
async function handleSubscriptionChange(subscription, env) {
  const item = subscription.items?.data?.[0];
  const productId = item?.price?.product;
  const clearance = PRODUCT_TO_CLEARANCE[productId];

  if (!clearance) {
    console.warn('Unmapped or intentionally-excluded product ID — no clearance change made:', productId);
    return;
  }

  const customerEmail = await getCustomerEmail(subscription.customer, env);
  if (!customerEmail) {
    console.warn('Could not resolve Stripe customer email for', subscription.customer);
    return;
  }

  const userId = await findSupabaseUserByEmail(customerEmail, env);
  if (!userId) {
    console.warn('No Supabase account found for email:', customerEmail, '— they paid but have not signed up yet.');
    return;
  }

  // current_period_end lives on the subscription ITEM as of
  // Stripe's 2025-03-31 API version, not on the subscription
  // itself — this is a real, documented breaking change, not
  // a guess.
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000).toISOString()
    : null;

  await upsertSubscription({
    user_id: userId,
    stripe_customer_id: subscription.customer,
    stripe_subscription_id: subscription.id,
    clearance,
    status: subscription.status,
    current_period_end: periodEnd,
  }, env);
}


// ------------------------------------------------------------
// SUBSCRIPTION CANCELED
// Per the product doc: don't delete their files, just drop
// clearance back down so RLS blocks new writes while keeping
// their existing case data fully readable.
// ------------------------------------------------------------
async function handleSubscriptionCanceled(subscription, env) {
  const customerEmail = await getCustomerEmail(subscription.customer, env);
  if (!customerEmail) return;

  const userId = await findSupabaseUserByEmail(customerEmail, env);
  if (!userId) return;

  await upsertSubscription({
    user_id: userId,
    stripe_customer_id: subscription.customer,
    stripe_subscription_id: subscription.id,
    clearance: 'visitor',
    status: 'canceled',
    current_period_end: null,
  }, env);
}


// ------------------------------------------------------------
// Look up a Stripe customer's email via Stripe's API.
// (Not always present on the subscription object itself.)
// ------------------------------------------------------------
async function getCustomerEmail(customerId, env) {
  const res = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
    headers: { 'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email || null;
}


// ------------------------------------------------------------
// Find the Supabase auth user with this email, using the
// admin auth API — requires the service role key.
// ------------------------------------------------------------
async function findSupabaseUserByEmail(email, env) {
  const res = await fetch(
    `${env.SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
      }
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const user = (data.users || []).find(u => u.email === email);
  return user ? user.id : null;
}


// ------------------------------------------------------------
// Upsert into the subscriptions table. The unique index on
// user_id (see schema.sql) is what makes "merge-duplicates"
// update the existing row instead of creating a second one.
// ------------------------------------------------------------
async function upsertSubscription(record, env) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error('Supabase upsert failed: ' + errText);
  }
}


// ------------------------------------------------------------
// Verify the webhook actually came from Stripe. Implemented by
// hand with the Web Crypto API instead of the stripe npm
// package on purpose — importing that package would require
// adding a package.json and a build step, which this repo
// doesn't have yet. This keeps deployment exactly as simple as
// every other file on the site: commit, push, done.
// ------------------------------------------------------------
async function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return false;

  const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Reject anything older than 5 minutes — replay protection.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const expectedHex = [...new Uint8Array(sigBuffer)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqual(expectedHex, signature);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ============================================================
// BEFORE THIS GOES LIVE:
//
// 1. Create the webhook endpoint in Stripe: Developers →
//    Webhooks → Add endpoint → URL:
//    https://yourdomain.com/api/stripe-webhook
//    Events to send: customer.subscription.created,
//    customer.subscription.updated,
//    customer.subscription.deleted
//
// 2. Copy the "Signing secret" Stripe shows you for that
//    specific endpoint (whsec_...) — that's STRIPE_WEBHOOK_SECRET.
//
// 3. Set all 4 environment variables in Cloudflare Pages →
//    your project → Settings → Environment Variables.
//
// 4. STILL OPEN: Division Access — Monthly and Multi-Division
//    Investigation subscribers currently get NO clearance
//    change when they pay — the webhook logs a warning and
//    moves on. Decide how those two should actually work
//    (a new column? a separate table for division-scoped
//    access?) before launching them, or people will pay and
//    get nothing.
// ============================================================
