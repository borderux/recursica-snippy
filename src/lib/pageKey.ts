// The key a page's comments are filed under: origin, path and query, plus
// the fragment when it is a route (#/... or #!..., as hash-routed apps
// use), so each route is its own page. A plain fragment (#top, #section)
// is not a different page. Keys stored before hash routes counted stay as
// they were.
//
// Read from the tab's address (the side panel is not in the page). Only
// web and file pages have a key: anything else (chrome://, the new tab
// page, the Web Store's own pages) is a page Snippy can't comment on.
export function pageKeyFromUrl(address: string | undefined): string | null {
  if (!address) return null;
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (!["http:", "https:", "file:"].includes(url.protocol)) return null;
  const route = /^#[/!]/.test(url.hash) ? url.hash : "";
  return url.origin + url.pathname + url.search + route;
}
