// Detects whether the page being reviewed is built with Recursica, and
// which versions, so the report can say which Recursica build a page's
// feedback applies to. Best-effort, read-only, and never blocking:
//
// - Presence and mode: elements carrying data-recursica-theme (light or
//   dark) and data-recursica-layer (0 to 3).
// - Forge and transform versions: the theme stylesheet
//   (recursica_variables_scoped.css) begins with a header comment holding
//   "Source JSON version: x.y.z" (the Forge export) and "Transform version:
//   x.y.z". Only same-origin stylesheets and <style> elements are read, and
//   only their first few KB - no request goes to another origin, and
//   nothing else on the page is read or stored. A minified sheet without
//   comments simply yields nothing.
// - Adapter version: the adapter exposes none today. Reported only if the
//   page itself offers one, as a data-recursica-adapter-version attribute
//   or a --recursica-adapter-version custom property.
//
// Everything found is page-derived and untrusted: values are checked
// against a strict version pattern before they are kept.

export interface RecursicaDetection {
  // Whether any sign of Recursica was found on the page.
  recursica: boolean;
  // The theme mode(s) found on data-recursica-theme.
  themeMode?: "light" | "dark" | "mixed";
  // The data-recursica-layer levels found, ascending.
  layers?: number[];
  // "Source JSON version" from the theme stylesheet's header comment.
  forgeVersion?: string;
  // "Transform version" from the same header comment.
  transformVersion?: string;
  // Only if the page exposes one (see above).
  adapterVersion?: string;
}

// A version string as it may appear in a header or attribute. Anything
// else is not kept.
export const VERSION_SHAPE = /^[0-9][0-9A-Za-z.+-]{0,39}$/;

// How much of each stylesheet is read: the header comment is at the very
// top.
const READ_BYTES = 4096;
// How long one stylesheet read may take, and the whole detection.
const SHEET_TIMEOUT_MS = 1500;
const TOTAL_TIMEOUT_MS = 2500;
// At most this many elements are inspected for layers, so a huge page
// can't make detection slow.
const MAX_LAYER_ELEMENTS = 2000;

function versionFrom(text: string, label: string): string | undefined {
  const match = new RegExp(`${label}:\\s*([0-9][0-9A-Za-z.+-]{0,39})`).exec(
    text,
  );
  return match && VERSION_SHAPE.test(match[1]) ? match[1] : undefined;
}

async function readStart(href: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHEET_TIMEOUT_MS);
  try {
    const res = await fetch(href, {
      signal: controller.signal,
      credentials: "same-origin",
      cache: "force-cache",
    });
    if (!res.ok || !res.body) return "";
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < READ_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
    }
    void reader.cancel().catch(() => {});
    const bytes = new Uint8Array(Math.min(total, READ_BYTES));
    let offset = 0;
    for (const chunk of chunks) {
      const part = chunk.subarray(0, bytes.length - offset);
      bytes.set(part, offset);
      offset += part.length;
      if (offset >= bytes.length) break;
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

// The start of every same-origin stylesheet on the page, and of every
// <style> element. Cross-origin sheets are skipped without a request.
async function stylesheetStarts(): Promise<string[]> {
  const starts: string[] = [];
  const reads: Promise<string>[] = [];
  for (const el of document.querySelectorAll("style")) {
    starts.push((el.textContent ?? "").slice(0, READ_BYTES));
  }
  for (const link of document.querySelectorAll<HTMLLinkElement>(
    'link[rel~="stylesheet"][href]',
  )) {
    let url: URL;
    try {
      url = new URL(link.href, location.href);
    } catch {
      continue;
    }
    if (url.origin !== location.origin) continue;
    reads.push(readStart(url.href));
  }
  starts.push(...(await Promise.all(reads)));
  return starts;
}

function adapterVersionFromPage(): string | undefined {
  const attr = document
    .querySelector("[data-recursica-adapter-version]")
    ?.getAttribute("data-recursica-adapter-version")
    ?.trim();
  if (attr && VERSION_SHAPE.test(attr)) return attr;
  const themed =
    document.querySelector("[data-recursica-theme]") ??
    document.documentElement;
  const prop = getComputedStyle(themed)
    .getPropertyValue("--recursica-adapter-version")
    .trim()
    .replace(/^["']|["']$/g, "");
  return prop && VERSION_SHAPE.test(prop) ? prop : undefined;
}

async function detect(): Promise<RecursicaDetection> {
  const modes = new Set<string>();
  for (const el of document.querySelectorAll("[data-recursica-theme]")) {
    const mode = el.getAttribute("data-recursica-theme");
    if (mode === "light" || mode === "dark") modes.add(mode);
  }
  const layers = new Set<number>();
  const layerEls = document.querySelectorAll("[data-recursica-layer]");
  for (let i = 0; i < Math.min(layerEls.length, MAX_LAYER_ELEMENTS); i += 1) {
    const level = Number(layerEls[i].getAttribute("data-recursica-layer"));
    if (Number.isInteger(level) && level >= 0 && level <= 3) layers.add(level);
  }

  let forgeVersion: string | undefined;
  let transformVersion: string | undefined;
  for (const text of await stylesheetStarts()) {
    if (!text.includes("Recursica")) continue;
    forgeVersion ??= versionFrom(text, "Source JSON version");
    transformVersion ??= versionFrom(text, "Transform version");
    if (forgeVersion && transformVersion) break;
  }
  const adapterVersion = adapterVersionFromPage();

  const result: RecursicaDetection = {
    recursica:
      modes.size > 0 ||
      layers.size > 0 ||
      Boolean(forgeVersion || transformVersion || adapterVersion),
  };
  if (modes.size === 1) result.themeMode = [...modes][0] as "light" | "dark";
  else if (modes.size > 1) result.themeMode = "mixed";
  if (layers.size > 0) result.layers = [...layers].sort((a, b) => a - b);
  if (forgeVersion) result.forgeVersion = forgeVersion;
  if (transformVersion) result.transformVersion = transformVersion;
  if (adapterVersion) result.adapterVersion = adapterVersion;
  return result;
}

// Never throws and never takes longer than the total timeout; on any
// failure it reports only what it could see from the DOM.
export async function detectRecursica(): Promise<RecursicaDetection> {
  const fallback = new Promise<RecursicaDetection>((resolve) =>
    setTimeout(
      () =>
        resolve({
          recursica: Boolean(
            document.querySelector(
              "[data-recursica-theme], [data-recursica-layer]",
            ),
          ),
        }),
      TOTAL_TIMEOUT_MS,
    ),
  );
  try {
    return await Promise.race([detect(), fallback]);
  } catch {
    return { recursica: false };
  }
}

// Normalizes a detection read from storage: keeps only well-formed fields,
// and returns undefined for anything that isn't a detection at all.
export function sanitizeDetection(
  raw: unknown,
): RecursicaDetection | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Record<string, unknown>;
  if (typeof d.recursica !== "boolean") return undefined;
  const out: RecursicaDetection = { recursica: d.recursica };
  if (
    d.themeMode === "light" ||
    d.themeMode === "dark" ||
    d.themeMode === "mixed"
  )
    out.themeMode = d.themeMode;
  if (Array.isArray(d.layers)) {
    const layers = d.layers.filter(
      (n): n is number => Number.isInteger(n) && n >= 0 && n <= 3,
    );
    if (layers.length > 0) out.layers = [...new Set(layers)].sort();
  }
  for (const key of [
    "forgeVersion",
    "transformVersion",
    "adapterVersion",
  ] as const) {
    const v = d[key];
    if (typeof v === "string" && VERSION_SHAPE.test(v)) out[key] = v;
  }
  return out;
}
