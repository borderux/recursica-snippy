// The Recursica theme names two typefaces (Dongle for headings, Nunito
// Sans for everything else) and every one must load, or the browser
// silently substitutes a default face. They ship inside the extension
// rather than being fetched from Google Fonts.
//
// Registered with the FontFace API under exactly the family names the
// theme uses: the variable Nunito Sans package's own stylesheet would
// name it "Nunito Sans Variable".
import dongle400 from "@fontsource/dongle/files/dongle-latin-400-normal.woff2";
import dongle700 from "@fontsource/dongle/files/dongle-latin-700-normal.woff2";
import nunitoSans from "@fontsource-variable/nunito-sans/files/nunito-sans-latin-wght-normal.woff2";

const FACES: { family: string; url: string; weight: string }[] = [
  { family: "Dongle", url: dongle400, weight: "400" },
  { family: "Dongle", url: dongle700, weight: "700" },
  { family: "Nunito Sans", url: nunitoSans, weight: "200 1000" },
];

export function registerFonts(): void {
  for (const { family, url, weight } of FACES) {
    const face = new FontFace(family, `url(${url})`, {
      weight,
      style: "normal",
      display: "swap",
    });
    document.fonts.add(face);
    face.load().catch((err) => {
      console.error(`Snippy: could not load ${family}.`, err);
    });
  }
}
