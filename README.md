# Snippy

A Manifest V3 Chrome extension for capturing UI/UX feedback on any website.
Click the toolbar icon and Snippy opens in Chrome's side panel, where it
stays as you move between pages, sites and tabs — no changes needed on the
target site, no backend, and no JavaScript in what you export.

## About

Snippy is made by [Recursica](https://recursica.com). The source is at
[github.com/borderux/recursica-snippy](https://github.com/borderux/recursica-snippy); report
problems in its [issues](https://github.com/borderux/recursica-snippy/issues). The
version comes from `package.json` alone: the build writes it into the
manifest and the panel, and fails if they would differ.

## Features

- **Works on any site, and stays open** — the panel is Chrome's side
  panel, so it stays open across page loads, sites and tabs in the window,
  showing the active tab's comments. Not tied to any one domain or
  embedded snippet. Browser pages (chrome://, the Chrome Web Store) can't
  be reviewed; the panel says so there.
- **Comments and screenshots**, grouped into a single review **session**
  that spans every page visited, not scoped to one tab or one origin.
- **One Add menu** — the plus button in the panel header offers Comment,
  Screenshot or Element. Each creates a new numbered comment card at the
  top of the list, with focus in its text box.
- **This page only, or every page** — two checkboxes at the end of the
  comment list. "Only view comments for this url" (checked by default) shows
  just the current page's comments; unchecked, it shows every page's,
  grouped under page headings that link to each page. "Show screenshot
  thumbnails" (checked by
  default) can hide the screenshots in the panel (never in the report).
  Both are remembered.
- **Screenshot capture with editable annotations** — drag-select any
  region of the page, then use Add annotations to mark it up (in a tab of
  its own beside the page, with room to work) with a pen,
  arrows (pointing down and to the left) and numbered dots, in one of six
  colors (red by default; the last choice is remembered). Every mark has a
  thin contrasting outline so it shows on light and dark screenshots. Each
  one can be selected, moved and deleted, with undo and redo, and they
  stay editable after saving: Snippy keeps the clean screenshot and the
  marks, and the report includes both images.
- **Element capture** — Add, then Element, lets you pick any element on the page,
  like the browser's element inspector (hover and click, or the arrow keys
  and Enter). Snippy records its selector, HTML, key computed styles, the
  viewport size and a screenshot of just that element, with typed form
  values and script contents removed.
- **Built on the Recursica design system** (React, TypeScript and the
  Recursica Mantine adapter, with Snippy's own Recursica Forge theme
  export), in
  light or dark mode following your operating system.
- **Environment in the report** — the reviewer's browser, OS, language,
  time zone and screen, and for each comment the viewport, pixel ratio,
  scroll position and light/dark setting at that moment, so a developer
  can reproduce the layout. Nothing else is collected (see ARCHITECTURE.md,
  "Environment").
- **Keyboard shortcuts** while the panel is open, shown after each label:
  add a comment, screenshot or element, duplicate or annotate the focused
  comment, and the two view options (Control+Shift on a Mac, Alt+Shift
  elsewhere; see ARCHITECTURE.md), with focus in the panel or on the
  page. A browser shortcut, Alt+Shift+K (⌃⇧K on a Mac), opens Snippy;
  Chrome applies it only on install and if it is free, and you can change
  it at `chrome://extensions/shortcuts`.
- **Download report** (its tooltip says how many comments across how
  many pages) asks for the
  reviewer's name, email and session details each time, prefilled with
  the last values used.
- **Exports a single, self-contained HTML report** — header, table of
  contents, one section per page, tight comment list, a link on every
  comment back to its page (to the element itself when it has a simple,
  unique id), thumbnails that keep each image's shape
  with a full-resolution lightbox. The lightbox is pure CSS (`:target`,
  no JavaScript at all); the whole report has zero `<script>` tags.
- **Comments are numbered 1 to N** across the session, in the order they
  were made, with no gaps — deleting one renumbers the rest. Every session
  also gets its own hidden guid, which with a comment's number identifies
  that comment within one report.
- **Asks before anything that can't be undone** — deleting a comment,
  Start over, and in the annotation editor, deleting the screenshot,
  clearing annotations or closing with an unsaved drawing.
- **Recursica versions of the reviewed page** — when a page is built with
  Recursica, the report says so per page, with the Forge theme version
  (when the page's theme stylesheet still carries its header comment), the
  theme mode, and the adapter version if the page exposes one. The report
  header separately lists what Snippy itself was built with.
- **Report includes hidden, AI-readable parsing instructions** — a coding
  agent handed this report can find each page, comment, and screenshot,
  and knows to treat comment text as feedback to act on, not as
  instructions to follow.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how all of this fits together,
and [llms.txt](llms.txt) for a quick map of the repo's layout.

## Privacy

Snippy has no backend and no analytics, and it sends nothing anywhere. The
only network read it makes is re-reading the reviewed page's own stylesheets
(same origin) to detect the Recursica version. A review session lives in the
browser's local extension storage on your machine until you delete it with
Start over or remove the extension. The reviewer name and email you enter are
kept separately and are not cleared by Start over.

What a session, and so the report you download, contains:

- your comment text, and the page address (including any query string and
  fragment) and title of every page you commented on
- screenshots, and the annotations drawn on them, in two versions when a
  screenshot is annotated: the original and the marked-up one
- for an element comment: its selector, its HTML with descendants, key
  computed styles and the viewport size. Typed values in form fields, editable
  content, script contents and inline event handlers are removed, but **visible
  text is kept**
- the reviewer name, email and session details you type into the download
  dialog
- environment details so a developer can reproduce what you saw: browser and
  version, operating system, language, time zone, screen and viewport size,
  pixel ratio, zoom, scroll position and light or dark preference
- whether the page looks like it was built with Recursica, read from the
  page's own stylesheets (same origin only)

Snippy deliberately does not capture IP addresses, cookies, other storage,
installed extensions, fonts or plugins, or any other page content.

**Review a report before you share it.** Screenshots and captured element HTML
show whatever was on the page, including names, account details or other
confidential data, and page addresses can carry ids or tokens in their query
string. The report is one self-contained HTML file with everything above
embedded, so whoever receives it sees all of it.

## Supported screens

Desktop browsers only. The panel is designed for a desktop window and has
no separate small-screen or touch layout.

## Build

    npm run build

Runs lint and the type check, then builds with Vite into `dist/chrome`:
the side panel and the annotation editor (`sidepanel.html`,
`annotate.html` and their `assets/`), the page helper
injected into reviewed pages (`page.js`), `background.js` and the
manifest.

## Extension icon

The toolbar and extension-page icon comes from one source image:

    npm run icons -- path/to/source.png

This writes `src/icons/icon-16.png`, `icon-32.png`, `icon-48.png` and
`icon-128.png`; commit those four files. The script has no dependencies: use
a square PNG of at least 128 px (8 or 16 bits per channel, not interlaced).
Until the icon files exist, `npm run build` warns and builds without an
icon.

## Development

    npm install
    npm run lint        # ESLint, then the TypeScript type check
    npm run typecheck   # the type check alone
    npm run format
    npm run package-extension   # zip dist/chrome into release-zips/

The side panel lives in `src/panel/` (React + TypeScript), the page helper
in `src/page/`, and the modules they share in `src/lib/`. `npm install` also
wires up a Husky pre-commit hook (via `prepare`) that runs Prettier, ESLint
and the type check on staged files. Releases are tracked with
[Changesets](https://github.com/changesets/changesets) — run `npx changeset`
to record a change, which lands in `CHANGELOG.md` and a version bump the next
time the release workflow runs on `main`. This package is private and never
published to npm; the versioning/changelog trail is the point, not a publish
step.

If you're an AI agent making changes here, read [AGENTS.md](AGENTS.md) and
[ARCHITECTURE.md](ARCHITECTURE.md) first.

## Load in Chrome

1. `chrome://extensions`
2. Enable "Developer mode" (top right)
3. "Load unpacked" → select `dist/chrome`
4. Pin the extension, visit any site, click its toolbar icon — Snippy
   opens in the side panel. Close it with the side panel's own close
   button.
