// What the reviewer's browser and screen were like, so a developer can
// reproduce what they saw. Deliberately small (see ARCHITECTURE.md,
// "Environment"): no IP, cookies, storage, extensions, fonts, plugins,
// canvas or any other fingerprinting, and nothing from the page beyond two
// attributes on its <html> or <body> (theme and language).

export interface SessionEnvironment {
  browser?: { name: string; version?: string };
  os?: { name: string; version?: string };
  userAgent?: string;
  language?: string;
  timeZone?: string;
  screen?: { width: number; height: number };
}

export interface CommentContext {
  capturedAt?: number;
  viewport?: { width: number; height: number };
  dpr?: number;
  // visualViewport.scale: 1 unless the page is pinch-zoomed. Browser zoom
  // shows up in dpr, and cannot be told apart from the screen's own ratio.
  zoom?: number;
  scroll?: { x: number; y: number };
  scrollHeight?: number;
  // The prefers-color-scheme media query at the time.
  colorScheme?: "light" | "dark";
  // A theme attribute on the page's <html> or <body>, if an obvious one
  // is there (data-recursica-theme, data-theme, data-color-mode,
  // data-bs-theme, data-mantine-color-scheme).
  pageTheme?: string;
  // The page's <html lang>.
  lang?: string;
}

const TOKEN = /^[A-Za-z0-9_.+-]{1,40}$/;
const LANG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8}){0,4}$/;
const THEME_ATTRS = [
  "data-recursica-theme",
  "data-theme",
  "data-color-mode",
  "data-bs-theme",
  "data-mantine-color-scheme",
];

type UAData = {
  brands?: { brand: string; version: string }[];
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{
    fullVersionList?: { brand: string; version: string }[];
    platformVersion?: string;
  }>;
};
const uaData = (): UAData | undefined =>
  (navigator as Navigator & { userAgentData?: UAData }).userAgentData;

// The brand that names the browser, ignoring the placeholder and the
// engine brand when a product brand is present.
function pickBrand(list: { brand: string; version: string }[] | undefined) {
  const real = (list ?? []).filter((b) => !/not.?a.?brand/i.test(b.brand));
  return real.find((b) => b.brand !== "Chromium") ?? real[0];
}

function browserFromUA(ua: string): SessionEnvironment["browser"] {
  const tests: [string, RegExp][] = [
    ["Edge", /Edg\/([\d.]+)/],
    ["Opera", /OPR\/([\d.]+)/],
    ["Firefox", /Firefox\/([\d.]+)/],
    ["Chrome", /Chrome\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, re] of tests) {
    const m = re.exec(ua);
    if (m) return { name, version: m[1] };
  }
  return undefined;
}

function osFromUA(ua: string): SessionEnvironment["os"] {
  if (/Windows NT ([\d.]+)/.test(ua))
    return { name: "Windows", version: /Windows NT ([\d.]+)/.exec(ua)?.[1] };
  if (/CrOS/.test(ua)) return { name: "ChromeOS" };
  if (/Android ([\d.]+)/.test(ua))
    return { name: "Android", version: /Android ([\d.]+)/.exec(ua)?.[1] };
  if (/(iPhone|iPad).*OS ([\d_]+)/.test(ua))
    return {
      name: "iOS",
      version: /OS ([\d_]+)/.exec(ua)?.[1].replace(/_/g, "."),
    };
  if (/Mac OS X/.test(ua)) return { name: "macOS" };
  if (/Linux/.test(ua)) return { name: "Linux" };
  return undefined;
}

// What can be read at once. Browser versions from the user agent are
// often reduced (Chrome freezes the macOS version at 10.15.7, so it is not
// reported); richer values come from the async version below.
export function sessionEnvironmentNow(): SessionEnvironment {
  const ua = navigator.userAgent;
  const data = uaData();
  const brand = pickBrand(data?.brands);
  const env: SessionEnvironment = {
    browser: brand
      ? { name: brand.brand.replace(/^Google /, ""), version: brand.version }
      : browserFromUA(ua),
    os: data?.platform ? { name: data.platform } : osFromUA(ua),
    userAgent: ua,
    language: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: { width: screen.width, height: screen.height },
  };
  return sanitizeEnvironment(env) ?? {};
}

// The same, with the full browser version and the OS version where the
// browser offers them (user-agent client hints, Chromium only).
export async function sessionEnvironment(): Promise<SessionEnvironment> {
  const env = sessionEnvironmentNow();
  const data = uaData();
  if (!data?.getHighEntropyValues) return env;
  try {
    const high = await data.getHighEntropyValues([
      "fullVersionList",
      "platformVersion",
    ]);
    const brand = pickBrand(high.fullVersionList);
    if (brand && env.browser) env.browser.version = brand.version;
    if (high.platformVersion && env.os) env.os.version = high.platformVersion;
  } catch {
    // Keep what was read at once.
  }
  return sanitizeEnvironment(env) ?? env;
}

// The page and window at the moment a comment is made or captured.
export function commentContextNow(): CommentContext {
  const html = document.documentElement;
  let pageTheme: string | undefined;
  for (const el of [html, document.body]) {
    for (const attr of THEME_ATTRS) {
      const value = el?.getAttribute(attr)?.trim();
      if (value && !pageTheme) pageTheme = value;
    }
  }
  return (
    sanitizeContext({
      capturedAt: Date.now(),
      viewport: { width: innerWidth, height: innerHeight },
      dpr: window.devicePixelRatio || 1,
      zoom: window.visualViewport?.scale,
      scroll: { x: Math.round(scrollX), y: Math.round(scrollY) },
      scrollHeight: html.scrollHeight,
      colorScheme: matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
      pageTheme,
      lang: html.lang || undefined,
    }) ?? {}
  );
}

const int = (n: unknown, max = 100000): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;
const str = (s: unknown, re: RegExp): s is string =>
  typeof s === "string" && re.test(s);

// Keeps only well-formed environment fields; undefined if none survive.
export function sanitizeEnvironment(
  raw: unknown,
): SessionEnvironment | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: SessionEnvironment = {};
  for (const key of ["browser", "os"] as const) {
    const v = r[key] as Record<string, unknown> | undefined;
    if (
      v &&
      typeof v === "object" &&
      str(v.name, /^[A-Za-z0-9 ._()-]{1,40}$/)
    ) {
      out[key] = {
        name: v.name,
        ...(str(v.version, TOKEN) ? { version: v.version } : {}),
      };
    }
  }
  if (typeof r.userAgent === "string" && r.userAgent.length <= 500)
    out.userAgent = r.userAgent;
  if (str(r.language, LANG)) out.language = r.language;
  if (str(r.timeZone, /^[A-Za-z_+-]{1,32}(\/[A-Za-z0-9_+-]{1,32}){0,2}$/))
    out.timeZone = r.timeZone;
  const s = r.screen as Record<string, unknown> | undefined;
  if (s && int(s.width) && int(s.height))
    out.screen = { width: s.width, height: s.height };
  return Object.keys(out).length ? out : undefined;
}

// Keeps only well-formed context fields; undefined if none survive.
export function sanitizeContext(raw: unknown): CommentContext | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: CommentContext = {};
  if (int(r.capturedAt, 1e14)) out.capturedAt = r.capturedAt;
  const v = r.viewport as Record<string, unknown> | undefined;
  if (v && int(v.width) && int(v.height))
    out.viewport = { width: v.width, height: v.height };
  if (typeof r.dpr === "number" && r.dpr > 0 && r.dpr <= 8) out.dpr = r.dpr;
  if (typeof r.zoom === "number" && r.zoom > 0 && r.zoom <= 20)
    out.zoom = r.zoom;
  const sc = r.scroll as Record<string, unknown> | undefined;
  if (sc && int(sc.x, 1e7) && int(sc.y, 1e7)) out.scroll = { x: sc.x, y: sc.y };
  if (int(r.scrollHeight, 1e7)) out.scrollHeight = r.scrollHeight;
  if (r.colorScheme === "light" || r.colorScheme === "dark")
    out.colorScheme = r.colorScheme;
  if (str(r.pageTheme, /^[A-Za-z0-9_-]{1,32}$/)) out.pageTheme = r.pageTheme;
  if (str(r.lang, LANG)) out.lang = r.lang;
  return Object.keys(out).length ? out : undefined;
}
