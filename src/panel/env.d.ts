// The package.json version, injected by Vite at build time - one source of
// truth for the version shown in the panel header.
declare const __APP_VERSION__: string;
// What Snippy is built with (see vite.config.mts): the Recursica adapter's
// package version, and the Forge theme's source JSON and transform versions
// from the header comment of Snippy's Forge export
// (recursica_variables_scoped.css in the repo root).
declare const __ADAPTER_VERSION__: string;
declare const __FORGE_VERSION__: string;
declare const __TRANSFORM_VERSION__: string;
