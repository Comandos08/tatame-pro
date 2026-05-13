import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Sentry source-map upload only runs when all three vars are present.
// Without them the plugin no-ops, the build still succeeds, and stack
// traces in Sentry remain minified. In CI for prod releases, set
// SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT alongside
// VITE_APP_VERSION for symbolicated traces tagged with the release.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const sentryEnabled = Boolean(sentryAuthToken && sentryOrg && sentryProject);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  build: {
    // Maps are uploaded then deleted from dist/ by the Sentry plugin,
    // so production users never download them.
    sourcemap: sentryEnabled ? true : false,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    sentryEnabled &&
      sentryVitePlugin({
        authToken: sentryAuthToken,
        org: sentryOrg,
        project: sentryProject,
        release: { name: process.env.VITE_APP_VERSION },
        sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
        telemetry: false,
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
