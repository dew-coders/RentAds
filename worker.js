// Cloudflare Worker for RentAds.lk SEO-friendly routing
// This worker serves clean URLs like /rental/{slug}-{uuid} and /request/{slug}-{uuid}
//
// The worker rewrites incoming clean URLs to the appropriate page with
// the ID passed as a query parameter, since the frontend JS reads the ID
// from the path using pageId() in common.js.
//
// This improves SEO because search engines can index the clean URLs.
//
// See: https://developers.cloudflare.com/workers/

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Match ad clean URLs: /rental/{slug}-{uuid}
    const adMatch = pathname.match(/^\/rental\/([^/]+)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/)?$/i);
    if (adMatch) {
      const slug = adMatch[1];
      const id = adMatch[2];
      // Rewrite to search.html with the id as a query parameter
      // The frontend js/ad.js will read it from location.search via pageId()
      const newUrl = new URL('search.html', url.origin);
      newUrl.searchParams.set('id', id);
      return Response.redirect(newUrl, 301);
    }

    // Match wanted clean URLs: /request/{slug}-{uuid}
    const wantMatch = pathname.match(/^\/request\/([^/]+)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/)?$/i);
    if (wantMatch) {
      const slug = wantMatch[1];
      const id = wantMatch[2];
      // Rewrite to search.html with the id as a query parameter
      // The frontend js/common.js will read it from location.search via pageId()
      const newUrl = new URL('wanted.html', url.origin);
      newUrl.searchParams.set('id', id);
      return Response.redirect(newUrl, 301);
    }

    // Match search with category clean URL: /search?cat={slug}
    // (Optional: could add more routing rules here)

    // Return the original request for all other paths
    return fetch(request);
  }
};