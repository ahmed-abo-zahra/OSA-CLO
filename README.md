# ASO CLO — isolated presentation demo

A bilingual Arabic/English clothing store presentation preserving ASO's black, lime and ivory identity. Includes 120 ASO sample products: exactly ten in each of the existing twelve subcategories. Studio imagery is AI-generated for this fictional catalog; these are presentation products, not claims of real inventory or suppliers.

## Run

Node.js 20+, then `npm ci`, copy `.env.example` to `.env.local`, `npm run build` and `npm start`. Open http://localhost:3000. Keep `NEXT_PUBLIC_DEMO_MODE=true` for this presentation.

Demo admin: `/admin/login`, names `Safia`, `Omaima` or `Aisha`, password `aso-demo-2026`. These credentials only work in demo mode. Each partner accesses their own products and orders; store popup settings are restricted to Safia.

## Demo behavior

- Catalog: clothing 50, footwear 30, bags/accessories 20, beauty/home 20. Every item has a unique photographic tile, bilingual ASO name, price, exact photographed color, sizes and stock.
- Search, category selection, price filtering/sorting, variant selection, persistent cart and checkout.
- Checkout validates variants, quantities and combined stock, derives prices and ownership on the server, creates an unpaid order per partner, and decrements stock atomically within the single local Node process.
- Twelve fictional orders initialize the dashboard. Order tracking exposes masked names and no address or phone.
- Electronic payment, Google login, WhatsApp OTP and live Supabase subscriptions are disabled. The demo cannot collect payment or contact Supabase.
- Changes persist in ignored `.demo/database.json`; removing that file while the server is stopped restores the bundled fixtures. Uploaded demo pictures live under ignored `public/demo/uploads`.

The local file database is suitable for a single-process presentation. It is not a production or multi-instance database; filesystem storage on serverless hosting may be ephemeral.

## Verification

`node scripts/validate-catalog.mjs` verifies 120 products, ten per subcategory, unique identifiers/photo references, positive prices/stock and required variants/assets.

With the demo running: `node scripts/test-demo-api.mjs` tests unauthorized and forged sessions, partner isolation, variant validation, aggregate stock, server-derived totals and masked tracking. It only permits localhost and restores the local data file after its checks.

`npm run lint` and `npm run build` verify source and production compilation.

## Before enabling a real store

Use staging Supabase to verify schema (including `colors` and `description_ar`), RLS policies, storage rules and live integrations. Set a strong `ADMIN_SESSION_SECRET` and separate `ADMIN_PASSWORD_SAFIA`, `ADMIN_PASSWORD_OMAIMA`, `ADMIN_PASSWORD_AISHA`; only the service key belongs on the server. Rotate credentials previously committed in the original repository and remove them from history before sharing it publicly.

The legacy live checkout path needs a transactional database/RPC review and real payment integration before production. Demo verification does not establish that live Supabase RLS or payment processing is safe. Do not switch off demo mode and deploy directly to customers.
