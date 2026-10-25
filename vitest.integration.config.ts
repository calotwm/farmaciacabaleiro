import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests hit the real dev database (DATABASE_URL from .env).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
