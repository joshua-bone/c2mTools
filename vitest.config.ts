import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "web/src/**/*.test.ts"],
    testTimeout: 60000,
  },
});
