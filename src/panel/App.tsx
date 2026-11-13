import { type ReactNode } from "react";
import { MantineProvider, Tooltip, createTheme } from "@mantine/core";
import { RecursicaThemeProvider } from "@recursica/adapter-mantine-v8";
import manifest from "../../recursica_manifest.json";
import { ModalPortalContext } from "./modalPortal";
import { useColorScheme } from "./useColorScheme";

interface AppProps {
  portalEl: HTMLElement;
  modalPortalEl: HTMLElement;
  children: ReactNode;
  // Whether RecursicaThemeProvider wraps the page in its layer-0 Layer
  // (its default). See annotate.tsx.
  initLayer0?: boolean;
}

const theme = createTheme({
  components: {
    // Tooltips appear on keyboard focus as well as hover. Mantine's
    // default is hover only, and the adapter does not change it.
    Tooltip: Tooltip.extend({
      defaultProps: {
        events: { hover: true, focus: true, touch: false },
      },
    }),
  },
});

// The providers around one Snippy page (the side panel or the annotation
// editor), set up as the adapter's SETUP.md describes: Mantine's provider,
// then RecursicaThemeProvider with Snippy's Forge export (the manifest in
// the repo root). The Recursica provider sets the theme (light or dark,
// following the system) on <html> and wraps the page in layer 0. Where
// only the theme is set - Mantine's tooltips and menus, portaled into the
// body - the theme's stylesheet applies layer 0 by default.
export function App({
  portalEl,
  modalPortalEl,
  children,
  initLayer0 = true,
}: AppProps) {
  const scheme = useColorScheme();

  return (
    <MantineProvider theme={theme} forceColorScheme={scheme}>
      <RecursicaThemeProvider
        theme={scheme}
        manifest={manifest}
        initLayer0={initLayer0}
      >
        {/* The portals come first, so the toast's Dismiss button is a
            predictable tab stop - before the panel's controls, not after
            all of them. Everything in them is fixed-position, so their
            place in the DOM doesn't affect layout. */}
        <div
          ref={(el) => {
            if (!el) return;
            if (portalEl.parentElement !== el) el.appendChild(portalEl);
            if (modalPortalEl.parentElement !== el)
              el.appendChild(modalPortalEl);
          }}
        />
        <ModalPortalContext.Provider value={modalPortalEl}>
          {children}
        </ModalPortalContext.Provider>
      </RecursicaThemeProvider>
    </MantineProvider>
  );
}
