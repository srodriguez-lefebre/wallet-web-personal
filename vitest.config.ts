import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";

import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    // Two isolated workers share a migrated cluster, never fixture rows.
    test: {
      maxWorkers: process.env.WALLET_TEST_WORKERS === "1" ? 1 : 2,
      globalSetup: ["./scripts/sandbox/postgres-global.ts"],
      environmentOptions: { jsdom: { url: "http://test.local" } },
    },
  }),
);
