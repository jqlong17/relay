import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@relay/shared-auth": path.resolve(__dirname, "../../packages/shared-auth/src/index.ts"),
      "@relay/shared-types": path.resolve(__dirname, "../../packages/shared-types/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
