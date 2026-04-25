import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/entry.ts"],
  format: "esm",
  target: "es2023",
  platform: "node",
  clean: true,
  dts: true,
  sourcemap: true,
  deps: {
    neverBundle: [
      "better-sqlite3",
      "sharp",
      "@lydell/node-pty",
      "playwright-core",
      "fluent-ffmpeg",
      "screenshot-desktop",
      "pdfjs-dist",
    ],
  },
});
