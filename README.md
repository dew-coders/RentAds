# RentAds.lk - Sri Lanka's Rental Directory

**RentAds.lk** is a rental marketplace for Sri Lanka where users can find and rent anything from cars and vans to villas, generators, cameras, tents, and more. Vendors can post ads, and renters can post wanted requests.

![RentAds.lk Screenshot](https://rentads.lk/og-image.png)

## 🎯 Clean URL Routing (SEO Friendly)

This project implements SEO-friendly clean URLs that redirect to the appropriate pages while passing the ID as a query parameter. The frontend `pageId()` function reads the ID from either the clean URL path or the `?id=` query parameter.

### Supported URL Patterns

| Pattern | Description | Redirect Target |
|---|---|---|
| `/rental/{slug}-{uuid}` | Rental ad pages | `search.html?id={uuid}` |
| `/request/{slug}-{uuid}` | Wanted request pages | `wanted.html?id={uuid}` |
| `/search.html?id={uuid}` | Direct with query param | Works directly |
| `?id={uuid}` | Legacy query param | Works directly |

### How It Works

1. **Cloudflare Worker** (`worker.js`): Intercepts clean URLs and 301-redirects to pages with `?id=` query parameter
2. **`pageId()`** (`js/common.js`): Reads the UUID from either `location.pathname` or `location.search`
3. **Frontend modules** (`ad.js`, `wanted.js`, `search.js`, etc.): All use `pageId()` to get the current ad/request ID

This design ensures:
- **SEO benefit**: Search engines can index clean URLs
- **Backward compatibility**: Existing `?id=` links continue to work
- **Identical routing**: Both worker-rewritten URLs and direct `?id=` links work the same way

## 📁 Project Structure

```
rentads-lk/
├── index.html          # Homepage entry point
├── wanted.html         # Wanted requests page
├── rental.html         # Cloudflare default "not found" page
├── worker.js           # Cloudflare Worker for clean URL routing
├── wrangler.jsonc      # Cloudflare Worker configuration
├── css/
│   └── app.css         # Design system styles
├── js/
│   ├── ad.js           # Ads page module
│   ├── common.js       # Shared helpers + pageId() routing function
│   ├── wanted.js       # Wanted requests page module
│   ├── search.js       # Search results page module
│   ├── home.js         # Homepage module
│   ├── config.js       # Supabase credentials and settings
│   ├── supabase.js     # Supabase SDK initialization
│   ├── monitor.js      # Error tracking and monitoring
│   ├── i18n.js         # English/Sinhala language switch
│   ├── ranking.js      # Ranking/filter logic
│   ├── restore.js      # Back button state restoration
│   ├── legal.js        # Legal page
│   ├── i18n-si.js      # Sinhala localization
│   └── ...
├── favicon.ico
└── README.md           # This file
```

## 🛠️ Local Development

### Prerequisites
- **HTTP Server**: Project uses native ES Modules, cannot run via `file://`
- **Node.js** or **Python** for local development

### Setup

```bash
# 1. Start a local HTTP server
# Option A: Python
python3 -m http.server 3456

# Option B: Node (if serve is installed)
npx serve -l 3456

# 2. Visit the site at http://localhost:3456
```

### Testing Clean URLs

Visit these URLs and verify they work:

```bash
# Ad clean URL (redirects to search.html?id=...)
http://localhost:3456/rental/wagon-r-stingray-mh44ss-4a432ce9-8ecf-4b39-862f-2656ce98cbd8

# Wanted request clean URL (redirects to wanted.html?id=...)
http://localhost:3456/request/some-request-mh44ss-4a432ce9-8ecf-4b39-862f-2656ce98cbd8

# Direct ?id= link (works without worker)
http://localhost:3456/search.html?id=4a432ce9-8ecf-4b39-862f-2656ce98cbd8

# Homepage
http://localhost:3456/index.html
```

### Key Functions

- **`pageId()`** (`js/common.js`): Returns the current ad/request UUID from pathname or search params
- **`slugify(text, fallback)`** (`js/common.js`): Creates SEO-friendly slugs from text
- **`adPath(ad)`** (`js/common.js`): Creates clean URL path for an ad: `rental/{slug}-{id}`
- **`wantPath(r)`** (`js/common.js`): Creates clean URL path for a request: `request/{slug}-{id}`

## 🚀 Cloudflare Worker Deployment

### Prerequisites
1. Cloudflare account
2. `wrangler` CLI installed: `npm install -g wrangler`
3. Logged in to Cloudflare: `npx wrangler login`

### Deployment Steps

```bash
# 1. Install wrangler
npm install -g wrangler

# 2. Login to Cloudflare
npx wrangler login

# 3. Deploy the worker
npx wrangler deploy
```

### What Gets Deployed
- `worker.js` becomes the active Cloudflare Worker
- `wrangler.jsonc` configures it to handle `rentads.lk/*` routes
- After deployment: `https://rentads.lk/rental/wagon-r-stingray-mh44ss-4a432ce9-8ecf-4b39-862f-2656ce98cbd8` triggers the 301 redirect

### Without Cloudflare Access

Local testing works perfectly:
```bash
python3 -m http.server 3456
# Visit clean URLs - routing logic functions identically
```

## 🌐 Architecture Overview

### "No-Build" ESM Architecture
- **All dependencies loaded via jsdelivr CDN** with `modulepreload` in HTML
- **No npm install needed** during development
- **Native ES Modules** (`<script type="module">`)

### Key Components

| Component | Purpose |
|---|---|
| `worker.js` | Cloudflare Worker: redirects clean URLs to pages with `?id=` |
| `js/common.js` | Shared helpers, `pageId()` routing, slugify, adPath, wantPath |
| `js/wanted.js` | Wanted requests page module (follows `ad.js` pattern) |
| `wanted.html` | Entry point for wanted pages with modulepreloads |
| `index.html` | Homepage entry point |
| `js/config.js` | Supabase credentials and settings |
| `css/app.css` | Design system styles |

### ID Routing Flow

```
User visits clean URL
    ↓
Worker 301-redirects to ?id= page
    ↓
Browser navigates to search.html?id={uuid}
    ↓
js/common.js loads
    ↓
pageId() reads UUID from location.search
    ↓
Module (ad.js/wanted.js) fetches and displays content
```

### Supported Browsers
- Modern browsers with ES Module support
- Cloudflare Workers runtime

## 📦 Dependencies

All dependencies are loaded via jsdelivr CDN from the `index.html` modulepreloads:

- `@supabase/supabase-js@2.118.0` - Supabase SDK
- `@supabase/auth-js@2.118.0` - Authentication
- `@supabase/postgrest-js@2.118.0` - PostgREST client
- `@supabase/realtime-js@2.118.0` - Real-time subscriptions
- `@supabase/storage-js@2.118.0` - Storage client
- `@supabase/functions-js@2.118.0` - Edge functions
- `@supabase/phoenix@0.4.5` - Phoenix client
- `iceberg-js@0.8.1` - UI framework/components
- `tslib@2.8.1` - TypeScript runtime

## 🔧 Development Notes

### Adding New Pages
1. Create the HTML file with proper `modulepreload` links
2. Create a corresponding `.js` module following the `ad.js`/`wanted.js` pattern
3. The `pageId()` function in `common.js` will automatically handle routing

### Adding New URL Patterns
1. Update `worker.js` with a new `pathname.match()` rule
2. The `pageId()` function already handles UUID extraction from pathname
3. Existing modules will work without changes

### Backward Compatibility
- All existing `?id=` query parameter links continue to work
- Worker redirection is optional; the frontend handles both sources identically
- No breaking changes when enabling/disabling the worker

## 🐛 Troubleshooting

### Clean URLs Not Redirecting
1. **Worker not deployed**: Deploy with `npx wrangler deploy`
2. **Wrong UUID format**: Ensure UUID matches `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`
3. **Pathname not matching**: Check the worker regex patterns

### pageId() Returning Null
1. **UUID not at end of pathname**: The regex `UUID_AT_END` matches at the end of `location.pathname`
2. **Missing `?id=` param**: Ensure the URL has `?id={uuid}` or the worker redirected there
3. **Wrong page**: `pageId()` is designed for ad/wanted pages, not generic pages

### Local Server Required
- Error: `import.meta.url` not available in `file://`
- Solution: Always use `python3 -m http.server` or `npx serve`

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- Cloudflare Workers for the routing layer
- Supabase for the backend/database
- jsdelivr for CDN dependency hosting
- Sri Lanka rental market for the use case