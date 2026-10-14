import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  sourcemap: true,
  // The shared workspace package is TypeScript source: bundle it into dist/.
  noExternal: [/^@preflight\/shared/],
});
