// Links from a comment back to where it came from: its page, and for an
// element comment, the element itself when the page gives it a simple,
// unique id - the only kind of fragment a browser can scroll to. Nothing
// is invented from class names or selector paths.
import type { CapturedElement } from "./types";

// A plain id that needs no escaping in a URL fragment or a CSS selector.
const SIMPLE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,99}$/;

// The element's id, when it is simple and was unique on the page: the
// selector is exactly "#<id>" only when the element's id matched one
// element in the document at capture time (see selectorFor in element.ts;
// an element inside a shadow root has " >>> " in its selector, and a
// fragment can't reach it), and the captured HTML's own id must agree.
export function elementFragmentId(el: CapturedElement): string | null {
  const match = /^#([A-Za-z][A-Za-z0-9_-]*)$/.exec(el.selector);
  if (!match || !SIMPLE_ID.test(match[1])) return null;
  const htmlId = /^<[a-zA-Z][^>]*\sid\s*=\s*"([^"]*)"/.exec(el.html)?.[1];
  return htmlId === match[1] ? match[1] : null;
}

// The page's stored address as a link target - only for web and file
// pages, never anything else a page key could hold.
export function pageHref(pageKey: string): string | null {
  try {
    const url = new URL(pageKey);
    return ["http:", "https:", "file:"].includes(url.protocol)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// Where a comment links: its page, plus #id for an element with a simple,
// unique id.
export function commentHref(
  pageKey: string,
  element?: CapturedElement,
): string | null {
  const href = pageHref(pageKey);
  if (!href) return null;
  const id = element ? elementFragmentId(element) : null;
  if (!id) return href;
  const url = new URL(href);
  // A page address that already has a fragment (a hash route such as
  // #/orders/42) keeps it: replacing it with #id would open a different
  // view. The link then goes to the page only.
  if (url.hash) return href;
  url.hash = id;
  return url.href;
}
