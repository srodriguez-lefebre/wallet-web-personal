import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    // Database integration files start PostgreSQL runtimes; bound memory contention.
    test: { maxWorkers: 1 },
  }),
);
