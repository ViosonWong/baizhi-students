import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ mode }) => ({
  plugins: mode === "singlefile" ? [react(), viteSingleFile()] : [react()],
  base: "./",
  build: {
    outDir: mode === "singlefile" ? "dist-singlefile" : "dist",
    emptyOutDir: true,
  },
}));
