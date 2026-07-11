// ============================================================
// WILD SISTER // SID — Original Text Lookup
// Cloudflare Pages Function — lives at /api/bible-lookup
// ============================================================
// GET /api/bible-lookup?ref=Job+38:32
//
// Returns REAL retrieved text — not something for Claude to
// generate on its own. This exists because LUX's whole premise
// (Source / Key Word / Observation, no unsupported claims) only
// holds if there's an actual source behind every answer.
//
// Sources used, both free, no API key required:
//   - bible-api.com    → two English translations (KJV + WEB)
//                        so translation differences are real,
//                        not invented. CORS-enabled, but we're
//                        calling it server-side anyway so that
//                        doesn't matter here.
//   - sefaria.org       → Hebrew original text, Old Testament
//                        only. Sefaria's CORS support is
//                        inconsistent for direct browser calls —
//                        another reason this runs server-side:
//                        server-to-server requests don't hit
//                        CORS restrictions at all.
//
// Honest limitation: this covers Hebrew Old Testament text and
// English translation comparison. It does NOT currently retrieve
// original Greek New Testament text — no equivalently reliable
// free CORS-safe source was found for that. If a NT reference
// comes in, this returns the English translations only, with
// original_language explicitly set to null so LUX's prompt (see
// chat.html) knows to say so rather than pretend it has Greek
// text it doesn't.
// ============================================================

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const ref = url.searchParams.get('ref');

  if (!ref) {
    return json({ error: 'Missing ref parameter, e.g. ?ref=Job+38:32' }, 400);
  }

  const [kjv, web, hebrew] = await Promise.all([
    fetchTranslation(ref, 'kjv'),
    fetchTranslation(ref, 'web'),
    fetchHebrewOriginal(ref),
  ]);

  const translations = [kjv, web].filter(Boolean);

  if (translations.length === 0) {
    return json({
      error: 'No text found for that reference. Check the reference format (e.g. "Job 38:32", "John 3:16") and try again.',
      ref,
    }, 404);
  }

  return json({
    ref,
    translations,
    original_language: hebrew, // null if not found / not Old Testament
    sources: [
      'https://bible-api.com (KJV, WEB — public domain)',
      hebrew ? 'https://sefaria.org (Hebrew original, Masoretic Text)' : null,
    ].filter(Boolean),
  });
}


// ------------------------------------------------------------
// bible-api.com — returns { name, id, text } or null on failure.
// Failure is expected sometimes (bad ref, translation
// unavailable for that book) — never throw, just return null so
// the caller can still return what it did find.
// ------------------------------------------------------------
async function fetchTranslation(ref, translationId) {
  try {
    const url = `https://bible-api.com/${encodeURIComponent(ref)}?translation=${translationId}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.text) return null;
    return {
      id: data.translation_id,
      name: data.translation_name,
      text: data.text.trim(),
    };
  } catch (err) {
    return null;
  }
}


// ------------------------------------------------------------
// Sefaria — Hebrew original, Old Testament (Tanakh) only.
// Returns { versionTitle, text } or null.
// ------------------------------------------------------------
async function fetchHebrewOriginal(ref) {
  try {
    const url = `https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref)}?version=hebrew`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const version = data.versions && data.versions[0];
    if (!version || !version.text) return null;
    // text can be a nested array for multi-verse refs — flatten to a string
    const flatText = Array.isArray(version.text) ? version.text.flat(Infinity).join(' ') : version.text;
    return {
      versionTitle: version.versionTitle || 'Hebrew (Masoretic Text)',
      text: stripHtml(flatText),
    };
  } catch (err) {
    return null;
  }
}

function stripHtml(str) {
  return String(str).replace(/<[^>]*>/g, '').trim();
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
