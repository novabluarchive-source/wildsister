# Wild Sister ecosystem integration audit
Date: 2026-11-23
Status: discovery only; no production integrations changed

## Verified from connected GitHub
- novabluarchive-source/wildsister (public, main): Cloudflare Worker (worker.js, wrangler.jsonc); pages for landing, login, terminal, community, SID investigations, dashboard, pricing. README documents Supabase, Stripe, Claude AI and SID archive. README descriptions are not proof of live service health.
- novabluarchive-source/after-hours (private, main): Cloudflare Worker src/index.js; D1 binding after-hours-db in wrangler.toml; existing account/session tables, memberships, Stripe webhook, Nova lessons and owner analytics.
- Wild Sister login.html loads Supabase JS. After Hours has its own accounts and account_sessions tables. Shared login/SSO is NOT established.
- The provided Signal Desk URL (wild-sister-signal-desk.capcancerian3.chatgpt.site) is an additional surface. Its code, auth, ownership and backend have not been inspected; do not assume it is in either GitHub repository.

## Proposed roles (not yet implemented)
Wild Sister: public entry point, catalog and brand home.
Signal Desk: member command center, once its data sources are verified.
After Hours: education, student progress and Nova.
SID: investigations, evidence and archive.
Street Oracle: Oracle experience.
Shop: digital products, decks and books.

## Safe integration sequence
1. Confirm Signal Desk's source project and current data/auth implementation.
2. Inventory all active domains and production API endpoints and identify authoritative identity, entitlement, and chart records.
3. Add simple verified cross-links and a member-service directory; do not expose private or owner routes.
4. Design a read-only integration layer. Avoid direct browser access to private D1/Supabase data; require server-side authentication, explicit permissions, and minimal scoped API responses.
5. Only after identity mapping and consent are established, plan cross-service sign-on and purchase/learning summaries.
6. Add end-to-end tests for existing logins, Stripe access, SID permissions, student data and rollback.

## Explicit guardrails
- Do not merge, replace, or reset existing databases.
- Do not duplicate account identities by email alone or expose student chart data across apps without authorization.
- Do not treat a successful Stripe test in one app as proof that entitlements work in the others.
- Keep existing routes and student progress intact.
- Treat Signal Desk integration as blocked until its source and backend are identified.

## Next verification
Identify whether Signal Desk is built in a ChatGPT site workspace, its code export/repository if any, and which authentication or backend it uses.
