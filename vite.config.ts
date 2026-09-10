import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(import.meta.dirname, "client"),
  resolve: {
    // The client imports the grade/defect vocabulary and IMEI rules straight
    // from the same module the server validates against.
    alias: { "@shared": path.resolve(import.meta.dirname, "shared") },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
});
