import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [VitePWA({
    // The manifest lives in public/ and is linked explicitly by index.html.
    manifest: false,
    injectRegister: "script",
    registerType: "prompt",
    includeAssets: ["manifest.webmanifest", "icons/*.svg"],
    workbox: {
      // Include the bundled PDF.js worker (.mjs) for local extraction offline.
      globPatterns: ["**/*.{js,mjs,css,html}"],
      navigateFallback: "index.html",
      runtimeCaching: [],
      cleanupOutdatedCaches: true,
    },
  })],
});
