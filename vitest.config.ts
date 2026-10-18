import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Test against shared's source directly, so tests don't need shared/ built first.
    alias: {
      "@whiteboard/shared": fileURLToPath(new URL("./shared/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["{client,server,shared}/src/**/*.test.ts"],
    environment: "node",
  },
});
