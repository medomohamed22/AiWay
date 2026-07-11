# AIWay secure setup

## 1. Supabase

1. Create a Supabase project and keep its region close to the Vercel region.
2. Open **SQL Editor**, inspect then run `supabase/migrations/001_initial_secure_schema.sql` once.
3. Confirm that `users`, `generations`, `payments`, and `token_ledger` all show **RLS enabled**.
4. Confirm the `aiway-media` bucket is **private**. The API returns short-lived signed URLs.
5. Never place `SUPABASE_SERVICE_ROLE_KEY` in HTML, browser JavaScript, or a variable beginning with `NEXT_PUBLIC_`.

## 2. Environment variables (Vercel)

Copy `.env.example` values into Vercel → Project Settings → Environment Variables. Use the Project URL and server-only service-role key from Supabase. Add the OpenRouter and Pi server API keys. `PI_USD_PRICE` is authoritative: if absent or invalid, buying is disabled.

## 3. Deploy

```bash
npm install
npx vercel dev
```

Use Pi sandbox credentials in a separate test deployment before setting `sandbox:false` for production. Add your production Pi UIDs to `ADMIN_PI_UIDS` as a comma-separated allowlist.

## Security model

- Every user API verifies the Pi access token server-side through `/v2/me`; the browser never supplies an authoritative UID or username.
- Models, costs, packages, and payment amounts are selected and verified server-side.
- Token reservation/refund and payment credit are atomic PostgreSQL functions and idempotent through unique request/payment references.
- Media is private and accessed with 15-minute signed URLs.
- OpenRouter, Supabase service-role, and Pi API secrets exist only in server environment variables.

## Adding an OpenRouter model

Add it only to `api/_lib/catalog.js` with `id`, `name`, `provider`, `type`, and server-side `cost`. Confirm the exact model ID supports the required modality in OpenRouter before deploying. Unknown model IDs are rejected even if a client modifies the request.
