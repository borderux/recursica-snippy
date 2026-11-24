# snippy

## 0.5.0

### Minor Changes

- de5a230: The panel header now shows a "New Version Available" link next to the version when a newer Snippy has been released on GitHub. Snippy also now has a fixed extension id, so updating by replacing the files in its folder (see the README's "Updating" section) keeps your saved comments. Moving to this version from 0.4.0 or earlier starts with an empty session, so download a report of any review in progress first.
- de5a230: Comment numbers are permanent again: deleting a comment no longer renumbers the others, and a number is never reused, so "Comment 3" is the same comment in every report from a review session. Deleting a comment now leaves a gap in the numbers. Report format 1.2.
- de5a230: Respond to a Snippy report: open a downloaded report with Snippy's panel open, and each comment gets Mark Resolved and Respond. Resolved comments show a green check and answered ones a blue circle. The panel shows a banner and the collected replies, with Copy Responses to send them back to the reviewer, Paste Responses to load responses copied from the same report, and Delete Responses, and the report's comments with Resolved and Responded badges. Responses are saved in Snippy, and the report file stays unchanged.

### Patch Changes

- de5a230: The panel header now shows Snippy's version after the title, in smaller grey text, for example "Snippy (v0.4.0)".
- de5a230: The downloaded report's header now shows a "Snippy Version" line below the Environment line, in place of the "Snippy built with" line that listed the Recursica adapter and Forge theme versions. Reports also carry a hidden format version (`snippy-report-format`, now 1.1) so scripts and AI agents can tell report layouts apart.

## 0.4.0

### Minor Changes

- 6230f56: Snippy now opens in Chrome's side panel. It stays open as you move between pages, sites and tabs in a window, always showing the active tab's comments, and Chrome's own side panel controls resize and close it. Captures work as before, without hiding the panel: drag on the page for a screenshot, or pick an element by mouse or with the arrow keys and Enter, even with focus in the panel. Add annotations opens the screenshot in a new tab beside the page, with the main window's room to draw in; saving or cancelling closes it and returns to the page. On pages Snippy can't reach (browser pages, the Chrome Web Store) the panel says so and Add is turned off. Snippy is now Chrome only; the Firefox version is discontinued. The extension now needs access to all websites and Chrome's side panel permission, which Chrome asks you to approve when it updates. The panel's stored width is no longer used and is removed.

### Patch Changes

- 6230f56: Deleting the screenshot from an element comment now deletes the captured element details (its selector, HTML and styles) too, instead of leaving the element's selector behind on the comment.
- 6230f56: Snippy is now built on version 1.5.0 of the Recursica Mantine adapter, set up the way the adapter's setup guide describes, with Snippy's own Recursica Forge theme export. The panel header now has the design system's Close button, which closes the side panel, and pressing Escape closes the side panel too (except while a dialog is open or a capture is under way, where Escape still only cancels that).
- 6230f56: The View options ("Only view comments for this url" and "Show screenshot thumbnails") now sit at the top of the panel, above the comments, instead of after the last comment.

## 0.3.0

### Minor Changes

- ba549f4: Rename the extension to Snippy and rebuild its review panel on the Recursica design system (React, TypeScript, Vite): light and dark mode following the operating system; a single list of comment cards with one Add menu in the header (Comment, Screenshot, Element), numbered 1 to N with no gaps (deleting a comment renumbers the rest); two checkboxes at the end of the comment list to show only this page's comments (or every page's, grouped by page) and to show screenshot thumbnails, both remembered; a wider panel (400 to 720 px, 440 by default); screenshot comments with Add annotations and a pen color dropdown with six colors; Duplicate and Delete buttons on each comment; confirmation before anything that can't be undone, including discarding an unsaved drawing; page headings and a link on every report comment back to its page (and to the element, when it has a simple unique id); a Download report button showing the total count, with a dialog for the reviewer name, email and session details; a failed save reported as a message; and, if saved data can't be read, a panel that still opens with a message and Add turned off. Stored data moves to new storage keys automatically. Firefox: Snippy has a new add-on id, replacing the Alan Review Tool's, so Firefox installs Snippy as a new add-on and data stored by the Alan Review Tool is not carried over. The extension now requests the unlimitedStorage permission so long sessions with screenshots do not hit the storage quota.

## 0.2.0

### Minor Changes

- e95a17e: Updated release strategy and build
