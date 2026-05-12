import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname, "src"),
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@renderer": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../shared")
    }
  },
  build: {
    outDir: path.resolve(__dirname, "../../dist/renderer"),
    emptyOutDir: true
  }
});
