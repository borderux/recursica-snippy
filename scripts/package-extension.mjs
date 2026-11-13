#!/usr/bin/env node
// Zips the built dist/chrome folder into a versioned release asset -
// run after `npm run build`, as part of the release workflow once
// Changesets has bumped package.json's version.
import fs from "fs";
import path from "path";
import archiver from "archiver";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const { version } = JSON.parse(
  fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
);

const OUT_DIR = path.join(rootDir, "release-zips");
// Chrome only: Snippy's panel is Chrome's side panel.
const BROWSERS = ["chrome"];

function zipBrowser(browser) {
  const sourceDir = path.join(rootDir, "dist", browser);
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`${sourceDir} does not exist - run "npm run build" first`);
  }

  const zipPath = path.join(OUT_DIR, `snippy-${browser}-v${version}.zip`);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve(zipPath));
    archive.on("error", reject);
    archive.pipe(output);

    // false as the destpath flattens sourceDir's contents to the zip's own
    // root, so manifest.json ends up at the top level of the archive -
    // exactly what "Load unpacked" and the Chrome Web Store expect, not
    // nested under a "chrome/" folder.
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const zipPaths = await Promise.all(BROWSERS.map(zipBrowser));
for (const zipPath of zipPaths) {
  console.log(`Created ${path.relative(rootDir, zipPath)}`);
}
