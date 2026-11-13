// The side panel's entry point. Chrome loads sidepanel.html when the
// reviewer opens Snippy from the toolbar, and keeps it open across tabs
// and page loads in that window (see src/background.js). If storage can't
// be read, the panel still opens - empty, with Add disabled and a message
// saying the saved data could not be loaded. Closing and reopening the
// side panel tries again.
import { boot } from "./boot";
import { ReviewPanel } from "./ReviewPanel";

boot(({ stored, portalEl }) => (
  <ReviewPanel portalEl={portalEl} stored={stored} />
));
