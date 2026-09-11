// SID // Full-stack Worker router
import { onRequestPost as runAnalyst } from './functions/api/analyst-run.js';
import { onRequestGet as bibleLookup } from './functions/api/bible-lookup.js';

const PRODUCTION_ORIGIN = 'https://wildsister.co';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/analyst-run') {
      const origin = request.headers.get('Origin');
      if (origin && origin !== PRODUCTION_ORIGIN) {
        return apiResponse({ error: 'ORIGIN NOT ALLOWED' }, 403, origin);
      }
      if (request.method === 'OPTIONS') return preflight(origin);
      if (request.method !== 'POST') return apiResponse({ error: 'METHOD NOT ALLOWED' }, 405, origin);
      try {
        return withCors(await runAnalyst({ request, env, waitUntil: ctx.waitUntil.bind(ctx) }), origin);
      } catch (error) {
        console.error('SID ANALYST BOUNDARY ERROR', error);
        return apiResponse({ error: 'ANALYST EXECUTION BOUNDARY FAILED' }, 500, origin);
      }
    }

    if (url.pathname === '/api/bible-lookup') {
      if (request.method === 'OPTIONS') return preflight(request.headers.get('Origin'));
      if (request.method !== 'GET') return apiResponse({ error: 'METHOD NOT ALLOWED' }, 405, request.headers.get('Origin'));
      try {
        return await bibleLookup({ request, env, waitUntil: ctx.waitUntil.bind(ctx) });
      } catch (error) {
        console.error('SID BIBLE LOOKUP ERROR', error);
        return apiResponse({ error: 'BIBLE LOOKUP FAILED' }, 502);
      }
    }

    if (url.pathname.startsWith('/api/')) return apiResponse({ error: 'API ROUTE NOT FOUND' }, 404);
    return env.ASSETS.fetch(request);
  }
};

function preflight(origin) {
  if (origin && origin !== PRODUCTION_ORIGIN) return apiResponse({ error: 'ORIGIN NOT ALLOWED' }, 403, origin);
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin)
  });
}

function withCors(response, origin) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function apiResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(origin) }
  });
}

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (origin === PRODUCTION_ORIGIN) headers['Access-Control-Allow-Origin'] = PRODUCTION_ORIGIN;
  return headers;
}

