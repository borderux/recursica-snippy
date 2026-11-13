# Architecture

## Overview

Snippy is a Manifest V3 Chrome extension that lets a reviewer leave feedback
on any website without that site embedding anything. A comment can be text
only, or carry a screenshot, a captured page element, and annotations drawn
on the screenshot. Feedback is grouped into a single **session** spanning
every page the reviewer visits, and exported as a self-contained HTML report.

The panel is **Chrome's side panel** (`chrome.sidePanel`): Chrome owns it,
opens it from the toolbar, keeps it open across page loads, sites and tabs in
a window, and lets the reviewer resize and close it. It is an extension page
(`sidepanel.html`) running React + TypeScript, built from the Recursica
design system. It can't touch the reviewed page itself, so a small **page
helper** (`page.js`) is injected into the active tab for everything that
must: the capture overlays, element picking, and reading the page's context.
The annotation editor needs more room than the side panel has, so it opens
in a tab of its own (`annotate.html`), beside the reviewed page.
Chrome only: Firefox has no `chrome.sidePanel`.

There is no backend. `build.js` runs two Vite builds and writes the
extension to `dist/chrome` (see [Build](#build)).

## Components

### Extension shell

- **`src/manifest.json`** - The manifest. It carries no `version`; the build
  writes it. `side_panel.default_path` is `sidepanel.html`.
- **`src/background.js`** - The service worker, plain unbundled JavaScript,
  with one job: `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick:
true })`, so the toolbar icon (and its keyboard command) opens the side
  panel. Run on every worker start, not only on install.

### The side panel (`src/panel/`)

- `sidepanel.html`, `main.tsx` - the page Chrome loads into the side panel,
  and its entry point.
- `annotate.html`, `annotate.tsx` - the annotation editor's tab (see
  [The annotation editor's tab](#the-annotation-editors-tab)).
- `boot.tsx` - what both pages share on start: imports the stylesheets,
  sets the colour scheme, registers the fonts, loads storage and renders
  the app.
- `App.tsx` - the Mantine provider and the Recursica layer-0 scope, with
  its portals. The editor's tab declares layer 0 on a plain element rather
  than the `Layer` component, which would paint an empty padded surface
  there.
- `ReviewPanel.tsx` - the panel shell: the Add menu, captures, shortcuts,
  focus, the footer (Start over and Download report), the toast, the modals,
  and the failed-load and no-access states.
- `useActiveTab.ts` - the tab the panel is showing (the active tab of its
  window), its page key and title, and whether the page helper could be
  installed there.
- `pageBridge.ts` - the panel's side of the page helper: installs it, calls
  it, and captures and crops screenshots.
- `usePagePorts.ts` - the ports page helpers open to the panel, for
  shortcuts pressed with focus on the page.
- `useAnnotationTabs.ts`, `annotateApi.ts` - opening the annotation editor's
  tab, and the message it sends back when it closes.
- `useReviewSession.ts` - all session state and saving.
- `useColorScheme.ts` - follows `prefers-color-scheme` live.
- `modalPortal.ts` - hands every modal its layer-1 portal container.
- `dom.ts` - finding things in the panel, the modal `inert` handling, and
  `markPanelNonModal()`.
- `fonts.ts`, `panel.css` - see [Styling](#styling).
- `components/`:
  - `CommentList` - the one view: the current page's comments, or every
    page's grouped under page headings that each link to their page (opened
    in the reviewed tab).
  - `ViewOptions` - two checkboxes, "Only view comments for this url" and
    "Show screenshot thumbnails", at the top of the scrolling list, above
    the comments.
  - `AddMenu` - a small icon-only plus button left of the panel title, with
    Comment, Screenshot and Element. It is rendered into a slot placed first
    in the header (see [Adapter workarounds](#adapter-workarounds)).
  - `CommentItem` - a comment card (the kit's Card) with Duplicate and Delete
    buttons and, when it has no screenshot, an Add screenshot button.
  - `DownloadModal` - asks for the reviewer's name, email and the session's
    details every time a report is downloaded.
  - `AnnotationEditor` - see below.
  - `ConfirmModal` - the shared confirmation modal.
  - `useManagedMenu` - menu focus handling (see Adapter workarounds).

### The page helper (`src/page/`)

`main.ts`, built into `page.js`, a classic script injected into the reviewed
page. It installs once per document, exposes `globalThis.snippyPage` in the
extension's isolated world, and draws nothing but the capture overlays. See
[Lifecycle](#lifecycle).

### Shared modules (`src/lib/`)

Framework-free, used by the panel, the page helper or both: `storage`
(persistence, migration), `types`, `pageKey`, `pageApi` (the helper's API
and port messages, types only), `capture` (region selection), `element`
(element picking and serializing), `captureFrame` and `overlay` (the
overlays' frame and the active overlay), `annotations` and `pen`,
`environment`, `recursica` (page detection), `report`, `links`, `ids`,
`format`, `shortcuts`.

**The annotation editor** has a fixed toolbar and a bordered, scrolling image
below it. The toolbar holds the tool control (Select, Pen, Arrow, Numbered
dot - the kit's segmented control), the pen colour dropdown and Clear
annotations. Annotations are SVG objects over the image. A new one is left
unselected, so the add tool keeps adding. With the Select tool they are tab
stops: they can be selected, dragged, moved with the arrow keys, deleted with
Delete or Backspace, and undone and redone with Cmd/Ctrl+Z and
Cmd/Ctrl+Shift+Z. Its own confirmations (discard changes, clear annotations,
delete screenshot) stack on it. It is a modal, alone in its own tab (below).

### The annotation editor's tab

At the side panel's width the editor's title and footer were cut off, so
Add annotations opens `annotate.html?page=<page key>&id=<comment id>` in a
new tab, right after the reviewed tab and active, where the editor has the
main window's width (up to the kit's modal maximum). The side panel stays
open beside it.

- **One writer.** The side panel stays the only thing that changes the
  session while it is open. Before opening the tab it writes any pending
  typing (`flush`), and the editor reads the comment from storage. When
  the editor closes - Save, Delete screenshot, Cancel, Escape - it sends the
  panel an `AnnotateDone` message (`annotateApi.ts`): the fields to store,
  or null, and the screenshot it drew on. Messages are JSON, which drops
  `undefined`, so fields to remove travel as a list of names (`toWire`,
  `fromWire`). The panel stores them only while
  the comment still has that screenshot, switches back to the reviewed tab,
  and answers; the editor then closes its own tab.
- **No panel.** If no panel answers (the reviewer closed the side panel
  meanwhile), the editor writes the change to storage itself. Nothing else
  is writing then. A panel reopened while an editor is open answers for
  editors in its window, since it would otherwise write over the change
  with its own copy of the session.
- **One editor per comment.** Asking again switches to the open editor's
  tab. An editor whose screenshot is gone from the panel (the comment
  deleted, the screenshot replaced or deleted, Start over) has its tab
  closed: what it was drawing on no longer exists.
- **Leaving.** Closing the tab, reloading it or going elsewhere with
  unsaved annotations asks first (`beforeunload`), as Cancel does.
- **The panel meanwhile.** Chrome doesn't give the panel an extension
  page's address without the `tabs` permission, so the panel recognises
  the editor tabs by the ids it opened. With one active, the panel keeps
  showing that editor's page's comments, Add is disabled, and a message
  says the active tab is the editor.

### Build inputs and tooling

- **`src/report.css`** - Styles the _downloaded report_, not the live panel.
  Inlined into the panel's script at build time, because a downloaded standalone
  HTML file can't fetch a sibling stylesheet.
- **`src/ai-report-instructions.txt`** - Plain-text instructions for an AI
  agent reading a downloaded report, also inlined at build time. See
  [AI-readable instructions](#ai-readable-instructions).
- **`src/icons/`** - The four extension icon sizes and their source.
- **`build.js`, `vite.config.mts`** - see [Build](#build).
- **`scripts/`** - `make-icons.mjs`, `package-extension.mjs` and
  `lint-staged.config.cjs`.
- **`.github/workflows/`, `.changeset/`, `.husky/`** - see
  [Release and CI](#release-and-ci).

## Lifecycle

Permissions: `sidePanel`, `scripting`, `storage` and `unlimitedStorage`, plus
`host_permissions` of `<all_urls>`. The host permission is what lets the
panel inject the page helper into whatever page the active tab shows, and
capture it (`captureVisibleTab`), on every site the reviewer moves to.
`unlimitedStorage` lifts the 10 MB `chrome.storage.local` quota: screenshots
and captured element HTML live in the session, and a long review would
otherwise fill it.

**The panel.** The toolbar icon opens the side panel (the background sets
`openPanelOnActionClick`); Chrome's own close button closes it. One panel
serves a whole window (`side_panel.default_path`, no per-tab panels), so it
follows the active tab: `useActiveTab()` reads it with `chrome.tabs.query`
and keeps it current from `tabs.onActivated`, `tabs.onUpdated` (address,
title and load state, including single-page-app navigations, which Chrome
reports as an address change) and `tabs.onAttached`/`onDetached`. The panel
can read a tab's address and title because of the host permission; no `tabs`
permission is needed. The panel has no open or close transition of its own,
never moves focus on open, and never touches the page's layout.

**The page helper.** Once the active tab's page has loaded, the panel injects
`page.js` (`ensureHelper()` in `pageBridge.ts`) unless `globalThis.snippyPage`
is already there. The helper:

- exposes `selectRegion`, `pickElement`, `context`, `detectRecursica`, `key`
  and `cancel`, which the panel calls with `chrome.scripting.executeScript`
  (a function that calls `globalThis.snippyPage[method]`, in the same
  isolated world). Results are plain data, and the panel runs them through
  the same sanitizers as stored data.
- opens a port (`snippy-page`) to the extension. Every open side panel hears
  it; each listens only to the helper in its own active tab. Through it the
  helper forwards Snippy's shortcuts pressed with focus on the page, and the
  panel says when shortcuts may run.
- removes itself when the port disconnects (every panel that could hear it
  has closed): it cancels any overlay, removes its key listener and deletes
  `globalThis.snippyPage`, so the next panel installs it afresh.
- removes a panel an earlier version of Snippy drew into the page itself
  (`#snippy-host`, `#alan-review-tool-host`, `#tagger-host`), undoing the
  page push it applied from that version's dataset names.

A page no extension may script (chrome://, the new tab page, the Chrome Web
Store, the PDF viewer), or one with no web address, gets no helper: the panel
shows "Snippy can't add comments on this page", Add is disabled and described
by that message, and other pages' comments still show.

**Focus.** The panel never takes focus on open. When a modal closes, focus
goes back to the control that opened it, or the control that replaced it;
the panel does this itself (`returnFocus()`), because the opener may be gone.
Escape is not handled by the panel itself: Chrome closes the side panel.

While any modal is open, the panel's content and its layer-0 portal are made
`inert` (prior values restored), so only the modal is reachable. Pending
typing is written on `pagehide` and when the panel is hidden, so closing it
never loses typing.

### Capture

There are two screenshot modes (region selection, and the visible area) plus
element picking. The overlays are drawn by the page helper, in the reviewed
page's light DOM, where no theme token reaches; the pixels are taken by the
panel with `chrome.tabs.captureVisibleTab`, which captures only the tab's
viewport, so the side panel is never in the picture and the page always has
its full width.

- **The capture frame** (`lib/captureFrame.ts`). Both screenshot modes mark
  themselves with a 2px dashed frame around the whole viewport: a black line
  under white dashes, so it shows on light and dark pages, fixed inside the
  viewport, ignoring the pointer and never affecting layout. There is no
  tint over the page, and the region-selection rectangle is an edge with no
  fill, so what is being captured stays fully visible. The frame and every
  other overlay element are removed, and the page given two frames to
  paint, before the helper answers and pixels are taken.
- **Cropping.** The helper returns the selection in CSS px with the page's
  `devicePixelRatio` (which includes the page's zoom); the panel crops the
  capture with a canvas and stores a JPEG, with that ratio as its scale.
- **Element picking** (`lib/element.ts`). The mouse highlights the element
  under it and a click chooses; arrow up and down move to the parent and
  first child, Enter chooses, Escape cancels. The page's own handlers never
  see those clicks and keys. Open shadow roots are followed; closed ones stop
  at their host. Frames are never entered: a transparent blocker covers each
  one while picking, and choosing one says its content can't be captured.
- **Keys from the panel.** Focus is usually in the side panel when a capture
  starts, so while one is under way the panel forwards Escape, Enter and the
  up and down arrows to the overlay (`lib/overlay.ts`). Keyboard-only
  picking works without ever focusing the page.
- **Ending.** Switching tabs during a capture cancels it, as does closing
  the panel (the helper's port disconnects). Focus leaving the page's window
  after it had it (alt-tab) cancels too, as before.

## Styling

The side panel and the editor's tab are the extension's own pages, so the
design system is set up as the adapter's `SETUP.md` describes for any app.

- **Snippy's Forge export.** The theme is Snippy's own export from
  Recursica Forge, kept as exported in the repo root:
  `recursica_variables_scoped.css` (the theme variables),
  `recursica_manifest.json` (passed to `RecursicaThemeProvider`) and the
  `recursica_brand`, `recursica_tokens` and `recursica_ui-kit` JSON. A new
  theme is a new export dropped over these files. They are in
  `.prettierignore`, so nothing reformats them.
- **Stylesheets.** Mantine's CSS, then the Forge export's
  `recursica_variables_scoped.css`, then the adapter's `style.css`, then
  `panel.css`, imported in that order by `boot.tsx`.
- **Providers.** `App.tsx` wraps each page in `MantineProvider` and then
  `RecursicaThemeProvider`, with the manifest and the colour scheme (light
  or dark, following `prefers-color-scheme` live, from `useColorScheme()`;
  Mantine's scheme is forced to match). The provider sets
  `data-recursica-theme` on `<html>` and wraps the page in layer 0. Where
  only the theme is set - Mantine's tooltips and menus, portaled into the
  body - the theme's stylesheet applies layer 0 by default.
- **PostCSS check.** `postcss.config.cjs` runs
  `@recursica/recursica-postcss-vars` (recommended in `SETUP.md`) over all
  the CSS the build loads: any Recursica variable missing from the Forge
  export warns in development and fails `npm run build`. `eslint.config.mjs` runs
  `@recursica/eslint-plugin`'s recommended config (also recommended in
  `SETUP.md`) on `src/panel/**/*.tsx`: any use of `overStyled` fails
  `npm run lint`, and so the build.
- **Portals.** The toast renders in `.art-portal`, a container pinned to
  the viewport's top-left corner. Modals use a second container of the same
  kind that declares `data-recursica-layer="1"`, so every modal sits on
  layer 1, and that is where Mantine's modal expects its container. It is a
  plain element carrying the attribute rather than the adapter's `Layer`
  component, because `Layer` paints its own padded surface and a modal
  portals out of any `Layer` wrapped around it.
- **Fonts.** `fonts.ts` registers the theme's two typefaces (Dongle, Nunito
  Sans, bundled from Fontsource and emitted as files) with the FontFace API,
  under exactly the family names the theme uses.

**The page.** Snippy writes to the reviewed page only while a capture is
under way (the overlays) and, once, to remove an in-page panel left by an
earlier version. It never changes the page's layout.

## Adapter workarounds

Policy: when the adapter or theme misbehaves, that is an adapter bug, and the
UI shows the adapter's real behaviour. A workaround stays only if the panel
is **(A)** forced to it by drawing on someone else's page or by living in
Chrome's side panel, or **(B)** would otherwise be unusable, inaccessible, or break a MUST rule in
the Recursica skills. Everything purely cosmetic of our own **(C)** uses kit
props and tokens or goes. Each kept item is reported to the adapter. Keep
this list current: every workaround in the code appears here, with the gap it
stands in for.

### (A) Someone else's page, or the side panel

- `boot.tsx` modal portal with `data-recursica-layer="1"` - every modal sits
  on layer 1; the adapter's `Layer` paints a padded surface, so a plain
  element carries the attribute. Ask: Modal should set its own layer, or
  `Layer` should have a surface-less mode.
- `AnnotationEditor.tsx` `comboboxProps.portalProps` - the pen list renders
  with the modal (layer 1), not in the body underneath it. Follows from the
  one above.
- `annotate.tsx` `initLayer0: false` - the published adapter 1.5.0's
  `RecursicaThemeProvider` wraps the page in a painted, padded layer-0
  `Layer`, while its docs and types say it marks `<body>` instead. The
  editor's tab has nothing in that layer (the editor is a modal), so it
  showed as an empty rounded strip across the top. Report: the bundled
  provider doesn't match `@recursica/adapter-common` 1.5.0.
- `fonts.ts` - the theme names "Nunito Sans", while the variable Fontsource
  package's own stylesheet names it "Nunito Sans Variable".
- `lib/capture.ts`, `lib/element.ts`, `lib/captureFrame.ts` overlay inline
  styles and colours - they live in the reviewed page's light DOM, where no
  token reaches (an approved hand-built surface).

### (B) Adapter defect or gap that would break a MUST rule, accessibility or usability

- `ReviewPanel.tsx` `closeSidePanel` ignoring a close while a modal is open
  or a capture is under way - the kit's Panel always has a Close button and
  always closes on Escape (adapter 1.3.3 and 1.4.0), and here closing it
  closes Chrome's side panel. But it hears Escape anywhere in the window, so
  the Escape that cancels a confirmation, the download dialog or a capture
  would close Snippy too. Escape anywhere else - in a comment's text box,
  for instance - closes the side panel, as the adapter intends.
- `dom.ts` `markPanelNonModal` - Panel always renders `role="dialog"
aria-modal="true"`; this panel is the whole side panel, a region.
- `dom.ts` `makeBehindModalInert`, and `AnnotationEditor.tsx` making the
  editor inert under its questions - "everything behind the modal must be
  inert" (MUST); Mantine's modal leaves the rest of the page reachable to a
  screen reader's reading cursor.
- `AnnotationEditor.tsx` `closeOnEscape` toggled - every open Mantine modal
  closes on any Escape (a window listener), so Escape in the pen list or on a
  stacked question would throw the drawing away.
- `returnFocus={false}` on the modals, with
  `returnFocus()`; `AddMenu.tsx` `returnFocus={false}` with
  `useManagedMenu.ts` - Mantine returns focus to the element that opened a
  modal or menu, even when it is gone (a deleted comment's button) or when
  a menu item deliberately moved focus (into a new comment's text box,
  which can happen after the menu closes, once the page has answered). The
  panel returns focus itself, to the opener or what replaced it; Tab closes
  the menu.
- `App.tsx` `Tooltip.extend` focus events - tooltips must show on keyboard
  focus (MUST); the adapter keeps Mantine's hover-only default.
- `ReviewPanel.tsx` toast live-region wrapper and `role="group"` on Toast -
  the live region must exist before the message (MUST); the Toast's own role
  would announce twice.
- `ReviewPanel.tsx` header slot (`.art-header-slot`) for Add - Panel has no
  header actions slot, and its compound parts carry none of its styling; a
  button inside the title would rename the panel "Add Snippy".

### (C) Our own elements that no component covers

Tokens only, owner-requested. All in `panel.css`:

- `.art-shot-frame` - the bordered frame around a comment's image (no image
  component).
- `.art-thumb` - the image scales to the frame; a tall screenshot shows at
  full height.
- `.art-shot-well` and `.art-shot-scroll` - the editor's bordered, scrolling
  image area.
- `.art-shot` - the drawing canvases.
- `.art-swatch` - pen colours, fixed because they are baked into screenshots.
- `.art-sr-only` - there is no visually-hidden utility.
- `.art-list` - a reset for the list semantics a card set needs.

### Theme values

`panel.css` re-points no theme tokens and trims no headings: the panel shows
the Forge export's own values (panel body and card padding, card radius,
text box rows, heading line boxes). Changes to those go into the Forge
theme, not into Snippy.

### Other owner-approved exceptions

- **Pen colour dropdown** has no visible label, only its accessible name "Pen
  color" (`aria-label`, which the kit's field accepts), so the editor's
  toolbar sits on one line. The label rules say no label is visually hidden.
- **Tool control items are icons** (Phosphor `Cursor`, `PencilSimple`,
  `ArrowDownLeft`, `NumberCircleOne`). The kit's SegmentedControl items take
  a `label`, a `value`, `disabled` and an `icon`, but no tooltip or separate
  accessible name. So each item's label is the icon with `role="img"` and
  `aria-label`, wrapped in the kit's Tooltip, opened from the control's own
  hover and focus events (the item's radio is hidden, so the Tooltip can't
  see its focus). The tooltip renders in the modal's layer-1 portal, above
  the modal; Escape hides it first, then closes the editor. The chosen tool's
  icon is filled as well as highlighted. Gap: "SegmentedControl items have no
  tooltip or accessible-name option."
- **Close buttons.** The kit's icon-only close buttons (the Panel's, each
  Modal's and the Toast's X) have accessible names but no tooltip. Gap:
  "Close buttons have no tooltip."
- **Pen colour field margin.** The field keeps the kit's 8 px bottom margin
  even alone in the toolbar, so its box sits 4 px above the tools' and
  Clear's shared centre line. Not overridden. Gap: "A standalone field still
  carries the form's bottom margin."
- **Modal footer spacer.** `AnnotationEditor.tsx` has a flexible spacer in
  `Modal.Footer` (`<Group flex={1} aria-hidden />`) that puts the rarely used
  Delete screenshot at the bottom left, apart from Cancel and Save. Gap:
  "Modal.Footer has no slot for a rarely used action on the left."
- **Several solid buttons on one surface:** the header Add, a card's Add
  screenshot, and Download report.
- **Download report button** reads just "Download report". A tooltip on hover
  and keyboard focus, also the button's description (`aria-describedby`),
  says what the report holds for the whole session ("12 comments across 3
  pages"). With no comments the button is disabled and has none (a disabled
  button gets no pointer or focus events).
- **Blank comments** are never deleted for being blank; only Delete (with its
  confirmation) removes one. Blank comments count, and are in the report.
- **Other decisions kept as they are:** the visible "View" group label above
  the two checkboxes; no element link in the panel's cards (the page and
  element links are in the report); the error toast at the top-left of the
  page (the adapter's Toast has no placement; its gap stays filed);
  confirmation text at the full dialog width; no Add screenshot button on
  another page's comment (a new screenshot would capture the open page, not
  that comment's page); the failed-load message in the panel body; page
  links opened in the reviewed tab, with page titles at link size; the
  manifest `author` string (Chrome ignores it); and the suggested browser
  shortcut Alt+Shift+K.

### Adapter gaps with no workaround

The UI shows the kit's real behaviour:

- `Card` and `Panel` have no size or density option and strip padding props
  (remapped at token level above, by owner request).
- `Link` applies its own text style, so a page title that is a link inside a
  heading shows at the link's size, not the heading's.
- The kit's Toast has no placement, so the toast shows at the top-left of the
  viewport.

## Data model

Everything lives under one `chrome.storage.local` key (`snippySession`), not
one entry per comment or per page: one store shared by every site the
reviewer visits, which is the "any site, one session" pitch. The types live
in `src/lib/types.ts`.

```
Session {
  startedAt: number            // timestamp
  guid: string                 // see Report identity
  commentCounter: number       // the number of comments, N
  details: string              // freeform session notes
  environment?: SessionEnvironment
  pages: Record<pageKey, ReviewPage>
}

ReviewPage {
  title: string                // the tab's title, captured once per page
  recursica?: RecursicaDetection   // see Recursica detection
  comments: ReviewComment[]
}

ReviewComment {
  id: number
  commentNumber: number        // position 1..N, see Comment numbers
  text: string
  screenshot: string | null    // data URL; the annotated image if annotated
  screenshotClean?: string     // the image as captured (with annotations)
  annotations?: Annotation[]   // editable objects (with screenshotClean)
  screenshotScale?: number     // device pixel ratio at capture
  element?: CapturedElement
  context?: CommentContext     // window and page at capture time
}
```

The page key is `origin + pathname + search`, plus the fragment when it is a
route. `SessionEnvironment`, `CommentContext`, `Annotation`,
`CapturedElement` and `RecursicaDetection` are each described below.

### Page keys

The page key comes from the active tab's address (`pageKeyFromUrl()` in
`lib/pageKey.ts`), and only for web and file pages. Chrome reports a
single-page app's in-app navigations (history calls and hash changes) as an
address change on the tab, so comments added after one are filed under the
new address.

A fragment counts only when it is a route (`#/...` or `#!...`). Each hash
route is its own page: its own report section, its own group in the all-pages
view, and its own "Only view comments for this url" scope. A plain fragment
(`#top`, `#section`) is not a different page. Stored keys are never
rewritten, so comments filed under an address without its route stay under
that key (they show on the route-less address, and in the all-pages view).

An element comment's report link adds `#<id>` only when the page address has
no fragment of its own; on a hash-route address it links to the page, keeping
the route.

### Other stored keys

These are stored under **separate** keys and never cleared by "Start over",
because they are identity and preference facts, not session data:

- `snippyUser`, `snippyEmail` - reviewer identity. The download modal edits
  them (and the session's details) each time a report is downloaded.
- `snippyPenColor` - the annotation pen's last colour.
- `snippyPageOnly`, `snippyShowImages` - the two view checkboxes, both on
  unless stored as `false`.

### Annotations

A comment with annotations stores three things, all optional:

- `screenshot` - the annotated image the panel shows, rendered from the two
  below.
- `screenshotClean` - the image as captured.
- `annotations` - the objects (`lib/annotations.ts`): pen strokes (points and
  width), arrows (head position and length; always pointing down and to the
  left at 45 degrees) and numbered dots (centre and radius; a dot's number is
  its place among the dots, so deleting one renumbers the rest). The pen has
  six colours (`lib/pen.ts`): red, white, black, green, blue and yellow.

Every position and size is a fraction of the image's width (or height, for
y), so they survive any display scale. Saving regenerates the annotated image
from the clean one; saving with no annotations leaves just the clean image in
`screenshot`. Deleting the screenshot, or adding a new one, removes all
three. Older comments, with one image and possibly a drawing baked in, load
unchanged and use that image as the base. `migrateSession()` keeps both
fields or neither: malformed objects are dropped one by one, a malformed
clean image drops both, and a clean image with no valid objects left is
dropped.

A screenshot may carry `screenshotScale`, the device pixel ratio it was
captured at (dropped on load if it isn't a plausible ratio). The panel shows
an image at no more than its natural size (its pixels divided by that ratio,
or the current ratio for older comments), centred, and scales a larger one
down to the frame.

### Comment kinds

There is one kind of stored comment: text plus an optional screenshot and an
optional `element`. The panel shows it as a quick comment (text only), a
screenshot comment (thumbnail, Add annotations, text), or an element comment
(the same, plus the element's selector), depending on what it has.

### Captured elements

`element` (`CapturedElement` in `lib/types.ts`) is what Add element records,
like the browser's element inspector: a CSS selector path (crossing an open
shadow root is written `>>>`), the element's HTML with its descendants, a
compact set of 48 computed style properties, and flags for truncation and for
a partly visible element. Its `screenshot` is the element cropped from the
page. Deleting that screenshot (in the annotation editor) deletes the
`element` too, leaving a plain comment. Older element comments keep their viewport in `element.viewport`;
newer ones keep it in `context`.

Everything in it is copied from someone else's page, so it is untrusted and
is escaped wherever it is shown. Before it is stored, form values, textarea
text, select choices, editable content, password values, script contents and
inline event handlers are removed. The HTML is capped at 50,000 characters
and the styles at 8,000; anything cut is flagged, and the panel and the
report say so. `migrateSession()` drops a malformed one.

### Environment

So a developer can reproduce what the reviewer saw, the session and each
comment carry a few facts about the reviewer's browser and the page
(`lib/environment.ts`), all optional and normalized field by field in
`migrateSession()`:

- **Session** (`session.environment`, set when the session starts and
  refreshed with the browser's client hints when the panel opens, or at
  download for older sessions): browser name and version, operating system
  and (where the browser reports it) its version, the raw user agent string
  (hidden metadata only), the browser's UI language, the IANA time zone and
  the screen size. The light/dark and reduced-motion preferences are read
  when the report is built.
- **Comment** (`comment.context`, set when the comment is made or its
  screenshot or element captured): time, window viewport, device pixel ratio
  (which includes browser zoom), visual-viewport scale (pinch zoom), scroll
  position and document scroll height, the light/dark preference, a theme
  attribute on the page's `<html>` or `<body>` if there is an obvious one
  (`data-recursica-theme`, `data-theme`, `data-color-mode`, `data-bs-theme`,
  `data-mantine-color-scheme`), and `<html lang>`.

Deliberately not captured: IP address, cookies, any storage, the list of
extensions, fonts or plugins, canvas or other fingerprints, and any other
page content. The report shows the session facts in an "Environment" line and
`snippy-*` meta tags, and each comment's in a muted line with `data-*`
attributes.

### Recursica detection

A session spans many pages and sites, so each page records whether it is
built with Recursica, and which versions (`lib/recursica.ts`). It runs in the
background once a page has its first comment, and again on later comments
while nothing has been found. It never blocks the panel and never throws:

- **Presence and mode** from `data-recursica-theme` (light or dark) and
  `data-recursica-layer` (0 to 3) on the page.
- **Forge and transform versions** from the header comment of the page's
  theme stylesheet ("Source JSON version", "Transform version"). Only
  `<style>` elements and same-origin stylesheets are read (cross-origin
  sheets are skipped without a request), and only their first 4 KB, with a 1.5 s timeout per sheet and
  2.5 s overall. A minified sheet without comments yields nothing. No other
  page content is read or stored.
- **Adapter version** only if the page exposes one, as a
  `data-recursica-adapter-version` attribute or a
  `--recursica-adapter-version` custom property. The adapter carries no
  version of its own today.

The field is optional; pages without it show "Recursica: not checked" in the
report. On load, `migrateSession()` keeps only well-formed values field by
field (versions must match a strict pattern) and drops a detection that isn't
one at all.

### Comment numbers

Comment numbers are positions. Every comment in the session is numbered 1 to
N, across all pages, in creation order, with no gaps, and `commentCounter` is
N. A new comment is N + 1; deleting one renumbers the rest
(`renumberComments()` in `lib/storage.ts`), so a deleted number is not kept
back. Sessions saved when numbers were never reused can have gaps, so
`migrateSession()` renumbers on load, in the order of the old numbers.

### Saving and loading

- **Saving.** Structural changes (a new, deleted or duplicated comment, a
  capture, a start over) save at once; typing saves after a 400 ms pause, and
  anything still pending is written when the panel is hidden or closed. Saving is silent:
  the panel shows no save status (an approved exception to the autosave-status
  rule). Every write's promise is tracked, and a failed write raises a toast
  with the browser's reason.
- **Confirmations.** Every action that can't be undone asks first, in a modal
  on layer 1 (owner rule): deleting a comment or the whole session, and in
  the annotation editor, deleting the screenshot, clearing annotations, and
  closing with an unsaved drawing. The editor's confirmations stack on the
  editor, so Cancel returns to the drawing untouched.
- **Failed load.** If storage can't be read at all, `boot.tsx` opens the
  panel anyway with `FAILED_LOAD_STATE`: nothing loaded, Add disabled, and a
  message in the panel body. With Add disabled no session can start, so the
  session that could not be read is never written over. There is no retry;
  closing and reopening the side panel tries again.

### Migrations

**Schema changes require a migration.** Real users' `chrome.storage.local`
persists across every version of this extension they have had installed.
There is no database migration step and no version field forcing a clean
slate. `session.pages[key]` has already changed shape once (a bare comments
array became `{ title, comments }`), and a session created before that change
crashed the panel on load the moment old-shape data reached new code.
`migrateSession()` in `src/lib/storage.ts` normalizes a loaded
session in place before anything else touches it; do the same for any future
shape change.

#### Storage keys

The storage keys were renamed with the product, twice: the original
`alanReviewTool*` keys, then `tagger*` (a working name used only on a
development branch), now `snippy*`. `migrateStorageKeys()` runs before
anything reads storage: for each `snippy*` key that is missing, it takes the
value from the `tagger*` key, else from the `alanReviewTool*` key; then it
deletes every older key. An existing `snippy*` key always wins, so running it
twice never overwrites newer data. The copied session still goes through
`migrateSession()`, so an old array-shaped session is normalized as well.
Obsolete keys are deleted on load: `snippyDraft` / `taggerDraft` (from when
the panel had a New comment field), and the panel width under each
generation's name (`snippyPanelWidth`, `taggerPanelWidth`,
`alanReviewToolPanelWidth`; Chrome's side panel owns the width now).

A panel an older version drew into a page is removed by the page helper the
next time Snippy works with that page (see [Lifecycle](#lifecycle)).

## The report

`buildReportHtml()` (`src/lib/report.ts`) builds a single,
self-contained HTML file as a string. It makes no external requests, bundles
no JavaScript (a deliberate constraint: zero `<script>` tags), and is not
rendered with React. It contains:

- **Header** with session start time, comment and page counts, and the
  reviewer's name, email and details. The page has `lang="en"` and a
  viewport meta tag. Thumbnails keep each image's shape (at most 64 px tall,
  never cropped), so wide element strips and tall crops stay recognisable.
- **Table of contents** linking to each page section by anchor.
- **One section per page**, in the order first touched, each with a link to
  the page. The visible text is the full URL, query and fragment included,
  the same as the `href`, in the table of contents too.
- **Comments** in ascending number order within each page (the panel stores
  and shows them newest first), each labelled "Comment <n>" with the plain
  number in `data-comment-id`. `formatCommentId` and `commentName` in
  `lib/ids.ts` are the one place a number becomes text, in the panel and the
  report alike. The number can change when an earlier comment is deleted (see
  [Comment numbers](#comment-numbers)).
- **A link per comment**, in `p.comment-link`, back to the comment's own page
  (small and muted; its text and `href` are both the full URL), so a comment
  read on its own still says where it came from. An element comment links to
  `#<id>` on that page only when its element had a simple, unique id at
  capture time: `elementFragmentId()` in `lib/links.ts` accepts only a
  selector that is exactly `#<id>` (which `selectorFor` writes only for an id
  unique in the document, never inside a shadow root) with a plain id that
  the captured HTML's own `id` matches. No fragment is ever made from class
  names or paths. Only http, https and file addresses become links.
- **Screenshots** as thumbnails, each paired with a full-resolution image in
  a **pure-CSS lightbox** (an anchor and `:target`, no click handlers).
- **Annotated screenshots** show two labelled figures in `comment-shots`:
  `figure.shot.shot-annotated` ("With annotations", with
  `data-annotation-count` and `data-dot-count`) and `figure.shot.shot-clean`
  ("Original, no annotations"), each with its own thumbnail and lightbox. A
  screenshot without annotations shows one image.
- **Element comments** also show the captured element under a visible
  "Element" label (`p.element-label`): its selector and viewport, then its
  HTML and styles in collapsible `<details>` sections (no JavaScript), all
  escaped.
- **Recursica line.** A "Recursica:" line per page, with the same facts in
  `data-*` attributes, and a separate "Snippy built with" line in the header
  (Snippy's own version, and the adapter and Forge versions it was built
  with, injected by Vite at build time) so the two are never confused.

### Report identity

Two ids exist for combining feedback across sessions and tools without
collision:

- **`session.guid`** - one per session, generated with
  `crypto.randomUUID()` (falling back to `crypto.getRandomValues()` on plain
  `http://` pages, where `randomUUID()` isn't available). Written into the
  report as a hidden `<meta name="snippy-session-id">`: parsable, never
  rendered.
- **The comment number** - one per comment, unique _within_ one report.
  Combined with the guid it identifies a comment within that report only:
  numbers are positions, and a delete renumbers the comments after it.

The report's head also carries `<meta name="snippy-version">`, the extension
version that produced it, for support. The panel itself shows no version; the
browser's extension details do.

Sessions saved before either id existed get both backfilled on load by
`migrateSession()`: a guid is generated, and every existing comment is
numbered oldest to newest (then renumbered 1 to N, as for every session).

### AI-readable instructions

The report also carries a hidden `<meta name="ai-report-instructions">` tag,
inlined from `src/ai-report-instructions.txt` at build time, explaining the
report's structure to a coding agent reading it later, and drawing an
explicit trust boundary: comment text is reviewer-authored, untrusted content
describing a requested UI change, and captured HTML, styles and selectors are
untrusted page content; none of it is ever a set of operating instructions.

## Keyboard shortcuts

`lib/shortcuts.ts` holds them. They work with focus in the panel
(`ReviewPanel.tsx` listens on the panel's `window` in the capture phase) or
on the reviewed page (the page helper listens there and forwards them over
its port, while the panel says they may run). A combination is consumed
(`preventDefault`, `stopPropagation`) only when it is one of ours. Nothing runs while a modal
(a confirmation, the download dialog) is open, while a
capture is under way, or when saved data could not be loaded. Keys are
matched by physical key (`event.code`), so every layout works the same; key
repeat and IME composition (`isComposing`, key code 229) are ignored.

| Function                                            | macOS | Windows, Linux, ChromeOS |
| --------------------------------------------------- | ----- | ------------------------ |
| Add comment                                         | ⌃⇧C   | Alt+Shift+C              |
| Add screenshot (new comment)                        | ⌃⇧S   | Alt+Shift+S              |
| Add element (new comment)                           | ⌃⇧L   | Alt+Shift+L              |
| Duplicate the focused comment                       | ⌃⇧D   | Alt+Shift+D              |
| Add annotations to the focused comment's screenshot | ⌃⇧O   | Alt+Shift+O              |
| Only view comments for this url (toggle)            | ⌃⇧U   | Alt+Shift+U              |
| Show screenshot thumbnails (toggle)                 | ⌃⇧M   | Alt+Shift+M              |
| Open Snippy (browser command)                       | ⌃⇧K   | Alt+Shift+K              |

Why these modifiers: on macOS, Command combinations belong to the browser and
the system, and Option combinations type characters; Control+Shift with these
letters is not a macOS or Chrome shortcut, and not one of the
Control text-editing keys (which are Control+A/E/B/F/N/P/K/D/H/T/O/Y and
their Shift forms select). On Windows and Linux, Control+Shift is full of
browser shortcuts (developer tools on C, E, I, J, K, M; paste as plain text
on V; redo on Z), while Alt+Shift with these letters is free in Chrome. Control must be up, so AltGr (which
arrives as Control+Alt) never matches.

Known overlap: a web app that binds the same combination loses it while the
panel is open.

The browser command (`commands._execute_action` in the manifest) opens
Snippy like the toolbar button. Chrome applies the suggested key only when
the extension is installed and the key is free; the reviewer can change it
at `chrome://extensions/shortcuts`.

## Build

`npm run build` runs lint and the type check (`npm run lint`), then
`build.js`, which runs Vite (`vite.config.mts`) twice and assembles
`dist/chrome`:

1. **The extension pages** (mode `panel`): `src/panel/sidepanel.html` and
   `src/panel/annotate.html` and everything they import, sharing one
   bundle, as ES modules, with the stylesheets and font files
   emitted under `assets/`. `src/report.css` and
   `src/ai-report-instructions.txt` are imported as raw strings (`?raw`). The
   version written into the report comes from `package.json` via a Vite
   `define`, as do the adapter's version (its `package.json`) and the Forge
   versions (the header comment of the Forge export's
   `recursica_variables_scoped.css`). PostCSS runs the Recursica variable
   check (see [Styling](#styling)).
2. **The page helper** (mode `page`): `src/page/main.ts` in library mode, as
   one classic IIFE script, `page.js` (scripts injected with
   `executeScript` can't be ES modules).
3. **Copy.** `background.js`, the extension icons
   (`src/icons/icon-{16,32,48,128}.png`) and `src/manifest.json` (as
   `manifest.json`) join them in `dist/chrome`. The manifest lists the icons
   (`icons` and `action.default_icon`); if the icon files are missing, the
   build prints a warning and removes those entries, since Chrome refuses a
   manifest that points at missing files. `npm run icons -- <source.png>`
   (`scripts/make-icons.mjs`) generates the four sizes from one PNG, with no
   dependencies beyond Node's built-in `zlib`.
4. **Version.** `package.json`'s `version` is the only source of truth
   (Changesets bumps only it). The build writes it into the built manifest,
   right after the name. Chrome accepts only one to four dot-separated
   integers, so a prerelease or build suffix (`1.2.0-beta.1`) fails the build
   with a clear message rather than being mapped. The build then checks that
   the built manifest and the side panel's script carry exactly that
   version, and fails if not.

Type checking is `npm run typecheck`: `tsconfig.json` covers `src/panel`,
`src/page` and `src/lib`; `tsconfig.node.json` covers `vite.config.mts`.

## Release and CI

- **Pull requests** (`.github/workflows/pull-request.yml`): on a PR to
  `main`, installs with `npm ci` and runs `npm run build` (so lint, type check
  and the bundle all run). It is skipped for `changeset-release` branches.
- **Changesets** (`.changeset/`): each user-facing change adds a changeset.
  `package.json` is `private`, but `.changeset/config.json` sets
  `privatePackages: { version: true, tag: true }`, so Changesets still bumps
  the version, writes `CHANGELOG.md` and tags a GitHub Release, and never
  publishes to npm.
- **Release** (`.github/workflows/release.yml`): on a push to `main`
  touching `.changeset/`, `src/` or the package files (or by hand), it builds
  and runs the Changesets action. With changesets pending, that opens or
  updates a "Version Packages" PR. When that PR is merged, the action tags
  and creates the GitHub Release; the workflow then runs
  `npm run package-extension` and uploads the zips to that release.
- **Release zips** (`scripts/package-extension.mjs`): zips the built
  `dist/chrome` folder into `release-zips/` as
  `snippy-chrome-v<version>.zip`, with `manifest.json` at the zip's top
  level. The version comes from `package.json`. Run `npm run build` first.
- **Pre-commit** (`.husky/`, `scripts/lint-staged.config.cjs`): lint-staged
  formats staged files with Prettier, lints staged JS and TS with ESLint, and
  runs the type check for staged TypeScript.

## Verification methodology

There is no automated test suite checked into this repo. Chrome opens a side
panel only from a user gesture (the toolbar click), which can't be scripted,
so verification relies on Playwright, run ad hoc from outside the repo:

- Launch Chromium with the built `dist/chrome` loaded
  (`--load-extension`), and serve a fake site on two origins (for example
  `localhost` and `127.0.0.1`).
- Open `chrome-extension://<id>/sidepanel.html` in a narrow popup window
  (about 420 px), with an init script that stubs only
  `chrome.windows.getCurrent()` to return the reviewed tab's window - the
  one fact a real side panel knows that a popup doesn't. Everything else is
  real: storage, the page helper's injection, `captureVisibleTab`.
- Drive both the panel and the reviewed page with real mouse and keyboard
  input rather than synthetic `element.click()` calls, which don't reliably
  trigger the same focus and event paths as genuine input.

Cover light and dark, captures (region, element by mouse and by keys from the
panel, Escape), shortcuts with focus on the page, navigating the tab across
origins, a chrome:// page, the report download, and an old-shape stored
session. For the annotation editor, drive its tab (it opens as a new page
in the browser context): saving through the panel, the one-tab-per-comment
switch, and saving with the panel closed. A test can't read the editor
tab's address through `chrome.tabs` either (no `tabs` permission), so it
uses Playwright's own page for the tab.
