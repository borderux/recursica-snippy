# AGENTS.md

This document is for AI agents making changes to this codebase.

**Read [ARCHITECTURE.md](ARCHITECTURE.md) before planning or making any
change.** It describes the side panel and page helper lifecycle, the
styling model, the storage data model, the report format, and the build -
assume none of that is obvious from a local diff alone.

## RULES

- Snippy is **Chrome only**. The panel is Chrome's side panel
  (`chrome.sidePanel`): `src/panel/` is **React + TypeScript**, built with
  **Vite** into `sidepanel.html` and its assets. Its UI is built
  from the Recursica design system (`@recursica/adapter-mantine-v8`, on
  Mantine 8), set up as the adapter's `SETUP.md` says, with Snippy's own
  Recursica Forge export (the `recursica_*` files in the repo root). Get a
  new theme by exporting it from Forge - never copy theme files from the
  adapter package or another repo - and don't edit or reformat the export.
  Don't add another UI
  library, and don't import visual components from `@mantine/core` where
  the adapter has one
- The page helper (`src/page/`, built into `page.js`) is the only code that
  runs in the reviewed page. It draws nothing but the capture overlays and
  holds no state of its own; anything else the panel needs from the page
  goes through its API (`src/lib/pageApi.ts`)
- `src/background.js` stays plain, unbundled JavaScript, copied as-is. It
  is small and has no UI
- **Build from Recursica components and tokens.** No hand-rolled
  components, no one-off colours, no custom CSS values on anything a
  component owns. `src/panel/panel.css` holds the few layout rules for
  elements no component covers, and each one says why. The adapter's
  `overStyled` escape hatch is not used, and `@recursica/eslint-plugin`
  (`recursica/no-over-styled`) fails the lint on any use - one would need a
  stated reason, a reported design-system gap and the owner's approval. Don't re-point theme
  tokens or restyle a component's parts in `panel.css` either: a value the
  panel needs changed goes into the Forge theme
- **Don't paper over the adapter.** If a Recursica component misbehaves,
  that is an adapter bug: report it and let the UI show the real
  behaviour. A workaround is kept only when drawing on someone else's page
  or living in Chrome's side panel forces it, or when removing it would break accessibility, usability or
  a MUST rule in the Recursica skills. Every kept one is listed in
  ARCHITECTURE.md's "Adapter workarounds", with the bug it stands in for
- The reviewed page is someone else's website. Don't write to it beyond
  what ARCHITECTURE.md lists (the capture overlays while a capture is
  under way, and removing an in-page panel left by an earlier version), and
  never change its layout
- Test against `dist/chrome`, never against `src/` - the panel and the page
  helper only exist as the built extension
- Keep permissions minimal: `sidePanel`, `scripting`, `storage` and
  `unlimitedStorage`, plus `host_permissions` of `<all_urls>`.
  `unlimitedStorage` is there because screenshots and captured element HTML
  live in the session, and without it a long review hits the 10 MB
  `chrome.storage.local` quota and every save fails. The host permission
  lets the panel inject the page helper into, read the address of, and
  capture whatever page the active tab shows; the panel only does that
  while it is open. Don't add another permission without raising it as its
  own decision
- Any change to `session`'s stored shape (see ARCHITECTURE.md's Data model
  section) needs a migration for data already sitting in a real user's
  `chrome.storage.local` from before the change - there is no
  version-gated database, no clean slate, and old-shape data reaching new
  code has already caused a real crash-on-load bug once. Migrate in
  `migrateSession()` (`src/lib/storage.ts`), which runs right after
  the session is loaded, before anything else touches it. Renamed storage
  keys go through `migrateStorageKeys()` in the same file (copy old to new
  unless new exists, then delete old). UI-only state stays in memory and
  out of storage
- A real toolbar click can't be scripted, so verify browser-facing changes
  with Playwright instead of assuming a diff is correct (ARCHITECTURE.md,
  "Verification methodology"): load the built `dist/chrome`, open
  `sidepanel.html` in a narrow window with only
  `chrome.windows.getCurrent()` stubbed, and drive the panel and the
  reviewed page with real `page.mouse`/`page.keyboard` input rather than
  synthetic `element.click()` or `element.dispatchEvent()` calls - those
  don't reliably exercise the same focus and event paths as genuine input,
  and have produced false negatives here before. Check light and dark
  (`colorScheme`), and navigating the reviewed tab across origins
- The downloaded report has zero `<script>` tags and zero JavaScript by
  design (the lightbox is pure CSS, using `:target`) - don't reach for a
  `<script>` tag to solve a report-formatting problem; find the CSS-only or
  build-time way instead. The report is built as a string in
  `src/lib/report.ts`, not with React
- `npm run lint` (ESLint plus `npm run typecheck`) and `npm run format`
  must pass before committing; the pre-commit hook (Husky + lint-staged)
  runs them automatically on staged files, but run them yourself first
  when in doubt
- `npm run build` runs `npm run lint` first, and the pull-request workflow
  (`.github/workflows/pull-request.yml`) runs `npm ci` and `npm run build`,
  so a lint or type error fails CI
- Every user-facing change needs a changeset (`npx changeset`): the release
  workflow turns pending changesets into the version bump and
  `CHANGELOG.md`. Don't edit `CHANGELOG.md` or the version by hand
- Don't add a test framework as a side effect of an unrelated change - if
  one seems genuinely needed, raise it as its own decision. Playwright is
  used ad hoc for verification and is not a dependency of this repo
