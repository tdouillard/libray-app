import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { supabaseDefine } from "./supabaseEnv";

const pagesBase = process.env.GITHUB_ACTIONS === "true" ? "/libray-app/" : "/";

export default defineConfig(({ mode }) => ({
  base: pagesBase,
  define: supabaseDefine(mode),
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true,
  },
}));
