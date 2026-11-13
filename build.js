const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
// The extension, ready for "Load unpacked" and for packaging.
const OUT_DIR = path.join(DIST, "chrome");
// Vite writes the side panel and the page helper here first; they are
// then copied, unchanged, into OUT_DIR.
const PANEL_OUT = path.join(DIST, ".panel");
const PAGE_OUT = path.join(DIST, ".page", "page.js");

// Copied as-is. Everything else is Vite's output.
const SHARED_FILES = ["background.js"];
// The extension icon, in the four sizes the manifests list. Generated from
// one source image with `npm run icons -- <source.png>` (see README).
const ICON_SIZES = [16, 32, 48, 128];
const ICONS_DIR = path.join(SRC, "icons");
const iconFile = (size) => `icon-${size}.png`;

// package.json's version is the only source of truth: the manifest carries
// none in src, and the built manifest gets it here. Browsers need one to
// four dot-separated integers (0-65535) - a prerelease or build suffix
// (1.2.0-beta.1) is refused rather than silently mapped.
const { version } = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
);
if (
  !/^\d+(\.\d+){0,3}$/.test(version) ||
  version.split(".").some((part) => Number(part) > 65535 || /^0\d/.test(part))
) {
  throw new Error(
    `package.json version "${version}" is not a valid extension version: ` +
      "browsers accept only 1 to 4 dot-separated integers (like 1.2.3), " +
      "with no prerelease or build suffix.",
  );
}

async function main() {
  fs.rmSync(DIST, { recursive: true, force: true });

  // Vite is ESM-only; this script stays CommonJS so it keeps working
  // without "type": "module" in package.json. Two builds (see
  // vite.config.mts): the side panel, then the page helper.
  const { build } = await import("vite");
  for (const mode of ["panel", "page"]) {
    await build({
      configFile: path.join(ROOT, "vite.config.mts"),
      mode,
      logLevel: "warn",
    });
  }
  for (const page of ["sidepanel.html", "annotate.html"]) {
    if (!fs.existsSync(path.join(PANEL_OUT, page))) {
      throw new Error(`Vite did not produce ${PANEL_OUT}/${page}`);
    }
  }
  if (!fs.existsSync(PAGE_OUT)) {
    throw new Error(`Vite did not produce ${PAGE_OUT}`);
  }

  // Until the real icon has been generated, build without it rather than
  // ship a manifest pointing at missing files (which Chrome refuses to
  // load): drop the icon entries and say so loudly.
  const missingIcons = ICON_SIZES.filter(
    (size) => !fs.existsSync(path.join(ICONS_DIR, iconFile(size))),
  );
  if (missingIcons.length > 0) {
    console.warn(
      `WARNING: no extension icon (missing ${missingIcons.map(iconFile).join(", ")} in src/icons). ` +
        "Building without one; run `npm run icons -- <source.png>` to add it.",
    );
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const file of SHARED_FILES) {
    fs.copyFileSync(path.join(SRC, file), path.join(OUT_DIR, file));
  }
  fs.cpSync(PANEL_OUT, OUT_DIR, { recursive: true });
  fs.copyFileSync(PAGE_OUT, path.join(OUT_DIR, "page.js"));

  const manifest = JSON.parse(
    fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"),
  );
  if ("version" in manifest) {
    throw new Error(
      'manifest.json has its own "version"; remove it - the build writes package.json\'s.',
    );
  }
  // Right after the name, where browsers and people expect it.
  const { manifest_version, name, ...rest } = manifest;
  Object.keys(manifest).forEach((key) => delete manifest[key]);
  Object.assign(manifest, { manifest_version, name, version, ...rest });
  if (missingIcons.length > 0) {
    delete manifest.icons;
    delete manifest.action.default_icon;
  } else {
    fs.mkdirSync(path.join(OUT_DIR, "icons"), { recursive: true });
    for (const size of ICON_SIZES) {
      fs.copyFileSync(
        path.join(ICONS_DIR, iconFile(size)),
        path.join(OUT_DIR, "icons", iconFile(size)),
      );
    }
  }
  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  // Guard: the built manifest, and the panel itself (which writes the
  // version into every report), must carry exactly package.json's version.
  const built = JSON.parse(
    fs.readFileSync(path.join(OUT_DIR, "manifest.json"), "utf8"),
  );
  if (built.version !== version) {
    throw new Error(
      `dist/chrome/manifest.json says ${built.version}, package.json says ${version}`,
    );
  }
  const assetsDir = path.join(OUT_DIR, "assets");
  const panelJs = fs
    .readdirSync(assetsDir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => fs.readFileSync(path.join(assetsDir, file), "utf8"))
    .join("\n");
  // As a string literal in any quote style the minifier picked.
  const literal = new RegExp(`["'\`]${version.replace(/\./g, "\\.")}["'\`]`);
  if (!literal.test(panelJs)) {
    throw new Error(`The built side panel does not carry version ${version}`);
  }

  fs.rmSync(PANEL_OUT, { recursive: true, force: true });
  fs.rmSync(path.dirname(PAGE_OUT), { recursive: true, force: true });
  console.log("Built the extension into dist/chrome");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
