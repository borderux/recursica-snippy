// The service worker. Snippy's panel is Chrome's side panel
// (sidepanel.html, from src/panel): Chrome owns it, keeps it open across
// page loads and tabs in a window, and gives it its own close button. The
// one thing to set up here is that the toolbar icon (and its keyboard
// command, _execute_action) opens it.
//
// Called on every start of the worker rather than only on install: it is
// cheap, and it keeps the behaviour right after an update too.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) =>
    console.error("Snippy: could not set up the side panel.", err),
  );
