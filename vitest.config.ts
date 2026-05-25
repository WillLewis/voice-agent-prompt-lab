import { defineConfig } from "vitest/config";

// Standalone Vitest config (does not load the TanStack Start / Cloudflare vite
// plugins). The domain layer under test is plain TypeScript, so a node
// environment with relative imports is all we need.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
