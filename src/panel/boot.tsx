// What every Snippy extension page shares on start: the stylesheets, the
// colour scheme, the fonts, the saved data, and the React root with the
// Recursica provider and its portals (App). Two pages use it: the side
// panel (main.tsx) and the annotation editor's tab (annotate.tsx).
//
// Stylesheet order matters (the adapter's SETUP.md): Mantine first, then
// the Recursica theme variables - Snippy's own Forge export, in the repo
// root - then the adapter's component styles, then the panel's own few
// rules.
import "@mantine/core/styles.css";
import "../../recursica_variables_scoped.css";
import "@recursica/adapter-mantine-v8/style.css";
import "./panel.css";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { registerFonts } from "./fonts";
import {
  FAILED_LOAD_STATE,
  loadStoredState,
  type StoredState,
} from "../lib/storage";

export interface BootContext {
  stored: StoredState;
  // Where the toast renders (see App).
  portalEl: HTMLElement;
}

export function boot(
  render: (context: BootContext) => ReactNode,
  { initLayer0 = true }: { initLayer0?: boolean } = {},
): void {
  void (async () => {
    registerFonts();
    // If storage can't be read, the page still opens, with the failure
    // flagged (loadFailed) for the page to say so.
    let stored: StoredState;
    try {
      stored = await loadStoredState();
    } catch (err) {
      console.error("Snippy: could not load saved data.", err);
      stored = FAILED_LOAD_STATE;
    }
    const rootEl = document.getElementById("root")!;

    // The toast renders in a fixed container at the viewport's top-left
    // (App places it); modals in a second one declaring layer 1. The modal
    // one is a plain element carrying the layer attribute rather than the
    // adapter's Layer component, because Layer paints its own padded
    // surface and a modal portals out of any Layer it is wrapped in.
    const portalEl = document.createElement("div");
    portalEl.className = "art-portal";
    const modalPortalEl = document.createElement("div");
    modalPortalEl.className = "art-portal";
    modalPortalEl.setAttribute("data-recursica-layer", "1");

    createRoot(rootEl).render(
      <App
        portalEl={portalEl}
        modalPortalEl={modalPortalEl}
        initLayer0={initLayer0}
      >
        {render({ stored, portalEl })}
      </App>,
    );
  })();
}
