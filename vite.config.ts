// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { llmProxyPlugin } from "./src/server/llmMiddleware";
import { normalizeBasePath } from "./src/lib/basePath";

const configuredBasePath = normalizeBasePath(
  process.env.LPL_BASE_PATH ??
    process.env.VITE_LPL_BASE_PATH ??
    (process.env.LPL_PUBLIC_DEMO === "true" || process.env.VITE_LPL_PUBLIC_DEMO === "true"
      ? "/voice"
      : process.env.NODE_ENV === "production"
      ? "/voice"
      : ""),
);

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // Local dev API proxy for optional LLM mode (keeps API keys server-side).
  vite: {
    base: configuredBasePath ? `${configuredBasePath}/` : "/",
    plugins: [llmProxyPlugin()],
  },
});
