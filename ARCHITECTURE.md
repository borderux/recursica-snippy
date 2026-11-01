# Architecture

## Overview

Snippy is a Manifest V3 browser extension (Chrome and Firefox) that lets a
reviewer leave feedback on any website without that site embedding anything.
A comment can be text only, or carry a screenshot, a captured page element,
and annotations drawn on the screenshot. Feedback is grouped into a single
**session** spanning every page the reviewer visits, and exported as a
self-contained HTML report.

There is no backend. The live panel is React + TypeScript, built from the
Recursica design system and bundled by Vite into one content script.
`build.js` runs that build and writes browser-specific bundles to
`dist/chrome` and `dist/firefox` (see [Build](#build)).

## Components

### Extension shell

- **`src/manifest.chrome.json` / `src/manifest.firefox.json`** - Two
  manifests, because Chrome's MV3 requires `background.service_worker` and
  Firefox's MV3 still wants `background.scripts`. They differ in exactly two
  places: that `background` block, and Firefox's
  `browser_specific_settings.gecko.id` (`snippy@borderux.com`). Everything
  else, including permissions and `web_accessible_resources`, is identical.
  Neither carries a `version`; the build writes it.
- **`src/background.js`** - The service worker, plain unbundled JavaScript,
  with two jobs. It injects `content.js` into the active tab on toolbar-icon
  click (`chrome.action.onClicked` + `chrome.scripting.executeScript`). It
  also captures a screenshot when the panel sends a `snippy:capture` message
  (`chrome.tabs.captureVisibleTab`, since only the background context can
  capture pixels). Injection failures (chrome://, the Web Store, the PDF
  viewer - anywhere `activeTab` doesn't reach) show as a red `!` toolbar
  badge instead of failing silently; a later success clears it.

### The panel (`src/content/`)

Re-injected fresh on every toolbar click (see
[Injection & lifecycle](#injection--lifecycle)).

- `main.tsx` - entry point: toggles the panel open or closed.
- `mount.tsx` - builds the host element (`#snippy-host`), shadow root,
  stylesheet and React root.
- `App.tsx` - the Mantine provider, configured for the shadow root, and the
  Recursica layer-0 scope.
- `ReviewPanel.tsx` - the panel shell: open and close, Escape, focus, the
  footer (Start over and Download report), the toast, the modals, and the
  failed-load state.
- `useReviewSession.ts` - all session state and saving.
- `usePageKey.ts` - the current page key, re-read as the address changes.
- `useColorScheme.ts` - follows `prefers-color-scheme` live.
- `modalPortal.ts` - hands every modal its layer-1 portal container.
- `styles.ts`, `panel.css`, `fonts.ts` - see
  [Styling inside the shadow root](#styling-inside-the-shadow-root).
- `components/`:
  - `CommentList` - the one view: the current page's comments, or every
    page's grouped under page headings that each link to their page (same
    tab).
  - `ViewOptions` - two checkboxes, "Only view comments for this url" and
    "Show screenshot thumbnails", at the end of the scrolling list.
  - `AddMenu` - a small icon-only plus button left of the panel title, with
    Comment, Screenshot and Element. It is rendered into a slot placed first
    in the header (see [Adapter workarounds](#adapter-workarounds)).
  - `CommentItem` - a comment card (the kit's Card) with Duplicate and Delete
    buttons and, when it has no screenshot, an Add screenshot button.
  - `DownloadModal` - asks for the reviewer's name, email and the session's
    details every time a report is downloaded.
  - `AnnotationEditor` - see below.
  - `ConfirmModal` - the shared confirmation modal.
  - `ResizeHandle` - the resize strip on the panel's left edge.
  - `useManagedMenu` - menu focus handling that works in a shadow root.
- `lib/` - framework-free modules: `storage` (persistence, migration),
  `types`, `page` (page key and push), `capture`, `captureFrame` and
  `element` (the capture overlays), `annotations` and `pen`, `environment`,
  `recursica` (page detection), `report`, `links`, `ids`, `format`,
  `shortcuts`.

**The annotation editor** has a fixed toolbar and a bordered, scrolling image
below it. The toolbar holds the tool control (Select, Pen, Arrow, Numbered
dot - the kit's segmented control), the pen colour dropdown and Clear
annotations. Annotations are SVG objects over the image. A new one is left
unselected, so the add tool keeps adding. With the Select tool they are tab
stops: they can be selected, dragged, moved with the arrow keys, deleted with
Delete or Backspace, and undone and redone with Cmd/Ctrl+Z and
Cmd/Ctrl+Shift+Z. Its own confirmations (discard changes, clear annotations,
delete screenshot) stack on it.

### Build inputs and tooling

- **`src/report.css`** - Styles the _downloaded report_, not the live panel.
  Inlined into `content.js` at build time, because a downloaded standalone
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

## Injection & lifecycle

Permissions are deliberately minimal: `activeTab`, `scripting`, `storage` and
`unlimitedStorage`, with no `host_permissions`. `content.js` only ever runs
because the user clicked the toolbar icon (or its keyboard command), which is
what makes `activeTab` sufficient. `unlimitedStorage` lifts the 10 MB
`chrome.storage.local` quota: screenshots and captured element HTML live in
the session, and a long review would otherwise fill it.

The Firefox add-on id is `snippy@borderux.com`. The earlier product, Alan
Review Tool, used `alan-review-tool@borderux.com`. Firefox keys an add-on's
storage by id, so existing Firefox users of that product start with no data.
On Chrome the extension id does not change, which is why the
[storage-key migration](#storage-keys) still matters.

Each click re-injects `content.js` from scratch. `main.tsx` starts by
checking for an existing panel host (`#snippy-host`):

- **Found: close.** It dispatches a cancelable `snippy:close` event on the
  host. The script instance that owns the panel listens for it, calls
  `preventDefault()`, saves anything still pending, slides the panel out,
  then unmounts React, removes the host and restores the page. If nothing
  answers (the owning instance is gone, for example after the extension was
  reloaded), the new instance removes the host itself.
- **Not found: open.** `mount.tsx` loads storage, then builds the panel.

Anything that must survive a close and reopen lives outside the script:
`chrome.storage.local` for session data, panel width and reviewer identity;
`data-snippy*` attributes on `document.documentElement` for the page's own
pre-panel inline styles, and the fonts-registered flag.

The panel **pushes** the page rather than overlaying it: opening it shrinks
`document.documentElement`'s width (with a transition). It is **non-modal**:
no backdrop, no focus trap, no scroll lock, and the page stays usable. The
Recursica `Panel` (Mantine's `Drawer`) defaults to modal behaviour, so
`ReviewPanel.tsx` switches each of those off explicitly, and
`markPanelNonModal()` removes the `aria-modal` the Drawer always sets. Escape
closes the panel only while focus is inside it, and never while one of its
modals is open.

While any modal is open, the host page's `<body>` and the panel content are
made `inert` (prior values restored), so only the modal is reachable. Escape
that starts inside a modal or a menu is never treated as closing the panel:
Mantine closes its modal in a capture listener on `window`, before React's
handler runs, so the panel checks where the key came from rather than
trusting its own modal state. When the panel closes, whatever had focus on
the page before it opened gets focus back. Pending typing is written on
`pagehide` and when the page is hidden, so a refresh never loses it.

### Capture

There are two screenshot modes (region selection, and the visible area) plus
element picking. All of them draw hand-built overlays in the host page's
light DOM, where no theme token reaches.

- **The capture frame** (`lib/captureFrame.ts`). Both screenshot modes mark
  themselves with a 2px dashed frame around the whole viewport: a black line
  under white dashes, so it shows on light and dark pages, fixed inside the
  viewport, ignoring the pointer and never affecting layout. There is no
  tint over the page, and the region-selection rectangle is an edge with no
  fill, so what is being captured stays fully visible. The frame and every
  other overlay element are removed before pixels are taken.
- **Panel away** (`withPanelAway()` in `lib/capture.ts`). While a region is
  being selected, the panel is hidden and the page gets its full width back,
  so there is no blank strip and the capture covers the page as it really
  lays out. The panel and the push come back afterwards on every path:
  success, cancel or failure.
- **Element picking** (`lib/element.ts`). The mouse highlights the element
  under it and a click chooses; arrow up and down move to the parent and
  first child, Enter chooses, Escape cancels. The page's own handlers never
  see those clicks and keys. Open shadow roots are followed; closed ones stop
  at their host. Frames are never entered: a transparent blocker covers each
  one while picking, and choosing one says its content can't be captured.

## Styling inside the shadow root

Everything the panel draws lives in an open shadow root on the host element,
so its styles can't leak into the page and vice versa. Getting a Mantine- and
Recursica-based UI to work there takes five things:

1. **One stylesheet, injected once.** `styles.ts` concatenates Mantine's CSS,
   the Recursica theme variables (`recursica_variables_scoped.css`, the
   default Forge theme as shipped in the adapter package), the adapter's
   component CSS and `panel.css`, all imported as strings, into one `<style>`
   in the shadow root.
2. **`:root` retargeted at build time.** Mantine and the theme declare their
   base variables on `:root`, which never matches inside a shadow root. A
   PostCSS step in `vite.config.mts` rewrites `:root` to `.art-root`, the
   panel's own root element. The same step converts the few bare `rem`
   values in the Recursica stylesheets to px, since `rem` resolves against
   the host page's `<html>` font size, which any site can change. Mantine's
   own rem values are all multiplied by its scale, which `App.tsx` sets from
   the host page's real root font size (`pageRemScale()`).
3. **Theme and colour scheme on the panel's root, not the page's `<html>`.**
   `data-recursica-theme` (light or dark, following `prefers-color-scheme`
   live) and Mantine's colour-scheme attribute are both set on `.art-root`.
   The adapter's `RecursicaThemeProvider` is not used: it writes to
   `document.documentElement`, which here is the reviewed site's `<html>`.
   Layer 0 is declared once, with the adapter's `Layer`, just inside it.
4. **Portals stay inside the shadow root.** Mantine's `Portal` defaults to
   `document.body`, which would leave tooltips and modals unstyled. The theme
   points every portal (tooltips, menus, the toast) at `.art-portal`, a
   container inside the layer-0 scope pinned to the viewport's top-left
   corner (Mantine's modal positions itself assuming that) and stacked above
   the panel. Modals use a second container of the same kind that declares
   `data-recursica-layer="1"`, so every modal sits on layer 1. It is a plain
   element carrying the attribute rather than the adapter's `Layer`
   component, because `Layer` paints its own padded surface. Mantine's focus
   return (modals and menus) records `document.activeElement`, which inside
   a shadow root is the host, so the panel moves focus itself.
5. **Fonts on the document.** Chrome ignores `@font-face` inside a shadow
   root, so `fonts.ts` adds the theme's two typefaces (Dongle, Nunito Sans,
   bundled from Fontsource and inlined into `content.js`) to the host
   document's `FontFaceSet`, built from bytes so no page's `font-src` policy
   applies.

**Global side effects.** The panel writes to the host page only in three
ways: the page push (inline `width` and `transition` on `<html>`), the
`data-snippy*` dataset flags that remember the page's prior inline styles,
and the registered fonts. Nothing else touches `<html>` or `<body>`, apart
from the temporary `inert` attributes on `<body>` while a modal is open and
the capture overlays.

Because every stylesheet is inlined, `content.js` is large (about 2 MB, most
of it the theme's CSS variables). It is read from the local extension package
on each click, never downloaded.

## Adapter workarounds

Policy: when the adapter or theme misbehaves, that is an adapter bug, and the
UI shows the adapter's real behaviour. A workaround stays only if the panel
is **(A)** forced to it by running in a shadow root on someone else's page,
or **(B)** would otherwise be unusable, inaccessible, or break a MUST rule in
the Recursica skills. Everything purely cosmetic of our own **(C)** uses kit
props and tokens or goes. Each kept item is reported to the adapter. Keep
this list current: every workaround in the code appears here, with the gap it
stands in for.

### (A) Shadow root, or someone else's page

- `vite.config.mts` `shadowScope` - `:root` rewritten to `.art-root`: theme
  and Mantine variables never match inside a shadow root. Ask: ship the theme
  scoped to a selector the consumer chooses.
- `vite.config.mts` `shadowScope` - bare `rem` in the adapter and theme CSS
  converted to px: `rem` follows the host page's root font. Ask: no bare
  `rem`, or scale it like Mantine does.
- `App.tsx` `scale: pageRemScale()` - Mantine's scale set from the host's
  root font, for the same reason.
- `App.tsx` `cssVariablesSelector` and `getRootElement`; `mount.tsx` and
  `useColorScheme.ts` `data-recursica-theme` on the panel root -
  `RecursicaThemeProvider` writes to the host's `<html>`. Ask: a provider
  that targets a given element.
- `App.tsx` `Portal.extend` target, `panel.css` `.art-portal` - portals must
  stay inside the shadow root, and Mantine's modal assumes a viewport-pinned
  container. Ask: a documented portal target on every overlay component.
- `mount.tsx` modal portal with `data-recursica-layer="1"` - every modal sits
  on layer 1; the adapter's `Layer` paints a padded surface, so a plain
  element carries the attribute. Ask: Modal should set its own layer, or
  `Layer` should have a surface-less mode.
- `AnnotationEditor.tsx` `comboboxProps.portalProps` - the pen list renders
  with the modal (layer 1), not in the inert layer-0 portal. Follows from the
  two above.
- `ReviewPanel.tsx` `withinPortal={false}`, `returnFocus={false}` on Panel and
  modals, and `returnFocus()` - Mantine records `document.activeElement`,
  which is the shadow host. Ask: focus return that works in a shadow root.
- `useManagedMenu.ts` - menu focus into the first item and back to the
  trigger, done by hand for the same reason; Tab closes the menu.
- `fonts.ts` - the theme's typefaces added to `document.fonts` from bytes:
  `@font-face` is ignored in a shadow root and a page's CSP can block font
  requests. Ask: document this for embedded use.
- `mount.tsx` host element inline styles (`all: initial`, fixed, top
  z-index) - isolates the panel from the host page's CSS.
- `panel.css` `.art-root` font-family - the shadow tree inherits
  `all: initial`, so the base font comes from the brand token.
- `vite.config.mts` `process.env.NODE_ENV` define - the adapter reads
  `process` at runtime; a content script has none. Ask: no runtime `process`
  access.
- `lib/capture.ts`, `lib/element.ts`, `lib/captureFrame.ts` overlay inline
  styles and colours - they live in the host page's light DOM, where no token
  reaches (an approved hand-built surface).

### (B) Adapter defect or gap that would break a MUST rule, accessibility or usability

- `ReviewPanel.tsx` Panel `withOverlay`, `trapFocus`, `lockScroll`,
  `closeOnEscape` and `closeOnClickOutside` all false - the adapter's Panel
  keeps Mantine Drawer's modal defaults; the panel rules say a panel is never
  modal (MUST).
- `lib/page.ts` `markPanelNonModal` - Panel always renders `role="dialog"
aria-modal="true"`, which hides the live page from screen readers.
- `lib/page.ts` `makeBehindModalInert`, and `AnnotationEditor.tsx` making the
  editor inert under its questions - "everything behind the modal must be
  inert" (MUST); inside a shadow root Mantine's modal doesn't do it.
- `ReviewPanel.tsx` Escape handler judged by `event.target`, and
  `AnnotationEditor.tsx` `closeOnEscape` toggled - every open Mantine modal
  closes on any Escape (a window listener), so Escape in the pen list or on a
  stacked question would throw the drawing away.
- `App.tsx` `Tooltip.extend` focus events - tooltips must show on keyboard
  focus (MUST); the adapter keeps Mantine's hover-only default.
- `ReviewPanel.tsx` toast live-region wrapper and `role="group"` on Toast -
  the live region must exist before the message (MUST); the Toast's own role
  would announce twice.
- `ReviewPanel.tsx` header slot (`.art-header-slot`) for Add - Panel has no
  header actions slot, and its compound parts carry none of its styling; a
  button inside the title would rename the panel "Add Snippy".
- `ReviewPanel.tsx` `overStyled` and `size` on Panel, `ResizeHandle.tsx`,
  `panel.css` `.art-resizer` - Panel has no width or resize option; the owner
  requires a resizable panel of 400 to 720 px, default 440. This is the one
  approved use of `overStyled`.
- `vite.config.mts` theme CSS alias - `recursica_variables_scoped.css` is not
  in the package's `exports`; without the alias the build can't import it.

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

### Token remaps (owner-approved)

`panel.css` has one block on `.art-root` that re-points a few ui-kit token
values for the panel only. Their proper home is the Forge theme; remove the
block once Forge carries them. Add to it only with the owner's approval.

- **Panel body padding.** Content padding is `general_lg` (16 px) on all four
  sides: `--recursica_ui-kit_components_panel_properties_content-horizontal-padding`
  (Forge: `general_xl`, 24 px) is re-pointed to `general_lg`, and
  `...content-vertical-padding` is set explicitly so the four sides read alike.
- **Card padding.** `--recursica_ui-kit_components_card_properties_padding`
  (Forge: 24 px) is re-pointed to `--recursica_brand_dimensions_general_default`
  (8 px).
- **Card radius.** The layer-0 card border radius
  (`--recursica_ui-kit_modes_light_layer_0_components_card_properties_borders_border-radius`
  and its `dark` twin, 24 px) is set to 12 px, which no theme radius token
  equals.
- **Text box rows.** `--recursica_ui-kit_components_textarea_properties_rows`
  (Forge: 4) is set to 1, so every text box starts at one row and grows and
  shrinks with its text (with the kit's `autosize`). Gap: "TextArea should
  allow rows/min-height to be set by the consumer."

No element is styled by this block; only token values change.

### Other owner-approved exceptions

- **Heading trim.** `panel.css` `text-box: trim-both cap alphabetic` on the
  panel title and the card number headings, inside
  `@supports (text-box-trim: trim-both)`. It works around the theme's heading
  line-box bug: the header type (Dongle at 56 px, 39.2 px line height) puts
  the glyphs off the centre of their line box. Trimmed, the title's cap
  height centres on Add and Close within 0.5 px (it was 4.6 px high) and a
  card number on its buttons within 1 px (it was 4.8 px). Firefox doesn't
  support it yet and shows the theme's own line box.
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
  links in the same tab, with page titles at link size; no heading trim in
  Firefox until it supports it; Snippy's Alt+Shift shortcuts taking priority
  over a page's own access keys in Firefox on Windows and Linux; the
  manifest `author` string (Chrome ignores it, Firefox reads it); and the
  suggested browser shortcut Alt+Shift+K.

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
one entry per comment or per page. A content script's own page-scoped
`localStorage` is isolated per origin, which would defeat the entire "any
site, one session" pitch. The types live in `src/content/lib/types.ts`.

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
  title: string                // document.title, captured once per page
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

The page key is the address the panel is on right now
(`currentPageKey()` in `lib/page.ts`). Single-page apps change it without a
reload, and a content script can't see the page's own history calls, so
`usePageKey()` re-reads it every 500 ms, and at once on `hashchange` and
`popstate`; comments added after an in-app navigation are filed under the new
address.

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
- `snippyPanelWidth` - the panel's width: 400 to 720 px, default 440. A
  stored width below the minimum is raised to it on load.
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
page. Older element comments keep their viewport in `element.viewport`;
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
  `<style>` elements and same-origin stylesheets are read (the extension has
  no host permissions, so cross-origin sheets are skipped without a
  request), and only their first 4 KB, with a 1.5 s timeout per sheet and
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
  anything still pending is written when the panel closes. Saving is silent:
  the panel shows no save status (an approved exception to the autosave-status
  rule). Every write's promise is tracked, and a failed write raises a toast
  with the browser's reason.
- **Confirmations.** Every action that can't be undone asks first, in a modal
  on layer 1 (owner rule): deleting a comment or the whole session, and in
  the annotation editor, deleting the screenshot, clearing annotations, and
  closing with an unsaved drawing. The editor's confirmations stack on the
  editor, so Cancel returns to the drawing untouched.
- **Failed load.** If storage can't be read at all, `mountPanel()` opens the
  panel anyway with `FAILED_LOAD_STATE`: nothing loaded, Add disabled, and a
  message in the panel body. With Add disabled no session can start, so the
  session that could not be read is never written over. There is no retry;
  the next toolbar click tries again.

### Migrations

**Schema changes require a migration.** Real users' `chrome.storage.local`
persists across every version of this extension they have had installed.
There is no database migration step and no version field forcing a clean
slate. `session.pages[key]` has already changed shape once (a bare comments
array became `{ title, comments }`), and a session created before that change
crashed the panel on load the moment old-shape data reached new code.
`migrateSession()` in `src/content/lib/storage.ts` normalizes a loaded
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
`migrateSession()`, so an old array-shaped session is normalized as well. An
obsolete `snippyDraft` / `taggerDraft` key (from when the panel had a New
comment field) is deleted on load.

A panel left open by an older version (`#tagger-host` or
`#alan-review-tool-host`) is closed on the next click, restoring the page
from that version's dataset names.

## The report

`buildReportHtml()` (`src/content/lib/report.ts`) builds a single,
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

`lib/shortcuts.ts` holds them; `ReviewPanel.tsx` listens on `window` in the
capture phase while the panel is open, so they work with focus in the panel
or on the reviewed page. A combination is consumed (`preventDefault`,
`stopPropagation`) only when it is one of ours. Nothing runs while a modal
(the annotation editor, a confirmation, the download dialog) is open, while a
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
| Open or close Snippy (browser command)              | ⌃⇧K   | Alt+Shift+K              |

Why these modifiers: on macOS, Command combinations belong to the browser and
the system, and Option combinations type characters; Control+Shift with these
letters is not a macOS, Chrome or Firefox shortcut, and not one of the
Control text-editing keys (which are Control+A/E/B/F/N/P/K/D/H/T/O/Y and
their Shift forms select). On Windows and Linux, Control+Shift is full of
browser shortcuts (developer tools on C, E, I, J, K, M; Firefox's screenshot
on S; paste as plain text on V; redo on Z), while Alt+Shift with these
letters is free in Chrome and Firefox. Control must be up, so AltGr (which
arrives as Control+Alt) never matches.

Known overlaps: a page's own `accesskey` on one of these letters (Firefox on
Windows and Linux uses Alt+Shift for access keys) is taken while the panel is
open, and a web app that binds the same combination loses it while the panel
is open.

The browser command (`commands._execute_action` in both manifests) opens and
closes Snippy like the toolbar button. Chrome applies the suggested key only
when the extension is installed and the key is free; the reviewer can change
it at `chrome://extensions/shortcuts` (Firefox: Manage Extension Shortcuts in
the add-ons page).

## Build

`npm run build` runs lint and the type check (`npm run lint`), then
`build.js`:

1. **Vite** (`vite.config.mts`) runs in library mode, producing one classic
   IIFE script, `content.js` (content scripts injected with `executeScript`
   can't be ES modules). `src/report.css` and `src/ai-report-instructions.txt`
   are imported as raw strings (`?raw`), the panel's stylesheets as inline
   strings (`?inline`), and the font files inlined as data. The version
   written into the report comes from `package.json` via a Vite `define`. A
   missing source file fails the build.
2. **Copy.** `content.js`, `background.js` and the extension icons
   (`src/icons/icon-{16,32,48,128}.png`) are copied into `dist/chrome` and
   `dist/firefox`, with each browser's own manifest as `manifest.json`. Both
   manifests list the icons (`icons` and `action.default_icon`); if the icon
   files are missing, the build prints a warning and removes those entries
   from the built manifests, since a browser refuses a manifest that points
   at missing files. `npm run icons -- <source.png>` (`scripts/make-icons.mjs`)
   generates the four sizes from one PNG, with no dependencies beyond Node's
   built-in `zlib`.
3. **Version.** `package.json`'s `version` is the only source of truth
   (Changesets bumps only it). The build writes it into each built manifest,
   right after the name. Browsers accept only one to four dot-separated
   integers, so a prerelease or build suffix (`1.2.0-beta.1`) fails the build
   with a clear message rather than being mapped. The build then checks that
   both built manifests and the built `content.js` carry exactly that
   version, and fails if not.

Type checking is `npm run typecheck`: `tsconfig.json` covers the panel,
`tsconfig.node.json` covers `vite.config.mts`.

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
- **Release zips** (`scripts/package-extension.mjs`): zips each built
  `dist/<browser>` folder into `release-zips/` as
  `snippy-<browser>-v<version>.zip`, with `manifest.json` at the zip's top
  level. The version comes from `package.json`. Run `npm run build` first.
- **Pre-commit** (`.husky/`, `scripts/lint-staged.config.cjs`): lint-staged
  formats staged files with Prettier, lints staged JS and TS with ESLint, and
  runs the type check for staged TypeScript.

## Verification methodology

There is no automated test suite checked into this repo. A real toolbar click
can't be scripted, so verification relies on Playwright, run ad hoc from
outside the repo: stub `chrome.storage.local` and `chrome.runtime` in an init
script, route a fake site, evaluate `dist/chrome/content.js` in the page (one
evaluation is one toolbar click), then drive the panel with real mouse and
keyboard input rather than synthetic `element.click()` calls, which don't
reliably trigger the same focus and event paths as genuine input.
Playwright's role and label locators pierce the open shadow root. Cover light
and dark, a host page with a non-16px root font, the minimum panel width, and
an old-shape stored session.
