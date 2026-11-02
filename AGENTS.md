# AGENTS.md

This document is for AI agents making changes to this codebase.

**Read [ARCHITECTURE.md](ARCHITECTURE.md) before planning or making any
change.** It describes the injection/lifecycle model, the shadow-root
styling model, the storage data model, the report format, and the build -
assume none of that is obvious from a local diff alone.

## RULES

- The live panel (`src/content/`) is **React + TypeScript**, built with
  **Vite** into one classic-script IIFE, `content.js`. Its UI is built
  from the Recursica design system (`@recursica/adapter-mantine-v8`, on
  Mantine 8) and the default Recursica Forge theme. Don't add another UI
  library, and don't import visual components from `@mantine/core` where
  the adapter has one
- `src/background.js` stays plain, unbundled JavaScript, copied as-is. It
  is small and has no UI
- **Build from Recursica components and tokens.** No hand-rolled
  components, no one-off colours, no custom CSS values on anything a
  component owns. `src/content/panel.css` holds the few layout rules for
  elements no component covers, and each one says why. The adapter's
  `overStyled` escape hatch is used exactly once (the panel's
  user-resizable width, an approved exception) - any new use needs a
  stated reason and a reported design-system gap. One other exception is
  approved: `panel.css` re-points a few ui-kit token values (panel body
  padding, card padding, card radius) for the panel only, at the owner's
  request, until the Forge theme carries them - add to that block only
  with the owner's approval
- **Don't paper over the adapter.** If a Recursica component misbehaves,
  that is an adapter bug: report it and let the UI show the real
  behaviour. A workaround is kept only when running in a shadow root
  forces it, or when removing it would break accessibility, usability or
  a MUST rule in the Recursica skills. Every kept one is listed in
  ARCHITECTURE.md's "Adapter workarounds", with the bug it stands in for
- Everything the panel draws lives in a shadow root. Don't write to the
  host page's `<html>` or `<body>` beyond what ARCHITECTURE.md lists (the
  page push, the dataset flags, and the registered fonts) - the host page
  is someone else's website. In particular, don't use the adapter's
  `RecursicaThemeProvider`, which writes its theme attribute to
  `document.documentElement`
- Test against `dist/chrome/content.js` (or `dist/firefox`), never against
  `src/` - the panel only exists as the bundled script
- `src/manifest.chrome.json` and `manifest.firefox.json` should only ever
  differ in their `background` block (`service_worker` vs `scripts`) and
  Firefox's own `browser_specific_settings` - everything else, including
  permissions and `web_accessible_resources`, should stay identical
- Keep permissions minimal: `activeTab`, `scripting`, `storage` and
  `unlimitedStorage`, with no `host_permissions`. `unlimitedStorage` is
  there because screenshots and captured element HTML live in the session,
  and without it a long review hits the 10 MB `chrome.storage.local` quota
  and every save fails. Don't add another permission without raising it as
  its own decision
- Any change to `session`'s stored shape (see ARCHITECTURE.md's Data model
  section) needs a migration for data already sitting in a real user's
  `chrome.storage.local` from before the change - there is no
  version-gated database, no clean slate, and old-shape data reaching new
  code has already caused a real crash-on-load bug once. Migrate in
  `migrateSession()` (`src/content/lib/storage.ts`), which runs right after
  the session is loaded, before anything else touches it. Renamed storage
  keys go through `migrateStorageKeys()` in the same file (copy old to new
  unless new exists, then delete old). UI-only state stays in memory and
  out of storage
- A real toolbar click can't be scripted, so verify browser-facing changes
  with Playwright instead of assuming a diff is correct: stub
  `chrome.storage.local`/`chrome.runtime` in an init script, load the
  built `dist/.../content.js` into a page, and drive the panel with real
  `page.mouse`/`page.keyboard` input rather than synthetic
  `element.click()` or `element.dispatchEvent()` calls - those don't
  reliably exercise the same focus and event paths as genuine input, and
  have produced false negatives here before. Check light and dark
  (`colorScheme`), and a host page with a non-16px root font size
- The downloaded report has zero `<script>` tags and zero JavaScript by
  design (the lightbox is pure CSS, using `:target`) - don't reach for a
  `<script>` tag to solve a report-formatting problem; find the CSS-only or
  build-time way instead. The report is built as a string in
  `src/content/lib/report.ts`, not with React
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
