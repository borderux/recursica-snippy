import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin as VitePlugin } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(
  readFileSync(path.join(rootDir, "package.json"), "utf8"),
) as { version: string };

// Snippy's Forge export (the theme), in the repo root: imported by
// src/panel/boot.tsx, and the source of truth the PostCSS check
// (postcss.config.cjs) validates every Recursica variable against.
const themeCssPath = path.join(rootDir, "recursica_variables_scoped.css");

// What Snippy itself is built with, for the report header ("Snippy built
// with"): the adapter's package version, and the Forge versions from the
// header comment of the Forge export's stylesheet. A missing value fails the
// build rather than shipping a wrong one.
const adapterVersion = (
  JSON.parse(
    readFileSync(
      path.join(
        rootDir,
        "node_modules/@recursica/adapter-mantine-v8/package.json",
      ),
      "utf8",
    ),
  ) as { version: string }
).version;
const themeHeader = readFileSync(themeCssPath, "utf8").slice(0, 2048);
const headerVersion = (label: string) => {
  const match = new RegExp(`${label}:\\s*([0-9][\\w.+-]*)`).exec(themeHeader);
  if (!match) throw new Error(`The theme stylesheet has no "${label}" header.`);
  return match[1];
};

function versionDefine(): VitePlugin {
  return {
    name: "snippy-version",
    config: () => ({
      define: {
        __APP_VERSION__: JSON.stringify(version),
        __ADAPTER_VERSION__: JSON.stringify(adapterVersion),
        __FORGE_VERSION__: JSON.stringify(headerVersion("Source JSON version")),
        __TRANSFORM_VERSION__: JSON.stringify(
          headerVersion("Transform version"),
        ),
      },
    }),
  };
}

// Two builds, chosen by build.js through the mode:
// - "panel": the extension's own pages - the side panel
//   (src/panel/sidepanel.html) and the annotation editor's tab
//   (src/panel/annotate.html) - with their scripts as ES modules and their
//   fonts as separate files.
// - "page": the page helper, injected into the reviewed page with
//   chrome.scripting.executeScript, which only runs classic scripts - so
//   it ships as one self-running IIFE, page.js.
export default defineConfig(({ mode }) =>
  mode === "page"
    ? {
        plugins: [versionDefine()],
        build: {
          outDir: "dist/.page",
          emptyOutDir: true,
          lib: {
            entry: path.join(rootDir, "src/page/main.ts"),
            formats: ["iife"],
            name: "SnippyPage",
            fileName: () => "page.js",
          },
          minify: true,
          sourcemap: false,
        },
      }
    : {
        root: path.join(rootDir, "src/panel"),
        // Relative asset URLs: the page is served from the extension's
        // own origin, at its root.
        base: "./",
        plugins: [react(), versionDefine()],
        // The PostCSS config sits in the repo root, above this build's
        // root (src/panel).
        css: { postcss: rootDir },
        build: {
          outDir: path.join(rootDir, "dist/.panel"),
          emptyOutDir: true,
          // Two extension pages sharing one bundle: the side panel, and
          // the annotation editor's tab.
          rollupOptions: {
            input: {
              sidepanel: path.join(rootDir, "src/panel/sidepanel.html"),
              annotate: path.join(rootDir, "src/panel/annotate.html"),
            },
          },
          // One bundle, read from the extension package on disk, never
          // downloaded: its size doesn't warrant splitting.
          chunkSizeWarningLimit: 4096,
          minify: true,
          sourcemap: false,
        },
      },
);
