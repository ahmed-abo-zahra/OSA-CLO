# ASO CLO — framework-free frontend demo

A standalone HTML5, CSS3 and ES6+ JavaScript clothing storefront. No frameworks, package installation, backend, database, admin dashboard or payment provider. It preserves ASO's black, ivory and lime palette and logo, with local Geist/Cairo fonts.

This is an ASO portfolio presentation inspired by the provided frontend scope. It does not claim to convert Ket3a's original files or preserve that client's unknown logo/fonts; their actual prototype must be supplied for a client implementation.

## Run locally

From this folder:

```sh
python3 -m http.server 4173
```

Open http://localhost:4173. Use an HTTP server rather than double-clicking index.html, because the catalog is fetched from a JSON file.

## Structure

- `index.html`: collection, name/category search, category filter and price sorting/range.
- `product.html?id=PRODUCT_ID`: product details, size/color selection and size guide.
- `contact.html`: accessible client validation. No email is sent.
- `checkout.html`: customer/address validation and local sample order. No payment.
- `confirmation.html`: local confirmation, total and amount collected (zero).
- `css/store.css`: CSS variables, components, light/dark themes and responsive grid.
- `js/store.js`: bilingual UI, catalog rendering, accessible native dialogs, filters, cart and forms.
- `data/products.json`: 120 fictional ASO products, ten per existing subcategory.
- `img/`: 120 distinct compressed WebP photographs and logo.
- `fonts/`: local fonts and Cairo OFL license.

## Add a product

Add a unique product object to `data/products.json`. Use an existing category key (`abayas`, `isdals`, `dresses`, `tshirts`, `pants`, `sneakers`, `heels`, `slippers`, `girls_bags`, `accessories`, `makeup`, `home_appliances`). Put the corresponding photo in `img/`. Keep the file valid JSON (no comments or trailing commas).

```json
{
  "id": "aso-unique-product-121",
  "name": {"en": "ASO Everyday T-shirt — Black", "ar": "ASO تيشيرت يومي — أسود"},
  "price": 290,
  "image": "img/my-product.webp",
  "category": "tshirts",
  "description": {"en": "Describe this exact product.", "ar": "وصف هذا المنتج بالتحديد."},
  "sizes": ["S", "M", "L", "XL"],
  "colors": ["Black"],
  "stock": 10,
  "is_available": true,
  "in_stock": true
}
```

The photograph must match the category, cut and available color. Prices and stock are demonstration data; the current photographic catalog is AI-generated for a fictional ASO collection.

## Cart and demo privacy

The cart stores only product IDs, size, color and quantity in `localStorage`; prices are re-derived from the catalog on load. Invalid/stale variants and quantities are discarded or bounded to available stock. The sample order confirmation is saved only in the current browser. Contact data is never transmitted or stored. Nothing contacts Supabase, Google, WhatsApp or a payment gateway.

## Publish

Upload this folder as the site root to GitHub Pages or Netlify (no build command). `vercel.json` also configures a static Vercel deployment, caching and security headers. If using Netlify, `_headers` provides corresponding headers. No environment variables are needed.

## Client brief acceptance

See [the item-by-item requirements and demo walkthrough](CLIENT-REQUIREMENTS.md). Static deployment is live at https://aso-clo-frontend-demo.vercel.app; Netlify configuration is included.

## Compatibility and verification

Grid: 320px = one column, 768px = two, 1024px = three, 1440px = four. Images have explicit dimensions, WebP encoding and lazy loading. Native dialog semantics provide focus trapping, Escape and modal background isolation. Input labels, inline errors, keyboard focus, reduced motion and Arabic RTL are supported.

Additional simulated viewports cover 280px, 360px, 390px, 430px, 568×320 landscape and 720×540 foldable proportions. Mobile fields use 16px text to avoid iOS focus zoom; safe-area insets, viewport-fit and dynamic viewport height keep modal controls reachable. These are viewport simulations, not device certification.

Current evergreen browsers are the target. Actual iOS Safari/Android device testing and all named browser engines must be verified separately; do not infer cross-browser certification from Chromium-only checks. A Lighthouse report documents measured results and conditions; lab scores vary with hosting/device/network.

The optional existing Next.js application at the repository root is separate and is not required to run or deploy this frontend. This folder is the frontend-only deliverable for the requested technical scope.
