// Recommended by the Recursica adapter's SETUP.md: checks every Recursica
// CSS variable the build uses (Mantine's, the adapter's and panel.css)
// against Snippy's Forge export, so a variable a new export renames or
// drops is caught. A warning in development; it fails the production build
// (npm run build).
module.exports = {
  plugins: {
    "@recursica/recursica-postcss-vars": {
      cssPath: "./recursica_variables_scoped.css",
      strict: process.env.NODE_ENV === "production",
    },
  },
};
