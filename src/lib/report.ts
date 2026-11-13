// Builds the downloaded report: a single self-contained HTML file with no
// external requests and zero JavaScript (the screenshot lightbox is pure
// CSS, using :target). report.css and the AI instructions are inlined at
// build time because a downloaded standalone file cannot fetch a sibling
// file. Dates and counts use the panel's shared formatters.
import REPORT_CSS from "../report.css?raw";
import AI_INSTRUCTIONS from "../ai-report-instructions.txt?raw";
import { HTML_CAP } from "./element";
import { formatCount, formatDateTimeWithZone, plural } from "./format";
import { commentName, formatCommentId } from "./ids";
import { commentHref } from "./links";
import type { RecursicaDetection } from "./recursica";
import type { CommentContext, SessionEnvironment } from "./environment";
import type { CapturedElement, Session } from "./types";

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// An element comment's captured element: its selector, viewport, and its
// HTML and styles in collapsible sections (<details> needs no JavaScript).
// All of it is copied from the reviewed page, so all of it is escaped.
function elementHtml(el: CapturedElement): string {
  const notes = [
    el.htmlTruncated &&
      `HTML truncated to ${formatCount(HTML_CAP)} characters.`,
    el.stylesTruncated && "Styles truncated.",
    el.screenshotClipped &&
      "The screenshot shows only the part of the element that was on screen.",
  ].filter(Boolean) as string[];
  const styles = Object.entries(el.styles)
    .map(([name, value]) => `${name}: ${value};`)
    .join("\n");
  // A visible "Element" label first, so a person can tell what the
  // selector line below it is.
  return `<div class="comment-element"><p class="element-label">Element</p><p class="element-selector"><code>${escapeHtml(el.selector)}</code></p>${el.viewport ? `<p class="element-meta">Viewport ${formatCount(el.viewport.width)} × ${formatCount(el.viewport.height)}</p>` : ""}${notes.map((n) => `<p class="element-note">${escapeHtml(n)}</p>`).join("")}<details class="element-html"><summary>HTML</summary><pre><code>${escapeHtml(el.html)}</code></pre></details><details class="element-styles"><summary>Styles</summary><pre><code>${escapeHtml(styles)}</code></pre></details></div>`;
}

// A page's Recursica line: what was detected about the reviewed page (not
// about Snippy), in words and as data attributes an AI can parse. Pages
// whose comments predate detection say "not checked". All values are
// page-derived; they were validated against a version pattern on the way
// in and are escaped here.
function recursicaLine(d: RecursicaDetection | undefined): string {
  if (!d)
    return `<p class="page-recursica" data-recursica="not-checked">Recursica: not checked</p>`;
  const attrs = [
    `data-recursica="${d.recursica ? "yes" : "no"}"`,
    d.forgeVersion && `data-forge-version="${escapeHtml(d.forgeVersion)}"`,
    d.transformVersion &&
      `data-transform-version="${escapeHtml(d.transformVersion)}"`,
    d.adapterVersion &&
      `data-adapter-version="${escapeHtml(d.adapterVersion)}"`,
    d.themeMode && `data-theme-mode="${d.themeMode}"`,
    d.layers && `data-layers="${d.layers.join(",")}"`,
  ]
    .filter(Boolean)
    .join(" ");
  if (!d.recursica)
    return `<p class="page-recursica" ${attrs}>Recursica: not detected</p>`;
  const parts = ["yes"];
  parts.push(
    d.forgeVersion
      ? `Forge ${escapeHtml(d.forgeVersion)}${d.transformVersion ? ` (transform ${escapeHtml(d.transformVersion)})` : ""}`
      : "Forge version not detected",
  );
  parts.push(
    d.adapterVersion
      ? `adapter ${escapeHtml(d.adapterVersion)}`
      : "adapter not detected",
  );
  if (d.themeMode)
    parts.push(
      d.themeMode === "mixed"
        ? "light and dark themes"
        : `${d.themeMode} theme`,
    );
  return `<p class="page-recursica" ${attrs}>Recursica: ${parts.join(", ")}</p>`;
}

const attr = (name: string, value: string | number | undefined) =>
  value === undefined || value === ""
    ? ""
    : ` ${name}="${escapeHtml(String(value))}"`;

// The reviewer's environment, in words for people and as meta tags for
// agents. The color scheme and reduced-motion preference are read now, at
// report time.
function environmentHtml(env: SessionEnvironment | undefined) {
  const scheme = matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const b = env?.browser,
    o = env?.os;
  const browser = b ? `${b.name}${b.version ? ` ${b.version}` : ""}` : "";
  const os = o ? `${o.name}${o.version ? ` ${o.version}` : ""}` : "";
  const parts = [
    browser && (os ? `${browser} on ${os}` : browser),
    !browser && os,
    env?.language && `language ${env.language}`,
    env?.timeZone,
    env?.screen &&
      `screen ${formatCount(env.screen.width)} × ${formatCount(env.screen.height)}`,
    `${scheme} mode`,
    reduced ? "reduced motion" : "",
  ].filter(Boolean) as string[];
  const meta = [
    ["snippy-browser", b?.name],
    ["snippy-browser-version", b?.version],
    ["snippy-os", o?.name],
    ["snippy-os-version", o?.version],
    ["snippy-user-agent", env?.userAgent],
    ["snippy-language", env?.language],
    ["snippy-time-zone", env?.timeZone],
    [
      "snippy-screen",
      env?.screen && `${env.screen.width}x${env.screen.height}`,
    ],
    ["snippy-color-scheme", scheme],
    ["snippy-reduced-motion", reduced ? "reduce" : "no-preference"],
  ]
    .filter(([, v]) => v)
    .map(([n, v]) => `<meta name="${n}" content="${escapeHtml(String(v))}">`)
    .join("\n");
  return {
    meta,
    line: `<p class="report-meta report-environment">Environment: ${escapeHtml(parts.join(" · "))}</p>`,
  };
}

// A comment's context: one small line in words, the same facts as data
// attributes. Absent for comments made before the context existed.
function contextHtml(c: CommentContext | undefined): string {
  if (!c) return "";
  const words = [
    c.viewport &&
      `Viewport ${formatCount(c.viewport.width)} × ${formatCount(c.viewport.height)}${c.dpr ? ` at ${Number(c.dpr.toFixed(2))}x` : ""}`,
    c.zoom && c.zoom !== 1 ? `zoomed ${Number(c.zoom.toFixed(2))}x` : "",
    c.colorScheme,
    c.pageTheme && c.pageTheme !== c.colorScheme
      ? `page theme ${c.pageTheme}`
      : "",
    c.scroll &&
      `scrolled ${formatCount(c.scroll.y)}${c.scrollHeight ? ` of ${formatCount(c.scrollHeight)}` : ""}`,
    c.capturedAt && formatDateTimeWithZone(c.capturedAt),
  ].filter(Boolean) as string[];
  const attrs = [
    attr(
      "data-captured-at",
      c.capturedAt && new Date(c.capturedAt).toISOString(),
    ),
    attr("data-viewport-width", c.viewport?.width),
    attr("data-viewport-height", c.viewport?.height),
    attr("data-dpr", c.dpr),
    attr("data-zoom", c.zoom),
    attr("data-scroll-x", c.scroll?.x),
    attr("data-scroll-y", c.scroll?.y),
    attr("data-scroll-height", c.scrollHeight),
    attr("data-color-scheme", c.colorScheme),
    attr("data-page-theme", c.pageTheme),
    attr("data-page-lang", c.lang),
  ].join("");
  return `<p class="comment-context"${attrs}>${escapeHtml(words.join(" · "))}</p>`;
}

export function totalCommentCount(session: Session | null): number {
  if (!session) return 0;
  return Object.values(session.pages).reduce(
    (sum, page) => sum + page.comments.length,
    0,
  );
}

interface ReportInput {
  session: Session | null;
  userName: string;
  userEmail: string;
}

export function buildReportHtml({
  session,
  userName,
  userEmail,
}: ReportInput): string {
  const pages = Object.entries(session?.pages || {}).filter(
    ([, page]) => page.comments.length > 0,
  );
  const totalCount = totalCommentCount(session);
  const pageCount = pages.length;

  // Global across the whole report, not per-page, so two different
  // pages' anchors can never collide.
  let shotIndex = 0;
  const lightboxTargets: string[] = [];

  const tocHtml = pages
    .map(([url], i) => `<li><a href="#page-${i}">${escapeHtml(url)}</a></li>`)
    .join("\n");

  const pagesHtml = pages
    .map(([url, page], i) => {
      // Oldest first: ascending comment number, the order they were made.
      // (Each page stores its comments newest first, for the panel.)
      const commentsHtml = [...page.comments]
        .sort((a, b) => a.commentNumber - b.commentNumber)
        .map((comment) => {
          let shotsHtml = "";
          // A thumbnail linked to its full-size lightbox. The lightbox
          // target lives at the end of the document; :target matching
          // doesn't care where in the DOM it sits.
          const shot = (src: string, alt: string) => {
            const shotId = `shot-${shotIndex}`;
            shotIndex += 1;
            lightboxTargets.push(
              `<a href="#_" id="${shotId}" class="lightbox"><img src="${src}" alt="${escapeHtml(alt)}" /></a>`,
            );
            return `<a href="#${shotId}" class="shot-thumb-link"><img class="shot-thumb" src="${src}" alt="${escapeHtml(alt)}" /></a>`;
          };
          const marks = comment.annotations ?? [];
          if (comment.screenshot && comment.screenshotClean && marks.length) {
            // Annotated: both images, each labelled, the annotated first.
            const dots = marks.filter((a) => a.kind === "dot").length;
            shotsHtml = `<div class="comment-shots"><figure class="shot shot-annotated" data-annotation-count="${marks.length}" data-dot-count="${dots}">${shot(comment.screenshot, "Screenshot with annotations")}<figcaption>With annotations</figcaption></figure><figure class="shot shot-clean">${shot(comment.screenshotClean, "Screenshot, original, no annotations")}<figcaption>Original, no annotations</figcaption></figure></div>`;
          } else if (comment.screenshot) {
            shotsHtml = `<div class="comment-shots">${shot(comment.screenshot, "Screenshot")}</div>`;
          }
          // The comment number is its position, 1 to N across the session.
          // With the hidden session guid (in the head, once) it identifies
          // a comment within this one report - not across reports, since
          // a delete renumbers the comments after it.
          const hasNumber = comment.commentNumber != null;
          const commentId = hasNumber
            ? formatCommentId(comment.commentNumber)
            : "";
          // Every comment links back to its own page, so a comment read on
          // its own still says where it came from - an element comment to
          // the element itself when it had a simple, unique id. The visible
          // text is the full address, query and fragment included, the
          // same as the href (small and muted, by the number).
          const href = commentHref(url, comment.element);
          const linkText = href ?? "";
          const linkHtml = href
            ? `<p class="comment-link"><a href="${escapeHtml(href)}">${escapeHtml(linkText)}</a></p>`
            : "";
          return `<div class="comment" data-comment-id="${escapeHtml(commentId)}"><div class="comment-body">${hasNumber ? `<p class="comment-id">${escapeHtml(commentName(comment.commentNumber, true))}</p>` : ""}${linkHtml}<p class="comment-text">${escapeHtml(comment.text).replace(/\n/g, "<br>")}</p>${contextHtml(comment.context)}${comment.element ? elementHtml(comment.element) : ""}</div>${shotsHtml}</div>`;
        })
        .join("\n");

      // url is the full page key; the visible text is the same full
      // address, query and fragment included (a page whose address is
      // only a query or a hash route otherwise reads as just the domain).
      return `<div class="page-section" id="page-${i}">
<h2 class="page-url"><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></h2>
${recursicaLine(page.recursica)}
${commentsHtml}
</div>`;
    })
    .join("\n");

  const env = environmentHtml(session?.environment);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Snippy report</title>
${session?.guid ? `<meta name="snippy-session-id" content="${escapeHtml(session.guid)}">` : ""}
<meta name="snippy-version" content="${escapeHtml(__APP_VERSION__)}">
<meta name="snippy-built-with-adapter-version" content="${escapeHtml(__ADAPTER_VERSION__)}">
<meta name="snippy-built-with-forge-version" content="${escapeHtml(__FORGE_VERSION__)}">
<meta name="snippy-built-with-transform-version" content="${escapeHtml(__TRANSFORM_VERSION__)}">
${env.meta}
<meta name="ai-report-instructions" content="${escapeHtml(AI_INSTRUCTIONS)}">
<style>${REPORT_CSS}</style>
</head>
<body>
<div class="report-header">
<h1>Snippy report</h1>
<p class="report-meta">Started ${session ? formatDateTimeWithZone(session.startedAt) : "-"} — ${plural(totalCount, "comment", "comments")} across ${plural(pageCount, "page", "pages")}</p>
${userName ? `<p class="report-meta">Reviewer: ${escapeHtml(userName)}</p>` : ""}
${userEmail ? `<p class="report-meta">Email: ${escapeHtml(userEmail)}</p>` : ""}
${session?.details ? `<p class="report-meta">Details: ${escapeHtml(session.details)}</p>` : ""}
${env.line}
<p class="report-meta report-built-with">Snippy ${escapeHtml(__APP_VERSION__)} built with: @recursica/adapter-mantine-v8 ${escapeHtml(__ADAPTER_VERSION__)}, Forge theme ${escapeHtml(__FORGE_VERSION__)} (transform ${escapeHtml(__TRANSFORM_VERSION__)})</p>
</div>
<nav class="toc">
<h2>Pages reviewed</h2>
<ol>
${tocHtml}
</ol>
</nav>
${pagesHtml}
${lightboxTargets.join("\n")}
</body>
</html>
`;
}

export function downloadReport(input: ReportInput): void {
  const blob = new Blob([buildReportHtml(input)], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `snippy-report-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
