import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: false,
  splitting: false,
  treeshake: true,
  external: ["react", "react-dom", "@wxpr/tokens", "@wxpr/icons"],
  // Collect every CSS file imported from src/** into dist/index.css.
  injectStyle: false,
  loader: { ".css": "css" },
  esbuildOptions(options) {
    options.bundle = true;
  },
});
